import { defineRole } from 'twenty-sdk/define';

import { BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-link.object';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';

export const BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER =
  '8563f1a9-4e02-408a-a5d7-45f68779023a';

export default defineRole({
  universalIdentifier: BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Brand Brain Admin',
  description: 'Can manage Brand Brain pages and links in the local MVP.',
  icon: 'IconNotebook',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  objectPermissions: [
    {
      objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    },
    {
      objectUniversalIdentifier: BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    },
  ],
  canBeAssignedToAgents: true,
  canBeAssignedToUsers: true,
  canBeAssignedToApiKeys: true,
});
