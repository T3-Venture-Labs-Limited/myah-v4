import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { AgentEntity } from 'src/engine/metadata-modules/ai/ai-agent/entities/agent.entity';
import { WorkspaceFlatAgentMapCacheService } from 'src/engine/metadata-modules/flat-agent/services/workspace-flat-agent-map-cache.service';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [AgentEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  name?: string;
  label?: string;
  icon?: string | null;
  description?: string | null;
  prompt?: string;
  modelId?: string;
  responseFormat?: { type: string };
  isCustom?: boolean;
  modelConfiguration?: null;
  evaluationInputs?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
const agent = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    name: 'synthetic-agent',
    label: 'Synthetic agent',
    icon: null,
    description: null,
    prompt: '',
    modelId: 'synthetic-model',
    responseFormat: { type: 'text' },
    isCustom: true,
    modelConfiguration: null,
    evaluationInputs: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    deletedAt: null,
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [AgentEntity, [agent('agent', { deletedAt: new Date('2024-01-03') })]],
  ]);

// Fake TypeORM I/O only; scoped repository, conversion and indexing remain real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === AgentEntity
          ? { where: { workspaceId }, withDeleted: true }
          : {
              where: { workspaceId },
              select: ['id', 'universalIdentifier'],
              withDeleted: true,
            },
      );
      return (state.get(entity) ?? []).filter(
        (entry) => entry.workspaceId === workspaceId,
      );
    });
    calls.set(entity, find);
    repositories.set(entity, {
      target: entity,
      find,
    } as unknown as Repository<never>);
  }
  const getRepository = jest.fn((entity: Function) => {
    const repository = repositories.get(entity);
    if (!repository) throw new Error(`Unexpected repository: ${entity.name}`);
    return repository;
  });
  return {
    manager: { getRepository } as unknown as EntityManager,
    calls,
    getRepository,
  };
};

const service = (ordinaryManager: EntityManager) => {
  const pooled = <T extends { workspaceId: string }>(entity: Function) =>
    ({
      target: entity,
      find: () => {
        throw new Error(`POOLED_READ:${entity.name}`);
      },
    }) as unknown as Repository<T>;
  return new WorkspaceFlatAgentMapCacheService(
    new WorkspaceScopedRepository(pooled<AgentEntity>(AgentEntity)),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
  );
};

describe('WorkspaceFlatAgentMapCacheService manager-bound computation', () => {
  it('uses two exact manager reads on both paths and retains deleted rows and all indexes', async () => {
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
    for (const fixtureResult of [ordinary, pinned]) {
      expect(fixtureResult.getRepository).toHaveBeenCalledTimes(2);
      for (const entity of entities) {
        expect(fixtureResult.getRepository).toHaveBeenCalledWith(entity);
        expect(fixtureResult.calls.get(entity)).toHaveBeenCalledTimes(1);
      }
    }
    expect(local.byUniversalIdentifier['uid-agent']).toMatchObject({
      id: 'agent',
      workspaceId,
      name: 'synthetic-agent',
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      prompt: '',
      deletedAt: '2024-01-03T00:00:00.000Z',
    });
    expect(local.universalIdentifierById).toEqual({ agent: 'uid-agent' });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-agent'],
    });
  });

  it('starts the application read before the scoped read resolves', async () => {
    let releaseAgents!: (value: Row[]) => void;
    const agents = new Promise<Row[]>((resolve) => {
      releaseAgents = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find: entity === AgentEntity ? () => agents : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
      withDeleted: true,
    });
    releaseAgents([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rekeys changed UID, name and owner without mutating the first map', async () => {
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
    state.set(AgentEntity, [
      agent('agent', {
        universalIdentifier: 'uid-agent-v2',
        name: 'new-agent',
        applicationId: 'new-app',
      }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-agent']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-agent-v2']).toMatchObject({
      name: 'new-agent',
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expect(second.universalIdentifierById).toEqual({ agent: 'uid-agent-v2' });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-agent-v2'],
    });
    expect(first.byUniversalIdentifier['uid-agent']).toMatchObject({
      name: 'synthetic-agent',
      applicationUniversalIdentifier: 'uid-app',
    });
    expect(first.universalIdentifierById).toEqual({ agent: 'uid-agent' });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-agent'],
    });
    for (const entity of entities)
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
  });

  it('excludes foreign workspace rows and preserves missing-owner, duplicate UID and fresh-empty behavior', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(AgentEntity)!.push(
      agent('foreign', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    const manager = fixture(state).manager;
    const provider = service(manager);
    const isolated = await provider.computeFromManager(workspaceId, manager);
    expect(Object.keys(isolated.byUniversalIdentifier)).toEqual(['uid-agent']);
    expect(isolated.universalIdentifierById['foreign']).toBeUndefined();
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Application with id app not found for agent agent');
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(AgentEntity)!
      .push(agent('duplicate', { universalIdentifier: 'uid-agent' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(AgentEntity, []);
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
    'rejects invalid workspace %s before either repository acquisition on both paths',
    async (invalidId) => {
      const getRepository = jest.fn();
      const manager = { getRepository } as unknown as EntityManager;
      const provider = service(manager);
      for (const read of [
        () => provider.computeForCache(invalidId as string),
        () => provider.computeFromManager(invalidId as string, manager),
      ]) {
        await expect(read()).rejects.toThrow(
          'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
        );
      }
      expect(getRepository).not.toHaveBeenCalled();
    },
  );
});
