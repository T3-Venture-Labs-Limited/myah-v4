import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { SkillEntity } from 'src/engine/metadata-modules/skill/entities/skill.entity';
import { WorkspaceFlatSkillMapCacheService } from 'src/engine/metadata-modules/flat-skill/services/workspace-flat-skill-map-cache.service';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [SkillEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  name?: string;
  label?: string;
  icon?: string | null;
  description?: string | null;
  content?: string;
  isActive?: boolean;
  isCustom?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null; // ApplicationEntity only
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
const skill = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    name: 'synthetic-skill',
    label: 'Synthetic skill',
    icon: null,
    description: null,
    content: '',
    isActive: true,
    isCustom: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    // SkillEntity has no DeleteDateColumn; only ApplicationEntity is physically soft-deletable.
    [SkillEntity, [skill('skill')]],
  ]);

// Fake TypeORM I/O only; scoped repository, conversion and indexing remain real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === SkillEntity
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
  return new WorkspaceFlatSkillMapCacheService(
    new WorkspaceScopedRepository(pooled<SkillEntity>(SkillEntity)),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
  );
};

describe('WorkspaceFlatSkillMapCacheService manager-bound computation', () => {
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
    expect(local.byUniversalIdentifier['uid-skill']).toMatchObject({
      id: 'skill',
      workspaceId,
      name: 'synthetic-skill',
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      content: '',
      isActive: true,
    });
    expect(local.universalIdentifierById).toEqual({ skill: 'uid-skill' });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-skill'],
    });
  });

  it('starts the application read before the scoped read resolves', async () => {
    let releaseSkills!: (value: Row[]) => void;
    const skills = new Promise<Row[]>((resolve) => {
      releaseSkills = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find: entity === SkillEntity ? () => skills : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
      withDeleted: true,
    });
    releaseSkills([]);
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
    state.set(SkillEntity, [
      skill('skill', {
        universalIdentifier: 'uid-skill-v2',
        name: 'new-skill',
        applicationId: 'new-app',
      }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-skill']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-skill-v2']).toMatchObject({
      name: 'new-skill',
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expect(second.universalIdentifierById).toEqual({ skill: 'uid-skill-v2' });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-skill-v2'],
    });
    expect(first.byUniversalIdentifier['uid-skill']).toMatchObject({
      name: 'synthetic-skill',
      applicationUniversalIdentifier: 'uid-app',
    });
    expect(first.universalIdentifierById).toEqual({ skill: 'uid-skill' });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-skill'],
    });
    for (const entity of entities)
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
  });

  it('excludes foreign workspace rows and preserves missing-owner, duplicate UID and fresh-empty behavior', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(SkillEntity)!.push(
      skill('foreign', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    const manager = fixture(state).manager;
    const provider = service(manager);
    const isolated = await provider.computeFromManager(workspaceId, manager);
    expect(Object.keys(isolated.byUniversalIdentifier)).toEqual(['uid-skill']);
    expect(isolated.universalIdentifierById['foreign']).toBeUndefined();
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Application with id app not found for skill skill');
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(SkillEntity)!
      .push(skill('duplicate', { universalIdentifier: 'uid-skill' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(SkillEntity, []);
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
