import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import {
  createStandardRoleFlatMetadata,
  type CreateStandardRoleArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util';
import {
  MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
  MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS,
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

type Args = Omit<CreateStandardRoleArgs, 'context'>;

const BRAND_BRAIN_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIERS =
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
    ({ roleUniversalIdentifier }) =>
      roleUniversalIdentifier ===
      MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
  ).map(({ universalIdentifier }) => universalIdentifier);

const CREATOR_OPS_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIERS =
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
    ({ roleUniversalIdentifier }) =>
      roleUniversalIdentifier ===
      MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  ).map(({ universalIdentifier }) => universalIdentifier);

const CREATOR_OPS_FIELD_PERMISSION_UNIVERSAL_IDENTIFIERS =
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS.map(
    ({ universalIdentifier }) => universalIdentifier,
  );

const base = {
  description: null,
  icon: null,
  isEditable: true,
  canAccessAllTools: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: true,
  canBeAssignedToApiKeys: true,
  canUpdateAllSettings: false,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
} as const;

export const buildMyahBrandBrainAdminStandardFlatRole = (
  args: Args,
): FlatRole =>
  createStandardRoleFlatMetadata({
    ...args,
    context: {
      ...base,
      roleName: 'brandBrainAdmin',
      universalIdentifier: MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
      label: 'Brand Brain Admin',
      description: 'Can manage Brand Brain pages and links in the local MVP.',
      icon: 'IconNotebook',
      objectPermissionUniversalIdentifiers:
        BRAND_BRAIN_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIERS,
    },
  });

export const buildMyahCreatorOpsDefaultStandardFlatRole = (
  args: Args,
): FlatRole =>
  createStandardRoleFlatMetadata({
    ...args,
    context: {
      ...base,
      roleName: 'creatorOpsDefault',
      universalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
      label: 'Myah Creator Ops default function role',
      description: 'Myah Creator Ops default function role',
      objectPermissionUniversalIdentifiers:
        CREATOR_OPS_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIERS,
      fieldPermissionUniversalIdentifiers:
        CREATOR_OPS_FIELD_PERMISSION_UNIVERSAL_IDENTIFIERS,
    },
  });
