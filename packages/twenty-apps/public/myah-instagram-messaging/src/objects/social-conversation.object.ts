import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_RECIPIENT_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_LAST_INBOUND_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_REPLY_WINDOW_ENDS_AT_FIELD_UNIVERSAL_IDENTIFIER,
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
        SOCIAL_CONVERSATION_LAST_INBOUND_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Last inbound message at',
      name: 'lastInboundAt',
      isNullable: true,
      defaultValue: null,
      isUIEditable: false,
      description:
        'Newest verified inbound creator-message timestamp used to calculate the reply window.',
    },
    {
      universalIdentifier:
        SOCIAL_CONVERSATION_REPLY_WINDOW_ENDS_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Reply window',
      name: 'replyWindowEndsAt',
      isNullable: true,
      defaultValue: null,
      isUIEditable: false,
      description:
        'System-maintained deadline for replying to the creator on Instagram.',
    },
  ],
});
