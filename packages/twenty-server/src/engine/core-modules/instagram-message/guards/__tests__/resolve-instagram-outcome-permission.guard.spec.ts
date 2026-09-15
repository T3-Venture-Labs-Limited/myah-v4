import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { ResolveInstagramOutcomePermissionGuard } from 'src/engine/core-modules/instagram-message/guards/resolve-instagram-outcome-permission.guard';

const request = {
  user: { id: 'user-id' },
  workspace: { id: 'workspace-id' },
  userWorkspaceId: 'user-workspace-id',
};

const buildGuard = ({ isTeam = true, hasPermission = true } = {}) => {
  const myahTeamAuthorizationService = {
    isMyahTeamMember: jest.fn().mockReturnValue(isTeam),
  };
  const permissionsService = {
    userHasWorkspaceSettingPermission: jest
      .fn()
      .mockResolvedValue(hasPermission),
  };
  jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
    getContext: () => ({ req: request }),
  } as never);

  return {
    guard: new ResolveInstagramOutcomePermissionGuard(
      myahTeamAuthorizationService as never,
      permissionsService as never,
    ),
    myahTeamAuthorizationService,
    permissionsService,
  };
};

describe('ResolveInstagramOutcomePermissionGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requires both Myah Team identity and the explicit resolution flag', async () => {
    const { guard, permissionsService } = buildGuard();

    await expect(guard.canActivate({} as never)).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      userWorkspaceId: request.userWorkspaceId,
      workspaceId: request.workspace.id,
      setting: PermissionFlagType.RESOLVE_INSTAGRAM_SEND_OUTCOME,
      apiKeyId: undefined,
    });
  });

  it('denies a Myah Team member after the role flag is revoked', async () => {
    const { guard } = buildGuard({ hasPermission: false });

    await expect(guard.canActivate({} as never)).resolves.toBe(false);
  });

  it('denies non-Team identities without consulting the role flag', async () => {
    const { guard, permissionsService } = buildGuard({
      isTeam: false,
      hasPermission: true,
    });

    await expect(guard.canActivate({} as never)).resolves.toBe(false);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).not.toHaveBeenCalled();
  });
});
