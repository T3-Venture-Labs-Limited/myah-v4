import {
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { UsageResolver } from 'src/engine/core-modules/usage/usage.resolver';
import { MyahTeamGuard } from 'src/engine/guards/myah-team.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

describe('UsageResolver authorization', () => {
  let mockPermissionsService: jest.Mocked<
    Pick<PermissionsService, 'userHasWorkspaceSettingPermission'>
  >;
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    mockPermissionsService = {
      userHasWorkspaceSettingPermission: jest.fn(),
    };

    const mockGqlContext = {
      req: {
        workspace: {
          id: 'workspace-id',
          activationStatus: WorkspaceActivationStatus.ACTIVE,
        },
        user: { email: 'customer@example.com' },
        userWorkspaceId: 'user-workspace-id',
      },
    };

    mockExecutionContext = {
      getType: jest.fn(() => 'graphql'),
    } as unknown as ExecutionContext;

    jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({ getContext: () => mockGqlContext } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getUsageSettingsPermissionGuard = (): Type<CanActivate> => {
    const guards: Type<CanActivate>[] = Reflect.getMetadata(
      GUARDS_METADATA,
      UsageResolver,
    );

    expect(guards).toHaveLength(2);
    expect(guards[0]).toBe(WorkspaceAuthGuard);
    expect(guards).not.toContain(MyahTeamGuard);

    return guards[1];
  };

  it('allows a non-Team workspace permission holder to get usage analytics', async () => {
    mockPermissionsService.userHasWorkspaceSettingPermission.mockResolvedValue(
      true,
    );

    const UsageSettingsPermissionGuard = getUsageSettingsPermissionGuard();
    const guard = new UsageSettingsPermissionGuard(
      mockPermissionsService as unknown as PermissionsService,
    );

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    expect(
      mockPermissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      userWorkspaceId: 'user-workspace-id',
      setting: PermissionFlagType.WORKSPACE,
      workspaceId: 'workspace-id',
      apiKeyId: undefined,
      applicationId: undefined,
    });
  });

  it('denies a user without the WORKSPACE setting permission', async () => {
    mockPermissionsService.userHasWorkspaceSettingPermission.mockResolvedValue(
      false,
    );

    const UsageSettingsPermissionGuard = getUsageSettingsPermissionGuard();
    const guard = new UsageSettingsPermissionGuard(
      mockPermissionsService as unknown as PermissionsService,
    );
    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      PermissionsException,
    );
  });
});
