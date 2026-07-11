import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Myah Instagram Messaging',
  description:
    'Test Myah Instagram messaging capabilities through a narrow Composio adapter with reply polling disabled for the initial MVP.',
  logoUrl: undefined,
  applicationVariables: undefined,
  author: 'T3 Venture Labs',
  category: 'Marketing',
  emailSupport: 'contact@myah.dev',
  serverVariables: {
    COMPOSIO_API_KEY: {
      description:
        'Project API key used by server-side logic functions to call Composio direct tool execution. Stored as a secret and never exposed in app records.',
      isSecret: true,
      isRequired: true,
    },
  },
});
