import { type ObjectsPermissions } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CommonApiContextBuilderService } from 'src/engine/core-modules/record-crud/services/common-api-context-builder.service';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { type ApiKeyRoleService } from 'src/engine/core-modules/api-key/services/api-key-role.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const applicationAuthContext = {
  type: 'application',
  workspace: { id: 'workspace-id' },
  application: { id: 'application-id', defaultRoleId: 'application-role-id' },
  userWorkspaceId: 'user-workspace-id',
} as WorkspaceAuthContext;

const applicationPermissions = {
  'object-id': {
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
    restrictedFields: {},
    rowLevelPermissionPredicates: [],
    rowLevelPermissionPredicateGroups: [],
  },
} satisfies ObjectsPermissions;

const userPermissions = {
  'object-id': {
    canReadObjectRecords: true,
    canUpdateObjectRecords: false,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
    restrictedFields: {
      secret: { canRead: false, canUpdate: false },
    },
    rowLevelPermissionPredicates: [],
    rowLevelPermissionPredicateGroups: [],
  },
} satisfies ObjectsPermissions;

describe('CommonApiContextBuilderService application permissions', () => {
  it('intersects the application role with the initiating user role', async () => {
    const service = new CommonApiContextBuilderService(
      {} as WorkspaceManyOrAllFlatEntityMapsCacheService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          rolesPermissions: {
            'application-role-id': applicationPermissions,
            'user-role-id': userPermissions,
          },
        }),
      } as unknown as WorkspaceCacheService,
      {
        getRoleIdForUserWorkspace: jest.fn().mockResolvedValue('user-role-id'),
      } as unknown as UserRoleService,
      {} as ApiKeyRoleService,
    );

    await expect(
      service['getObjectsPermissions'](applicationAuthContext),
    ).resolves.toEqual({
      'object-id': {
        canReadObjectRecords: true,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields: {
          secret: { canRead: false, canUpdate: false },
        },
        rowLevelPermissionPredicateGroups: [],
        rowLevelPermissionPredicates: [],
      },
    });
  });
});
