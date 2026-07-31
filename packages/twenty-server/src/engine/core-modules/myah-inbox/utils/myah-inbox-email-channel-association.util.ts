import { MessageChannelType } from 'twenty-shared/types';

export const MYAH_INBOX_EMAIL_CHANNEL_TYPES = [
  MessageChannelType.EMAIL,
  MessageChannelType.EMAIL_GROUP,
];

export const getMyahInboxEmailChannelAssociationCondition = ({
  workspaceSchemaName,
  messageIdExpression,
  associationAlias,
  channelAlias,
}: {
  workspaceSchemaName: string;
  messageIdExpression: string;
  associationAlias: string;
  channelAlias: string;
}): string => `EXISTS (
  SELECT 1
  FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" ${associationAlias}
  INNER JOIN core."messageChannel" ${channelAlias}
    ON ${channelAlias}.id = ${associationAlias}."messageChannelId"
    AND ${channelAlias}."workspaceId" = :inboxEmailChannelWorkspaceId
  WHERE ${associationAlias}."messageId" = ${messageIdExpression}
    AND ${associationAlias}."deletedAt" IS NULL
    AND ${channelAlias}.type IN (:...inboxEmailChannelTypes)
)`;
