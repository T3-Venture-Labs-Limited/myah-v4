import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  REPLY_DRAFT_APPROVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_BODY_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_GENERATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_SEND_BLOCKED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_SENT_AT_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

enum ReplyDraftStatus {
  DRAFT = 'DRAFT',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
  DISCARDED = 'DISCARDED',
}

enum ReplyDraftSource {
  MANUAL = 'MANUAL',
  AI = 'AI',
  TEMPLATE = 'TEMPLATE',
}

export default defineObject({
  universalIdentifier: REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'myahInstagramReplyDraft',
  namePlural: 'myahInstagramReplyDrafts',
  labelSingular: 'Myah Instagram reply draft',
  labelPlural: 'Myah Instagram reply drafts',
  description:
    'Drafted Instagram reply awaiting human review. Approval never auto-sends; a separate explicit send action is required.',
  icon: 'IconMessagePlus',
  labelIdentifierFieldMetadataUniversalIdentifier:
    REPLY_DRAFT_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: REPLY_DRAFT_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Title',
      name: 'title',
      description: 'Short label for the draft reply.',
    },
    {
      universalIdentifier: REPLY_DRAFT_BODY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Body',
      name: 'body',
      description: 'Reply text to review before explicit send.',
    },
    {
      universalIdentifier: REPLY_DRAFT_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Status',
      name: 'status',
      defaultValue: `'${ReplyDraftStatus.DRAFT}'`,
      options: [
        {
          id: 'f1d82de8-e995-4d97-a8f8-6ebdef1c049b',
          value: ReplyDraftStatus.DRAFT,
          label: 'Draft',
          position: 0,
          color: 'gray',
        },
        {
          id: '3aa09d72-e11e-4c8a-b69f-f6ff0e270360',
          value: ReplyDraftStatus.NEEDS_REVIEW,
          label: 'Needs review',
          position: 1,
          color: 'orange',
        },
        {
          id: '8e46a2b5-fcdb-4ead-9dd5-0c1f31649cd5',
          value: ReplyDraftStatus.APPROVED,
          label: 'Approved',
          position: 2,
          color: 'green',
        },
        {
          id: '704cbe46-2eb2-4cc3-a5fd-ac6367e1b0c4',
          value: ReplyDraftStatus.SENT,
          label: 'Sent',
          position: 3,
          color: 'blue',
        },
        {
          id: '85188535-fc9b-4635-9ce0-2ba1a03b612d',
          value: ReplyDraftStatus.DISCARDED,
          label: 'Discarded',
          position: 4,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier: REPLY_DRAFT_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      label: 'Source',
      name: 'source',
      defaultValue: `'${ReplyDraftSource.MANUAL}'`,
      options: [
        {
          id: '1d31a9c0-5040-4d07-81d2-e5e3a6714328',
          value: ReplyDraftSource.MANUAL,
          label: 'Manual',
          position: 0,
          color: 'gray',
        },
        {
          id: '3718ac3b-5d92-4ef9-98bb-f27ff00f77c6',
          value: ReplyDraftSource.AI,
          label: 'AI',
          position: 1,
          color: 'purple',
        },
        {
          id: '43d1780f-28c5-4323-8211-134d745bac58',
          value: ReplyDraftSource.TEMPLATE,
          label: 'Template',
          position: 2,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier: REPLY_DRAFT_GENERATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Generated at',
      name: 'generatedAt',
      isNullable: true,
      defaultValue: null,
      description: 'When AI or a template generated this draft.',
    },
    {
      universalIdentifier: REPLY_DRAFT_APPROVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Approved at',
      name: 'approvedAt',
      isNullable: true,
      defaultValue: null,
      description: 'When a human approved this draft for a future explicit send.',
    },
    {
      universalIdentifier: REPLY_DRAFT_SENT_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      label: 'Sent at',
      name: 'sentAt',
      isNullable: true,
      defaultValue: null,
      description: 'When the approved draft was explicitly sent.',
    },
    {
      universalIdentifier:
        REPLY_DRAFT_SEND_BLOCKED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Send blocked reason',
      name: 'sendBlockedReason',
      isNullable: true,
      defaultValue: null,
      description:
        'Reason a draft cannot be sent, such as a closed Instagram reply window.',
    },
  ],
});
