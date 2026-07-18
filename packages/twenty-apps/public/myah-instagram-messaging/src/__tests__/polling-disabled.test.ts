import { describe, expect, it } from 'vitest';

import applicationConfig from '../application.config';
import { INSTAGRAM_REPLY_POLLING_ENABLED } from '../constants/polling-config';
import {
  CONNECT_INSTAGRAM_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
} from '../constants/universal-identifiers';
import connectInstagram from '../logic-functions/connect-instagram';
import listInstagramConversations from '../logic-functions/list-instagram-conversations';
import listInstagramMessages from '../logic-functions/list-instagram-messages';
import instagramAccount from '../objects/instagram-account.object';
import instagramReplyDraft from '../objects/instagram-reply-draft.object';
import socialConversation from '../objects/social-conversation.object';
import socialMessage from '../objects/social-message.object';
import defaultFunctionRole from '../roles/default-function.role';

const logicFunctions = [
  connectInstagram,
  listInstagramConversations,
  listInstagramMessages,
];

describe('polling-disabled MVP invariant', () => {
  it('keeps reply polling disabled while messaging capabilities are tested first', () => {
    expect(INSTAGRAM_REPLY_POLLING_ENABLED).toBe(false);
  });

  it('does not advertise cron or automatic reply polling in the application config', () => {
    expect(applicationConfig.config.description).toContain('polling disabled');
    expect(JSON.stringify(applicationConfig.config)).not.toContain(
      'cronTriggerSettings',
    );
    expect(JSON.stringify(applicationConfig.config)).not.toContain('0 * * * *');
    expect(applicationConfig.config.serverVariables).toEqual({
      COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID: {
        description:
          'Shared Myah Composio Instagram OAuth configuration used to create workspace-scoped authorization links.',
        isSecret: false,
        isRequired: true,
      },
    });
    expect(JSON.stringify(applicationConfig.config)).not.toContain(
      'COMPOSIO_API_KEY',
    );
  });

  it('keeps every messaging function manual or workflow-invoked, never cron-invoked', () => {
    for (const logicFunction of logicFunctions) {
      expect(logicFunction.config).not.toHaveProperty('cronTriggerSettings');
      expect(logicFunction.config.workflowActionTriggerSettings).toBeDefined();
    }
  });

  it('ships no direct Instagram sender function', () => {
    expect(JSON.stringify(logicFunctions)).not.toContain('send-instagram');
  });

  it('retains OAuth and bounded manual reads without an app-level sender', () => {
    expect(connectInstagram.config.universalIdentifier).toBe(
      CONNECT_INSTAGRAM_UNIVERSAL_IDENTIFIER,
    );
    expect(listInstagramConversations.config.name).toBe(
      'myah-list-instagram-conversations',
    );
    expect(listInstagramMessages.config.name).toBe(
      'myah-list-instagram-messages',
    );
    expect(JSON.stringify(logicFunctions)).not.toContain(
      'send-instagram-reply',
    );
  });

  it('declares reciprocal source graph relations for account, conversation, messages, and drafts', () => {
    const field = (
      object: { config: { fields: { universalIdentifier: string }[] } },
      universalIdentifier: string,
    ) =>
      object.config.fields.find(
        (candidate) => candidate.universalIdentifier === universalIdentifier,
      );

    expect(field(instagramAccount, INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER)).toMatchObject({
      name: 'conversations',
    });
    expect(field(socialConversation, SOCIAL_CONVERSATION_ACCOUNT_FIELD_UNIVERSAL_IDENTIFIER)).toMatchObject({
      name: 'instagramAccount',
      relationTargetFieldMetadataUniversalIdentifier:
        INSTAGRAM_ACCOUNT_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(field(socialConversation, SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER)).toMatchObject({
      name: 'messages',
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(field(socialMessage, SOCIAL_MESSAGE_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER)).toMatchObject({
      name: 'conversation',
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_MESSAGES_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(field(instagramReplyDraft, REPLY_DRAFT_CONVERSATION_FIELD_UNIVERSAL_IDENTIFIER)).toMatchObject({
      name: 'conversation',
      relationTargetFieldMetadataUniversalIdentifier:
        SOCIAL_CONVERSATION_REPLY_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
    });
  });

  it('declares the default application role through defineApplicationRole', () => {
    expect(defaultFunctionRole.config.universalIdentifier).toBe(
      DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    );
  });
});
