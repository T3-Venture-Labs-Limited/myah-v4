import { v4 } from 'uuid';
import { SystemPermissionFlag } from 'twenty-shared/constants';

import { fromPermissionFlagToUniversalFlatRolePermissionFlag } from 'src/engine/core-modules/application/application-manifest/converters/from-permission-flag-to-universal-flat-role-permission-flag.util';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { findFlatEntityByUniversalIdentifierOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier-or-throw.util';
import type { FlatPermissionFlag } from 'src/engine/metadata-modules/flat-permission-flag/types/flat-permission-flag.type';
import type { FlatRolePermissionFlag } from 'src/engine/metadata-modules/flat-role-permission-flag/types/flat-role-permission-flag.type';
import type { FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

export const buildStandardFlatRolePermissionFlagMaps = ({
  now,
  workspaceId,
  twentyStandardApplicationId,
  dependencyFlatEntityMaps,
}: {
  now: string;
  workspaceId: string;
  twentyStandardApplicationId: string;
  dependencyFlatEntityMaps: {
    flatPermissionFlagMaps: FlatEntityMaps<FlatPermissionFlag>;
    flatRoleMaps: FlatEntityMaps<FlatRole>;
  };
}): FlatEntityMaps<FlatRolePermissionFlag> => {
  const role = findFlatEntityByUniversalIdentifierOrThrow({
    flatEntityMaps: dependencyFlatEntityMaps.flatRoleMaps,
    universalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  });
  const permissionFlag = findFlatEntityByUniversalIdentifierOrThrow({
    flatEntityMaps: dependencyFlatEntityMaps.flatPermissionFlagMaps,
    universalIdentifier: SystemPermissionFlag.WORKFLOWS,
  });

  return addFlatEntityToFlatEntityMapsOrThrow({
    flatEntity: {
      id: v4(),
      ...fromPermissionFlagToUniversalFlatRolePermissionFlag({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        now,
        permissionFlagUniversalIdentifier: permissionFlag.universalIdentifier,
        roleUniversalIdentifier: role.universalIdentifier,
      }),
      applicationId: twentyStandardApplicationId,
      permissionFlagId: permissionFlag.id,
      roleId: role.id,
      workspaceId,
    },
    flatEntityMaps: createEmptyFlatEntityMaps(),
  });
};
