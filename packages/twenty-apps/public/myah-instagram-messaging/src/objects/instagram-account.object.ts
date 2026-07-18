import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import {
  INSTAGRAM_ACCOUNT_AFTER_CURSOR_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_AUTH_CONFIG_ID_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_COMPOSIO_USER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_CONNECTED_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_IG_USER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_LAST_CHECKED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_LAST_CONVERSATION_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_LAST_ERROR_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

enum InstagramAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  NEEDS_RECONNECT = 'NEEDS_RECONNECT',
  ERROR = 'ERROR',
}

export default defineObject({
  universalIdentifier: INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'myahInstagramAccount',
  namePlural: 'myahInstagramAccounts',
  labelSingular: 'Myah Instagram account',
  labelPlural: 'Myah Instagram accounts',
  description:
    'Workspace Instagram Business or Creator account connected for approved Myah message reads and replies.',
  icon: 'IconBrandInstagram',
  labelIdentifierFieldMetadataUniversalIdentifier:
    INSTAGRAM_ACCOUNT_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: INSTAGRAM_ACCOUNT_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Label',
      name: 'label',
      description: 'Human-readable account label shown to workspace members.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_CONNECTED_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Connected account ID',
      name: 'connectedAccountId',
      isUnique: true,
      description:
        'Composio connected account id for this workspace Instagram account. Hidden from normal user copy but used for server-side tool execution.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_COMPOSIO_USER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Composio user ID',
      name: 'composioUserId',
      description:
        'Workspace-scoped Composio user id, e.g. workspace:<workspaceId>:instagram.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_AUTH_CONFIG_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Auth config ID',
      name: 'authConfigId',
      isNullable: true,
      defaultValue: null,
      description:
        'Composio Instagram auth config id used to create this link.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_IG_USER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Instagram account ID',
      name: 'igUserId',
      isNullable: true,
      defaultValue: null,
      description:
        'Instagram-scoped account id when returned by provider data.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Username',
      name: 'username',
      isNullable: true,
      defaultValue: null,
      description: 'Instagram username or handle when known.',
    },
    {
      universalIdentifier: INSTAGRAM_ACCOUNT_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Status',
      name: 'status',
      defaultValue: `'${InstagramAccountStatus.ACTIVE}'`,
      options: [
        {
          id: '91e5543f-6fc5-4f49-a5bf-dccbbee7b625',
          value: InstagramAccountStatus.ACTIVE,
          label: 'Active',
          position: 0,
          color: 'green',
        },
        {
          id: 'cb391884-78b4-4f8b-be4a-1ab8266654df',
          value: InstagramAccountStatus.INACTIVE,
          label: 'Inactive',
          position: 1,
          color: 'gray',
        },
        {
          id: '0630ec55-2b0f-4ba1-ad69-776baf2889e7',
          value: InstagramAccountStatus.NEEDS_RECONNECT,
          label: 'Needs reconnect',
          position: 2,
          color: 'orange',
        },
        {
          id: '343ff77a-a842-4549-9ff2-8f2fa02bbd3e',
          value: InstagramAccountStatus.ERROR,
          label: 'Error',
          position: 3,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_LAST_CHECKED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Last checked at',
      name: 'lastCheckedAt',
      isNullable: true,
      defaultValue: null,
      description:
        'Most recent status check time for this Instagram connection.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_LAST_CONVERSATION_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Last conversation sync at',
      name: 'lastConversationSyncAt',
      isNullable: true,
      defaultValue: null,
      description:
        'Most recent manual conversation sync time. Polling is disabled.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_AFTER_CURSOR_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Conversation after cursor',
      name: 'conversationAfterCursor',
      isNullable: true,
      defaultValue: null,
      description:
        'Safe cursor for future manual or scheduled conversation sync. Do not store tokenized paging.next URLs.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_LAST_ERROR_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Last error',
      name: 'lastError',
      isNullable: true,
      defaultValue: null,
      description:
        'Redacted latest provider/status error if the connection fails.',
    },
    {
      universalIdentifier:
        INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      label: 'Conversations',
      name: 'conversations',
      description: 'Instagram conversations associated with this account.',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
