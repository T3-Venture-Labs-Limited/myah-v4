import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Myah Shopify',
  description:
    'Connect Shopify store context to Myah agents through read-only tools.',
  logoUrl: 'public/shopify.svg',
  author: 'Myah',
  category: 'E-commerce',
  websiteUrl: 'https://myah.dev',
});
