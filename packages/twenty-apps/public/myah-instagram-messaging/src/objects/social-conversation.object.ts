import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_RECIPIENT_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'myahSocialConversation',
  namePlural: 'myahSocialConversations',
  labelSingular: 'Myah social conversation',
  labelPlural: 'Myah social conversations',
  description:
    'Instagram DM conversation discovered manually through Composio. No automatic reply polling runs in the initial MVP.',
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
        SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Provider conversation ID',
      name: 'providerConversationId',
      description:
        'Instagram/Composio conversation id used for manual message lookup.',
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
