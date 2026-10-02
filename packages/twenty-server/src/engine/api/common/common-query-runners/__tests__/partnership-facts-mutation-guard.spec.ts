import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectRecord } from 'twenty-shared/types';

import { CommonBaseQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import {
  type CommonInput,
  CommonQueryNames,
  type UpdateOneQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';

class PartnershipRunner extends CommonBaseQueryRunnerService<
  UpdateOneQueryArgs,
  ObjectRecord
> {
  protected readonly operationName: CommonQueryNames;

  constructor(operation: CommonQueryNames) {
    super();
    this.operationName = operation;
  }

  protected async run(): Promise<ObjectRecord> {
    return { id: 'written' };
  }

  protected async validate(): Promise<void> {}

  protected async computeArgs(
    args: CommonInput<UpdateOneQueryArgs>,
  ): Promise<CommonInput<UpdateOneQueryArgs>> {
    return args;
  }

  protected async processQueryResult(
    result: ObjectRecord,
  ): Promise<ObjectRecord> {
    return result;
  }
}

const offerId =
  MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier;
const obligationId =
  MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier;
const operations = [
  CommonQueryNames.CREATE_ONE,
  CommonQueryNames.CREATE_MANY,
  CommonQueryNames.UPDATE_ONE,
  CommonQueryNames.UPDATE_MANY,
  CommonQueryNames.DELETE_ONE,
  CommonQueryNames.DELETE_MANY,
  CommonQueryNames.DESTROY_ONE,
  CommonQueryNames.DESTROY_MANY,
  CommonQueryNames.RESTORE_ONE,
  CommonQueryNames.RESTORE_MANY,
  CommonQueryNames.MERGE_MANY,
];
const contexts = [
  { type: 'system', workspace: { id: 'workspace-a' } },
  {
    type: 'user',
    workspace: { id: 'workspace-a' },
    userWorkspaceId: 'admin-id',
  },
  {
    type: 'apiKey',
    workspace: { id: 'workspace-b' },
    apiKey: { id: 'api-key-id' },
  },
];

const buildRunner = (
  operation: CommonQueryNames,
  identifier: string,
  inTransaction: boolean,
  authContext: (typeof contexts)[number],
  hookData?: unknown,
) => {
  const runner = new PartnershipRunner(operation);
  const run = jest.spyOn(runner as never, 'run');
  jest
    .spyOn(
      runner as unknown as {
        prepareExtendedQueryRunnerContextWithGlobalDatasource: () => Promise<unknown>;
      },
      'prepareExtendedQueryRunnerContextWithGlobalDatasource',
    )
    .mockResolvedValue({ authContext });
  const preHooks = jest.fn(async (_auth, _object, _operation, args) =>
    hookData === undefined ? args : { ...args, data: hookData },
  );
  const rawHooks = jest.fn();
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
      shouldRunPreQueryHooksInTransaction: () => inTransaction,
      executeRawInputPreQueryHooks: rawHooks,
      executePreQueryHooks: preHooks,
      executePostQueryHooks: jest.fn(),
    },
    globalWorkspaceOrmManager: {
      executeInWorkspaceContext: async (callback: () => unknown) => callback(),
      getGlobalWorkspaceDataSource: async () => ({
        createQueryRunner: () => queryRunner,
      }),
    },
    twentyConfigService: { get: () => 100 },
    throttlerService: { tokenBucketThrottleOrThrow: jest.fn() },
    metricsService: { incrementCounterForEvent: jest.fn() },
  });
  const context = {
    authContext,
    flatObjectMetadata: {
      id: 'object-id',
      nameSingular: 'partnershipOfferVersion',
      universalIdentifier: identifier,
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
  return { runner, context, run, rawHooks, preHooks };
};

const args = {
  id: '10000000-0000-4000-8000-000000000001',
  data: { confirmedAt: '2026-09-24', confirmationState: 'CONFIRMED' },
  selectedFields: {},
} as CommonInput<UpdateOneQueryArgs>;

// No role, claim in data, or query operation can manufacture the domain-service
// authority that is not yet implemented. Deny the entire fact object for now.
describe('native partnership fact mutation guard', () => {
  it.each(operations)(
    'rejects %s on both authoritative objects',
    async (operation) => {
      for (const identifier of [offerId, obligationId]) {
        for (const inTransaction of [false, true]) {
          const { runner, context, run, rawHooks } = buildRunner(
            operation,
            identifier,
            inTransaction,
            contexts[0],
          );
          await expect(runner.execute(args, context)).rejects.toThrow(
            'Partnership facts are writable only through authorized domain services',
          );
          expect(run).not.toHaveBeenCalled();
          expect(rawHooks).not.toHaveBeenCalled();
        }
      }
    },
  );

  it.each(contexts)(
    'rejects forged authorization, acceptance and completion claims in %p',
    async (authContext) => {
      for (const [identifier, data] of [
        [
          offerId,
          {
            authorizedById: 'admin-id',
            authorizedAt: '2026-09-24',
            acceptanceReference: 'forged',
            confirmedAt: '2026-09-24',
          },
        ],
        [
          obligationId,
          {
            evidenceActorId: 'admin-id',
            evidenceReference: 'forged',
            confirmationState: 'CONFIRMED',
          },
        ],
      ] as const) {
        const { runner, context, run } = buildRunner(
          CommonQueryNames.CREATE_ONE,
          identifier,
          false,
          authContext,
        );
        await expect(
          runner.execute({ ...args, data }, context),
        ).rejects.toThrow(
          'Partnership facts are writable only through authorized domain services',
        );
        expect(run).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    CommonQueryNames.FIND_ONE,
    CommonQueryNames.FIND_MANY,
    CommonQueryNames.FIND_DUPLICATES,
    CommonQueryNames.GROUP_BY,
  ])('does not reject %s reads', async (operation) => {
    const { runner, context, rawHooks } = buildRunner(
      operation,
      offerId,
      false,
      contexts[0],
    );
    await expect(runner.execute(args, context)).resolves.toMatchObject({
      results: { id: 'written' },
    });
    expect(rawHooks).toHaveBeenCalledTimes(1);
  });

  it('allows unrelated object updates without granting fact-object writes', async () => {
    const { runner, context, run } = buildRunner(
      CommonQueryNames.UPDATE_ONE,
      '00000000-0000-4000-8000-000000000001',
      false,
      contexts[0],
    );
    await expect(runner.execute(args, context)).resolves.toMatchObject({
      results: { id: 'written' },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'rechecks the object identifier after input processing (%s)',
    async (inTransaction) => {
      const { runner, context, run, preHooks } = buildRunner(
        CommonQueryNames.UPDATE_ONE,
        '00000000-0000-4000-8000-000000000001',
        inTransaction,
        contexts[0],
      );
      jest
        .spyOn(
          runner as unknown as {
            computeArgs: () => Promise<CommonInput<UpdateOneQueryArgs>>;
          },
          'computeArgs',
        )
        .mockImplementation(async () => {
          (
            context as { flatObjectMetadata: { universalIdentifier: string } }
          ).flatObjectMetadata.universalIdentifier = offerId;
          return args;
        });

      await expect(runner.execute(args, context)).rejects.toThrow(
        'Partnership facts are writable only through authorized domain services',
      );
      expect(preHooks).toHaveBeenCalledTimes(1);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'rejects a protected object even if hooks rewrite data (%s)',
    async (inTransaction) => {
      const { runner, context, preHooks } = buildRunner(
        CommonQueryNames.UPDATE_ONE,
        obligationId,
        inTransaction,
        contexts[0],
        { confirmationState: 'CONFIRMED' },
      );
      await expect(
        runner.execute({ ...args, data: { name: 'safe' } }, context),
      ).rejects.toThrow(
        'Partnership facts are writable only through authorized domain services',
      );
      expect(preHooks).not.toHaveBeenCalled();
    },
  );
});
