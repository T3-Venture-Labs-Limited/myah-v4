import { FindOperator } from 'typeorm';

import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { SocialProfileService } from 'src/modules/myah-creator-social-profile/services/social-profile.service';
import { type SocialProfileRecord } from 'src/modules/myah-creator-social-profile/types/social-profile-record.type';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: () => ({
      userWorkspaceRoleMap: {},
      apiKeyRoleMap: {},
    }),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => ({
      intersectionOf: ['role-1'],
    })),
  }),
);

const authContext = {
  workspace: { id: 'workspace-1' },
} as never;

class FakeSocialProfileRepository {
  records: SocialProfileRecord[];

  constructor(records: SocialProfileRecord[] = []) {
    this.records = records;
  }

  async find({
    where,
  }: {
    where: Partial<SocialProfileRecord>[];
  }): Promise<SocialProfileRecord[]> {
    return this.records.filter((record) =>
      where.some((condition) =>
        Object.entries(condition).every(
          ([key, value]) => record[key as keyof SocialProfileRecord] === value,
        ),
      ),
    );
  }

  async findOneBy({ id }: { id: string }) {
    return (
      this.records.find(
        (record) => record.id === id && record.deletedAt === null,
      ) ?? null
    );
  }

  async findOne({
    where: { id },
    withDeleted,
  }: {
    where: { id: string };
    withDeleted?: boolean;
  }) {
    return (
      this.records.find(
        (record) =>
          record.id === id && (withDeleted || record.deletedAt === null),
      ) ?? null
    );
  }

  async softDelete({ id }: { id: string }) {
    const profile = this.records.find((record) => record.id === id);
    if (profile) profile.deletedAt = new Date();
  }

  async restore({ id }: { id: string }) {
    const profile = this.records.find((record) => record.id === id);
    if (profile) profile.deletedAt = null;
  }

  create(input: SocialProfileRecord) {
    return input;
  }

  async save(record: SocialProfileRecord) {
    const duplicate = this.records.find(
      (candidate) =>
        candidate.deletedAt === null &&
        candidate.platform === record.platform &&
        ((record.platformAccountId &&
          candidate.platformAccountId === record.platformAccountId) ||
          (record.normalizedLocator &&
            candidate.normalizedLocator === record.normalizedLocator)),
    );

    if (duplicate)
      throw Object.assign(new Error('duplicate'), { code: '23505' });
    this.records.push(record);
    return record;
  }

  async update(
    {
      id,
      platformAccountId,
    }: {
      id?: string;
      platformAccountId?: string | null | FindOperator<string>;
    },
    patch: Partial<SocialProfileRecord>,
  ) {
    const record = this.records.find(
      (candidate) =>
        candidate.id === id &&
        (platformAccountId === undefined ||
          (platformAccountId instanceof FindOperator
            ? platformAccountId.type === 'isNull' &&
              candidate.platformAccountId === null
            : candidate.platformAccountId === platformAccountId)),
    );

    if (!record) return { affected: 0 };

    const duplicate = this.records.find(
      (candidate) =>
        candidate.id !== id &&
        candidate.deletedAt === null &&
        candidate.platform === record.platform &&
        ((patch.platformAccountId &&
          candidate.platformAccountId === patch.platformAccountId) ||
          (patch.normalizedLocator &&
            candidate.normalizedLocator === patch.normalizedLocator)),
    );

    if (duplicate)
      throw Object.assign(new Error('duplicate'), { code: '23505' });
    Object.assign(record, patch);
    return { affected: 1 };
  }
}

class AdvisoryLockCoordinator {
  private tails = new Map<string, Promise<void>>();

  queryRunner() {
    const releases: (() => void)[] = [];

    return {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(async (_query: string, [key]: [string]) => {
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release: () => void = () => {};
        const current = new Promise<void>((resolve) => {
          release = resolve;
        });

        this.tails.set(
          key,
          previous.then(() => current),
        );
        await previous;
        releases.push(release);
      }),
      commitTransaction: jest.fn(async () =>
        releases.splice(0).forEach((fn) => fn()),
      ),
      rollbackTransaction: jest.fn(async () =>
        releases.splice(0).forEach((fn) => fn()),
      ),
      release: jest.fn(),
    };
  }
}

const record = (
  overrides: Partial<SocialProfileRecord> = {},
): SocialProfileRecord => ({
  id: 'profile-1',
  creatorId: 'creator-1',
  name: '@creator.name on Instagram',
  platform: 'INSTAGRAM',
  handle: 'creator.name',
  profileUrl: 'https://www.instagram.com/creator.name/',
  normalizedLocator: 'handle:creator.name',
  platformAccountId: null,
  followerCount: null,
  followerCountObservedAt: null,
  followerCountSource: null,
  deletedAt: null,
  ...overrides,
});

const makeService = (
  repository: FakeSocialProfileRepository,
  onTransactionStart?: () => void,
) => {
  const locks = new AdvisoryLockCoordinator();
  const dataSource = {
    createQueryRunner: () => {
      const runner = locks.queryRunner();
      const start = runner.startTransaction;
      runner.startTransaction = jest.fn(async () => {
        await start();
        onTransactionStart?.();
      });
      return runner;
    },
    createEntityManager: () => ({ getRepository: () => repository }),
  };
  const ormManager = {
    executeInWorkspaceContext: (callback: () => unknown) => callback(),
    getGlobalWorkspaceDataSource: async () => dataSource,
  };

  return new SocialProfileService(ormManager as never);
};

describe('SocialProfileService', () => {
  const mockedResolveRolePermissionConfig = jest.mocked(
    resolveRolePermissionConfig,
  );

  beforeEach(() => {
    mockedResolveRolePermissionConfig.mockReturnValue({
      intersectionOf: ['role-1'],
    });
  });

  it('preserves the locator-derived display name on an ID-only refresh', async () => {
    const repository = new FakeSocialProfileRepository([
      record({ platformAccountId: 'ig-1' }),
    ]);

    await expect(
      makeService(repository).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          platformAccountId: 'ig-1',
        },
        authContext,
      ),
    ).resolves.toMatchObject({
      name: '@creator.name on INSTAGRAM',
      handle: 'creator.name',
      platformAccountId: 'ig-1',
    });
  });

  it('returns an ID-bearing profile for locator-only input', async () => {
    const repository = new FakeSocialProfileRepository([
      record({ platformAccountId: 'ig-1' }),
    ]);

    await expect(
      makeService(repository).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@Creator.Name',
        },
        authContext,
      ),
    ).resolves.toMatchObject({ id: 'profile-1', platformAccountId: 'ig-1' });
    expect(repository.records).toHaveLength(1);
  });

  it('enriches a locator-only profile with a stable ID', async () => {
    const repository = new FakeSocialProfileRepository([record()]);

    await expect(
      makeService(repository).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          profileUrl: 'https://instagram.com/Creator.Name',
          platformAccountId: 'ig-1',
        },
        authContext,
      ),
    ).resolves.toMatchObject({ id: 'profile-1', platformAccountId: 'ig-1' });
    expect(repository.records).toHaveLength(1);
  });

  it('rejects contradictory ID and locator populations', async () => {
    const repository = new FakeSocialProfileRepository([
      record({
        id: 'profile-by-id',
        normalizedLocator: 'handle:other',
        handle: 'other',
        platformAccountId: 'ig-1',
      }),
      record({ id: 'profile-by-locator' }),
    ]);

    await expect(
      makeService(repository).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@creator.name',
          platformAccountId: 'ig-1',
        },
        authContext,
      ),
    ).rejects.toThrow('different social profiles');
    expect(repository.records).toHaveLength(2);
  });

  it('does not overwrite migration enrichment during a matching upsert', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const originalFind = repository.find.bind(repository);
    jest.spyOn(repository, 'find').mockImplementation(async (options) => {
      const found = await originalFind(options);
      if (found.length > 0) {
        const snapshot = found.map((profile: SocialProfileRecord) => ({
          ...profile,
        }));
        repository.records[0].platformAccountId = 'migration-id';
        return snapshot;
      }
      return found;
    });

    await expect(
      makeService(repository).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@creator.name',
          platformAccountId: 'managed-id',
        },
        authContext,
      ),
    ).rejects.toThrow('Social profile identity changed during update');
    expect(repository.records[0].platformAccountId).toBe('migration-id');
  });

  it('serializes concurrent ID enrichment of a locator-only profile', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const service = makeService(repository);

    const results = await Promise.all([
      service.upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@creator.name',
          platformAccountId: 'ig-1',
        },
        authContext,
      ),
      service.upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          profileUrl: 'https://instagram.com/Creator.Name',
          platformAccountId: 'ig-1',
        },
        authContext,
      ),
    ]);

    expect(results.map(({ id }) => id)).toEqual(['profile-1', 'profile-1']);
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0].platformAccountId).toBe('ig-1');
  });

  it('serializes concurrent locator-only writes to an ID-bearing profile', async () => {
    const repository = new FakeSocialProfileRepository([
      record({ platformAccountId: 'ig-1' }),
    ]);
    const service = makeService(repository);

    const results = await Promise.all([
      service.upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@creator.name',
        },
        authContext,
      ),
      service.upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          profileUrl: 'https://instagram.com/creator.name',
        },
        authContext,
      ),
    ]);

    expect(results.map(({ id }) => id)).toEqual(['profile-1', 'profile-1']);
    expect(repository.records).toHaveLength(1);
  });

  it('allows multiple accounts on the same platform for one Creator', async () => {
    const repository = new FakeSocialProfileRepository([record()]);

    await expect(
      makeService(repository).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@second.account',
        },
        authContext,
      ),
    ).resolves.toMatchObject({
      creatorId: 'creator-1',
      normalizedLocator: 'handle:second.account',
    });
    expect(repository.records).toHaveLength(2);
  });

  it('keeps identical identities isolated by workspace context', async () => {
    const repositories = {
      'workspace-1': new FakeSocialProfileRepository([record()]),
      'workspace-2': new FakeSocialProfileRepository(),
    };
    const locks = new AdvisoryLockCoordinator();
    let activeWorkspaceId: keyof typeof repositories = 'workspace-1';
    const dataSource = {
      createQueryRunner: () => locks.queryRunner(),
      createEntityManager: () => ({
        getRepository: () => repositories[activeWorkspaceId],
      }),
    };
    const ormManager = {
      executeInWorkspaceContext: async (
        callback: () => Promise<unknown>,
        context: { workspace: { id: keyof typeof repositories } },
      ) => {
        activeWorkspaceId = context.workspace.id;
        return callback();
      },
      getGlobalWorkspaceDataSource: async () => dataSource,
    };
    const service = new SocialProfileService(ormManager as never);

    await service.upsert(
      {
        creatorId: 'creator-2',
        platform: 'instagram',
        handle: '@creator.name',
      },
      { workspace: { id: 'workspace-2' } } as never,
    );

    expect(repositories['workspace-1'].records).toHaveLength(1);
    expect(repositories['workspace-1'].records[0].creatorId).toBe('creator-1');
    expect(repositories['workspace-2'].records).toHaveLength(1);
    expect(repositories['workspace-2'].records[0].creatorId).toBe('creator-2');
  });

  it('updates a selected profile without creating or reassigning it', async () => {
    const repository = new FakeSocialProfileRepository([record()]);

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', handle: '@corrected.name' },
        authContext,
      ),
    ).resolves.toMatchObject({
      id: 'profile-1',
      creatorId: 'creator-1',
      handle: 'corrected.name',
      normalizedLocator: 'handle:corrected.name',
    });
    expect(repository.records).toHaveLength(1);
  });

  it('persists a count-only observation on a profile with a null stable ID', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const update = jest.spyOn(repository, 'update');

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', followerCount: 1234 },
        authContext,
      ),
    ).resolves.toMatchObject({ followerCount: 1234, platformAccountId: null });
    expect(update).toHaveBeenCalledWith(
      { id: 'profile-1' },
      { followerCount: 1234 },
    );
    expect(repository.records[0].normalizedLocator).toBe('handle:creator.name');
  });

  it('persists a count-only observation when ORM formats a null stable ID as empty text', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const update = jest.spyOn(repository, 'update');
    const read = repository.findOneBy.bind(repository);

    jest.spyOn(repository, 'findOneBy').mockImplementation(async (where) => {
      const persisted = await read(where);

      return persisted
        ? { ...persisted, platformAccountId: persisted.platformAccountId ?? '' }
        : null;
    });

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', followerCount: 1234 },
        authContext,
      ),
    ).resolves.toMatchObject({ followerCount: 1234, platformAccountId: '' });
    expect(update).toHaveBeenCalledWith(
      { id: 'profile-1' },
      { followerCount: 1234 },
    );
    expect(repository.records[0]).toMatchObject({
      platformAccountId: null,
      followerCount: 1234,
      normalizedLocator: 'handle:creator.name',
    });
  });

  it('allows observation-only writes without writing denied identity fields and denies forbidden observations', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const update = repository.update.bind(repository);
    jest
      .spyOn(repository, 'update')
      .mockImplementation(async (where, patch) => {
        if (Object.keys(patch).some((key) => key !== 'followerCount')) {
          throw new Error('Field update denied');
        }
        return update(where, patch);
      });
    const service = makeService(repository);

    await expect(
      service.updateIdentity(
        { id: 'profile-1', followerCount: 1234 },
        authContext,
      ),
    ).resolves.toMatchObject({ followerCount: 1234 });
    await expect(
      service.updateIdentity(
        { id: 'profile-1', handle: '@changed' },
        authContext,
      ),
    ).rejects.toThrow('Field update denied');
    expect(repository.records[0].normalizedLocator).toBe('handle:creator.name');

    jest.spyOn(repository, 'update').mockRestore();
    const observationUpdate = repository.update.bind(repository);
    jest
      .spyOn(repository, 'update')
      .mockImplementation(async (where, patch) => {
        if ('followerCountSource' in patch)
          throw new Error('Field update denied');
        return observationUpdate(where, patch);
      });
    await expect(
      service.updateIdentity(
        { id: 'profile-1', followerCountSource: 'manual' },
        authContext,
      ),
    ).rejects.toThrow('Field update denied');
    expect(repository.records[0].followerCountSource).toBeNull();
  });

  it('does not restore a stale locator when an observation waits for an identity correction', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const originalRead = repository.findOneBy.bind(repository);
    const readLocators: (string | null)[] = [];
    jest.spyOn(repository, 'findOneBy').mockImplementation(async (where) => {
      const value = await originalRead(where);
      readLocators.push(value?.normalizedLocator ?? null);
      return value ? { ...value } : null;
    });
    const originalUpdate = repository.update.bind(repository);
    let releaseCorrection!: () => void;
    let correctionEntered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseCorrection = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      correctionEntered = resolve;
    });
    jest
      .spyOn(repository, 'update')
      .mockImplementation(async (where, patch) => {
        if (patch.handle === 'corrected.name') {
          correctionEntered();
          await blocked;
        }
        return originalUpdate(where, patch);
      });
    let transactionCount = 0;
    let observationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observationStarted = resolve;
    });
    const service = makeService(repository, () => {
      if (++transactionCount === 2) observationStarted();
    });
    const correction = service.updateIdentity(
      { id: 'profile-1', handle: '@corrected.name' },
      authContext,
    );
    await entered;
    const observation = service.updateIdentity(
      { id: 'profile-1', followerCount: 1234 },
      authContext,
    );
    try {
      await started;
      for (let step = 0; step < 20; step++) await Promise.resolve();
    } finally {
      releaseCorrection();
    }
    await Promise.all([correction, observation]);
    expect(readLocators[0]).toBe('handle:creator.name');
    expect(readLocators.slice(1)).toEqual([
      'handle:corrected.name',
      'handle:corrected.name',
      'handle:corrected.name',
    ]);
    expect(repository.records[0]).toMatchObject({
      handle: 'corrected.name',
      normalizedLocator: 'handle:corrected.name',
      followerCount: 1234,
    });
  });

  it('preserves an existing stable ID during a count-only observation', async () => {
    const repository = new FakeSocialProfileRepository([
      record({ platformAccountId: 'ig-1' }),
    ]);
    const update = jest.spyOn(repository, 'update');

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', followerCount: 1234 },
        authContext,
      ),
    ).resolves.toMatchObject({
      followerCount: 1234,
      platformAccountId: 'ig-1',
    });
    expect(update).toHaveBeenCalledWith(
      { id: 'profile-1' },
      { followerCount: 1234 },
    );
  });

  it.each([null, 'ig-1'])(
    'fails closed if a hypothetical read omits platformAccountId (physical value %s)',
    async (platformAccountId) => {
      const repository = new FakeSocialProfileRepository([
        record({ platformAccountId }),
      ]);
      const { platformAccountId: _hidden, ...visible } = repository.records[0];
      const update = jest.spyOn(repository, 'update');

      jest
        .spyOn(repository, 'findOneBy')
        .mockResolvedValue(visible as SocialProfileRecord);
      await expect(
        makeService(repository).updateIdentity(
          { id: 'profile-1', followerCount: 1234 },
          authContext,
        ),
      ).rejects.toThrow('A stable account ID cannot be reassigned');
      expect(update).not.toHaveBeenCalled();
      expect(repository.records[0]).toMatchObject({
        followerCount: null,
        platformAccountId,
      });
    },
  );

  it('does not write when a permission-aware read is denied', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const update = jest.spyOn(repository, 'update');

    jest
      .spyOn(repository, 'findOneBy')
      .mockRejectedValue(new Error('Permission denied'));
    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', followerCount: 1234 },
        authContext,
      ),
    ).rejects.toThrow('Permission denied');
    expect(update).not.toHaveBeenCalled();
    expect(repository.records[0].followerCount).toBeNull();
  });

  it('rejects stale identity after a migration assigns another stable ID between read and write', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const originalFind = repository.find.bind(repository);
    jest.spyOn(repository, 'find').mockImplementation(async (options) => {
      // The migration uses a different advisory key and a row lock. Its
      // committed enrichment can land after the managed permission-aware read.
      repository.records[0].platformAccountId = 'migration-id';
      return originalFind(options);
    });

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', platformAccountId: 'managed-id' },
        authContext,
      ),
    ).rejects.toThrow('Social profile identity changed during update');
    expect(repository.records[0].platformAccountId).toBe('migration-id');
  });

  it('enriches a selected locator-only profile with its stable account ID', async () => {
    const repository = new FakeSocialProfileRepository([record()]);

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', platformAccountId: 'ig-1' },
        authContext,
      ),
    ).resolves.toMatchObject({ id: 'profile-1', platformAccountId: 'ig-1' });
  });

  it('does not allow a stable account ID to be removed or replaced', async () => {
    const service = makeService(
      new FakeSocialProfileRepository([record({ platformAccountId: 'ig-1' })]),
    );

    await expect(
      service.updateIdentity(
        { id: 'profile-1', platformAccountId: null },
        authContext,
      ),
    ).rejects.toThrow('cannot be reassigned');
    await expect(
      service.updateIdentity(
        { id: 'profile-1', platformAccountId: 'ig-2' },
        authContext,
      ),
    ).rejects.toThrow('cannot be reassigned');
  });

  it('rejects an identity correction that conflicts with another Creator even with a formatted null ID', async () => {
    const repository = new FakeSocialProfileRepository([
      record({ platformAccountId: '' }),
      record({
        id: 'profile-2',
        creatorId: 'creator-2',
        handle: 'other.creator',
        normalizedLocator: 'handle:other.creator',
        profileUrl: 'https://www.instagram.com/other.creator/',
      }),
    ]);

    await expect(
      makeService(repository).updateIdentity(
        { id: 'profile-1', handle: '@other.creator' },
        authContext,
      ),
    ).rejects.toThrow('already owned');
  });

  it('rejects a requested Creator move', async () => {
    await expect(
      makeService(new FakeSocialProfileRepository([record()])).updateIdentity(
        { id: 'profile-1', creatorId: 'creator-2' },
        authContext,
      ),
    ).rejects.toThrow('cannot be moved');
  });

  it('soft-retires idempotently and restores the persisted profile', async () => {
    const repository = new FakeSocialProfileRepository([record()]);
    const service = makeService(repository);

    await expect(
      service.retire('profile-1', authContext),
    ).resolves.toMatchObject({
      id: 'profile-1',
      deletedAt: expect.any(Date),
    });
    await expect(
      service.retire('profile-1', authContext),
    ).resolves.toMatchObject({
      id: 'profile-1',
      deletedAt: expect.any(Date),
    });
    await expect(
      service.restore('profile-1', authContext),
    ).resolves.toMatchObject({
      id: 'profile-1',
      deletedAt: null,
    });
  });

  it('rejects restoration when another active profile now owns its identity', async () => {
    const repository = new FakeSocialProfileRepository([
      record({ id: 'retired', deletedAt: new Date() }),
      record({ id: 'replacement' }),
    ]);

    await expect(
      makeService(repository).restore('retired', authContext),
    ).rejects.toThrow('already owned');
  });

  it('denies writes when the caller role cannot be resolved', async () => {
    mockedResolveRolePermissionConfig.mockReturnValueOnce(null);

    await expect(
      makeService(new FakeSocialProfileRepository()).upsert(
        {
          creatorId: 'creator-1',
          platform: 'instagram',
          handle: '@creator.name',
        },
        authContext,
      ),
    ).rejects.toThrow('Role could not be resolved');
  });
});
