const execute = jest
  .fn()
  .mockResolvedValue({ generatedMaps: [{ id: 'campaign-id' }] });
const queryBuilder: Record<string, jest.Mock> = {};
queryBuilder.update = jest.fn(() => queryBuilder);
queryBuilder.set = jest.fn(() => queryBuilder);
queryBuilder.returning = jest.fn(() => queryBuilder);
queryBuilder.execute = execute;

jest.mock(
  'src/engine/api/common/common-query-runners/utils/build-mutation-query-builder.util',
  () => ({ buildMutationQueryBuilder: jest.fn(() => queryBuilder) }),
);
jest.mock(
  'src/engine/api/graphql/graphql-query-runner/utils/build-columns-to-return',
  () => ({ buildColumnsToReturn: jest.fn(() => ['id']) }),
);

import { CommonDeleteManyQueryRunnerService } from '../common-delete-many-query-runner.service';
import { CommonDestroyManyQueryRunnerService } from '../common-destroy-many-query-runner.service';
import { CommonMergeManyQueryRunnerService } from '../common-merge-many-query-runner.service';
import { CommonUpdateManyQueryRunnerService } from '../common-update-many-query-runner.service';
import { CommonUpdateOneQueryRunnerService } from '../common-update-one-query-runner.service';

describe('Myah Inbox contact triage generic runners', () => {
  it('reconciles generic message thread Creator relationship updates through the source bridge', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000001';
    queryBuilder.clone = jest.fn(() => queryBuilder);
    queryBuilder.select = jest.fn(() => queryBuilder);
    queryBuilder.getRawMany = jest.fn().mockResolvedValue([{ id: sourceId }]);
    const lifecycle = {
      withPreparedSourceMutationInTransaction: jest.fn(
        async ({ mutate }: { mutate: () => Promise<unknown> }) => mutate(),
      ),
    };
    const manager = { getRepository: jest.fn(() => ({})) };
    const service = new CommonUpdateManyQueryRunnerService(lifecycle as never);

    await expect(
      service.run(
        {
          filter: { id: { eq: sourceId } },
          data: { creatorId: '00000000-0000-4000-8000-000000000002' },
          selectedFieldsResult: { select: { id: true } },
        } as never,
        {
          repository: {},
          flatObjectMetadata: { nameSingular: 'messageThread' },
          flatObjectMetadataMaps: {},
          flatFieldMetadataMaps: {},
          commonQueryParser: {},
          authContext: { workspace: { id: 'workspace-id' } },
          rolePermissionConfig: {},
          workspaceDataSource: {
            transaction: (
              callback: (transactionManager: typeof manager) => unknown,
            ) => callback(manager),
          },
        } as never,
      ),
    ).resolves.toEqual([{ id: 'campaign-id' }]);

    expect(
      lifecycle.withPreparedSourceMutationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'EMAIL_THREAD',
        sourceRecordIds: [sourceId],
        nextCreatorIds: ['00000000-0000-4000-8000-000000000002'],
        manager,
      }),
    );
  });

  it('routes update-one through exactly one update-many bridge without a lifecycle callback', async () => {
    const id = '00000000-0000-4000-8000-000000000010';
    const updateMany = {
      run: jest.fn().mockResolvedValue([{ id }]),
    };
    const service = new CommonUpdateOneQueryRunnerService(updateMany as never);

    await expect(
      service.run(
        {
          id,
          data: { creatorId: '00000000-0000-4000-8000-000000000011' },
          selectedFieldsResult: { select: { id: true } },
        } as never,
        {} as never,
      ),
    ).resolves.toEqual({ id });

    expect(updateMany.run).toHaveBeenCalledTimes(1);
    expect(updateMany.run).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { id: { eq: id } } }),
      expect.anything(),
    );
    expect(updateMany.run.mock.calls[0][0]).not.toHaveProperty('callback');
  });

  it('reconciles generic Instagram Creator relationship updates through a transaction-bound source bridge', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000012';
    queryBuilder.clone = jest.fn(() => queryBuilder);
    queryBuilder.select = jest.fn(() => queryBuilder);
    queryBuilder.getRawMany = jest.fn().mockResolvedValue([{ id: sourceId }]);
    const manager = { getRepository: jest.fn(() => ({})) };
    const lifecycle = {
      withPreparedSourceMutationInTransaction: jest.fn(
        async ({
          verify,
          mutate,
        }: {
          verify: () => Promise<void>;
          mutate: () => Promise<unknown>;
        }) => {
          await verify();
          return mutate();
        },
      ),
    };
    const service = new CommonUpdateManyQueryRunnerService(lifecycle as never);

    await service.run(
      {
        filter: { id: { eq: sourceId } },
        data: { creatorId: '00000000-0000-4000-8000-000000000013' },
        selectedFieldsResult: { select: { id: true } },
      } as never,
      {
        repository: {},
        flatObjectMetadata: { nameSingular: 'myahSocialConversation' },
        flatObjectMetadataMaps: {},
        flatFieldMetadataMaps: {},
        commonQueryParser: {},
        authContext: { workspace: { id: 'workspace-id' } },
        rolePermissionConfig: {},
        workspaceDataSource: {
          transaction: (
            callback: (transactionManager: typeof manager) => unknown,
          ) => callback(manager),
        },
      } as never,
    );

    expect(
      lifecycle.withPreparedSourceMutationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'INSTAGRAM_CONVERSATION',
        sourceRecordIds: [sourceId],
        nextCreatorIds: ['00000000-0000-4000-8000-000000000013'],
        manager,
      }),
    );
    // Authorization prefetch and the locked transaction re-read both use the
    // mutation query builder, while the latter uses the transaction manager.
    expect(manager.getRepository).toHaveBeenCalledWith(
      'myahSocialConversation',
      {},
      expect.anything(),
    );
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
  });

  it('uses one Creator merge bridge to re-read locked targets and aborts before related migration on mismatch', async () => {
    const priorityId = '00000000-0000-4000-8000-000000000020';
    const deletedId = '00000000-0000-4000-8000-000000000021';
    const lockedTargets = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ id: priorityId }]),
      })),
    };
    const manager = { getRepository: jest.fn(() => lockedTargets) };
    const lifecycle = {
      withPreparedCreatorMutationInTransaction: jest.fn(async ({ verify }) =>
        verify(),
      ),
    };
    const service = new CommonMergeManyQueryRunnerService(lifecycle as never);
    const migrateRelatedRecords = jest.fn();
    Object.assign(service, { migrateRelatedRecords });
    const executeMerge = Reflect.get(
      service,
      'executeMergeWithinTransaction',
    ) as (...args: unknown[]) => Promise<unknown>;

    await expect(
      executeMerge.call(service, manager, {
        args: { selectedFieldsResult: { select: { id: true } } },
        queryRunnerContext: {
          flatObjectMetadata: { nameSingular: 'creator' },
          flatObjectMetadataMaps: {},
          flatFieldMetadataMaps: {},
          rolePermissionConfig: {},
          authContext: { workspace: { id: 'workspace-id' } },
        },
        idsToDelete: [deletedId],
        priorityRecordId: priorityId,
        mergedData: {},
      }),
    ).rejects.toThrow(
      'Creator records changed before transaction reconciliation',
    );

    expect(
      lifecycle.withPreparedCreatorMutationInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(
      lifecycle.withPreparedCreatorMutationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorIds: [priorityId, deletedId],
        manager,
      }),
    );
    expect(manager.getRepository).toHaveBeenCalledWith(
      'creator',
      {},
      expect.anything(),
    );
    expect(migrateRelatedRecords).not.toHaveBeenCalled();
  });

  it('passes the merge transaction manager through bridge mutation and related migration', async () => {
    const priorityId = '00000000-0000-4000-8000-000000000022';
    const deletedId = '00000000-0000-4000-8000-000000000023';
    const transactionQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => transactionQueryBuilder),
      })),
    };
    const lifecycle = {
      withPreparedCreatorMutationInTransaction: jest.fn(async ({ mutate }) =>
        mutate(),
      ),
    };
    const service = new CommonMergeManyQueryRunnerService(lifecycle as never);
    const migrateRelatedRecords = jest.fn();
    const updatePriorityRecord = jest
      .fn()
      .mockResolvedValue({ id: priorityId });
    Object.assign(service, { migrateRelatedRecords, updatePriorityRecord });
    const executeMerge = Reflect.get(
      service,
      'executeMergeWithinTransaction',
    ) as (...args: unknown[]) => Promise<unknown>;

    await expect(
      executeMerge.call(service, manager, {
        args: { selectedFieldsResult: { select: { id: true } } },
        queryRunnerContext: {
          flatObjectMetadata: { nameSingular: 'creator' },
          flatObjectMetadataMaps: {},
          flatFieldMetadataMaps: {},
          rolePermissionConfig: {},
          authContext: { workspace: { id: 'workspace-id' } },
        },
        idsToDelete: [deletedId],
        priorityRecordId: priorityId,
        mergedData: {},
      }),
    ).resolves.toEqual({ id: priorityId });

    expect(migrateRelatedRecords).toHaveBeenCalledWith(
      manager,
      expect.anything(),
      [deletedId],
      priorityId,
    );
  });

  it('routes Creator soft deletion through the prepared bridge before rekeying sources', async () => {
    const creatorId = '00000000-0000-4000-8000-000000000003';
    queryBuilder.clone = jest.fn(() => queryBuilder);
    queryBuilder.select = jest.fn(() => queryBuilder);
    queryBuilder.getRawMany = jest.fn().mockResolvedValue([{ id: creatorId }]);
    queryBuilder.whereInIds = jest.fn(() => queryBuilder);
    queryBuilder.setLock = jest.fn(() => queryBuilder);
    queryBuilder.softDelete = jest.fn(() => queryBuilder);
    const lifecycle = {
      withPreparedCreatorMutationInTransaction: jest.fn(
        async ({ verify, mutate }) => {
          await verify();
          return mutate([]);
        },
      ),
      rekeyPreparedSourcesToUnmatchedInTransaction: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => queryBuilder),
      })),
    };
    const service = new CommonDeleteManyQueryRunnerService(lifecycle as never);

    await service.run(
      {
        filter: { id: { eq: creatorId } },
        selectedFieldsResult: { select: { id: true } },
      } as never,
      {
        repository: {},
        flatObjectMetadata: { nameSingular: 'creator' },
        flatObjectMetadataMaps: {},
        flatFieldMetadataMaps: {},
        commonQueryParser: {},
        authContext: { workspace: { id: 'workspace-id' } },
        rolePermissionConfig: {},
        workspaceDataSource: {
          transaction: (
            callback: (transactionManager: typeof manager) => unknown,
          ) => callback(manager),
        },
      } as never,
    );

    expect(
      lifecycle.withPreparedCreatorMutationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ creatorIds: [creatorId], manager }),
    );
    expect(
      lifecycle.rekeyPreparedSourcesToUnmatchedInTransaction,
    ).toHaveBeenCalledWith(expect.objectContaining({ manager, sources: [] }));
  });

  it('routes Creator hard deletion through the prepared bridge before rekeying sources', async () => {
    const creatorId = '00000000-0000-4000-8000-000000000004';
    queryBuilder.clone = jest.fn(() => queryBuilder);
    queryBuilder.select = jest.fn(() => queryBuilder);
    queryBuilder.getRawMany = jest.fn().mockResolvedValue([{ id: creatorId }]);
    queryBuilder.whereInIds = jest.fn(() => queryBuilder);
    queryBuilder.setLock = jest.fn(() => queryBuilder);
    queryBuilder.delete = jest.fn(() => queryBuilder);
    const lifecycle = {
      withPreparedCreatorMutationInTransaction: jest.fn(
        async ({ verify, mutate }) => {
          await verify();
          return mutate([]);
        },
      ),
      rekeyPreparedSourcesToUnmatchedInTransaction: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => queryBuilder),
      })),
    };
    const service = new CommonDestroyManyQueryRunnerService(lifecycle as never);

    await service.run(
      {
        filter: { id: { eq: creatorId } },
        selectedFieldsResult: { select: { id: true } },
      } as never,
      {
        repository: {},
        flatObjectMetadata: { nameSingular: 'creator' },
        flatObjectMetadataMaps: {},
        flatFieldMetadataMaps: {},
        commonQueryParser: {},
        authContext: { workspace: { id: 'workspace-id' } },
        rolePermissionConfig: {},
        workspaceDataSource: {
          transaction: (
            callback: (transactionManager: typeof manager) => unknown,
          ) => callback(manager),
        },
      } as never,
    );

    expect(
      lifecycle.withPreparedCreatorMutationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ creatorIds: [creatorId], manager }),
    );
    expect(
      lifecycle.rekeyPreparedSourcesToUnmatchedInTransaction,
    ).toHaveBeenCalledWith(expect.objectContaining({ manager, sources: [] }));
  });

  it('does not enter the lifecycle bridge for Campaign updates', async () => {
    const lifecycle = {
      withPreparedCreatorMutationInTransaction: jest.fn(),
    };
    const service = new CommonUpdateManyQueryRunnerService(lifecycle as never);

    await expect(
      service.run(
        {
          filter: { id: { eq: 'campaign-id' } },
          data: { name: 'unchanged triage' },
          selectedFieldsResult: { select: { id: true } },
        } as never,
        {
          repository: {},
          flatObjectMetadata: { nameSingular: 'campaign' },
          flatObjectMetadataMaps: {},
          flatFieldMetadataMaps: {},
          commonQueryParser: {},
        } as never,
      ),
    ).resolves.toEqual([{ id: 'campaign-id' }]);

    expect(
      lifecycle.withPreparedCreatorMutationInTransaction,
    ).not.toHaveBeenCalled();
  });
});
