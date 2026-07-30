import type { WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { resolveRoleIdFromAuthContext } from 'src/engine/twenty-orm/utils/resolve-role-id-from-auth-context.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

const applicationAuthContext = ({
  defaultRoleId = 'application-role',
  userWorkspaceId,
}: {
  defaultRoleId?: string | null;
  userWorkspaceId?: string;
} = {}): WorkspaceAuthContext =>
  ({
    type: 'application',
    application: { defaultRoleId },
    workspace: {},
    ...(userWorkspaceId === undefined ? {} : { userWorkspaceId }),
  }) as WorkspaceAuthContext;

describe('resolveRolePermissionConfig', () => {
  it('uses the initiating workspace member role for row-level predicates', () => {
    expect(
      resolveRoleIdFromAuthContext({
        authContext: applicationAuthContext({
          userWorkspaceId: 'user-workspace-id',
        }),
        userWorkspaceRoleMap: { 'user-workspace-id': 'user-role' },
        apiKeyRoleMap: {},
      }),
    ).toBe('user-role');
  });

  it('intersects an application role with the initiating workspace member role', () => {
    expect(
      resolveRolePermissionConfig({
        authContext: applicationAuthContext({
          userWorkspaceId: 'user-workspace-id',
        }),
        userWorkspaceRoleMap: { 'user-workspace-id': 'user-role' },
        apiKeyRoleMap: {},
      }),
    ).toEqual({ intersectionOf: ['application-role', 'user-role'] });
  });

  it('denies a user-bound application token when the user role is unresolved', () => {
    expect(
      resolveRolePermissionConfig({
        authContext: applicationAuthContext({
          userWorkspaceId: 'missing-user-workspace-id',
        }),
        userWorkspaceRoleMap: {},
        apiKeyRoleMap: {},
      }),
    ).toBeNull();
  });

  it('retains the application role for autonomous application tokens', () => {
    expect(
      resolveRolePermissionConfig({
        authContext: applicationAuthContext(),
        userWorkspaceRoleMap: {},
        apiKeyRoleMap: {},
      }),
    ).toEqual({ intersectionOf: ['application-role'] });
  });
});
