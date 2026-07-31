import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MYAH_INBOX_MAX_PAGE_SIZE } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { type MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import {
  type MyahInboxListThreadsInput,
  MyahInboxQueryService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import {
  getMyahInboxEmailChannelAssociationCondition,
  MYAH_INBOX_EMAIL_CHANNEL_TYPES,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-email-channel-association.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

export type MyahInboxThreadProposalHistoryEntry = {
  receivedAt: string;
  sender: string | null;
  subject: string | null;
  text: string | null;
};

export type MyahInboxThreadProposalContext = {
  thread: MyahInboxThreadSummary;
  history: MyahInboxThreadProposalHistoryEntry[];
};

type MyahInboxThreadProposalHistoryRaw = Omit<
  MyahInboxThreadProposalHistoryEntry,
  'receivedAt'
> & {
  receivedAt: Date | string;
};

@Injectable()
export class MyahInboxThreadProposalContextService {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
  ) {}

  async getThreadProposalContext(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
  ): Promise<MyahInboxThreadProposalContext> {
    const thread = await this.myahInboxQueryService.getThreadSummary(input);
    const history = await this.loadThreadProposalHistory(input);

    return { thread, history };
  }

  private async loadThreadProposalHistory(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
  ): Promise<MyahInboxThreadProposalHistoryEntry[]> {
    this.assertUserRequest(input);
    this.assertValidFilterIds(input);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const rolePermissionConfig = resolveRolePermissionConfig({
          authContext: input.authContext,
          userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
          apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        });

        if (!rolePermissionConfig) {
          throw new ForbiddenException('Inbox role permissions are required');
        }

        const messageRepository =
          await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(input.workspace.id, 'message', rolePermissionConfig);
        const visibility =
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'message.id',
          });
        const workspaceSchemaName = getWorkspaceSchemaName(input.workspace.id);
        const rows = await messageRepository
          .createQueryBuilder('message')
          .select('message."receivedAt"', 'receivedAt')
          .addSelect('message.subject', 'subject')
          .addSelect('message.text', 'text')
          .addSelect(
            `(SELECT messageParticipant.handle
              FROM "${workspaceSchemaName}"."messageParticipant" messageParticipant
              WHERE messageParticipant."messageId" = message.id
                AND messageParticipant."deletedAt" IS NULL
                AND messageParticipant.role = :fromParticipantRole
              ORDER BY messageParticipant.id ASC
              LIMIT 1)`,
            'sender',
          )
          .where('message."messageThreadId" = :threadId', {
            threadId: input.threadId,
          })
          .andWhere('message."deletedAt" IS NULL')
          .andWhere('message."receivedAt" IS NOT NULL')
          .andWhere(
            getMyahInboxEmailChannelAssociationCondition({
              workspaceSchemaName,
              messageIdExpression: 'message.id',
              associationAlias: 'inboxAssociation',
              channelAlias: 'inboxChannel',
            }),
          )
          .andWhere(`${visibility.expression} = :messageVisibilityFull`)
          .setParameters({
            ...visibility.parameters,
            fromParticipantRole: MessageParticipantRole.FROM,
            inboxEmailChannelWorkspaceId: input.workspace.id,
            inboxEmailChannelTypes: MYAH_INBOX_EMAIL_CHANNEL_TYPES,
          })
          .orderBy('message."receivedAt"', 'DESC')
          .addOrderBy('message.id', 'DESC')
          .limit(MYAH_INBOX_MAX_PAGE_SIZE)
          .getRawMany<MyahInboxThreadProposalHistoryRaw>();

        return rows.reverse().map((message) => ({
          ...message,
          receivedAt:
            message.receivedAt instanceof Date
              ? message.receivedAt.toISOString()
              : message.receivedAt,
        }));
      },
      input.authContext,
    );
  }

  private assertUserRequest(
    input: MyahInboxListThreadsInput,
  ): asserts input is MyahInboxListThreadsInput & {
    authContext: Extract<WorkspaceAuthContext, { type: 'user' }>;
  } {
    if (
      !isUserAuthContext(input.authContext) ||
      !isDefined(input.authContext.user) ||
      !isDefined(input.user) ||
      input.authContext.user.id !== input.user.id ||
      input.authContext.workspace.id !== input.workspace.id ||
      input.authContext.workspaceMemberId !== input.workspaceMemberId
    ) {
      throw new ForbiddenException(
        'The Myah Inbox requires matching authenticated user context',
      );
    }
  }

  private assertValidFilterIds(input: MyahInboxListThreadsInput): void {
    const hasInvalidThreadId =
      isDefined(input.threadId) && !isValidUuid(input.threadId);
    const hasInvalidCampaignId =
      isDefined(input.campaignId) && !isValidUuid(input.campaignId);
    const hasInvalidOwnerId =
      isDefined(input.owner) &&
      input.owner !== 'ME' &&
      input.owner !== 'UNASSIGNED' &&
      !isValidUuid(input.owner);

    if (hasInvalidThreadId || hasInvalidCampaignId || hasInvalidOwnerId) {
      throw new BadRequestException('Invalid Myah inbox relation filter');
    }
  }
}
