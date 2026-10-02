import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';

const objects = [
  MYAH_STANDARD_OBJECTS.partnershipOfferVersion,
  MYAH_STANDARD_OBJECTS.partnershipObligation,
];
const objectIds = new Set<string>(
  objects.map(({ universalIdentifier }) => universalIdentifier),
);
const fieldOwners = new Map([
  ...objects.flatMap((object) =>
    Object.values(object.fields).map(
      (field) =>
        [field.universalIdentifier, object.universalIdentifier] as const,
    ),
  ),
  [
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
      .universalIdentifier,
    STANDARD_OBJECTS.campaignCreator.universalIdentifier,
  ],
  [
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
      .universalIdentifier,
    STANDARD_OBJECTS.campaignCreator.universalIdentifier,
  ],
  [
    STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
    STANDARD_OBJECTS.task.universalIdentifier,
  ],
]);
const indexOwners = new Map(
  objects.flatMap((object) =>
    Object.values(object.indexes).map(
      (index) =>
        [index.universalIdentifier, object.universalIdentifier] as const,
    ),
  ),
);
const permissionOwners = new Map(
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
    ({ objectMetadataUniversalIdentifier }) =>
      objectIds.has(objectMetadataUniversalIdentifier),
  ).map(
    ({
      universalIdentifier,
      objectMetadataUniversalIdentifier,
      roleUniversalIdentifier,
    }) =>
      [
        universalIdentifier,
        { objectMetadataUniversalIdentifier, roleUniversalIdentifier },
      ] as const,
  ),
);

// Admission check only. A passing result does not prove plan completeness, physical
// compatibility, receipt atomicity or permission to execute the plan.
export const assertPartnershipFactsPlanIsAdditive = (
  plan: WorkspaceMigration,
): void => {
  if (
    plan.applicationUniversalIdentifier !==
      TWENTY_STANDARD_APPLICATION.universalIdentifier ||
    !plan.actions.length
  ) {
    throw new Error('Partnership facts plan application or actions missing');
  }
  for (const action of plan.actions) {
    if (action.type !== 'create')
      throw new Error('Partnership facts plan contains a non-create action');
    if (
      ![
        'objectMetadata',
        'fieldMetadata',
        'index',
        'objectPermission',
      ].includes(action.metadataName)
    ) {
      throw new Error('Partnership facts plan contains an unsupported action');
    }
    const entity = action.flatEntity as {
      universalIdentifier: string;
      applicationUniversalIdentifier: string;
      objectMetadataUniversalIdentifier?: string;
    };
    const owner =
      action.metadataName === 'objectMetadata'
        ? objectIds.has(entity.universalIdentifier)
          ? entity.universalIdentifier
          : undefined
        : action.metadataName === 'fieldMetadata'
          ? fieldOwners.get(entity.universalIdentifier)
          : action.metadataName === 'index'
            ? indexOwners.get(entity.universalIdentifier)
            : permissionOwners.get(entity.universalIdentifier)
                ?.objectMetadataUniversalIdentifier;
    if (
      !owner ||
      entity.applicationUniversalIdentifier !==
        TWENTY_STANDARD_APPLICATION.universalIdentifier ||
      (action.metadataName !== 'objectMetadata' &&
        entity.objectMetadataUniversalIdentifier !== owner)
    ) {
      throw new Error(
        'Partnership facts plan targets an unrelated entity or owner',
      );
    }
    if (action.metadataName === 'objectMetadata') {
      const fieldIds = action.universalFlatFieldMetadatas.map(
        (field) => field.universalIdentifier,
      );
      if (
        action.universalFlatFieldMetadatas.some(
          (field) =>
            fieldOwners.get(field.universalIdentifier) !== owner ||
            field.applicationUniversalIdentifier !==
              TWENTY_STANDARD_APPLICATION.universalIdentifier ||
            field.objectMetadataUniversalIdentifier !== owner,
        ) ||
        Object.keys(action.fieldIdByUniversalIdentifier ?? {}).some(
          (id) => !fieldIds.includes(id),
        )
      ) {
        throw new Error('Partnership facts plan embeds an unrelated field');
      }
    }
    if (action.metadataName === 'fieldMetadata') {
      if (
        action.relatedUniversalFlatFieldMetadata &&
        (fieldOwners.get(
          action.relatedUniversalFlatFieldMetadata.universalIdentifier,
        ) !==
          action.relatedUniversalFlatFieldMetadata
            .objectMetadataUniversalIdentifier ||
          action.relatedUniversalFlatFieldMetadata
            .applicationUniversalIdentifier !==
            TWENTY_STANDARD_APPLICATION.universalIdentifier)
      ) {
        throw new Error(
          'Partnership facts plan creates an unrelated inverse field',
        );
      }
      if (
        Object.keys(action.fieldIdByUniversalIdentifier ?? {}).some(
          (id) => !fieldOwners.has(id),
        )
      ) {
        throw new Error(
          'Partnership facts plan preallocates an unrelated field',
        );
      }
    }
    if (
      action.metadataName === 'index' &&
      (!action.flatEntity.universalFlatIndexFieldMetadatas.length ||
        action.flatEntity.universalFlatIndexFieldMetadatas.some(
          (member) =>
            member.indexMetadataUniversalIdentifier !==
              entity.universalIdentifier ||
            fieldOwners.get(member.fieldMetadataUniversalIdentifier) !== owner,
        ))
    ) {
      throw new Error('Partnership facts plan indexes an unrelated field');
    }
    if (
      action.metadataName === 'objectPermission' &&
      action.flatEntity.roleUniversalIdentifier !==
        permissionOwners.get(entity.universalIdentifier)
          ?.roleUniversalIdentifier
    ) {
      throw new Error('Partnership facts plan grants an unrelated role');
    }
  }
};
