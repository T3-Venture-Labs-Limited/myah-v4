import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  CREATOR_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_COMPLETED_MESSAGE_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_LIFECYCLE_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_RECIPIENT_DISPLAY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_RECIPIENT_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_RECIPIENT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

enum SocialConversationProvider {
  COMPOSIO_HISTORY = 'COMPOSIO_HISTORY',
  UNIPILE = 'UNIPILE',
}

enum SocialConversationLifecycle {
  ACTIVE = 'ACTIVE',
  HISTORICAL = 'HISTORICAL',
}

export default defineObject({
  universalIdentifier: SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'myahSocialConversation',
  namePlural: 'myahSocialConversations',
  labelSingular: 'Myah social conversation',
  labelPlural: 'Myah social conversations',
  description:
    'Instagram DM conversation metadata retained for historical display and server-managed messaging.',
  icon: 'IconMessages',
  labelIdentifierFieldMetadataUniversalIdentifier:
    SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Label',
      name: 'label',
      description: 'Human-readable thread label, such as creator handle.',
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Provider',
      name: 'provider',
      defaultValue: `'${SocialConversationProvider.COMPOSIO_HISTORY}'`,
      options: [
        {
          id: 'e161e884-2f21-44ad-a6ac-5e221a0c1cee',
          value: SocialConversationProvider.COMPOSIO_HISTORY,
          label: 'Composio history',
          position: 0,
          color: 'purple',
        },
        {
          id: '5dcd0095-ae5f-431a-8fe2-d5d0e22c98ce',
          value: SocialConversationProvider.UNIPILE,
          label: 'Unipile',
          position: 1,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_LIFECYCLE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Lifecycle',
      name: 'lifecycle',
      defaultValue: `'${SocialConversationLifecycle.HISTORICAL}'`,
      options: [
        {
          id: 'f0dec157-630f-46d0-ba8a-678f9082d2f9',
          value: SocialConversationLifecycle.ACTIVE,
          label: 'Active',
          position: 0,
          color: 'green',
        },
        {
          id: '4845c0dc-5892-46dc-9682-b008c6f6070f',
          value: SocialConversationLifecycle.HISTORICAL,
          label: 'Historical',
          position: 1,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Provider conversation ID',
      name: 'providerConversationId',
      description:
        'Provider conversation id retained with the conversation metadata.',
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_RECIPIENT_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Recipient IGSID',
      name: 'recipientIgsid',
      isNullable: true,
      defaultValue: null,
      description:
        'Instagram-scoped recipient id required by server-owned reply delivery. Usernames are not accepted.',
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_RECIPIENT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Recipient username',
      name: 'recipientUsername',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_RECIPIENT_DISPLAY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Recipient display name',
      name: 'recipientDisplayName',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      label: 'Instagram account',
      name: 'instagramAccount',
      description: 'Connected Instagram account that owns this conversation.',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'instagramAccountId',
      },
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      label: 'Creator',
      name: 'creator',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'creatorId',
      },
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_COMPLETED_MESSAGE_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Completed message sync at',
      name: 'completedMessageSyncAt',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      label: 'Messages',
      name: 'messages',
      description: 'Messages in this conversation.',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      label: 'Reply drafts',
      name: 'replyDrafts',
      description: 'Reply drafts prepared for this conversation.',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
