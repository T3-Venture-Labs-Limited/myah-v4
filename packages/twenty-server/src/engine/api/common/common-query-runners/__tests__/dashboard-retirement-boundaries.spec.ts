import {
  CommonBaseQueryRunnerService,
  isRetiredDashboardMutation,
} from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import {
  type CommonInput,
  CommonQueryNames,
  type UpdateOneQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectRecord } from 'twenty-shared/types';

class DashboardMutationRunner extends CommonBaseQueryRunnerService<
  UpdateOneQueryArgs,
  ObjectRecord
> {
  protected readonly operationName = CommonQueryNames.UPDATE_ONE;

  protected async run(): Promise<ObjectRecord> {
    return { id: 'must-not-run' };
  }

  protected async validate(): Promise<void> {}

  protected async computeArgs(
    args: CommonInput<UpdateOneQueryArgs>,
  ): Promise<CommonInput<UpdateOneQueryArgs>> {
    return args;
  }

  protected async processQueryResult(
    queryResult: ObjectRecord,
  ): Promise<ObjectRecord> {
    return queryResult;
  }
}

const dashboardMutationContext = {
  authContext: { type: 'system', workspace: { id: 'workspace-a' } },
  flatObjectMetadata: {
    id: 'dashboard-object-id',
    nameSingular: 'dashboard',
    universalIdentifier: STANDARD_OBJECTS.dashboard.universalIdentifier,
    isSystem: false,
    fieldIds: [],
  },
  flatObjectMetadataMaps: {
    byUniversalIdentifier: {},
    universalIdentifierById: {},
    universalIdentifiersByApplicationId: {},
  },
  flatFieldMetadataMaps: {
    byUniversalIdentifier: {},
    universalIdentifierById: {},
    universalIdentifiersByApplicationId: {},
  },
} as never;

const dashboardMutationArgs = {
  id: '10000000-0000-4000-8000-000000000001',
  data: { title: 'Retired dashboard' },
  selectedFields: {},
} as CommonInput<UpdateOneQueryArgs>;

const buildDashboardMutationRunner = () => {
  const runner = new DashboardMutationRunner();
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager: {},
  };

  Object.assign(runner, {
    workspaceQueryHookService: {
      shouldRunPreQueryHooksInTransaction: () => false,
      executeRawInputPreQueryHooks: jest.fn(),
      executePreQueryHooks: jest.fn(
        async (_auth, _object, _operation, args) => args,
      ),
      executePostQueryHooks: jest.fn(),
    },
    globalWorkspaceOrmManager: {
      executeInWorkspaceContext: async (callback: () => unknown) => callback(),
      getGlobalWorkspaceDataSource: async () => ({
        createQueryRunner: () => queryRunner,
      }),
    },
    twentyConfigService: { get: () => 100 },
  });

  return { queryRunner, runner };
};

describe('dashboard retirement query boundary', () => {
  it.each([
    CommonQueryNames.CREATE_ONE,
    CommonQueryNames.UPDATE_ONE,
    CommonQueryNames.DELETE_ONE,
    CommonQueryNames.DESTROY_ONE,
    CommonQueryNames.RESTORE_ONE,
  ])('rejects dashboard %s mutations before query execution', (operation) => {
    expect(
      isRetiredDashboardMutation(
        operation,
        STANDARD_OBJECTS.dashboard.universalIdentifier,
      ),
    ).toBe(true);
  });

  it('rejects a direct dashboard mutation before hooks, transaction work, or runner execution', async () => {
    const { queryRunner, runner } = buildDashboardMutationRunner();
    const run = jest.spyOn(runner as never, 'run');

    await expect(
      runner.execute(dashboardMutationArgs, dashboardMutationContext),
    ).rejects.toThrow(
      'Dashboard records are read-only after feature retirement',
    );

    expect(run).not.toHaveBeenCalled();
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('keeps reads and retained objects outside the mutation denial', () => {
    expect(
      isRetiredDashboardMutation(
        CommonQueryNames.FIND_MANY,
        STANDARD_OBJECTS.dashboard.universalIdentifier,
      ),
    ).toBe(false);
    expect(
      isRetiredDashboardMutation(
        CommonQueryNames.CREATE_ONE,
        STANDARD_OBJECTS.person.universalIdentifier,
      ),
    ).toBe(false);
  });
});
