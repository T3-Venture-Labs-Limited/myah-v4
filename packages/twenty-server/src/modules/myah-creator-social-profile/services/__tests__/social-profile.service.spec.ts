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

  async find({ where }: { where: Partial<SocialProfileRecord>[] }) {
    return this.records.filter((record) =>
      where.some((condition) =>
        Object.entries(condition).every(
          ([key, value]) => record[key as keyof SocialProfileRecord] === value,
        ),
      ),
    );
  }

  async findOneBy({ id }: { id: string }) {
    return this.records.find((record) => record.id === id) ?? null;
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
    { id, platformAccountId }: Partial<SocialProfileRecord>,
    patch: Partial<SocialProfileRecord>,
  ) {
    const record = this.records.find(
      (candidate) =>
        candidate.id === id &&
        (platformAccountId === undefined ||
          candidate.platformAccountId === platformAccountId),
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

const makeService = (repository: FakeSocialProfileRepository) => {
  const locks = new AdvisoryLockCoordinator();
  const dataSource = {
    createQueryRunner: () => locks.queryRunner(),
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
