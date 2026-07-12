import { defineApplication } from 'twenty-sdk/define';

import { BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/brand-brain-admin.role';

export default defineApplication({
  universalIdentifier: '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991',
  displayName: 'Brand Brain Record Wiki MVP',
  description:
    'Record-backed Brand Brain pages with hierarchy, backlinks, and direct agent-written knowledge updates.',
  defaultRoleUniversalIdentifier: BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
});
