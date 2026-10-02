import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import type { QueryRunner } from 'typeorm';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { CreateSearchFieldMetadataActionHandlerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/search-field-metadata/services/create-search-field-metadata-action-handler.service';
import { UpdateFieldActionHandlerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/field/services/update-field-action-handler.service';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const applicationId = '20202020-0000-4000-8000-000000000002';

it('rebuilds Creator vector from search rows created earlier in the same pinned transaction, before its receipt', async () => {
  const { allFlatEntityMaps: fixture } =
    computeTwentyStandardApplicationAllFlatEntityMaps({
      now: '2026-07-28T00:00:00.000Z',
      workspaceId,
      twentyStandardApplicationId: applicationId,
    });
  const creatorId = MYAH_STANDARD_OBJECTS.creator.universalIdentifier;
  const source = Object.values(
    fixture.flatSearchFieldMetadataMaps.byUniversalIdentifier,
  )
    .filter(isDefined)
    .find(
      (row) =>
        row.objectMetadataUniversalIdentifier === creatorId &&
        row.fieldMetadataUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
    )!;
  expect(source).toBeDefined();
  const vector = Object.values(
    fixture.flatFieldMetadataMaps.byUniversalIdentifier,
  )
    .filter(isDefined)
    .find((field) => field.id === source.tsVectorFieldMetadataId)!;
  expect(vector.type).toBe(FieldMetadataType.TS_VECTOR);
  const missing = createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps;
  const applicationUniversalIdentifier = '20202020-0000-4000-8000-000000000003';
  const flatApplicationMaps = {
    idByUniversalIdentifier: {
      [applicationUniversalIdentifier]: applicationId,
    },
    byId: {
      [applicationId]: {
        id: applicationId,
        universalIdentifier: applicationUniversalIdentifier,
      },
    },
  };
  const indexedFields = {
    ...fixture.flatFieldMetadataMaps,
    byId: Object.fromEntries(
      Object.values(fixture.flatFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map((field) => [field.id, field]),
    ),
    universalIdentifierById: Object.fromEntries(
      Object.values(fixture.flatFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map((field) => [field.id, field.universalIdentifier]),
    ),
  };
  const indexedObjects = {
    ...fixture.flatObjectMetadataMaps,
    byUniversalIdentifier: Object.fromEntries(
      Object.values(fixture.flatObjectMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map((object) => [
          object.universalIdentifier,
          {
            ...object,
            fieldIds: Object.values(indexedFields.byId)
              .filter((field) => field.objectMetadataId === object.id)
              .map((field) => field.id),
          },
        ]),
    ),
    universalIdentifierById: Object.fromEntries(
      Object.values(fixture.flatObjectMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map((object) => [object.id, object.universalIdentifier]),
    ),
  };
  const cached = {
    ...fixture,
    flatFieldMetadataMaps: indexedFields,
    flatObjectMetadataMaps: indexedObjects,
    flatSearchFieldMetadataMaps: missing,
  };
  const created = {
    ...missing,
    byUniversalIdentifier: { [source.universalIdentifier]: source },
    byId: { [source.id]: source },
  };
  const addColumns = jest.fn(async () => undefined);
  const repository = {
    insert: jest.fn(async () => undefined),
    update: jest.fn(async () => undefined),
  };
  const queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    query: jest.fn(async () => undefined),
    manager: { getRepository: () => repository },
    startTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    commitTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
  } as unknown as QueryRunner;
  const upgradeTransaction: UpgradeWorkspaceTransaction = {
    queryRunner,
    afterCommit: () => {
      throw new Error('owner must install after-commit callback');
    },
  };
  const createHandler = new CreateSearchFieldMetadataActionHandlerService();
  const updateHandler = new UpdateFieldActionHandlerService({
    columnManager: { dropColumns: jest.fn(async () => undefined), addColumns },
  } as never);
  const actionRegistry = {
    executeActionRollbackHandler: jest.fn(async () => undefined),
    executeActionHandler: jest.fn(
      async ({
        action,
        context,
      }: {
        action: { metadataName: string };
        context: Record<string, unknown>;
      }) => {
        if (action.metadataName === 'searchFieldMetadata') {
          await createHandler.executeForMetadata({
            flatAction: { flatEntity: source },
            queryRunner,
          } as never);
          return {
            partialOptimisticCache: { flatSearchFieldMetadataMaps: created },
            metadataEvents: [],
            afterCommitSideEffects: [],
          };
        }
        expect(
          (context.allFlatEntityMaps as typeof cached)
            .flatSearchFieldMetadataMaps.byUniversalIdentifier[
            source.universalIdentifier
          ],
        ).toBeDefined();
        expect(
          (
            context.getSearchFieldMetadatasByTsVectorFieldId as (
              id: string,
            ) => unknown[]
          )(vector.id),
        ).toContainEqual(source);
        await updateHandler.executeForWorkspaceSchema({
          flatAction: {
            entityId: vector.id,
            update: {},
            rebuildSearchVector: true,
          },
          queryRunner,
          workspaceId,
          allFlatEntityMaps: context.allFlatEntityMaps,
          getSearchFieldMetadatasByTsVectorFieldId:
            context.getSearchFieldMetadatasByTsVectorFieldId,
        } as never);
        return {
          partialOptimisticCache: {},
          metadataEvents: [],
          afterCommitSideEffects: [],
        };
      },
    ),
  };
  const runner = new WorkspaceMigrationRunnerService(
    {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(async () => cached),
    } as never,
    {
      createQueryRunner: jest.fn(() => {
        throw new Error('pooled runner forbidden');
      }),
    } as never,
    actionRegistry as never,
    {
      incrementMetadataVersion: jest.fn(async (_workspaceId, transaction) => {
        if (transaction.queryRunner !== queryRunner)
          throw new Error('version must use pinned runner');
      }),
    } as never,
    {} as never,
    { getOrRecompute: jest.fn(async () => ({ flatApplicationMaps })) } as never,
    {
      perfTime: jest.fn(),
      perfTimeEnd: jest.fn(),
      perf: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as never,
    { get: jest.fn(() => false) } as never,
  );
  (
    runner as unknown as { invalidateCache: () => Promise<void> }
  ).invalidateCache = jest.fn(async () => undefined);
  const recordUpgradeMigration = jest.fn(
    async ({ queryRunner }: { queryRunner: QueryRunner }) => {
      await queryRunner.query(
        'INSERT INTO core.upgradeMigration /* receipt */',
      );
    },
  );
  const commandRunner = new WorkspaceCommandRunnerService(
    { get: () => 'test' } as never,
    { recordUpgradeMigration } as never,
    {
      invalidateInstanceAndAllWorkspacesStatus: jest.fn(async () => undefined),
    } as never,
    { currentRunner: () => queryRunner } as never,
  );
  await commandRunner.runWorkspaceCommands({
    iteratorContext: { workspaceId, index: 0, total: 1 },
    options: {},
    workspaceCommands: [
      {
        name: 'creator-search',
        command: {
          runOnWorkspaceInUpgradeTransaction: async (
            _args: unknown,
            _runner: QueryRunner,
            afterCommit: UpgradeWorkspaceTransaction['afterCommit'],
          ) => {
            upgradeTransaction.afterCommit = afterCommit;
            await runner.run({
              workspaceId,
              workspaceMigration: {
                applicationUniversalIdentifier,
                actions: [
                  {
                    metadataName: 'searchFieldMetadata',
                    type: 'create',
                  } as never,
                ],
              },
              upgradeTransaction,
            });
            expect(repository.insert).toHaveBeenCalledTimes(1);
            expect(source.tsVectorFieldMetadataId).toBe(vector.id);
            expect(indexedFields.byId[source.fieldMetadataId]).toBeDefined();
            expect(
              indexedObjects.byUniversalIdentifier[creatorId]?.fieldIds,
            ).toContain(source.fieldMetadataId);
            expect(
              upgradeTransaction.optimisticFlatEntityMaps
                ?.flatSearchFieldMetadataMaps?.byUniversalIdentifier[
                source.universalIdentifier
              ],
            ).toBeDefined();
            expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
            await runner.run({
              workspaceId,
              workspaceMigration: {
                applicationUniversalIdentifier,
                actions: [
                  {
                    metadataName: 'fieldMetadata',
                    type: 'update',
                    rebuildSearchVector: true,
                  } as never,
                ],
              },
              upgradeTransaction,
            });
            const [[{ columnDefinitions }]] = (addColumns as jest.Mock).mock
              .calls as Array<
              [{ columnDefinitions: Array<{ asExpression: string }> }]
            >;
            const expression = columnDefinitions[0].asExpression;
            expect(expression).toContain('to_tsvector');
            expect(expression).toContain('"name"');
            expect(expression).not.toBe("to_tsvector('simple', NULL)");
            expect(
              upgradeTransaction.optimisticFlatEntityMaps
                ?.flatSearchFieldMetadataMaps?.byUniversalIdentifier[
                source.universalIdentifier
              ],
            ).toBeDefined();
          },
        } as never,
      },
    ],
  });
  expect(recordUpgradeMigration).toHaveBeenCalledTimes(1);
  expect(queryRunner.query).toHaveBeenCalledWith(
    'INSERT INTO core.upgradeMigration /* receipt */',
  );
  expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  expect(
    jest.mocked(queryRunner.query).mock.invocationCallOrder[
      jest.mocked(queryRunner.query).mock.invocationCallOrder.length - 1
    ],
  ).toBeLessThan(
    jest.mocked(queryRunner.commitTransaction).mock.invocationCallOrder[0],
  );
  expect(queryRunner.release).not.toHaveBeenCalled();
});
