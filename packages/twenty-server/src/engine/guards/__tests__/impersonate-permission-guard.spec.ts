import { type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { type MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { ImpersonatePermissionGuard } from 'src/engine/guards/impersonate-permission.guard';
import { type PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

const buildExecutionContext = ({
  user,
  userWorkspaceId = 'user-workspace-id',
}: {
  user?: {
    email?: string | null;
    isEmailVerified?: boolean;
    canImpersonate?: boolean;
  };
  userWorkspaceId?: string | null;
}) => {
  const mockContext = {
    getContext: jest.fn(() => ({
      req: {
        user,
        userWorkspaceId,
        workspace: {
          id: 'workspace-id',
        },
      },
    })),
  };

  jest
    .spyOn(GqlExecutionContext, 'create')
    .mockReturnValue(mockContext as never);

  return {} as ExecutionContext;
};

describe('ImpersonatePermissionGuard', () => {
  const permissionsService = {
    userHasWorkspaceSettingPermission: jest.fn(),
  } as unknown as jest.Mocked<PermissionsService>;
  const myahTeamAuthorizationService = {
    isMyahTeamMember: jest.fn(),
  } as unknown as jest.Mocked<MyahTeamAuthorizationService>;
  const guard = new ImpersonatePermissionGuard(
    permissionsService,
    myahTeamAuthorizationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a verified Myah Team identity before any target lookup', async () => {
    const user = {
      email: 'operator@t3labs.io',
      isEmailVerified: true,
    };
    myahTeamAuthorizationService.isMyahTeamMember.mockReturnValue(true);

    await expect(
      guard.canActivate(buildExecutionContext({ user })),
    ).resolves.toBe(true);

    expect(myahTeamAuthorizationService.isMyahTeamMember).toHaveBeenCalledWith(
      user,
    );
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).not.toHaveBeenCalled();
  });

  it('allows a customer workspace user with the current workspace IMPERSONATE permission', async () => {
    const user = {
      email: 'admin@customer.example',
      isEmailVerified: true,
    };
    myahTeamAuthorizationService.isMyahTeamMember.mockReturnValue(false);
    permissionsService.userHasWorkspaceSettingPermission.mockResolvedValue(
      true,
    );

    await expect(
      guard.canActivate(buildExecutionContext({ user })),
    ).resolves.toBe(true);

    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      userWorkspaceId: 'user-workspace-id',
      setting: 'IMPERSONATE',
      workspaceId: 'workspace-id',
    });
  });

  it('denies a legacy impersonator without a Team identity or current workspace permission', async () => {
    myahTeamAuthorizationService.isMyahTeamMember.mockReturnValue(false);
    permissionsService.userHasWorkspaceSettingPermission.mockResolvedValue(
      false,
    );

    await expect(
      guard.canActivate(
        buildExecutionContext({
          user: {
            email: 'legacy@example.com',
            isEmailVerified: true,
            canImpersonate: true,
          },
        }),
      ),
    ).rejects.toMatchObject({
      message: 'Entity performing the request does not have permission',
    });
  });

  it('denies API-key callers before evaluating Team identity or workspace permissions', async () => {
    await expect(
      guard.canActivate(
        buildExecutionContext({
          user: {
            email: 'operator@t3labs.io',
            isEmailVerified: true,
          },
          userWorkspaceId: null,
        }),
      ),
    ).rejects.toMatchObject({
      message: 'Entity performing the request does not have permission',
    });

    expect(
      myahTeamAuthorizationService.isMyahTeamMember,
    ).not.toHaveBeenCalled();
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).not.toHaveBeenCalled();
  });
});
