import { MODULE_METADATA } from '@nestjs/common/constants';

import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkspaceQueryHookModule } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import {
  MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { MyahCampaignCreateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-many.pre-query.hook';
import { MyahCampaignCreateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-one.pre-query.hook';
import { MyahCampaignQueryHookModule } from 'src/modules/myah-campaign/query-hooks/myah-campaign-query-hook.module';
import { MyahCampaignUpdateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-many.pre-query.hook';
import { MyahCampaignUpdateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-one.pre-query.hook';
import {
  CampaignLifecycleService,
  type CampaignUpdateManyArgs,
} from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { MyahCampaignDeleteOnePostQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-delete.post-query.hooks';
import {
  MyahCampaignDestroyManyPreQueryHook,
  MyahCampaignDestroyOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-destroy.pre-query.hooks';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

const getWorkspaceContextMock = jest.mocked(getWorkspaceContext);
const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;
const objectName = 'campaign';

type HookCase = {
  hookClass: new (lifecycleService: CampaignLifecycleService) => {
    execute: (
      authContext: WorkspaceAuthContext,
      objectName: string,
      payload: never,
    ) => Promise<unknown>;
  };
  serviceMethod:
    | 'prepareCreateOne'
    | 'prepareCreateMany'
    | 'validateStatusBearingUpdateOne'
    | 'prepareUpdateMany';
  decoratorKey:
    | 'campaign.createOne'
    | 'campaign.createMany'
    | 'campaign.updateOne'
    | 'campaign.updateMany';
  payload: object;
};

const hookCases: HookCase[] = [
  {
    hookClass: MyahCampaignCreateOnePreQueryHook,
    serviceMethod: 'prepareCreateOne',
    decoratorKey: 'campaign.createOne',
    payload: { data: { name: 'Launch' } },
  },
  {
    hookClass: MyahCampaignCreateManyPreQueryHook,
    serviceMethod: 'prepareCreateMany',
    decoratorKey: 'campaign.createMany',
    payload: { data: [{ name: 'Launch' }] },
  },
  {
    hookClass: MyahCampaignUpdateOnePreQueryHook,
    serviceMethod: 'validateStatusBearingUpdateOne',
    decoratorKey: 'campaign.updateOne',
    payload: { id: 'campaign-1', data: { lifecycleStatus: 'PAUSED' } },
  },
  {
    hookClass: MyahCampaignUpdateManyPreQueryHook,
    serviceMethod: 'prepareUpdateMany',
    decoratorKey: 'campaign.updateMany',
    payload: {
      filter: { id: { eq: 'campaign-1' } },
      data: { lifecycleStatus: 'PAUSED' },
    },
  },
];

describe('Myah Campaign query hooks', () => {
  it.each(hookCases)(
    '$decoratorKey delegates auth context, object name, and payload exactly once',
    async ({ hookClass: HookClass, serviceMethod, payload }) => {
      const serviceResult = { prepared: serviceMethod };
      const lifecycleService = {
        prepareCreateOne: jest.fn(),
        prepareCreateMany: jest.fn(),
        validateStatusBearingUpdateOne: jest.fn(),
        prepareUpdateMany: jest.fn(),
      } as unknown as CampaignLifecycleService;
      jest
        .mocked(lifecycleService[serviceMethod])
        .mockResolvedValue(serviceResult as never);
      const hook = new HookClass(lifecycleService);

      await expect(
        hook.execute(authContext, objectName, payload as never),
      ).resolves.toBe(serviceResult);
      expect(lifecycleService[serviceMethod]).toHaveBeenCalledTimes(1);
      expect(lifecycleService[serviceMethod]).toHaveBeenCalledWith(
        authContext,
        objectName,
        payload,
      );
    },
  );

  it.each(hookCases)(
    '$decoratorKey carries its exact pre-hook metadata',
    ({ hookClass: HookClass, decoratorKey }) => {
      expect(
        Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, HookClass),
      ).toEqual({
        key: decoratorKey,
        type: WorkspaceQueryHookType.PRE_HOOK,
      });
    },
  );

  it('registers lifecycle and all four adapters through the workspace hook module', () => {
    const lifecycleProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignLifecycleModule,
    ) as unknown[];
    const lifecycleExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
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
    expect(lifecycleExports).toContain(CampaignLifecycleService);
    expect(lifecycleExports).toContain(
      CampaignOutreachWorkflowLifecycleWorkspaceService,
    );
    expect(queryHookImports).toContain(MyahCampaignLifecycleModule);
    expect(queryHookProviders).toEqual(
      expect.arrayContaining(hookCases.map(({ hookClass }) => hookClass)),
    );
    expect(workspaceHookImports).toContain(MyahCampaignQueryHookModule);
  });

  it('uses normalized delete-one results to clean Campaign Outreach workflows', async () => {
    const campaignOutreachWorkflowLifecycleService = {
      handleCampaignDeletion: jest.fn().mockResolvedValue(undefined),
    } as unknown as CampaignOutreachWorkflowLifecycleWorkspaceService;
    const hook = new MyahCampaignDeleteOnePostQueryHook(
      campaignOutreachWorkflowLifecycleService,
    );

    await hook.execute(authContext, objectName, [
      { id: 'campaign-a' },
    ] as never);

    expect(
      campaignOutreachWorkflowLifecycleService.handleCampaignDeletion,
    ).toHaveBeenCalledWith({
      authContext,
      campaignIds: ['campaign-a'],
      operation: 'delete',
      workspaceId: 'workspace-a',
    });
  });

  it('authorizes Campaign rows before destroy cleanup', async () => {
    const campaignOutreachWorkflowLifecycleService = {
      assertCampaignsAreAccessible: jest.fn().mockResolvedValue(undefined),
      handleCampaignDeletion: jest.fn().mockResolvedValue(undefined),
    } as unknown as CampaignOutreachWorkflowLifecycleWorkspaceService;
    const destroyOneHook = new MyahCampaignDestroyOnePreQueryHook(
      campaignOutreachWorkflowLifecycleService,
    );
    const destroyManyHook = new MyahCampaignDestroyManyPreQueryHook(
      campaignOutreachWorkflowLifecycleService,
    );

    await destroyOneHook.execute(authContext, objectName, {
      id: 'campaign-a',
    } as never);
    await destroyManyHook.execute(authContext, objectName, {
      filter: { id: { in: ['campaign-a', 'campaign-b'] } },
    } as never);

    expect(
      campaignOutreachWorkflowLifecycleService.assertCampaignsAreAccessible,
    ).toHaveBeenNthCalledWith(1, {
      authContext,
      campaignIds: ['campaign-a'],
      workspaceId: 'workspace-a',
    });
    expect(
      campaignOutreachWorkflowLifecycleService.assertCampaignsAreAccessible,
    ).toHaveBeenNthCalledWith(2, {
      authContext,
      campaignIds: ['campaign-a', 'campaign-b'],
      workspaceId: 'workspace-a',
    });
  });
});

describe('Campaign lifecycle compare-and-set regression', () => {
  const campaignRepository = { findOne: jest.fn() };
  const getRepository = jest.fn(async () => campaignRepository);
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => unknown | Promise<unknown>) => callback(),
  );
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager;
  const service = new CampaignLifecycleService(globalWorkspaceOrmManager);
  const workspaceContext = {
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER]: {
          id: 'campaign-object-id',
          universalIdentifier: MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
          nameSingular: 'campaign',
        },
        [MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER]: {
          id: 'campaign-creator-object-id',
          universalIdentifier:
            MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
          nameSingular: 'campaignCreator',
        },
      },
    },
    flatFieldMetadataMaps: { byUniversalIdentifier: {} },
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: {},
  } as unknown as ORMWorkspaceContext;

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceContextMock.mockReturnValue(workspaceContext);
  });

  const prepareFromActive = async (
    targetStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  ) => {
    campaignRepository.findOne.mockResolvedValueOnce({
      id: 'campaign-1',
      name: 'Launch',
      objective: 'Goal',
      lifecycleStatus: 'ACTIVE',
      ownerId: null,
    });

    return service.prepareUpdateMany(authContext, objectName, {
      filter: { id: { eq: 'campaign-1' } },
      data: { lifecycleStatus: targetStatus },
    });
  };

  const applyPreparedWrite = (
    currentStatus: string,
    preparedPayload: CampaignUpdateManyArgs,
  ): string => {
    const observedStatus = (
      preparedPayload.filter.and as Array<{
        lifecycleStatus?: { eq?: string };
      }>
    )[1].lifecycleStatus?.eq;

    return currentStatus === observedStatus
      ? (preparedPayload.data.lifecycleStatus as string)
      : currentStatus;
  };

  it.each([
    ['PAUSED', 'COMPLETED'],
    ['COMPLETED', 'PAUSED'],
  ] as const)(
    'allows only one stale-source winner when %s applies before %s',
    async (firstTarget, secondTarget) => {
      const firstPrepared = await prepareFromActive(firstTarget);
      const secondPrepared = await prepareFromActive(secondTarget);

      expect(firstPrepared.filter).toEqual({
        and: [
          { id: { eq: 'campaign-1' } },
          { lifecycleStatus: { eq: 'ACTIVE' } },
        ],
      });
      expect(secondPrepared.filter).toEqual({
        and: [
          { id: { eq: 'campaign-1' } },
          { lifecycleStatus: { eq: 'ACTIVE' } },
        ],
      });

      let storedStatus = 'ACTIVE';
      storedStatus = applyPreparedWrite(storedStatus, firstPrepared);
      const statusAfterWinner = storedStatus;
      storedStatus = applyPreparedWrite(storedStatus, secondPrepared);

      expect(storedStatus).toBe(statusAfterWinner);
      expect(['PAUSED', 'COMPLETED']).toContain(storedStatus);
    },
  );

  it('prevents a stale idempotent Active write from reopening Completed', async () => {
    const idempotentPrepared = await prepareFromActive('ACTIVE');
    const completedPrepared = await prepareFromActive('COMPLETED');

    let storedStatus = 'ACTIVE';
    storedStatus = applyPreparedWrite(storedStatus, completedPrepared);
    storedStatus = applyPreparedWrite(storedStatus, idempotentPrepared);

    expect(idempotentPrepared.filter).toEqual({
      and: [
        { id: { eq: 'campaign-1' } },
        { lifecycleStatus: { eq: 'ACTIVE' } },
      ],
    });
    expect(storedStatus).toBe('COMPLETED');
  });
});
