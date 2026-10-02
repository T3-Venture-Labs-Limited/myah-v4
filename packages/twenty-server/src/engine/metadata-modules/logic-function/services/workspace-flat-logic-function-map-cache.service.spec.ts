import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import {
  LogicFunctionEntity,
  LogicFunctionExecutionMode,
  LogicFunctionRuntime,
} from 'src/engine/metadata-modules/logic-function/logic-function.entity';
import { WorkspaceFlatLogicFunctionMapCacheService } from 'src/engine/metadata-modules/logic-function/services/workspace-flat-logic-function-map-cache.service';

const workspaceId = 'workspace-A';
const entities = [LogicFunctionEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  name?: string;
  runtime?: LogicFunctionRuntime;
  executionMode?: LogicFunctionExecutionMode;
  sourceHandlerPath?: string;
  builtHandlerPath?: string;
  handlerName?: string;
  toolTriggerSettings?: object | null;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
const definition = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    name: 'Original',
    runtime: LogicFunctionRuntime.NODE22,
    executionMode: LogicFunctionExecutionMode.LIVE,
    sourceHandlerPath: 'src/handler.ts',
    builtHandlerPath: 'dist/handler.js',
    handlerName: 'handle',
    toolTriggerSettings: { name: 'creator_tool' },
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app')]],
    [
      LogicFunctionEntity,
      [
        definition('function', { deletedAt: new Date('2024-01-01') }),
        definition('other'),
      ],
    ],
  ]);

// Fake only TypeORM I/O; the provider, converter and three-index insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === LogicFunctionEntity
          ? { withDeleted: true }
          : { select: ['id', 'universalIdentifier'] }),
      });
      return (state.get(entity) ?? []).filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          (options.withDeleted || !entry.deletedAt),
      );
    });
    calls.set(entity, find);
    repositories.set(entity, {
      target: entity,
      find,
    } as unknown as Repository<never>);
  }
  const manager = {
    getRepository: (entity: Function) => {
      const repository = repositories.get(entity);
      if (!repository) throw new Error(`Unexpected repository: ${entity.name}`);
      return repository;
    },
  } as unknown as EntityManager;
  return { manager, calls };
};

const service = (ordinaryManager: EntityManager) => {
  const pooled = <T extends { workspaceId: string }>(entity: Function) =>
    ({
      target: entity,
      find: () => {
        throw new Error(`POOLED_READ:${entity.name}`);
      },
    }) as unknown as Repository<T>;
  return new WorkspaceFlatLogicFunctionMapCacheService(
    {
      ...pooled<LogicFunctionEntity>(LogicFunctionEntity),
      manager: ordinaryManager,
    } as Repository<LogicFunctionEntity>,
    pooled<ApplicationEntity>(ApplicationEntity),
  );
};

const expectIndexes = (
  map: Awaited<
    ReturnType<WorkspaceFlatLogicFunctionMapCacheService['computeForCache']>
  >,
  functionUid: string,
  ownerId = 'app',
) => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    functionUid,
    'uid-other',
  ]);
  expect(map.universalIdentifierById).toEqual({
    function: functionUid,
    other: 'uid-other',
  });
  expect(map.universalIdentifiersByApplicationId).toEqual({
    [ownerId]: [functionUid, 'uid-other'],
  });
};

describe('WorkspaceFlatLogicFunctionMapCacheService manager-bound computation', () => {
  it('uses both direct manager reads on ordinary and pinned paths, retaining deleted functions and handler/trigger fields', async () => {
    const state = rows();
    const ordinary = fixture(state);
    const pinned = fixture(state);
    const provider = service(ordinary.manager);
    const cached = await provider.computeForCache(workspaceId);
    const local = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(cached).toEqual(local);
    for (const entity of entities) {
      expect(ordinary.calls.get(entity)).toHaveBeenCalledTimes(1);
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(1);
    }
    expect(local.byUniversalIdentifier['uid-function']).toMatchObject({
      id: 'function',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      name: 'Original',
      runtime: LogicFunctionRuntime.NODE22,
      executionMode: LogicFunctionExecutionMode.LIVE,
      sourceHandlerPath: 'src/handler.ts',
      builtHandlerPath: 'dist/handler.js',
      handlerName: 'handle',
      toolTriggerSettings: { name: 'creator_tool' },
      deletedAt: '2024-01-01T00:00:00.000Z',
    });
    expectIndexes(local, 'uid-function');
  });

  it('starts both parallel reads before the first finishes', async () => {
    let releaseFunctions!: (value: Row[]) => void;
    const functions = new Promise<Row[]>((resolve) => {
      releaseFunctions = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find:
          entity === LogicFunctionEntity ? () => functions : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
    });
    releaseFunctions([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rebuilds mutable name/runtime/UID and owner map on a second read, preserving first indexes', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.set(ApplicationEntity, [
      row('new-app', { universalIdentifier: 'uid-new-app' }),
    ]);
    state.set(LogicFunctionEntity, [
      definition('function', {
        applicationId: 'new-app',
        universalIdentifier: 'uid-function-v2',
        name: 'Changed',
        runtime: LogicFunctionRuntime.NODE18,
      }),
      definition('other', { applicationId: 'new-app' }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-function']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-function-v2']).toMatchObject({
      name: 'Changed',
      runtime: LogicFunctionRuntime.NODE18,
      applicationId: 'new-app',
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expectIndexes(second, 'uid-function-v2', 'new-app');
    expect(first.byUniversalIdentifier['uid-function']).toMatchObject({
      name: 'Original',
      runtime: LogicFunctionRuntime.NODE22,
      applicationUniversalIdentifier: 'uid-app',
    });
    expectIndexes(first, 'uid-function');
    for (const entity of entities) {
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
    }
  });

  it('scopes both queries to A and excludes deleted application owners while retaining deleted logic functions', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(LogicFunctionEntity)!.push(
      definition('foreign-function', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    const provider = service(fixture(new Map()).manager);
    const local = await provider.computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-function');
    expect(local.universalIdentifierById['foreign-function']).toBeUndefined();
    state.get(ApplicationEntity)![0] = row('app', {
      deletedAt: new Date('2024-01-01'),
    });
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow(
      'Application with id app not found for logicFunction function',
    );
  });

  it('preserves missing owner, duplicate UID rejection, and fresh empty indexes', async () => {
    const state = rows();
    const manager = fixture(state).manager;
    const provider = service(manager);
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for logicFunction function',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(LogicFunctionEntity)!
      .push(definition('duplicate', { universalIdentifier: 'uid-function' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(LogicFunctionEntity, []);
    const empty = await provider.computeFromManager(workspaceId, manager);
    expect(empty).toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
    expect(empty).not.toBe(
      await provider.computeFromManager(workspaceId, manager),
    );
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before either direct read on both entry points',
    async (invalidId) => {
      const directFind = jest.fn();
      const getRepository = jest.fn(() => ({ find: directFind }));
      const manager = { getRepository } as unknown as EntityManager;
      const provider = service(manager);
      await expect(
        provider.computeForCache(invalidId as string),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      await expect(
        provider.computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      expect(getRepository).not.toHaveBeenCalled();
      expect(directFind).not.toHaveBeenCalled();
    },
  );
});
