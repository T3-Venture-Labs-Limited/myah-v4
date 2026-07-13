import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Myah Instagram Messaging',
  description:
    'Read existing Instagram conversations and messages through a narrow Composio adapter with reply polling disabled for the initial MVP.',
  logoUrl: undefined,
  applicationVariables: undefined,
  author: 'T3 Venture Labs',
  category: 'Marketing',
  emailSupport: 'contact@myah.dev',
  serverVariables: {
    COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID: {
      description:
        'Shared Myah Composio Instagram OAuth configuration used to create workspace-scoped authorization links.',
      isSecret: false,
      isRequired: true,
    },
  },
});
