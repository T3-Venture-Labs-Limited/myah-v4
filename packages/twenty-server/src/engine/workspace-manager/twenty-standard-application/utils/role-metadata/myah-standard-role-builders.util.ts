import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import {
  createStandardRoleFlatMetadata,
  type CreateStandardRoleArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util';

type Args = Omit<CreateStandardRoleArgs, 'context'>;

const BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER =
  '8563f1a9-4e02-408a-a5d7-45f68779023a';
const CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '802cf87a-e4c5-559b-89c5-2172e3e5cc2f';

const BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS = [
  '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
  'f99ff6bc-3b56-4600-beb3-cfc2c23364f6',
];

const CREATOR_OPS_OBJECT_UNIVERSAL_IDENTIFIERS = [
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
  'd51f2758-055b-5367-8250-859cb3f58631',
  'e004c4b4-b1e1-59d9-b096-9fc57875d47f',
  '9a09d54a-d464-5692-ac74-70527fb00ddd',
  'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a',
  '843aa6c8-36af-5906-8241-4017c4188df7',
  'fd8a37b8-72db-5069-902a-a1763ddc63f7',
  '0446497e-3240-5a78-a02f-e08594e5c2af',
  'c25bfef3-4636-5864-a777-705238c91326',
  'b4459926-2c01-560a-8432-fa1974168439',
];

const PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS = [
  'c4bccf25-cfd1-5648-918e-bf20b32ed375',
  'ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29',
  '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
  '1186d5b4-385f-5566-a4ba-87b8f65cdee5',
  'd383c2c2-9617-548f-a0ab-266b7dbe0789',
  'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31',
  '3db5e356-13b9-539d-8320-7c6606e3c574',
  '52162ce6-20b6-536d-b6b1-c21271c96006',
  'af645cc7-31fc-5175-af8d-427845ebe1ed',
  'cba072b8-6758-5eaa-bc1c-72e94a75b112',
  '6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab',
  'bdaf9a54-8931-5e51-836f-eb1cf6b11fcb',
  'bbfda234-327c-5d9d-ac39-8a33fd06779d',
  'cba84727-9219-502a-9880-a14bee741515',
  'b286bdf2-3024-575d-b852-adf935061749',
  'fa743d1a-aa43-5976-b6b2-8131a533ae5b',
  '789717de-3c12-59c3-b91a-ca4a70d00886',
  'f10ed5aa-ff19-5cbe-b176-ae4bf642edf1',
  'd68083f5-0db1-5c77-ac35-640a2fdb1f3f',
];

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
      universalIdentifier: BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
      label: 'Brand Brain Admin',
      description: 'Can manage Brand Brain pages and links in the local MVP.',
      icon: 'IconNotebook',
      objectPermissionUniversalIdentifiers:
        BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS,
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
      universalIdentifier: CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
      label: 'Myah Creator Ops default function role',
      description: 'Myah Creator Ops default function role',
      objectPermissionUniversalIdentifiers:
        CREATOR_OPS_OBJECT_UNIVERSAL_IDENTIFIERS,
      fieldPermissionUniversalIdentifiers:
        PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
    },
  });
