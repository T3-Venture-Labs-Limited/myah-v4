import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import applicationConfig from '../application.config';
import {
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
} from '../constants/universal-identifiers';
import instagramAccount from '../objects/instagram-account.object';
import instagramReplyDraft from '../objects/instagram-reply-draft.object';
import socialConversation from '../objects/social-conversation.object';
import socialMessage from '../objects/social-message.object';
import defaultFunctionRole from '../roles/default-function.role';

describe('metadata-only Instagram app manifest', () => {
  it('declares no application or server provider transport', () => {
    expect(applicationConfig.config.applicationVariables).toBeUndefined();
    expect(applicationConfig.config.serverVariables).toBeUndefined();
  });

  it('contains no executable logic-function or polling source', () => {
    expect(
      existsSync(fileURLToPath(new URL('../logic-functions', import.meta.url))),
    ).toBe(false);
    expect(
      existsSync(
        fileURLToPath(
          new URL('../constants/polling-config.ts', import.meta.url),
        ),
      ),
    ).toBe(false);
  });

  it('declares reciprocal source graph relations for account, conversation, messages, and drafts', () => {
    const field = (
      object: { config: { fields: { universalIdentifier: string }[] } },
      universalIdentifier: string,
    ) =>
      object.config.fields.find(
        (candidate) => candidate.universalIdentifier === universalIdentifier,
      );

    expect(
      field(
        instagramAccount,
        INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
      ),
    ).toMatchObject({
      name: 'conversations',
    });
    expect(
      field(
        socialConversation,
        SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
      ),
    ).toMatchObject({
      name: 'instagramAccount',
      relationTargetFieldMetadataUniversalIdentifier:
        INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(
      field(
        socialConversation,
        SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
      ),
    ).toMatchObject({
      name: 'messages',
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(
      field(
        socialMessage,
        SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      ),
    ).toMatchObject({
      name: 'conversation',
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(
      field(
        instagramReplyDraft,
        REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
      ),
    ).toMatchObject({
      name: 'conversation',
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
    });
  });

  it('retains the metadata-only default application role', () => {
    expect(defaultFunctionRole.config).toMatchObject({
      universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
      canReadAllObjectRecords: false,
      canUpdateAllObjectRecords: false,
    });
    expect(defaultFunctionRole.config.description).toMatch(/metadata/i);
  });
});
