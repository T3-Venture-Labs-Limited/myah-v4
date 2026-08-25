import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { In, type FindOptionsSelect, type ObjectLiteral } from 'typeorm';
import { EntityPropertyNotFoundError } from 'typeorm/error/EntityPropertyNotFoundError';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
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
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

export type MyahInboxThreadProposalHistoryEntry = {
  direction: MessageDirection;
  receivedAt: string;
  sender: string | null;
  subject: string | null;
  text: string | null;
};

export type MyahInboxCampaignReplyContext = {
  objective: string | null;
  icpGoal: string | null;
  agent: {
    campaignBrief: string | null;
    communicationGuidelines: string | null;
    replyRules: string | null;
    escalationBoundaries: string | null;
    additionalNotes: string | null;
  };
};

export type MyahInboxCampaignCreatorReplyContext = {
  stage: string | null;
  selectedContactMethod: string | null;
  nextActionAt: string | null;
  selectionReason: string | null;
  dealSummary: string | null;
};

export type MyahInboxCreatorReplyContext = {
  name: string | null;
  language: string | null;
  location: string | null;
  categories: string[];
  niches: string[];
};

export type MyahInboxReplyBriefing = {
  thread: MyahInboxThreadSummary;
  history: MyahInboxThreadProposalHistoryEntry[];
  replyRecipient: string | null;
  campaign: MyahInboxCampaignReplyContext | null;
  campaignCreator: MyahInboxCampaignCreatorReplyContext | null;
  creator: MyahInboxCreatorReplyContext | null;
};

export type MyahInboxReplyGenerationContext = MyahInboxReplyBriefing & {
  campaignEmailSignatureMarkdown: string | null;
  hasCampaignLink: boolean;
};

type MyahInboxThreadProposalHistoryRaw = Omit<
  MyahInboxThreadProposalHistoryEntry,
  'receivedAt' | 'sender'
> & {
  id: string;
  receivedAt: Date | string;
};

type MyahInboxReplyBriefingRichText = {
  markdown?: string | null;
} | null;

type MyahInboxReplyBriefingMessageThreadRecord = ObjectLiteral & {
  id: string;
  myahCampaignId: string | null;
};

type MyahInboxReplyBriefingCampaignRecord = ObjectLiteral & {
  id: string;
  objective: string | null;
  icpGoal: string | null;
  campaignBrief: MyahInboxReplyBriefingRichText;
  communicationGuidelines: MyahInboxReplyBriefingRichText;
  replyRules: MyahInboxReplyBriefingRichText;
  escalationBoundaries: MyahInboxReplyBriefingRichText;
  additionalNotes: MyahInboxReplyBriefingRichText;
  emailSignature: MyahInboxReplyBriefingRichText;
};

type MyahInboxReplyBriefingCampaignCreatorRecord = ObjectLiteral & {
  stage: string | null;
  selectedContactMethod: string | null;
  nextActionAt: Date | string | null;
  selectionReason: string | null;
  dealSummary: string | null;
};

type MyahInboxReplyBriefingCreatorRecord = ObjectLiteral & {
  id: string;
  name: string | null;
  language: string | null;
  location: string | null;
  categories: string | null;
  niches: string | null;
};

type MyahInboxReplyBriefingMessageParticipantRecord = ObjectLiteral & {
  id: string;
  messageId: string;
  personId: string | null;
  displayName: string | null;
  handle: string | null;
};

type MyahInboxReplyBriefingPersonRecord = ObjectLiteral & {
  id: string;
  nameFirstName: string | null;
  nameLastName: string | null;
};

type MyahInboxReplyBriefingRepositories = {
  messageThread: WorkspaceRepository<MyahInboxReplyBriefingMessageThreadRecord>;
  campaign: WorkspaceRepository<MyahInboxReplyBriefingCampaignRecord>;
  campaignCreator: WorkspaceRepository<MyahInboxReplyBriefingCampaignCreatorRecord>;
  creator: WorkspaceRepository<MyahInboxReplyBriefingCreatorRecord>;
  message: WorkspaceRepository<Record<string, unknown>>;
  messageParticipant: WorkspaceRepository<MyahInboxReplyBriefingMessageParticipantRecord>;
  person: WorkspaceRepository<MyahInboxReplyBriefingPersonRecord>;
};

type MyahInboxReplyBriefingContext = Omit<
  MyahInboxReplyGenerationContext,
  'thread'
>;

const MYAH_INBOX_REPLY_BRIEFING_TRUNCATION_MARKER = '[…truncated]';
const MYAH_INBOX_REPLY_BRIEFING_MAX_AGENT_RICH_TEXT_LENGTH = 2_000;
const MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH = 1_000;
const MYAH_INBOX_REPLY_BRIEFING_CAMPAIGN_FIELDS = [
  'objective',
  'icpGoal',
  'campaignBrief',
  'communicationGuidelines',
  'replyRules',
  'escalationBoundaries',
  'additionalNotes',
  'emailSignature',
] as const satisfies readonly (keyof MyahInboxReplyBriefingCampaignRecord)[];
const MYAH_INBOX_REPLY_BRIEFING_CAMPAIGN_MARKDOWN_COLUMN_BY_FIELD: Partial<
  Record<keyof MyahInboxReplyBriefingCampaignRecord, string>
> = {
  campaignBrief: 'campaignBriefMarkdown',
  communicationGuidelines: 'communicationGuidelinesMarkdown',
  replyRules: 'replyRulesMarkdown',
  escalationBoundaries: 'escalationBoundariesMarkdown',
  additionalNotes: 'additionalNotesMarkdown',
  emailSignature: 'emailSignatureMarkdown',
};
const MYAH_INBOX_REPLY_BRIEFING_CAMPAIGN_CREATOR_FIELDS = [
  'stage',
  'selectedContactMethod',
  'nextActionAt',
  'selectionReason',
  'dealSummary',
] as const satisfies readonly (keyof MyahInboxReplyBriefingCampaignCreatorRecord)[];
const MYAH_INBOX_REPLY_BRIEFING_CREATOR_FIELDS = [
  'name',
  'language',
  'location',
  'categories',
  'niches',
] as const satisfies readonly (keyof MyahInboxReplyBriefingCreatorRecord)[];
const MYAH_INBOX_REPLY_BRIEFING_MESSAGE_PARTICIPANT_FIELDS = [
  'personId',
  'displayName',
  'handle',
] as const satisfies readonly (keyof MyahInboxReplyBriefingMessageParticipantRecord)[];

const getReplyBriefingSelect = <T extends ObjectLiteral>(
  fields: readonly (keyof T)[],
): FindOptionsSelect<T> =>
  Object.fromEntries(
    fields.map((field) => [field, true]),
  ) as FindOptionsSelect<T>;

const getCampaignReplyBriefingSelect = (
  fields: readonly (keyof MyahInboxReplyBriefingCampaignRecord)[],
): FindOptionsSelect<MyahInboxReplyBriefingCampaignRecord> =>
  Object.fromEntries(
    fields.map((field) => [
      MYAH_INBOX_REPLY_BRIEFING_CAMPAIGN_MARKDOWN_COLUMN_BY_FIELD[field] ??
        field,
      true,
    ]),
  ) as FindOptionsSelect<MyahInboxReplyBriefingCampaignRecord>;

const normalizeCreatorReplyBriefingText = (value: unknown): string[] => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  const normalizedValue = truncateReplyBriefingValue(
    value.trim(),
    MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
  );

  return normalizedValue ? [normalizedValue] : [];
};

const formatReplyBriefingSender = (
  participant: MyahInboxReplyBriefingMessageParticipantRecord,
  person: MyahInboxReplyBriefingPersonRecord | undefined,
): string | null => {
  const personName = [person?.nameFirstName, person?.nameLastName]
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    .join(' ');

  return (
    personName ||
    participant.displayName?.trim() ||
    participant.handle?.trim() ||
    null
  );
};

function truncateReplyBriefingValue(
  value: string | null | undefined,
  maximumLength: number,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return value.length <= maximumLength
    ? value
    : `${value.slice(
        0,
        maximumLength - MYAH_INBOX_REPLY_BRIEFING_TRUNCATION_MARKER.length,
      )}${MYAH_INBOX_REPLY_BRIEFING_TRUNCATION_MARKER}`;
}
@Injectable()
export class MyahInboxReplyBriefingService {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
  ) {}

  async loadReplyBriefing(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
  ): Promise<MyahInboxReplyGenerationContext> {
    const thread = await this.myahInboxQueryService.getThreadSummary(input);
    const context = await this.loadThreadProposalHistory(input, thread);

    const latestHistoryEntry = context.history[context.history.length - 1];

    return {
      thread: {
        ...thread,
        lastMessageSender:
          latestHistoryEntry?.receivedAt === thread.lastActivityAt
            ? latestHistoryEntry.sender
            : null,
      },
      ...context,
    };
  }

  private async loadThreadProposalHistory(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
    thread: MyahInboxThreadSummary,
  ): Promise<MyahInboxReplyBriefingContext> {
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

        const [
          messageThread,
          message,
          messageParticipant,
          person,
          creator,
          campaign,
          campaignCreator,
        ] = await Promise.all([
          this.globalWorkspaceOrmManager.getRepository<MyahInboxReplyBriefingMessageThreadRecord>(
            input.workspace.id,
            'messageThread',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            input.workspace.id,
            'message',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<MyahInboxReplyBriefingMessageParticipantRecord>(
            input.workspace.id,
            'messageParticipant',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<MyahInboxReplyBriefingPersonRecord>(
            input.workspace.id,
            'person',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<MyahInboxReplyBriefingCreatorRecord>(
            input.workspace.id,
            'creator',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<MyahInboxReplyBriefingCampaignRecord>(
            input.workspace.id,
            'campaign',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<MyahInboxReplyBriefingCampaignCreatorRecord>(
            input.workspace.id,
            'campaignCreator',
            rolePermissionConfig,
          ),
        ]);
        const persistedThread = await messageThread.findOne({
          where: { id: input.threadId },
          select: {
            id: true,
            myahCampaignId: true,
          },
        });

        if (!persistedThread) {
          throw new ForbiddenException('Inbox thread is not readable');
        }

        const repositories: MyahInboxReplyBriefingRepositories = {
          messageThread,
          message,
          messageParticipant,
          person,
          creator,
          campaign,
          campaignCreator,
        };
        const visibility =
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'message.id',
          });
        const workspaceSchemaName = getWorkspaceSchemaName(input.workspace.id);
        const rows = await repositories.message
          .createQueryBuilder('message')
          .select('message.id', 'id')
          .addSelect('message."receivedAt"', 'receivedAt')
          .addSelect('message.subject', 'subject')
          .addSelect('message.text', 'text')
          .addSelect(
            `(SELECT inboxDirectionAssociation.direction
              FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" inboxDirectionAssociation
              INNER JOIN core."messageChannel" inboxDirectionChannel
                ON inboxDirectionChannel.id = inboxDirectionAssociation."messageChannelId"
                AND inboxDirectionChannel."workspaceId" = :inboxEmailChannelWorkspaceId
              LEFT JOIN core."connectedAccount" inboxDirectionConnectedAccount
                ON inboxDirectionConnectedAccount.id = inboxDirectionChannel."connectedAccountId"
                AND inboxDirectionConnectedAccount."workspaceId" = :inboxEmailChannelWorkspaceId
              WHERE inboxDirectionAssociation."messageId" = message.id
                AND inboxDirectionAssociation."deletedAt" IS NULL
                AND inboxDirectionChannel.type IN (:...inboxEmailChannelTypes)
                AND (
                  inboxDirectionChannel."visibility" = :messageVisibilityShareEverything
                  OR inboxDirectionConnectedAccount."userWorkspaceId" = :messageVisibilityUserWorkspaceId
                )
              ORDER BY (inboxDirectionConnectedAccount."userWorkspaceId" = :messageVisibilityUserWorkspaceId) DESC, inboxDirectionAssociation.id ASC
              LIMIT 1)`,
            'direction',
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
            inboxEmailChannelWorkspaceId: input.workspace.id,
            inboxEmailChannelTypes: MYAH_INBOX_EMAIL_CHANNEL_TYPES,
          })
          .orderBy('message."receivedAt"', 'ASC')
          .addOrderBy('message.id', 'ASC')
          .getRawMany<MyahInboxThreadProposalHistoryRaw>();
        const senderParticipants =
          rows.length === 0
            ? []
            : await this.loadReadableReplyBriefingRecords<MyahInboxReplyBriefingMessageParticipantRecord>(
                MYAH_INBOX_REPLY_BRIEFING_MESSAGE_PARTICIPANT_FIELDS,
                (fields) =>
                  repositories.messageParticipant.find({
                    where: {
                      messageId: In(rows.map(({ id }) => id)),
                      role: MessageParticipantRole.FROM,
                    },
                    select: {
                      id: true,
                      messageId: true,
                      ...getReplyBriefingSelect<MyahInboxReplyBriefingMessageParticipantRecord>(
                        fields,
                      ),
                    },
                    order: { id: 'ASC' },
                  }),
              );
        const personIds = senderParticipants.flatMap(({ personId }) =>
          personId ? [personId] : [],
        );
        const readablePeople =
          personIds.length === 0
            ? []
            : await this.loadReadableReplyBriefingRecords<MyahInboxReplyBriefingPersonRecord>(
                ['nameFirstName', 'nameLastName'] as const,
                (fields) =>
                  repositories.person.find({
                    where: { id: In(personIds) },
                    select: {
                      id: true,
                      ...getReplyBriefingSelect<MyahInboxReplyBriefingPersonRecord>(
                        fields,
                      ),
                    },
                  }),
              );
        const readablePeopleById = new Map(
          readablePeople.map((person) => [person.id, person]),
        );

        const sendersByMessageId = new Map<string, string | null>();

        for (const participant of senderParticipants) {
          if (!sendersByMessageId.has(participant.messageId)) {
            sendersByMessageId.set(
              participant.messageId,
              formatReplyBriefingSender(
                participant,
                participant.personId
                  ? readablePeopleById.get(participant.personId)
                  : undefined,
              ),
            );
          }
        }
        const campaignId = thread.campaign?.id;
        const creatorId = thread.creator?.id;
        const [campaignRecord, creatorRecord] = await Promise.all([
          campaignId
            ? this.loadReadableReplyBriefingRecord(
                MYAH_INBOX_REPLY_BRIEFING_CAMPAIGN_FIELDS,
                (fields) =>
                  repositories.campaign.findOne({
                    where: { id: campaignId },
                    select: {
                      id: true,
                      ...getCampaignReplyBriefingSelect(fields),
                    },
                  }),
              )
            : null,
          creatorId
            ? this.loadReadableReplyBriefingRecord(
                MYAH_INBOX_REPLY_BRIEFING_CREATOR_FIELDS,
                (fields) =>
                  repositories.creator.findOne({
                    where: { id: creatorId },
                    select:
                      getReplyBriefingSelect<MyahInboxReplyBriefingCreatorRecord>(
                        fields,
                      ),
                  }),
              )
            : null,
        ]);
        const campaignCreatorRecord =
          campaignRecord && creatorRecord && campaignId && creatorId
            ? await this.loadReadableReplyBriefingRecord(
                MYAH_INBOX_REPLY_BRIEFING_CAMPAIGN_CREATOR_FIELDS,
                (fields) =>
                  repositories.campaignCreator.findOne({
                    where: {
                      campaignId,
                      creatorId,
                    },
                    select:
                      getReplyBriefingSelect<MyahInboxReplyBriefingCampaignCreatorRecord>(
                        fields,
                      ),
                  }),
              )
            : null;

        const history = rows.map(
          ({ id, direction, receivedAt, subject, text }) => ({
            direction,
            receivedAt:
              receivedAt instanceof Date
                ? receivedAt.toISOString()
                : receivedAt,
            sender: sendersByMessageId.get(id) ?? null,
            subject,
            text,
          }),
        );
        const replyRecipient =
          [...history]
            .reverse()
            .find(
              ({ direction, sender }) =>
                direction === MessageDirection.INCOMING && sender !== null,
            )?.sender ?? null;

        return {
          history,
          replyRecipient,
          hasCampaignLink: persistedThread.myahCampaignId !== null,
          campaignEmailSignatureMarkdown:
            typeof campaignRecord?.emailSignature?.markdown === 'string' &&
            campaignRecord.emailSignature.markdown.trim().length > 0
              ? campaignRecord.emailSignature.markdown
              : null,
          campaign: campaignRecord
            ? {
                objective: truncateReplyBriefingValue(
                  campaignRecord.objective,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                icpGoal: truncateReplyBriefingValue(
                  campaignRecord.icpGoal,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                agent: {
                  campaignBrief: truncateReplyBriefingValue(
                    campaignRecord.campaignBrief?.markdown ?? null,
                    MYAH_INBOX_REPLY_BRIEFING_MAX_AGENT_RICH_TEXT_LENGTH,
                  ),
                  communicationGuidelines: truncateReplyBriefingValue(
                    campaignRecord.communicationGuidelines?.markdown ?? null,
                    MYAH_INBOX_REPLY_BRIEFING_MAX_AGENT_RICH_TEXT_LENGTH,
                  ),
                  replyRules: truncateReplyBriefingValue(
                    campaignRecord.replyRules?.markdown ?? null,
                    MYAH_INBOX_REPLY_BRIEFING_MAX_AGENT_RICH_TEXT_LENGTH,
                  ),
                  escalationBoundaries: truncateReplyBriefingValue(
                    campaignRecord.escalationBoundaries?.markdown ?? null,
                    MYAH_INBOX_REPLY_BRIEFING_MAX_AGENT_RICH_TEXT_LENGTH,
                  ),
                  additionalNotes: truncateReplyBriefingValue(
                    campaignRecord.additionalNotes?.markdown ?? null,
                    MYAH_INBOX_REPLY_BRIEFING_MAX_AGENT_RICH_TEXT_LENGTH,
                  ),
                },
              }
            : null,
          campaignCreator: campaignCreatorRecord
            ? {
                stage: truncateReplyBriefingValue(
                  campaignCreatorRecord.stage,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                selectedContactMethod: truncateReplyBriefingValue(
                  campaignCreatorRecord.selectedContactMethod,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                nextActionAt:
                  campaignCreatorRecord.nextActionAt instanceof Date
                    ? campaignCreatorRecord.nextActionAt.toISOString()
                    : (campaignCreatorRecord.nextActionAt ?? null),
                selectionReason: truncateReplyBriefingValue(
                  campaignCreatorRecord.selectionReason,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                dealSummary: truncateReplyBriefingValue(
                  campaignCreatorRecord.dealSummary,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
              }
            : null,
          creator: creatorRecord
            ? {
                name: truncateReplyBriefingValue(
                  creatorRecord.name,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                language: truncateReplyBriefingValue(
                  creatorRecord.language,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                location: truncateReplyBriefingValue(
                  creatorRecord.location,
                  MYAH_INBOX_REPLY_BRIEFING_MAX_TEXT_FIELD_LENGTH,
                ),
                categories: normalizeCreatorReplyBriefingText(
                  creatorRecord.categories,
                ),
                niches: normalizeCreatorReplyBriefingText(creatorRecord.niches),
              }
            : null,
        };
      },
      input.authContext,
    );
  }

  private async loadReadableReplyBriefingRecords<T extends ObjectLiteral>(
    fields: readonly (keyof T)[],
    load: (fields: readonly (keyof T)[]) => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await load(fields);
    } catch (error) {
      if (!this.isUnavailableReplyBriefingField(error)) {
        throw error;
      }
    }

    const recordsById = new Map<string, T>();

    for (const field of fields) {
      try {
        for (const partialRecord of await load([field])) {
          recordsById.set(partialRecord.id as string, {
            ...recordsById.get(partialRecord.id as string),
            ...partialRecord,
          });
        }
      } catch (error) {
        if (!this.isUnavailableReplyBriefingField(error)) {
          throw error;
        }
      }
    }

    return [...recordsById.values()];
  }

  private async loadReadableReplyBriefingRecord<T extends ObjectLiteral>(
    fields: readonly (keyof T)[],
    load: (fields: readonly (keyof T)[]) => Promise<T | null>,
  ): Promise<T | null> {
    try {
      return await load(fields);
    } catch (error) {
      if (!this.isUnavailableReplyBriefingField(error)) {
        throw error;
      }
    }

    const record = {} as T;
    let hasReadableField = false;

    for (const field of fields) {
      try {
        const partialRecord = await load([field]);

        if (partialRecord) {
          Object.assign(record, partialRecord);
          hasReadableField = true;
        }
      } catch (error) {
        if (!this.isUnavailableReplyBriefingField(error)) {
          throw error;
        }
      }
    }

    return hasReadableField ? record : null;
  }

  private isPermissionDenied(error: unknown): error is PermissionsException {
    return (
      error instanceof PermissionsException &&
      error.code === PermissionsExceptionCode.PERMISSION_DENIED
    );
  }

  private isUnavailableReplyBriefingField(error: unknown): boolean {
    return (
      this.isPermissionDenied(error) ||
      error instanceof EntityPropertyNotFoundError
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
