import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { v5 as uuidv5 } from 'uuid';

export const MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER =
  '8563f1a9-4e02-408a-a5d7-45f68779023a';
export const MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '802cf87a-e4c5-559b-89c5-2172e3e5cc2f';

const ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE =
  'b403ec59-4d80-4f22-85e6-717a192dc9cb';

const buildObjectPermissionDefinition = ({
  roleUniversalIdentifier,
  objectMetadataUniversalIdentifier,
}: {
  roleUniversalIdentifier: string;
  objectMetadataUniversalIdentifier: string;
}) => ({
  universalIdentifier: uuidv5(
    `${roleUniversalIdentifier}:${objectMetadataUniversalIdentifier}`,
    ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
  ),
  roleUniversalIdentifier,
  objectMetadataUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: false,
});

export const MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS = [
  ...[
    MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
    MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  ].map((objectMetadataUniversalIdentifier) =>
    buildObjectPermissionDefinition({
      roleUniversalIdentifier:
        MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
      objectMetadataUniversalIdentifier,
    }),
  ),
  ...[
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
    MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.promotedAsset.universalIdentifier,
    MYAH_STANDARD_OBJECTS.offer.universalIdentifier,
    MYAH_STANDARD_OBJECTS.outreachSequence.universalIdentifier,
    MYAH_STANDARD_OBJECTS.outreachStep.universalIdentifier,
    MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
  ].map((objectMetadataUniversalIdentifier) =>
    buildObjectPermissionDefinition({
      roleUniversalIdentifier:
        MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
      objectMetadataUniversalIdentifier,
    }),
  ),
] as const;

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
] as const;

export const MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS =
  PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.map(
    (fieldMetadataUniversalIdentifier) => ({
      universalIdentifier: uuidv5(
        `${MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER}:${MYAH_STANDARD_OBJECTS.creator.universalIdentifier}:${fieldMetadataUniversalIdentifier}`,
        ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
      ),
      roleUniversalIdentifier:
        MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
      objectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      fieldMetadataUniversalIdentifier,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
  );
