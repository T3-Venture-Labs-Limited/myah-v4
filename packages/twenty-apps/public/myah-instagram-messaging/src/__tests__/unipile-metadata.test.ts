import { FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import applicationConfig from '../application.config';
import instagramConversationsOnCreator from '../fields/instagram-conversations-on-creator.field';
import instagramMessageDraftsOnCreator from '../fields/instagram-message-drafts-on-creator.field';
import socialConversationProviderIdentityIndex from '../indexes/social-conversation-provider-identity.index';
import socialMessageProviderIdentityIndex from '../indexes/social-message-provider-identity.index';
import instagramAccount from '../objects/instagram-account.object';
import instagramReplyDraft from '../objects/instagram-reply-draft.object';
import socialConversation from '../objects/social-conversation.object';
import socialMessage from '../objects/social-message.object';

const INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER =
  '2d357469-831a-4629-ad4b-47335900e883';
const SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER =
  '36817464-855f-42db-9fbb-f8853643f8d6';
const SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER =
  '7241bd44-e474-4904-8636-339276b3feff';
const INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER =
  '85762d24-541b-407f-9d6a-cdf89552c665';
const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';

const INSTAGRAM_ACCOUNT_COMPLETED_CHAT_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '23224a02-a2f3-490f-81f4-84273cc113d1';
const SOCIAL_CONVERSATION_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER =
  '99cbc07b-138a-4d0a-b9f3-05d0be9e46b3';
const SOCIAL_CONVERSATION_LIFECYCLE_FIELD_UNIVERSAL_IDENTIFIER =
  '74b47e38-60ec-4f11-8c23-4e622b7d3045';
const SOCIAL_CONVERSATION_RECIPIENT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER =
  '39b1ef10-36da-452b-a246-0334eea7d78e';
const SOCIAL_CONVERSATION_RECIPIENT_DISPLAY_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  'e1a10c6b-f59e-4597-8d7b-3003b97609fb';
const SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER =
  '6b26848c-ab3b-45dd-ad62-9d194512b116';
const CREATOR_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER =
  'c46dbf9f-ceaf-4fb5-a7b9-8b05dd579935';
const SOCIAL_CONVERSATION_COMPLETED_MESSAGE_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER =
  'e824bee6-188d-445f-b3ac-dcf8f365161c';
const SOCIAL_MESSAGE_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER =
  'b421f20f-363c-4ce5-af0a-b4dcede88e9f';
const SOCIAL_MESSAGE_HAS_ATTACHMENTS_FIELD_UNIVERSAL_IDENTIFIER =
  '2208e340-552f-430c-b1a1-b0bbc033e4eb';
const SOCIAL_MESSAGE_ATTACHMENT_COUNT_FIELD_UNIVERSAL_IDENTIFIER =
  'cd621cac-95e8-4894-ac9f-dac654612bd9';
const SOCIAL_MESSAGE_DELIVERY_STATE_FIELD_UNIVERSAL_IDENTIFIER =
  '27ab20f0-3339-4c10-b9d3-76b774b40ca5';
const SOCIAL_MESSAGE_DELIVERY_STATE_UPDATED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '0d8bafac-00b0-45ed-860c-3bf1f0711fd2';
const INSTAGRAM_REPLY_DRAFT_KIND_FIELD_UNIVERSAL_IDENTIFIER =
  '51f98b6b-dbb8-49c9-9c16-30695b301f77';
const INSTAGRAM_REPLY_DRAFT_CREATOR_FIELD_UNIVERSAL_IDENTIFIER =
  '2cc8ea09-7c86-41bd-80ea-efcc5edc81e5';
const CREATOR_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER =
  'f072449f-7fc3-4481-b9d3-b255add4a574';
const INSTAGRAM_REPLY_DRAFT_RECIPIENT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER =
  'a46d5603-cff8-46de-8907-292ef82b4e25';
const INSTAGRAM_REPLY_DRAFT_RECIPIENT_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER =
  '4a79a104-ac37-4920-9ef7-181e52756574';
const INSTAGRAM_REPLY_DRAFT_REVISION_FIELD_UNIVERSAL_IDENTIFIER =
  '0d53dfe9-0252-45c4-a3aa-78d640798d38';

const SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER =
  'd3252d54-709f-4ae6-89bb-2ed4b21fa9a8';
const SOCIAL_CONVERSATION_RECIPIENT_IGSID_FIELD_UNIVERSAL_IDENTIFIER =
  'feaaf284-4421-44df-84d5-70c31732bd1e';
const SOCIAL_CONVERSATION_INSTAGRAM_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER =
  '64c89b5d-9b54-4fb0-804e-b0c3cd110711';
const INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER =
  '08930cbe-877b-484d-8570-4ad1b8f8f5c0';
const SOCIAL_MESSAGE_TEXT_FIELD_UNIVERSAL_IDENTIFIER =
  'ceb3642e-b4b4-44b7-8297-fa3ac944dc19';
const SOCIAL_MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER =
  '882c38ea-7464-4d2f-9dab-8468e14814ad';
const SOCIAL_MESSAGE_SENT_VIA_FIELD_UNIVERSAL_IDENTIFIER =
  'eacf38d5-b3e9-4838-b115-d879df85fe72';
const SOCIAL_MESSAGE_PROVIDER_MESSAGE_ID_FIELD_UNIVERSAL_IDENTIFIER =
  '9132e7f5-8607-4d36-95b2-1dd557ef35e8';
const SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER =
  '80670f08-59e0-4f45-9058-e7221d66b95f';
const SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER =
  '49f3eeac-b8a5-4362-827a-7dc597d2dcb4';
const SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER =
  '006182fc-786f-4ea3-8168-6a5d440d76ac';
const INSTAGRAM_REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER =
  'cbf131df-81b8-4ff5-aadf-42f6ae55d6c8';

const SOCIAL_CONVERSATION_PROVIDER_IDENTITY_INDEX_UNIVERSAL_IDENTIFIER =
  '574979a4-1216-43d1-b302-0c18240a0450';
const SOCIAL_CONVERSATION_PROVIDER_INDEX_FIELD_UNIVERSAL_IDENTIFIER =
  'b59f221b-c82a-4c15-8970-4034ea6c8da8';
const SOCIAL_CONVERSATION_ACCOUNT_INDEX_FIELD_UNIVERSAL_IDENTIFIER =
  'e7d02e0f-14f6-43a9-b366-eb92fe8ba1e3';
const SOCIAL_CONVERSATION_PROVIDER_CONVERSATION_ID_INDEX_FIELD_UNIVERSAL_IDENTIFIER =
  'd86b9b8d-35e3-4fc0-8c0a-973e48be60d8';
const SOCIAL_MESSAGE_PROVIDER_IDENTITY_INDEX_UNIVERSAL_IDENTIFIER =
  '1718368c-182b-4643-bb7a-5a5f2ab3e9b8';
const SOCIAL_MESSAGE_PROVIDER_INDEX_FIELD_UNIVERSAL_IDENTIFIER =
  '55fd3672-7ac8-40b2-a359-92cd4c08c88b';
const SOCIAL_MESSAGE_CONVERSATION_INDEX_FIELD_UNIVERSAL_IDENTIFIER =
  '67ec8a20-b415-4da6-85f3-ed08dab78054';
const SOCIAL_MESSAGE_PROVIDER_MESSAGE_ID_INDEX_FIELD_UNIVERSAL_IDENTIFIER =
  'e587218c-73c6-4df3-96d0-ce66d7f40b46';

type TestField = Record<string, unknown> & {
  name: string;
  options?: readonly unknown[];
};

const field = (
  object: { config: { fields: readonly { name: string }[] } },
  name: string,
): TestField =>
  object.config.fields.find(
    (candidate) => candidate.name === name,
  ) as TestField;

const option = (id: string, value: string, label: string) =>
  expect.objectContaining({
    id,
    value,
    label,
  });

describe('Unipile Instagram metadata', () => {
  it('keeps the four application object identities stable', () => {
    expect(instagramAccount.config.universalIdentifier).toBe(
      INSTAGRAM_ACCOUNT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(socialConversation.config.universalIdentifier).toBe(
      SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(socialMessage.config.universalIdentifier).toBe(
      SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(instagramReplyDraft.config.universalIdentifier).toBe(
      INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
  });

  it('records when an account has completed its chat synchronization', () => {
    expect(field(instagramAccount, 'completedChatSyncAt')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_ACCOUNT_COMPLETED_CHAT_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'completedChatSyncAt',
      isNullable: true,
      defaultValue: null,
    });
  });

  it('models the synchronized conversation provider, lifecycle, recipient, and creator', () => {
    expect(field(socialConversation, 'provider')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'provider',
      defaultValue: "'COMPOSIO_HISTORY'",
    });
    expect(field(socialConversation, 'provider').options).toEqual(
      expect.arrayContaining([
        option(
          'e161e884-2f21-44ad-a6ac-5e221a0c1cee',
          'COMPOSIO_HISTORY',
          'Composio history',
        ),
        option('5dcd0095-ae5f-431a-8fe2-d5d0e22c98ce', 'UNIPILE', 'Unipile'),
      ]),
    );
    expect(field(socialConversation, 'lifecycle')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_LIFECYCLE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'lifecycle',
      defaultValue: "'HISTORICAL'",
    });
    expect(field(socialConversation, 'lifecycle').options).toEqual(
      expect.arrayContaining([
        option('f0dec157-630f-46d0-ba8a-678f9082d2f9', 'ACTIVE', 'Active'),
        option(
          '4845c0dc-5892-46dc-9682-b008c6f6070f',
          'HISTORICAL',
          'Historical',
        ),
      ]),
    );
    expect(field(socialConversation, 'recipientIgsid')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_RECIPIENT_IGSID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recipientIgsid',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(socialConversation, 'instagramAccount')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_INSTAGRAM_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      name: 'instagramAccount',
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
    });
    expect(field(socialConversation, 'recipientUsername')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_RECIPIENT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recipientUsername',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(socialConversation, 'recipientDisplayName')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_RECIPIENT_DISPLAY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recipientDisplayName',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(socialConversation, 'creator')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
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
    });
    expect(field(socialConversation, 'completedMessageSyncAt')).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_COMPLETED_MESSAGE_SYNC_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'completedMessageSyncAt',
      isNullable: true,
      defaultValue: null,
    });
  });

  it('models nullable message content, delivery, attachments, and source provider', () => {
    expect(field(socialMessage, 'text')).toMatchObject({
      universalIdentifier: SOCIAL_MESSAGE_TEXT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'text',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(socialMessage, 'direction')).toMatchObject({
      universalIdentifier: SOCIAL_MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'direction',
    });
    expect(field(socialMessage, 'direction').options).toEqual(
      expect.arrayContaining([
        option('9b7e22a4-21f8-4379-8b1f-549a0a802434', 'UNKNOWN', 'Unknown'),
      ]),
    );
    expect(field(socialMessage, 'sentVia')).toMatchObject({
      universalIdentifier: SOCIAL_MESSAGE_SENT_VIA_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'sentVia',
      defaultValue: "'MANUAL'",
    });
    expect(field(socialMessage, 'sentVia').options).toEqual(
      expect.arrayContaining([
        option('6989ae94-6f41-4f00-af49-3aba0e4c2897', 'UNIPILE', 'Unipile'),
      ]),
    );
    expect(field(socialMessage, 'provider')).toMatchObject({
      universalIdentifier: SOCIAL_MESSAGE_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'provider',
      defaultValue: "'COMPOSIO_HISTORY'",
    });
    expect(field(socialMessage, 'provider').options).toEqual(
      expect.arrayContaining([
        option(
          'e177ebaf-239f-4b44-aa9d-4f4358a1d244',
          'COMPOSIO_HISTORY',
          'Composio history',
        ),
        option('8f616732-93b5-4a23-9f2a-bcb4d47931e4', 'UNIPILE', 'Unipile'),
      ]),
    );
    expect(field(socialMessage, 'hasAttachments')).toMatchObject({
      universalIdentifier:
        SOCIAL_MESSAGE_HAS_ATTACHMENTS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'hasAttachments',
      defaultValue: false,
    });
    expect(field(socialMessage, 'attachmentCount')).toMatchObject({
      universalIdentifier:
        SOCIAL_MESSAGE_ATTACHMENT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'attachmentCount',
      defaultValue: 0,
    });
    expect(field(socialMessage, 'deliveryState')).toMatchObject({
      universalIdentifier:
        SOCIAL_MESSAGE_DELIVERY_STATE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'deliveryState',
      defaultValue: "'UNKNOWN'",
    });
    expect(field(socialMessage, 'deliveryState').options).toEqual(
      expect.arrayContaining([
        option('ee88c704-acba-411b-9e61-8d953915e7d4', 'UNKNOWN', 'Unknown'),
        option('cd27dfbc-7e8c-44a5-88fd-cd8eeceeab48', 'RECEIVED', 'Received'),
        option('69d2a394-a90a-4be9-88e8-84acd3378d5e', 'SENT', 'Sent'),
        option(
          'ea556c36-fc36-4d54-917b-cf859a6f095e',
          'DELIVERED',
          'Delivered',
        ),
        option('bebfcc76-371c-40bb-8eec-64093cbd2eb0', 'READ', 'Read'),
      ]),
    );
    expect(field(socialMessage, 'deliveryStateUpdatedAt')).toMatchObject({
      universalIdentifier:
        SOCIAL_MESSAGE_DELIVERY_STATE_UPDATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'deliveryStateUpdatedAt',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(socialMessage, 'conversation')).toMatchObject({
      universalIdentifier:
        SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      name: 'conversation',
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
    });
  });

  it('makes Instagram message drafts provider-neutral and revisioned', () => {
    expect(instagramReplyDraft.config).toMatchObject({
      labelSingular: 'Myah Instagram message draft',
      labelPlural: 'Myah Instagram message drafts',
    });
    expect(instagramReplyDraft.config.description).toMatch(
      /Instagram message draft/i,
    );
    expect(instagramReplyDraft.config.description).not.toMatch(
      /composio|unipile/i,
    );
    expect(field(instagramReplyDraft, 'kind')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_REPLY_DRAFT_KIND_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'kind',
      defaultValue: "'REPLY'",
    });
    expect(field(instagramReplyDraft, 'kind').options).toEqual(
      expect.arrayContaining([
        option(
          '391098f4-d2a7-4969-9352-9f24103dd12c',
          'FIRST_MESSAGE',
          'First message',
        ),
        option('560e4db8-2875-432c-8131-f14cf59395df', 'REPLY', 'Reply'),
      ]),
    );
    expect(field(instagramReplyDraft, 'creator')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_REPLY_DRAFT_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      name: 'creator',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'creatorId',
      },
    });
    expect(field(instagramReplyDraft, 'recipientUsername')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_REPLY_DRAFT_RECIPIENT_USERNAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recipientUsername',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(instagramReplyDraft, 'recipientProviderId')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_REPLY_DRAFT_RECIPIENT_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recipientProviderId',
      isNullable: true,
      defaultValue: null,
    });
    expect(field(instagramReplyDraft, 'revision')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_REPLY_DRAFT_REVISION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'revision',
      defaultValue: 1,
    });
    expect(field(instagramReplyDraft, 'conversation')).toMatchObject({
      universalIdentifier:
        INSTAGRAM_REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      name: 'conversation',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'conversationId',
      },
    });
  });

  it('declares both Creator inverse relation fields through the app SDK', () => {
    expect(instagramConversationsOnCreator.config).toMatchObject({
      universalIdentifier: CREATOR_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
      objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      name: 'instagramConversations',
      relationTargetObjectMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
    expect(instagramMessageDraftsOnCreator.config).toMatchObject({
      universalIdentifier: CREATOR_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
      objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      type: FieldType.RELATION,
      name: 'instagramMessageDrafts',
      relationTargetObjectMetadataUniversalIdentifier:
        INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        INSTAGRAM_REPLY_DRAFT_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
  });

  it('declares the exact unique provider identity indexes', () => {
    expect(socialConversationProviderIdentityIndex.config).toMatchObject({
      universalIdentifier:
        SOCIAL_CONVERSATION_PROVIDER_IDENTITY_INDEX_UNIVERSAL_IDENTIFIER,
      objectUniversalIdentifier:
        SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      isUnique: true,
      fields: [
        {
          universalIdentifier:
            SOCIAL_CONVERSATION_PROVIDER_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
          fieldUniversalIdentifier:
            SOCIAL_CONVERSATION_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
        },
        {
          universalIdentifier:
            SOCIAL_CONVERSATION_ACCOUNT_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
          fieldUniversalIdentifier:
            SOCIAL_CONVERSATION_INSTAGRAM_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
        },
        {
          universalIdentifier:
            SOCIAL_CONVERSATION_PROVIDER_CONVERSATION_ID_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
          fieldUniversalIdentifier:
            SOCIAL_CONVERSATION_PROVIDER_ID_FIELD_UNIVERSAL_IDENTIFIER,
        },
      ],
    });
    expect(socialMessageProviderIdentityIndex.config).toMatchObject({
      universalIdentifier:
        SOCIAL_MESSAGE_PROVIDER_IDENTITY_INDEX_UNIVERSAL_IDENTIFIER,
      objectUniversalIdentifier: SOCIAL_MESSAGE_OBJECT_UNIVERSAL_IDENTIFIER,
      isUnique: true,
      fields: [
        {
          universalIdentifier:
            SOCIAL_MESSAGE_PROVIDER_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
          fieldUniversalIdentifier:
            SOCIAL_MESSAGE_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
        },
        {
          universalIdentifier:
            SOCIAL_MESSAGE_CONVERSATION_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
          fieldUniversalIdentifier:
            SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
        },
        {
          universalIdentifier:
            SOCIAL_MESSAGE_PROVIDER_MESSAGE_ID_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
          fieldUniversalIdentifier:
            SOCIAL_MESSAGE_PROVIDER_MESSAGE_ID_FIELD_UNIVERSAL_IDENTIFIER,
        },
      ],
    });
  });

  it('keeps application copy provider-neutral without adding Unipile secrets', () => {
    expect(applicationConfig.config.displayName).toBe(
      'Myah Instagram Messaging',
    );
    expect(applicationConfig.config.description).toMatch(
      /Instagram conversations and messages/i,
    );
    expect(applicationConfig.config.description).not.toMatch(
      /composio|unipile/i,
    );
    expect(applicationConfig.config.serverVariables).toMatchObject({
      COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID: {
        description:
          'Shared Myah Composio Instagram OAuth configuration used to create workspace-scoped authorization links.',
        isRequired: true,
        isSecret: false,
      },
    });
    expect(applicationConfig.config.serverVariables).not.toHaveProperty(
      'UNIPILE_API_KEY',
    );
    expect(applicationConfig.config.serverVariables).not.toHaveProperty(
      'UNIPILE_WEBHOOK_SECRET',
    );
  });
});
