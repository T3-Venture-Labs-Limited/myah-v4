import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageChannelVisibility } from 'twenty-shared/types';
import { In, IsNull, type Repository } from 'typeorm';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

export enum MessageVisibilityAccess {
  HIDDEN = 'HIDDEN',
  METADATA = 'METADATA',
  SUBJECT = 'SUBJECT',
  FULL = 'FULL',
}

const MESSAGE_VISIBILITY_RANK: Record<MessageVisibilityAccess, number> = {
  [MessageVisibilityAccess.HIDDEN]: 0,
  [MessageVisibilityAccess.METADATA]: 1,
  [MessageVisibilityAccess.SUBJECT]: 2,
  [MessageVisibilityAccess.FULL]: 3,
};

type SqlVisibilityProjection = {
  expression: string;
  parameters: Record<string, string>;
};

@Injectable()
export class MessageVisibilityPolicyService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
  ) {}

  async applyMessagesVisibility(
    messages: MessageWorkspaceEntity[],
    authContext: WorkspaceAuthContext,
  ): Promise<MessageWorkspaceEntity[]> {
    if (messages.length === 0) {
      return messages;
    }

    const workspaceId = authContext.workspace.id;

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const associationRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
            workspaceId,
            'messageChannelMessageAssociation',
          );
        const associations = (
          await associationRepository.find({
            where: {
              messageId: In(messages.map(({ id }) => id)),
              deletedAt: IsNull(),
            },
          })
        ).filter(
          ({ deletedAt }) => deletedAt === null || deletedAt === undefined,
        );
        const messageChannelIds = [
          ...new Set(
            associations.map(({ messageChannelId }) => messageChannelId),
          ),
        ];
        const messageChannels = (
          messageChannelIds.length === 0
            ? []
            : await this.messageChannelRepository.find({
                where: { id: In(messageChannelIds), workspaceId },
                select: {
                  id: true,
                  workspaceId: true,
                  connectedAccountId: true,
                  visibility: true,
                },
              })
        ).filter((channel) => channel.workspaceId === workspaceId);
        const connectedAccountIds = [
          ...new Set(
            messageChannels.map(({ connectedAccountId }) => connectedAccountId),
          ),
        ];
        const ownedConnectedAccountIds = new Set(
          isUserAuthContext(authContext) && connectedAccountIds.length > 0
            ? (
                await this.connectedAccountRepository.find({
                  where: {
                    id: In(connectedAccountIds),
                    workspaceId,
                    userWorkspaceId: authContext.userWorkspaceId,
                  },
                  select: {
                    id: true,
                    workspaceId: true,
                    userWorkspaceId: true,
                  },
                })
              )
                .filter(
                  (account) =>
                    account.workspaceId === workspaceId &&
                    account.userWorkspaceId === authContext.userWorkspaceId,
                )
                .map(({ id }) => id)
            : [],
        );
        const channelById = new Map(
          messageChannels.map((channel) => [channel.id, channel]),
        );
        const accessByMessageId = new Map<string, MessageVisibilityAccess>();

        for (const association of associations) {
          const channel = channelById.get(association.messageChannelId);

          if (!channel) {
            continue;
          }

          const channelAccess = ownedConnectedAccountIds.has(
            channel.connectedAccountId,
          )
            ? MessageVisibilityAccess.FULL
            : this.accessForChannelVisibility(channel.visibility);
          const currentAccess =
            accessByMessageId.get(association.messageId) ??
            MessageVisibilityAccess.HIDDEN;

          if (
            MESSAGE_VISIBILITY_RANK[channelAccess] >
            MESSAGE_VISIBILITY_RANK[currentAccess]
          ) {
            accessByMessageId.set(association.messageId, channelAccess);
          }
        }

        for (let index = messages.length - 1; index >= 0; index--) {
          const message = messages[index];
          const access =
            accessByMessageId.get(message.id) ?? MessageVisibilityAccess.HIDDEN;

          if (access === MessageVisibilityAccess.HIDDEN) {
            messages.splice(index, 1);
          } else if (access === MessageVisibilityAccess.SUBJECT) {
            message.text = FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
          } else if (access === MessageVisibilityAccess.METADATA) {
            message.subject = FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
            message.text = FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
          }
        }

        return messages;
      },
      authContext,
      { lite: true },
    );
  }

  buildSqlVisibilityProjection({
    workspaceId,
    userWorkspaceId,
    messageIdExpression,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
    messageIdExpression: string;
  }): SqlVisibilityProjection {
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);

    return {
      expression: `COALESCE((
        SELECT CASE
          WHEN BOOL_OR(
            channel."visibility" = :messageVisibilityShareEverything
            OR connectedAccount."userWorkspaceId" = :messageVisibilityUserWorkspaceId
          ) THEN :messageVisibilityFull
          WHEN BOOL_OR(channel."visibility" = :messageVisibilitySubjectChannel)
            THEN :messageVisibilitySubject
          WHEN BOOL_OR(channel."visibility" = :messageVisibilityMetadataChannel)
            THEN :messageVisibilityMetadata
          ELSE :messageVisibilityHidden
        END
        FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" association
        INNER JOIN core."messageChannel" channel
          ON channel.id = association."messageChannelId"
          AND channel."workspaceId" = :messageVisibilityWorkspaceId
        LEFT JOIN core."connectedAccount" connectedAccount
          ON connectedAccount.id = channel."connectedAccountId"
          AND connectedAccount."workspaceId" = :messageVisibilityWorkspaceId
        WHERE association."messageId" = ${messageIdExpression}
          AND association."deletedAt" IS NULL
      ), :messageVisibilityHidden)`,
      parameters: {
        messageVisibilityWorkspaceId: workspaceId,
        messageVisibilityUserWorkspaceId: userWorkspaceId,
        messageVisibilityShareEverything:
          MessageChannelVisibility.SHARE_EVERYTHING,
        messageVisibilitySubjectChannel: MessageChannelVisibility.SUBJECT,
        messageVisibilityMetadataChannel: MessageChannelVisibility.METADATA,
        messageVisibilityFull: MessageVisibilityAccess.FULL,
        messageVisibilitySubject: MessageVisibilityAccess.SUBJECT,
        messageVisibilityMetadata: MessageVisibilityAccess.METADATA,
        messageVisibilityHidden: MessageVisibilityAccess.HIDDEN,
      },
    };
  }

  private accessForChannelVisibility(
    visibility: MessageChannelVisibility,
  ): MessageVisibilityAccess {
    switch (visibility) {
      case MessageChannelVisibility.SHARE_EVERYTHING:
        return MessageVisibilityAccess.FULL;
      case MessageChannelVisibility.SUBJECT:
        return MessageVisibilityAccess.SUBJECT;
      case MessageChannelVisibility.METADATA:
        return MessageVisibilityAccess.METADATA;
      default:
        return MessageVisibilityAccess.HIDDEN;
    }
  }
}
