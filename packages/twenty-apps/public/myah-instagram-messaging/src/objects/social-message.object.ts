import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_ATTACHMENT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_DELIVERY_STATE_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_DELIVERY_STATE_UPDATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_HAS_ATTACHMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_PROVIDER_CREATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_SENT_VIA_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_TEXT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

enum SocialMessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
  UNKNOWN = 'UNKNOWN',
}

enum SocialMessageSentVia {
  MANUAL = 'MANUAL',
  COMPOSIO = 'COMPOSIO',
  UNIPILE = 'UNIPILE',
  UNKNOWN = 'UNKNOWN',
}

enum SocialMessageProvider {
  COMPOSIO_HISTORY = 'COMPOSIO_HISTORY',
  UNIPILE = 'UNIPILE',
}

enum SocialMessageDeliveryState {
  UNKNOWN = 'UNKNOWN',
  RECEIVED = 'RECEIVED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
}

export default defineObject({
  universalIdentifier: SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'myahSocialMessage',
  namePlural: 'myahSocialMessages',
  labelSingular: 'Myah social message',
  labelPlural: 'Myah social messages',
  description:
    'Persisted Instagram DM message or manual first-DM touchpoint. This is the display source while polling is disabled.',
  icon: 'IconMessage',
  labelIdentifierFieldMetadataUniversalIdentifier:
    SOCIAL_MESSAGE_TEXT_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: SOCIAL_MESSAGE_TEXT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Text',
      name: 'text',
      isNullable: true,
      defaultValue: null,
      description: 'Message text or a local note for media-only messages.',
    },
    {
      universalIdentifier: SOCIAL_MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Direction',
      name: 'direction',
      defaultValue: `'${SocialMessageDirection.OUTBOUND}'`,
      options: [
        {
          id: '13d27078-c7bc-40b1-ae19-1ddbbfe15642',
          value: SocialMessageDirection.INBOUND,
          label: 'Inbound',
          position: 0,
          color: 'green',
        },
        {
          id: '34847dd8-c965-43b1-b979-572a0830b97f',
          value: SocialMessageDirection.OUTBOUND,
          label: 'Outbound',
          position: 1,
          color: 'blue',
        },
        {
          id: '9b7e22a4-21f8-4379-8b1f-549a0a802434',
          value: SocialMessageDirection.UNKNOWN,
          label: 'Unknown',
          position: 2,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: SOCIAL_MESSAGE_SENT_VIA_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Sent via',
      name: 'sentVia',
      defaultValue: `'${SocialMessageSentVia.MANUAL}'`,
      options: [
        {
          id: 'a2df96c5-8d37-433b-995a-8b972b85a8aa',
          value: SocialMessageSentVia.MANUAL,
          label: 'Manual',
          position: 0,
          color: 'gray',
        },
        {
          id: '958683e0-a74a-40c2-9e33-43a36a972b03',
          value: SocialMessageSentVia.COMPOSIO,
          label: 'Composio',
          position: 1,
          color: 'purple',
        },
        {
          id: 'e2dc9bec-bf06-48aa-9add-a7a99f7d2917',
          value: SocialMessageSentVia.UNKNOWN,
          label: 'Unknown',
          position: 2,
          color: 'orange',
        },
        {
          id: '6989ae94-6f41-4f00-af49-3aba0e4c2897',
          value: SocialMessageSentVia.UNIPILE,
          label: 'Unipile',
          position: 3,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier: SOCIAL_MESSAGE_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Provider',
      name: 'provider',
      defaultValue: `'${SocialMessageProvider.COMPOSIO_HISTORY}'`,
      options: [
        {
          id: 'e177ebaf-239f-4b44-aa9d-4f4358a1d244',
          value: SocialMessageProvider.COMPOSIO_HISTORY,
          label: 'Composio history',
          position: 0,
          color: 'purple',
        },
        {
          id: '8f616732-93b5-4a23-9f2a-bcb4d47931e4',
          value: SocialMessageProvider.UNIPILE,
          label: 'Unipile',
          position: 1,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_HAS_ATTACHMENTS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      label: 'Has attachments',
      name: 'hasAttachments',
      defaultValue: false,
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_ATTACHMENT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      label: 'Attachment count',
      name: 'attachmentCount',
      defaultValue: 0,
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_DELIVERY_STATE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Delivery state',
      name: 'deliveryState',
      defaultValue: `'${SocialMessageDeliveryState.UNKNOWN}'`,
      options: [
        {
          id: 'ee88c704-acba-411b-9e61-8d953915e7d4',
          value: SocialMessageDeliveryState.UNKNOWN,
          label: 'Unknown',
          position: 0,
          color: 'gray',
        },
        {
          id: 'cd27dfbc-7e8c-44a5-88fd-cd8eeceeab48',
          value: SocialMessageDeliveryState.RECEIVED,
          label: 'Received',
          position: 1,
          color: 'green',
        },
        {
          id: '69d2a394-a90a-4be9-88e8-84acd3378d5e',
          value: SocialMessageDeliveryState.SENT,
          label: 'Sent',
          position: 2,
          color: 'blue',
        },
        {
          id: 'ea556c36-fc36-4d54-917b-cf859a6f095e',
          value: SocialMessageDeliveryState.DELIVERED,
          label: 'Delivered',
          position: 3,
          color: 'turquoise',
        },
        {
          id: 'bebfcc76-371c-40bb-8eec-64093cbd2eb0',
          value: SocialMessageDeliveryState.READ,
          label: 'Read',
          position: 4,
          color: 'purple',
        },
      ],
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_DELIVERY_STATE_UPDATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Delivery state updated at',
      name: 'deliveryStateUpdatedAt',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Provider message ID',
      name: 'providerMessageId',
      isNullable: true,
      defaultValue: null,
      description:
        'Instagram message id when known. Manual first-DM rows may not have one before reconciliation.',
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_PROVIDER_CREATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Provider created at',
      name: 'providerCreatedAt',
      isNullable: true,
      defaultValue: null,
      description: 'Timestamp reported by Instagram for this message.',
    },
    {
      universalIdentifier:
        SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      label: 'Conversation',
      name: 'conversation',
      description: 'Conversation containing this message.',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'conversationId',
      },
    },
  ],
});
