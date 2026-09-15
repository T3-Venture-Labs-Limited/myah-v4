import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Myah Instagram Messaging',
  description: 'Historical Instagram metadata for server-managed messaging.',
  logoUrl: undefined,
  author: 'T3 Venture Labs',
  category: 'Marketing',
  emailSupport: 'contact@myah.dev',
});
