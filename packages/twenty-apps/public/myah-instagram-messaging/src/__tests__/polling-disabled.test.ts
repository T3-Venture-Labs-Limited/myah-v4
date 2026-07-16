import { NavigationMenuItemType, ViewType } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import applicationConfig from '../application.config';
import { INSTAGRAM_REPLY_POLLING_ENABLED } from '../constants/polling-config';
import {
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
} from '../constants/universal-identifiers';
import listInstagramConversations from '../logic-functions/list-instagram-conversations';
import listInstagramMessages from '../logic-functions/list-instagram-messages';
import defaultFunctionRole from '../roles/default-function.role';
import inboxNavigationMenuItem from '../navigation-menu-items/inbox';
import inboxView from '../views/inbox';

const logicFunctions = [listInstagramConversations, listInstagramMessages];

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

  it('declares the default application role through defineApplicationRole', () => {
    expect(defaultFunctionRole.config.universalIdentifier).toBe(
      DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    );
  });

  it('allows the manual refresh function to read and update only conversations', () => {
    expect(defaultFunctionRole.config.objectPermissions).toContainEqual({
      objectUniversalIdentifier:
        SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
  });

  it('exposes Inbox as a native table view for conversation triage', () => {
    expect(inboxView.config).toMatchObject({
      name: 'Inbox',
      objectUniversalIdentifier: SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
      type: ViewType.TABLE,
    });
    expect(inboxNavigationMenuItem.config).toMatchObject({
      name: 'Inbox',
      type: NavigationMenuItemType.VIEW,
      viewUniversalIdentifier: inboxView.config.universalIdentifier,
    });
    expect(inboxNavigationMenuItem.config).not.toHaveProperty(
      'pageLayoutUniversalIdentifier',
    );
  });
});
