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
  canSoftDeleteObjectRecords = true,
}: {
  roleUniversalIdentifier: string;
  objectMetadataUniversalIdentifier: string;
  canSoftDeleteObjectRecords?: boolean;
}) => ({
  universalIdentifier: uuidv5(
    `${roleUniversalIdentifier}:${objectMetadataUniversalIdentifier}`,
    ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
  ),
  roleUniversalIdentifier,
  objectMetadataUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords,
  canDestroyObjectRecords: false,
});

const buildReadOnlyObjectPermissionDefinition = ({
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
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const MYAH_CAMPAIGN_ACCOUNT_READ_ONLY_OBJECT_PERMISSION_DEFINITION =
  buildReadOnlyObjectPermissionDefinition({
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.campaignAccount.universalIdentifier,
  });

export const MYAH_CAMPAIGN_ACCOUNT_READ_ONLY_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIER =
  MYAH_CAMPAIGN_ACCOUNT_READ_ONLY_OBJECT_PERMISSION_DEFINITION.universalIdentifier;

export const MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS = [
  ...[
    MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
    MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  ].map((objectMetadataUniversalIdentifier) =>
    buildObjectPermissionDefinition({
      roleUniversalIdentifier: MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
      objectMetadataUniversalIdentifier,
    }),
  ),
  ...[
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
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
  buildObjectPermissionDefinition({
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.socialProfile.universalIdentifier,
    canSoftDeleteObjectRecords: false,
  }),
  buildObjectPermissionDefinition({
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
    canSoftDeleteObjectRecords: false,
  }),
  {
    universalIdentifier: uuidv5(
      `${MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER}:${MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier}`,
      ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
    ),
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
  },
  MYAH_CAMPAIGN_ACCOUNT_READ_ONLY_OBJECT_PERMISSION_DEFINITION,
  buildReadOnlyObjectPermissionDefinition({
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.campaignCreatorList.universalIdentifier,
  }),
  buildReadOnlyObjectPermissionDefinition({
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.campaignCreatorListSource.universalIdentifier,
  }),
  buildReadOnlyObjectPermissionDefinition({
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
    objectMetadataUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
  }),
] as const;

const PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS = [
  MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creator.fields.phone.universalIdentifier,
] as const;
const CAMPAIGN_CREATOR_PROTECTED_FIELDS = [
  [
    MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.campaign.universalIdentifier,
  ],
  [
    MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.creator.universalIdentifier,
  ],
  [
    MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.isDirectlyAdded
      .universalIdentifier,
  ],
] as const;
const CAMPAIGN_CREATOR_LIST_SOURCE_PROTECTED_FIELDS = [
  [
    MYAH_STANDARD_OBJECTS.campaignCreatorListSource.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreatorListSource.fields.campaignCreator
      .universalIdentifier,
  ],
  [
    MYAH_STANDARD_OBJECTS.campaignCreatorListSource.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreatorListSource.fields.creatorList
      .universalIdentifier,
  ],
] as const;

export const MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS = [
  ...[
    ...CAMPAIGN_CREATOR_PROTECTED_FIELDS,
    ...CAMPAIGN_CREATOR_LIST_SOURCE_PROTECTED_FIELDS,
  ].map(
    ([
      objectMetadataUniversalIdentifier,
      fieldMetadataUniversalIdentifier,
    ]) => ({
      universalIdentifier: uuidv5(
        `${MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER}:${objectMetadataUniversalIdentifier}:${fieldMetadataUniversalIdentifier}`,
        ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
      ),
      roleUniversalIdentifier:
        MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
      objectMetadataUniversalIdentifier,
      fieldMetadataUniversalIdentifier,
      canReadFieldValue: true,
      canUpdateFieldValue: false,
    }),
  ),
  ...PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.map(
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
  ),
] as const;
