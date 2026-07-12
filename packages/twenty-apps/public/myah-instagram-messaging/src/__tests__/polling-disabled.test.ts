import { describe, expect, it } from 'vitest';

import applicationConfig from '../application.config';
import { INSTAGRAM_REPLY_POLLING_ENABLED } from '../constants/polling-config';
import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from '../constants/universal-identifiers';
import listInstagramConversations from '../logic-functions/list-instagram-conversations';
import listInstagramMessages from '../logic-functions/list-instagram-messages';
import sendInstagramTextMessage from '../logic-functions/send-instagram-text-message';
import defaultFunctionRole from '../roles/default-function.role';

const logicFunctions = [
  listInstagramConversations,
  listInstagramMessages,
  sendInstagramTextMessage,
];

describe('polling-disabled MVP invariant', () => {
  it('keeps reply polling disabled while messaging capabilities are tested first', () => {
    expect(INSTAGRAM_REPLY_POLLING_ENABLED).toBe(false);
  });

  it('does not advertise cron or automatic reply polling in the application config', () => {
    expect(applicationConfig.config.description).toContain('polling disabled');
    expect(JSON.stringify(applicationConfig.config)).not.toContain('cronTriggerSettings');
    expect(JSON.stringify(applicationConfig.config)).not.toContain('0 * * * *');
  });

  it('keeps every messaging function manual or workflow-invoked, never cron-invoked', () => {
    for (const logicFunction of logicFunctions) {
      expect(logicFunction.config).not.toHaveProperty('cronTriggerSettings');
      expect(logicFunction.config.workflowActionTriggerSettings).toBeDefined();
    }
  });

  it('declares the default application role through defineApplicationRole', () => {
    expect(defaultFunctionRole.config.universalIdentifier).toBe(
      DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    );
  });
});
