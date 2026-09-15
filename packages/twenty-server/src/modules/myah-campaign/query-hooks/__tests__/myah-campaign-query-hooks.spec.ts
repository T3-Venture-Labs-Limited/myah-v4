import { MODULE_METADATA } from '@nestjs/common/constants';

import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkspaceQueryHookModule } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { CampaignAccountResolver } from 'src/modules/myah-campaign/resolvers/campaign-account.resolver';
import {
  MyahCampaignAccountCreateManyPreQueryHook,
  MyahCampaignAccountCreateOnePreQueryHook,
  MyahCampaignAccountDeleteManyPreQueryHook,
  MyahCampaignAccountDeleteOnePreQueryHook,
  MyahCampaignAccountDestroyManyPreQueryHook,
  MyahCampaignAccountDestroyOnePreQueryHook,
  MyahCampaignAccountRestoreManyPreQueryHook,
  MyahCampaignAccountRestoreOnePreQueryHook,
  MyahCampaignAccountUpdateManyPreQueryHook,
  MyahCampaignAccountUpdateOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-account-write.pre-query.hooks';
import { MyahCampaignCreateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-many.pre-query.hook';
import { MyahCampaignCreateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-one.pre-query.hook';
import {
  MyahCampaignDeleteManyPreQueryHook,
  MyahCampaignDeleteOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-delete.pre-query.hooks';
import {
  MyahCampaignDestroyManyPreQueryHook,
  MyahCampaignDestroyOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-destroy.pre-query.hooks';
import { MyahCampaignQueryHookModule } from 'src/modules/myah-campaign/query-hooks/myah-campaign-query-hook.module';
import { MyahCampaignRestoreManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-restore-many.pre-query.hook';
import { MyahCampaignRestoreOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-restore-one.pre-query.hook';
import { MyahCampaignUpdateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-many.pre-query.hook';
import { MyahCampaignUpdateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-one.pre-query.hook';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;
const objectName = 'campaign';
const dedicatedError =
  'Campaign lifecycle and execution authority require a dedicated operation.';

const adapterCases = [
  [MyahCampaignCreateOnePreQueryHook, 'campaign.createOne'],
  [MyahCampaignCreateManyPreQueryHook, 'campaign.createMany'],
  [MyahCampaignUpdateOnePreQueryHook, 'campaign.updateOne'],
  [MyahCampaignUpdateManyPreQueryHook, 'campaign.updateMany'],
  [MyahCampaignDeleteOnePreQueryHook, 'campaign.deleteOne'],
  [MyahCampaignDeleteManyPreQueryHook, 'campaign.deleteMany'],
  [MyahCampaignRestoreOnePreQueryHook, 'campaign.restoreOne'],
  [MyahCampaignRestoreManyPreQueryHook, 'campaign.restoreMany'],
] as const;

const lifecycleDelegatingCases = [
  [MyahCampaignCreateOnePreQueryHook, 'prepareCreateOne'],
  [MyahCampaignCreateManyPreQueryHook, 'prepareCreateMany'],
  [MyahCampaignUpdateOnePreQueryHook, 'validateStatusBearingUpdateOne'],
  [MyahCampaignUpdateManyPreQueryHook, 'prepareUpdateMany'],
] as const;

describe('Myah Campaign query hooks', () => {
  it.each(adapterCases)(
    '%s carries exact pre-hook metadata',
    (HookClass, key) => {
      expect(
        Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, HookClass),
      ).toEqual({
        key,
        type: WorkspaceQueryHookType.PRE_HOOK,
      });
    },
  );

  it.each(lifecycleDelegatingCases)(
    '%s delegates the original payload once',
    async (HookClass, serviceMethod) => {
      const payload = { data: { name: 'Launch' } };
      const result = { prepared: true };
      const lifecycleService = {
        [serviceMethod]: jest.fn().mockResolvedValue(result),
      } as unknown as CampaignLifecycleService;
      const hook = new HookClass(lifecycleService);

      await expect(
        hook.execute(authContext, objectName, payload as never),
      ).resolves.toBe(result);
      expect(lifecycleService[serviceMethod]).toHaveBeenCalledWith(
        authContext,
        objectName,
        payload,
      );
    },
  );

  it.each([
    MyahCampaignDeleteOnePreQueryHook,
    MyahCampaignDeleteManyPreQueryHook,
    MyahCampaignRestoreOnePreQueryHook,
    MyahCampaignRestoreManyPreQueryHook,
  ])('%s rejects unconditionally before persistence', async (HookClass) => {
    const hook = new HookClass();

    await expect(
      hook.execute(authContext, objectName, {} as never),
    ).rejects.toMatchObject({ message: dedicatedError });
  });

  it('registers all lifecycle compatibility adapters through the workspace hook module', () => {
    const lifecycleProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignLifecycleModule,
    ) as unknown[];
    const queryHookImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahCampaignQueryHookModule,
    ) as unknown[];
    const queryHookProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignQueryHookModule,
    ) as unknown[];
    const workspaceHookImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      WorkspaceQueryHookModule,
    ) as unknown[];

    expect(lifecycleProviders).toContain(CampaignLifecycleService);
    expect(queryHookImports).toContain(MyahCampaignLifecycleModule);
    expect(queryHookProviders).toEqual(
      expect.arrayContaining(adapterCases.map(([HookClass]) => HookClass)),
    );
    expect(workspaceHookImports).toContain(MyahCampaignQueryHookModule);
  });

  it('preserves coordinator-aware hard-destroy transaction hooks', async () => {
    const lifecycleService = {
      assertCampaignDeletionAllowedInTransaction: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as CampaignOutreachWorkflowLifecycleWorkspaceService;
    const destroyOneHook = new MyahCampaignDestroyOnePreQueryHook(
      lifecycleService,
    );
    const destroyManyHook = new MyahCampaignDestroyManyPreQueryHook(
      lifecycleService,
    );
    const transactionContext = { entityManager: {} as never };

    await destroyOneHook.execute(
      authContext,
      objectName,
      { id: 'campaign-a' } as never,
      transactionContext,
    );
    await destroyManyHook.execute(
      authContext,
      objectName,
      { filter: { id: { in: ['campaign-a', 'campaign-b'] } } } as never,
      transactionContext,
    );

    expect(
      lifecycleService.assertCampaignDeletionAllowedInTransaction,
    ).toHaveBeenCalledTimes(2);
  });
});

describe('Campaign Account generic-write query hooks', () => {
  const accountHookCases = [
    [MyahCampaignAccountCreateOnePreQueryHook, 'campaignAccount.createOne'],
    [MyahCampaignAccountCreateManyPreQueryHook, 'campaignAccount.createMany'],
    [MyahCampaignAccountUpdateOnePreQueryHook, 'campaignAccount.updateOne'],
    [MyahCampaignAccountUpdateManyPreQueryHook, 'campaignAccount.updateMany'],
    [MyahCampaignAccountDeleteOnePreQueryHook, 'campaignAccount.deleteOne'],
    [MyahCampaignAccountDeleteManyPreQueryHook, 'campaignAccount.deleteMany'],
    [MyahCampaignAccountDestroyOnePreQueryHook, 'campaignAccount.destroyOne'],
    [MyahCampaignAccountDestroyManyPreQueryHook, 'campaignAccount.destroyMany'],
    [MyahCampaignAccountRestoreOnePreQueryHook, 'campaignAccount.restoreOne'],
    [MyahCampaignAccountRestoreManyPreQueryHook, 'campaignAccount.restoreMany'],
  ] as const;

  it.each(accountHookCases)(
    '%s rejects generic writes with the system-managed message',
    async (HookClass) => {
      const hook = new HookClass();

      await expect(
        hook.execute(authContext, 'campaignAccount', {} as never),
      ).rejects.toThrow('Campaign Accounts are system-managed');
    },
  );

  it.each(accountHookCases)(
    '%s carries its exact pre-hook decorator key',
    (HookClass, decoratorKey) => {
      expect(
        Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, HookClass),
      ).toEqual({
        key: decoratorKey,
        type: WorkspaceQueryHookType.PRE_HOOK,
      });
    },
  );

  it('registers Campaign Account controls and generic-write hooks', () => {
    const lifecycleProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignLifecycleModule,
    ) as unknown[];
    const lifecycleExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahCampaignLifecycleModule,
    ) as unknown[];
    const queryHookProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignQueryHookModule,
    ) as unknown[];

    expect(lifecycleProviders).toEqual(
      expect.arrayContaining([CampaignAccountService, CampaignAccountResolver]),
    );
    expect(lifecycleExports).toContain(CampaignAccountService);
    expect(queryHookProviders).toEqual(
      expect.arrayContaining(accountHookCases.map(([HookClass]) => HookClass)),
    );
  });
});
