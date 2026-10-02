import {
  type EntityManager,
  type FindManyOptions,
  IsNull,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatWebhookMapCacheService } from 'src/engine/metadata-modules/flat-webhook/services/workspace-flat-webhook-map-cache.service';
import { WebhookEntity } from 'src/engine/metadata-modules/webhook/entities/webhook.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [WebhookEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  targetUrl?: string;
  operations?: string[];
  secret?: string;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
const webhook = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    targetUrl: 'https://example.invalid/webhook',
    operations: ['person.created'],
    secret: '',
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app')]],
    [WebhookEntity, [webhook('hook'), webhook('other')]],
  ]);

// Fake only TypeORM I/O; exercise the real scoped wrapper, converter and indexes.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      if (entity === WebhookEntity) {
        expect(options).toEqual({
          where: { workspaceId, deletedAt: IsNull() },
        });
      } else {
        expect(options).toEqual({
          where: { workspaceId },
          select: ['id', 'universalIdentifier'],
        });
      }
      // Both entities have DeleteDateColumn: default reads exclude deleted rows.
      return (state.get(entity) ?? []).filter(
        (entry) => entry.workspaceId === workspaceId && !entry.deletedAt,
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
  return new WorkspaceFlatWebhookMapCacheService(
    new WorkspaceScopedRepository(pooled<WebhookEntity>(WebhookEntity)),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
  );
};

type Maps = Awaited<
  ReturnType<WorkspaceFlatWebhookMapCacheService['computeForCache']>
>;
const expectIndexes = (map: Maps, hookUid: string, ownerId = 'app') => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    hookUid,
    'uid-other',
  ]);
  expect(map.universalIdentifierById).toEqual({
    hook: hookUid,
    other: 'uid-other',
  });
  expect(map.universalIdentifiersByApplicationId).toEqual({
    [ownerId]: [hookUid, 'uid-other'],
  });
};

describe('WorkspaceFlatWebhookMapCacheService manager-bound computation', () => {
  it('uses two exact manager reads through both entry points and preserves webhook output', async () => {
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
      expect(ordinary.getRepository).toHaveBeenCalledWith(entity);
      expect(pinned.getRepository).toHaveBeenCalledWith(entity);
    }
    expect(local.byUniversalIdentifier['uid-hook']).toMatchObject({
      id: 'hook',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      targetUrl: 'https://example.invalid/webhook',
      operations: ['person.created'],
      secret: '',
    });
    expectIndexes(local, 'uid-hook');
  });

  it('starts the application read before the webhook read resolves', async () => {
    let releaseWebhooks!: (value: Row[]) => void;
    const webhooks = new Promise<Row[]>((resolve) => {
      releaseWebhooks = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find: entity === WebhookEntity ? () => webhooks : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
    });
    releaseWebhooks([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rekeys URL, operations, UID and owner on the second read without changing the first map', async () => {
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
    state.set(WebhookEntity, [
      webhook('hook', {
        applicationId: 'new-app',
        universalIdentifier: 'uid-hook-v2',
        targetUrl: 'https://example.invalid/changed',
        operations: ['person.updated'],
      }),
      webhook('other', { applicationId: 'new-app' }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-hook']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-hook-v2']).toMatchObject({
      targetUrl: 'https://example.invalid/changed',
      operations: ['person.updated'],
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expectIndexes(second, 'uid-hook-v2', 'new-app');
    expect(first.byUniversalIdentifier['uid-hook']).toMatchObject({
      targetUrl: 'https://example.invalid/webhook',
      operations: ['person.created'],
      applicationUniversalIdentifier: 'uid-app',
    });
    expectIndexes(first, 'uid-hook');
    for (const entity of entities) {
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
    }
  });

  it('excludes foreign workspace and deleted webhooks, and rejects deleted owners', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(WebhookEntity)!.push(
      webhook('foreign-hook', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
      webhook('deleted-hook', { deletedAt: new Date('2024-01-01') }),
    );
    const provider = service(fixture(new Map()).manager);
    const isolated = await provider.computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(isolated, 'uid-hook');
    expect(isolated.universalIdentifierById['foreign-hook']).toBeUndefined();
    expect(isolated.universalIdentifierById['deleted-hook']).toBeUndefined();

    state.get(ApplicationEntity)![0] = row('app', {
      deletedAt: new Date('2024-01-01'),
    });
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow('Application with id app not found for webhook hook');
  });

  it('retains native missing-owner and duplicate-UID errors and fresh empty maps', async () => {
    const state = rows();
    const manager = fixture(state).manager;
    const provider = service(manager);
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Application with id app not found for webhook hook');
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(WebhookEntity)!
      .push(webhook('duplicate', { universalIdentifier: 'uid-hook' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(WebhookEntity, []);
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
    'rejects invalid workspace %s before either repository read on both paths',
    async (invalidId) => {
      const find = jest.fn();
      const getRepository = jest.fn(() => ({ target: WebhookEntity, find }));
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
      expect(find).not.toHaveBeenCalled();
    },
  );
});
