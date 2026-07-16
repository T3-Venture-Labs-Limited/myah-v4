import { v4 } from 'uuid';
import { isDefined } from 'twenty-shared/utils';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { findFlatEntityByUniversalIdentifierOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier-or-throw.util';
import type { FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import type { FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import type { FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

export const buildStandardFlatFieldPermissionMaps = ({
  now,
  workspaceId,
  twentyStandardApplicationId,
  dependencyFlatEntityMaps,
}: {
  now: string;
  workspaceId: string;
  twentyStandardApplicationId: string;
  dependencyFlatEntityMaps: {
    flatRoleMaps: FlatEntityMaps<FlatRole>;
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
    flatFieldMetadataMaps: {
      universalIdentifierById: Partial<Record<string, string>>;
    };
  };
}): FlatEntityMaps<FlatFieldPermission> => {
  let flatFieldPermissionMaps = createEmptyFlatEntityMaps();
  const fieldMetadataIdByUniversalIdentifier = new Map(
    Object.entries(
      dependencyFlatEntityMaps.flatFieldMetadataMaps.universalIdentifierById,
    ).map(([id, universalIdentifier]) => [universalIdentifier, id]),
  );

  for (const definition of MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS) {
    const role = findFlatEntityByUniversalIdentifierOrThrow({
      flatEntityMaps: dependencyFlatEntityMaps.flatRoleMaps,
      universalIdentifier: definition.roleUniversalIdentifier,
    });
    const objectMetadata = findFlatEntityByUniversalIdentifierOrThrow({
      flatEntityMaps: dependencyFlatEntityMaps.flatObjectMetadataMaps,
      universalIdentifier: definition.objectMetadataUniversalIdentifier,
    });
    const fieldMetadataId = fieldMetadataIdByUniversalIdentifier.get(
      definition.fieldMetadataUniversalIdentifier,
    );

    if (!isDefined(fieldMetadataId)) {
      throw new Error(
        `Missing protected Myah field ${definition.fieldMetadataUniversalIdentifier}`,
      );
    }

    flatFieldPermissionMaps = addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: {
        id: v4(),
        ...definition,
        workspaceId,
        applicationId: twentyStandardApplicationId,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        roleId: role.id,
        objectMetadataId: objectMetadata.id,
        fieldMetadataId,
        createdAt: now,
        updatedAt: now,
      },
      flatEntityMaps: flatFieldPermissionMaps,
    });
  }

  return flatFieldPermissionMaps;
};
