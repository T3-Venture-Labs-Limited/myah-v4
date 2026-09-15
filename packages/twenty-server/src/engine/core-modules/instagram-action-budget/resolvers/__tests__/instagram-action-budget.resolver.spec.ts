import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IsNull } from 'typeorm';
import { PermissionFlagType } from 'twenty-shared/constants';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { InstagramActionUsageDto } from 'src/engine/core-modules/instagram-action-budget/dtos/instagram-action-usage.dto';
import { InstagramActionBudgetResolver } from 'src/engine/core-modules/instagram-action-budget/resolvers/instagram-action-budget.resolver';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

const workspaceId = 'workspace-id';
const workspace = { id: workspaceId } as WorkspaceEntity;
const usage = {
  dailyLimit: 100 as const,
  dailyRemaining: 88,
  dailyUsed: 12,
  hourlyLimit: 10 as const,
  hourlyRemaining: 8,
  hourlyUsed: 2,
  nextEligibleAt: new Date('2026-09-05T13:00:00.000Z'),
};
const accountBinding = {
  deactivatedAt: null,
  workspaceId,
  workspaceInstagramAccountRecordId: 'workspace-instagram-account-id',
} as UnipileInstagramAccountBindingEntity;

const createHarness = (
  bindings: UnipileInstagramAccountBindingEntity[] = [accountBinding],
) => {
  const budgetService = {
    inspectUsage: jest.fn().mockResolvedValue(usage),
  };
  const accountBindingRepository = {
    find: jest.fn().mockResolvedValue(bindings),
  };

  return {
    accountBindingRepository,
    budgetService,
    resolver: new InstagramActionBudgetResolver(
      budgetService as unknown as InstagramActionBudgetService,
      accountBindingRepository as unknown as WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
    ),
  };
};

describe('InstagramActionBudgetResolver', () => {
  it('derives the sole active workspace Instagram account and returns only budget usage fields', async () => {
    const harness = createHarness();

    const result = await harness.resolver.instagramActionUsage(workspace);
    expect(harness.accountBindingRepository.find).toHaveBeenCalledWith(
      workspaceId,
      {
        take: 2,
        where: { deactivatedAt: IsNull() },
      },
    );
    expect(harness.budgetService.inspectUsage).toHaveBeenCalledWith({
      instagramAccountRecordId: 'workspace-instagram-account-id',
      workspaceId,
    });
    expect(result).toEqual(usage);
    expect(Object.keys(result).sort()).toEqual([
      'dailyLimit',
      'dailyRemaining',
      'dailyUsed',
      'hourlyLimit',
      'hourlyRemaining',
      'hourlyUsed',
      'nextEligibleAt',
    ]);
  });

  it.each([
    { bindings: [] },
    { bindings: [accountBinding, { ...accountBinding, id: 'other-binding' }] },
  ])(
    'fails safely unless the workspace has exactly one active Instagram account binding',
    async ({ bindings }) => {
      const harness = createHarness(bindings);

      await expect(
        harness.resolver.instagramActionUsage(workspace),
      ).rejects.toThrow(
        'A single active Instagram account binding is required',
      );
      expect(harness.budgetService.inspectUsage).not.toHaveBeenCalled();
    },
  );

  it('accepts no client-selected provider or account identifier', () => {
    const harness = createHarness();

    expect(harness.resolver.instagramActionUsage).toHaveLength(1);
  });

  it('requires workspace, user, custom permission, and Instagram reply settings guards', async () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InstagramActionBudgetResolver,
    ) as (new (...args: never[]) => { canActivate: Function })[];

    expect(guards.slice(0, 3)).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      CustomPermissionGuard,
    ]);
    expect(guards).toHaveLength(4);

    const permissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    };
    const settingsPermissionGuard = new (guards[3] as unknown as new (
      permissions: typeof permissionsService,
    ) => { canActivate: (context: unknown) => Promise<boolean> })(
      permissionsService,
    );

    await expect(
      settingsPermissionGuard.canActivate({
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({
            userWorkspaceId: 'user-workspace-id',
            workspace: { id: workspaceId },
          }),
        }),
      }),
    ).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
        workspaceId,
      }),
    );
  });

  it('defines a DTO with the public usage shape', () => {
    const dto: InstagramActionUsageDto = usage;

    expect(dto).toEqual(usage);
  });
});
