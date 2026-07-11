import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SOCIAL_MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_SENT_VIA_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_TEXT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

enum SocialMessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

enum SocialMessageSentVia {
  MANUAL = 'MANUAL',
  COMPOSIO = 'COMPOSIO',
  UNKNOWN = 'UNKNOWN',
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
      ],
    },
    {
      universalIdentifier: SOCIAL_MESSAGE_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Provider message ID',
      name: 'providerMessageId',
      isNullable: true,
      defaultValue: null,
      description:
        'Instagram message id when known. Manual first-DM rows may not have one before reconciliation.',
    },
  ],
});
