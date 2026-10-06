import {
  MyahWorkspaceAccess,
  MyahWorkspaceAccessService,
} from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';

describe('MyahWorkspaceAccessService', () => {
  let service: MyahWorkspaceAccessService;
  let row: { stripeStatus: string | null; hadPaidSubscription: boolean } | null;
  const values: Record<string, unknown> = {};
  const cached = new Map<string, unknown>();
  const repository = {
    findOneBy: jest.fn(async () => row),
    save: jest.fn(
      async (_workspaceId, update) => (row = { ...row, ...update }),
    ),
  };
  const cache = {
    get: jest.fn(async (key) => cached.get(key)),
    set: jest.fn(async (key, value) => {
      cached.set(key, value);
    }),
    incrBy: jest.fn(async (key: string, increment: number) => {
      const value = ((cached.get(key) as number | undefined) ?? 0) + increment;
      cached.set(key, value);
      return value;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cached.clear();
    row = null;
    values.MYAH_SUBSCRIPTION_REQUIRED = true;
    values.MYAH_COMPLIMENTARY_WORKSPACE_IDS = [];
    service = new MyahWorkspaceAccessService(
      repository as never,
      {
        get: (key: string) => values[key],
      } as never,
      cache as never,
    );
  });

  it.each([
    ['active', false, MyahWorkspaceAccess.ACTIVE],
    ['trialing', false, MyahWorkspaceAccess.ACTIVE],
    ['past_due', true, MyahWorkspaceAccess.PAYMENT_RETRYING],
    ['incomplete', false, MyahWorkspaceAccess.NEEDS_SUBSCRIPTION],
    ['incomplete_expired', false, MyahWorkspaceAccess.NEEDS_SUBSCRIPTION],
    ['canceled', false, MyahWorkspaceAccess.NEEDS_SUBSCRIPTION],
    ['unpaid', true, MyahWorkspaceAccess.LAPSED],
    ['canceled', true, MyahWorkspaceAccess.LAPSED],
    ['paused', true, MyahWorkspaceAccess.LAPSED],
    [null, false, MyahWorkspaceAccess.NEEDS_SUBSCRIPTION],
  ])(
    '%s (paid=%s) gives %s',
    async (stripeStatus, hadPaidSubscription, expected) => {
      row = { stripeStatus, hadPaidSubscription };
      expect(await service.getAccess('workspace')).toBe(expected);
      expect(cache.set).toHaveBeenCalledWith(
        'myah-access:workspace:0',
        expected,
        300_000,
      );
    },
  );

  it('requires subscription without a row', async () => {
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.NEEDS_SUBSCRIPTION,
    );
  });

  it('grants complimentary access only to the configured workspace', async () => {
    values.MYAH_COMPLIMENTARY_WORKSPACE_IDS = ['workspace'];
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.COMPLIMENTARY,
    );
    expect(await service.getAccess('other')).toBe(
      MyahWorkspaceAccess.NEEDS_SUBSCRIPTION,
    );
    values.MYAH_COMPLIMENTARY_WORKSPACE_IDS = [];
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.NEEDS_SUBSCRIPTION,
    );
  });

  it('switch off grants access without caching a grant or reading the database', async () => {
    values.MYAH_SUBSCRIPTION_REQUIRED = false;
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.COMPLIMENTARY,
    );
    expect(repository.findOneBy).not.toHaveBeenCalled();
    values.MYAH_SUBSCRIPTION_REQUIRED = true;
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.NEEDS_SUBSCRIPTION,
    );
  });

  it('uses shared cache and moves to a new cache generation after a row update', async () => {
    await service.getAccess('workspace');
    await service.getAccess('workspace');
    expect(repository.findOneBy).toHaveBeenCalledTimes(1);
    await service.saveSubscription('workspace', {
      stripeStatus: 'active',
      hadPaidSubscription: true,
    });
    expect(cache.incrBy).toHaveBeenCalledWith(
      'myah-access-generation:workspace',
      1,
    );
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.ACTIVE,
    );
  });

  it('never serves a state read before a sync that finished in the meantime', async () => {
    // A request reads the unpaid row, then a sync commits and invalidates
    // before that request writes its (now stale) result to the cache.
    let releaseRead: (() => void) | undefined;
    repository.findOneBy.mockImplementationOnce(async () => {
      const staleRow = row;
      await new Promise<void>((resolve) => (releaseRead = resolve));
      return staleRow;
    });
    const slowRequest = service.getAccess('workspace');
    // Jest fake timers are on, so wait on microtasks until the row is read.
    while (!releaseRead) await Promise.resolve();
    row = { stripeStatus: 'active', hadPaidSubscription: true };
    await service.invalidate('workspace');
    releaseRead?.();
    expect(await slowRequest).toBe(MyahWorkspaceAccess.NEEDS_SUBSCRIPTION);
    expect(await service.getAccess('workspace')).toBe(
      MyahWorkspaceAccess.ACTIVE,
    );
  });
});
