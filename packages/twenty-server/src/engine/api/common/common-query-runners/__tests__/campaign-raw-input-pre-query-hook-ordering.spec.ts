import { CommonCreateManyQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/common-create-many-query-runner.service';
import { CommonCreateOneQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-create-one-query-runner.service';
import { CommonUpdateManyQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-update-many-query-runner.service';
import { CommonUpdateOneQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-update-one-query-runner.service';
import { CommonQueryNames } from 'src/engine/api/common/types/common-query-args.type';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';
import { MyahCampaignCreateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-many.pre-query.hook';
import { MyahCampaignCreateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-one.pre-query.hook';
import { MyahCampaignUpdateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-many.pre-query.hook';
import { MyahCampaignUpdateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-one.pre-query.hook';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;
const dedicatedError =
  'Campaign lifecycle and execution authority require a dedicated operation.';

const lifecycleService = new CampaignLifecycleService(
  {} as GlobalWorkspaceOrmManager,
);

const hookByOperation: Partial<
  Record<CommonQueryNames, WorkspacePreQueryHookInstance>
> = {
  [CommonQueryNames.CREATE_ONE]: new MyahCampaignCreateOnePreQueryHook(
    lifecycleService,
  ),
  [CommonQueryNames.CREATE_MANY]: new MyahCampaignCreateManyPreQueryHook(
    lifecycleService,
  ),
  [CommonQueryNames.UPDATE_ONE]: new MyahCampaignUpdateOnePreQueryHook(
    lifecycleService,
  ),
  [CommonQueryNames.UPDATE_MANY]: new MyahCampaignUpdateManyPreQueryHook(
    lifecycleService,
  ),
};

const dataArgProcessor = { process: jest.fn() };
const executePreQueryHooks = jest.fn(
  async (_auth, _object, _operation, args) => args,
);
const workspaceQueryHookService = {
  executeRawInputPreQueryHooks: jest.fn(
    async (
      auth: WorkspaceAuthContext,
      objectName: string,
      operation: CommonQueryNames,
      args: never,
      context: {
        objectMetadataId: string;
        objectMetadataUniversalIdentifier: string;
      },
    ) => {
      await hookByOperation[operation]?.validateRawInput?.(
        auth,
        objectName,
        args,
        context,
      );
    },
  ),
  executePreQueryHooks,
};

const campaignContext = {
  authContext,
  flatObjectMetadata: {
    id: 'campaign-object-id',
    nameSingular: 'campaign',
    universalIdentifier: MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  },
  flatObjectMetadataMaps: {},
  flatFieldMetadataMaps: {},
};

const makeRunners = () => {
  const createMany = new CommonCreateManyQueryRunnerService({} as never);
  const updateMany = new CommonUpdateManyQueryRunnerService();
  const runners = {
    [CommonQueryNames.CREATE_ONE]: new CommonCreateOneQueryRunnerService(
      createMany,
    ),
    [CommonQueryNames.CREATE_MANY]: createMany,
    [CommonQueryNames.UPDATE_ONE]: new CommonUpdateOneQueryRunnerService(
      updateMany,
    ),
    [CommonQueryNames.UPDATE_MANY]: updateMany,
  };

  for (const runner of Object.values(runners)) {
    Object.assign(runner, {
      workspaceQueryHookService,
      dataArgProcessor,
      filterArgProcessor: { process: jest.fn((value) => value.filter) },
    });
  }

  return runners;
};

const processArgs = async (
  runner: object,
  args: object,
  operation: CommonQueryNames,
  context = campaignContext,
) =>
  (
    runner as {
      processArgs(
        args: object,
        context: object,
        operation: CommonQueryNames,
      ): Promise<object>;
    }
  ).processArgs(args, context, operation);

describe('Common runner Campaign raw-input pre-query ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dataArgProcessor.process.mockImplementation(
      async ({ partialRecordInputs }) =>
        partialRecordInputs.map((input: object) =>
          Object.fromEntries(
            Object.entries(input).filter(([, value]) => value !== undefined),
          ),
        ),
    );
  });

  it.each([
    [
      CommonQueryNames.CREATE_ONE,
      { data: { sequenceAuthorization: undefined } },
    ],
    [
      CommonQueryNames.CREATE_MANY,
      { data: [{ name: 'allowed' }, { deletedAt: undefined }] },
    ],
    [
      CommonQueryNames.UPDATE_ONE,
      { id: 'campaign-a', data: { lifecycleStatus: undefined } },
    ],
    [
      CommonQueryNames.UPDATE_MANY,
      { filter: {}, data: { sequenceAuthorization: undefined } },
    ],
  ] as const)(
    'rejects raw own keys on %s before DataArgProcessor coercion',
    async (operation, args) => {
      const runner = makeRunners()[operation];

      await expect(processArgs(runner, args, operation)).rejects.toThrow(
        dedicatedError,
      );
      expect(dataArgProcessor.process).not.toHaveBeenCalled();
      expect(executePreQueryHooks).not.toHaveBeenCalled();
    },
  );

  it('does not partially process a mixed createMany payload', async () => {
    const data = [{ name: 'first' }, { deletedAt: null }];

    await expect(
      processArgs(
        makeRunners()[CommonQueryNames.CREATE_MANY],
        { data },
        CommonQueryNames.CREATE_MANY,
      ),
    ).rejects.toThrow(dedicatedError);
    expect(data).toEqual([{ name: 'first' }, { deletedAt: null }]);
    expect(dataArgProcessor.process).not.toHaveBeenCalled();
  });

  it('preserves unrelated-object undefined handling and reaches processed hooks', async () => {
    const unrelatedContext = {
      ...campaignContext,
      flatObjectMetadata: {
        id: 'company-object-id',
        nameSingular: 'company',
        universalIdentifier: '20202020-0000-4000-8000-000000000099',
      },
    };
    const args = { data: { sequenceAuthorization: undefined, name: 'Acme' } };

    await expect(
      processArgs(
        makeRunners()[CommonQueryNames.CREATE_ONE],
        args,
        CommonQueryNames.CREATE_ONE,
        unrelatedContext,
      ),
    ).resolves.toMatchObject({ data: { name: 'Acme' } });
    expect(dataArgProcessor.process).toHaveBeenCalledTimes(1);
    expect(executePreQueryHooks).toHaveBeenCalledTimes(1);
  });
});
