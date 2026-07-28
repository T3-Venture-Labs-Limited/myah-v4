import { type ObjectsPermissions } from 'twenty-shared/types';

import { RestApiBaseHandler } from 'src/engine/api/rest/core/handlers/rest-api-base.handler';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

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

describe('RestApiBaseHandler application permissions', () => {
  it('intersects the application role with the initiating user role', async () => {
    const HandlerConstructor =
      RestApiBaseHandler as unknown as new () => RestApiBaseHandler;
    const handler = new HandlerConstructor();

    Object.assign(handler, {
      apiKeyRoleService: {},
      userRoleService: {
        getRoleIdForUserWorkspace: jest.fn().mockResolvedValue('user-role-id'),
      },
      workspaceCacheService: {
        getOrRecompute: jest.fn().mockResolvedValue({
          rolesPermissions: {
            'application-role-id': applicationPermissions,
            'user-role-id': userPermissions,
          },
        }),
      },
    });

    const getObjectsPermissions = Reflect.get(
      handler,
      'getObjectsPermissions',
    ).bind(handler) as (
      authContext: WorkspaceAuthContext,
    ) => Promise<{ objectsPermissions: ObjectsPermissions }>;

    await expect(
      getObjectsPermissions(applicationAuthContext),
    ).resolves.toEqual({
      objectsPermissions: {
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
      },
    });
  });
});
