import { RetireShopifyConnectionsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000411-retire-shopify-connections.command';
import { RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER as shopifyUid } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const account: {
  id: string;
  name: string;
  applicationId: string | null;
  applicationWorkspaceId: string | null;
  applicationUniversalIdentifier: string | null;
  connectionProviderId: string | null;
  providerApplicationId: string | null;
  providerWorkspaceId: string | null;
  handle: string;
  visibility: string;
  userWorkspaceId: string;
  userWorkspaceWorkspaceId: string | null;
} = {
  id: '20202020-0000-4000-8000-000000000002',
  name: 'Shopify',
  applicationId: '20202020-0000-4000-8000-000000000003',
  applicationWorkspaceId: workspaceId,
  applicationUniversalIdentifier: shopifyUid,
  connectionProviderId: null,
  providerApplicationId: null,
  providerWorkspaceId: null,
  handle: 'example-store.myshopify.com',
  visibility: 'workspace',
  userWorkspaceId: '20202020-0000-4000-8000-000000000004',
  userWorkspaceWorkspaceId: workspaceId,
};
const nativeAccount = {
  ...account,
  applicationId: null,
  applicationUniversalIdentifier: null,
  connectionProviderId: null,
  providerApplicationId: null,
  providerWorkspaceId: null,
};
const args = { index: 0, options: {}, total: 1, workspaceId };
const updateResult = (rows: { id: string }[], affected = rows.length) => ({
  records: rows,
  affected,
  raw: [rows, affected], // The default unstructured Postgres result, not records.
});
const createFixture = (candidates = [account]) => {
  const query = jest
    .fn()
    .mockResolvedValueOnce(candidates)
    .mockResolvedValueOnce(updateResult(candidates.map(({ id }) => ({ id }))))
    .mockResolvedValueOnce(candidates.map(({ id }) => ({ id })));
  const runner = {
    isTransactionActive: true,
    isReleased: false,
    manager: { queryRunner: null as unknown },
    query,
  };
  runner.manager.queryRunner = runner;
  const dryRunQuery = jest.fn().mockResolvedValue(candidates);
  const command = new RetireShopifyConnectionsCommand(
    {} as never,
    { query: dryRunQuery } as never,
  );
  return { command, query, dryRunQuery, runner: runner as never };
};

describe('RetireShopifyConnectionsCommand', () => {
  it('blocks every unpinned write and keeps standalone dry run read-only', async () => {
    const { command, query, dryRunQuery } = createFixture();
    await expect(command.runOnWorkspace(args)).rejects.toThrow(/pinned/);
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(dryRunQuery).toHaveBeenCalledTimes(1);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        args,
        { isTransactionActive: false } as never,
        jest.fn(),
      ),
    ).rejects.toThrow(/pinned/);
    expect(query).not.toHaveBeenCalled();
  });

  it('archives only the exact verified app identity on the bound runner and reads back', async () => {
    const { command, query, runner } = createFixture();
    await command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn());
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][1]).toEqual([
      workspaceId,
      'app',
      'Shopify',
      shopifyUid,
    ]);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF ca');
    expect(query.mock.calls[1][1][1]).toEqual([account.id]);
    expect(query.mock.calls[1][2]).toBe(true);
    expect(query.mock.calls[1][0]).toContain('"archivedAt" = NOW()');
    expect(query.mock.calls[1][0]).not.toMatch(/accessToken|refreshToken/);
  });

  it('accepts the historical native Shopify account without app/provider IDs in dry run and pinned write', async () => {
    const { command, dryRunQuery, query, runner } = createFixture([
      nativeAccount,
    ]);
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(dryRunQuery).toHaveBeenCalledTimes(1);
    expect(dryRunQuery.mock.calls[0][0]).toContain('core."userWorkspace"');
    expect(dryRunQuery.mock.calls[0][0]).not.toMatch(
      /accessToken|refreshToken|connectionParameters/,
    );
    await command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn());
    expect(query.mock.calls[1][1]).toEqual([workspaceId, [nativeAccount.id]]);
    expect(query.mock.calls[2][1]).toEqual([workspaceId, [nativeAccount.id]]);
  });

  it('archives a mixed verified app-owned and native-legacy set by exact IDs', async () => {
    const otherNative = {
      ...nativeAccount,
      id: '20202020-0000-4000-8000-000000000005',
    };
    const { command, query, dryRunQuery, runner } = createFixture([
      account,
      otherNative,
    ]);
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(dryRunQuery).toHaveBeenCalledTimes(1);
    await command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn());
    expect(query.mock.calls[1][1][1]).toEqual([account.id, otherNative.id]);
    expect(query.mock.calls[2][1][1]).toEqual([account.id, otherNative.id]);
  });

  it.each([
    [{ ...nativeAccount, name: 'Not Shopify' }],
    [{ ...nativeAccount, handle: 'evil.example.com' }],
    [{ ...nativeAccount, handle: 'https://store.myshopify.com' }],
    [{ ...nativeAccount, visibility: 'user' }],
    [
      {
        ...nativeAccount,
        userWorkspaceId: '20202020-0000-4000-8000-000000000009',
        userWorkspaceWorkspaceId: null,
      },
    ],
    [{ ...nativeAccount, userWorkspaceWorkspaceId: 'foreign-workspace' }],
    [{ ...nativeAccount, connectionProviderId: 'provider-id' }],
    [{ ...account, userWorkspaceWorkspaceId: null }],
    [{ ...account, userWorkspaceWorkspaceId: 'foreign-workspace' }],
    [{ ...account, applicationUniversalIdentifier: 'foreign-app' }],
    [{ ...account, applicationWorkspaceId: 'foreign-workspace' }],
    [
      {
        ...account,
        connectionProviderId: 'provider-id',
        providerApplicationId: 'foreign-app',
      },
    ],
    [
      {
        ...account,
        connectionProviderId: 'provider-id',
        providerApplicationId: null,
      },
    ],
  ])(
    'fails closed on ambiguous or foreign APP owner without writing',
    async (candidate) => {
      const { command, query, runner } = createFixture([candidate]);
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn()),
      ).rejects.toThrow(/ownership/);
      expect(query).toHaveBeenCalledTimes(1);
      const foreignCandidate = {
        ...candidate,
        id: '20202020-0000-4000-8000-000000000006',
      };
      const dryRun = createFixture([nativeAccount, foreignCandidate]);
      await expect(
        dryRun.command.runOnWorkspace({ ...args, options: { dryRun: true } }),
      ).rejects.toThrow(/ownership/);
      expect(dryRun.dryRunQuery).toHaveBeenCalledTimes(1);
      const mixed = createFixture([account, foreignCandidate]);
      await expect(
        mixed.command.runOnWorkspaceInUpgradeTransaction(
          args,
          mixed.runner,
          jest.fn(),
        ),
      ).rejects.toThrow(/ownership/);
      expect(mixed.query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([null, 'foreign-workspace'])(
    'rejects mixed valid app-owned plus missing/foreign userWorkspace (%s) in dry-run and pinned paths',
    async (userWorkspaceWorkspaceId) => {
      const badAppOwner = {
        ...account,
        id: '20202020-0000-4000-8000-000000000007',
        userWorkspaceWorkspaceId,
      };
      const { command, dryRunQuery, query, runner } = createFixture([
        account,
        badAppOwner,
      ]);
      await expect(
        command.runOnWorkspace({ ...args, options: { dryRun: true } }),
      ).rejects.toThrow(/ownership/);
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn()),
      ).rejects.toThrow(/ownership/);
      expect(dryRunQuery).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['unstructured tuple', [[{ id: account.id }], 1], [{ id: account.id }]],
    [
      'missing affected count',
      { records: [{ id: account.id }] },
      [{ id: account.id }],
    ],
    [
      'wrong affected count',
      updateResult([{ id: account.id }], 0),
      [{ id: account.id }],
    ],
    [
      'null returned ID',
      { records: [{ id: null }], affected: 1 },
      [{ id: account.id }],
    ],
    [
      'foreign returned ID',
      updateResult([{ id: '20202020-0000-4000-8000-000000000009' }]),
      [{ id: account.id }],
    ],
    [
      'duplicate returned ID',
      { records: [{ id: account.id }, { id: account.id }], affected: 1 },
      [{ id: account.id }],
    ],
    ['missing readback ID', updateResult([{ id: account.id }]), []],
    [
      'foreign readback ID',
      updateResult([{ id: account.id }]),
      [{ id: '20202020-0000-4000-8000-000000000009' }],
    ],
    ['null readback ID', updateResult([{ id: account.id }]), [{ id: null }]],
  ])(
    'rejects %s rather than recording a false completion',
    async (_case, update, persisted) => {
      const { command, query, runner } = createFixture();
      query
        .mockReset()
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce(update)
        .mockResolvedValueOnce(persisted);
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn()),
      ).rejects.toThrow(/postcondition/);
    },
  );

  it('rejects duplicate returned IDs despite matching affected and record counts', async () => {
    const another = {
      ...nativeAccount,
      id: '20202020-0000-4000-8000-000000000008',
    };
    const { command, query, runner } = createFixture([account, another]);
    query
      .mockReset()
      .mockResolvedValueOnce([account, another])
      .mockResolvedValueOnce(
        updateResult([{ id: account.id }, { id: account.id }], 2),
      )
      .mockResolvedValueOnce([{ id: account.id }, { id: another.id }]);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn()),
    ).rejects.toThrow(/postcondition/);
  });

  it('rejects duplicate readback IDs for two selected accounts', async () => {
    const another = {
      ...nativeAccount,
      id: '20202020-0000-4000-8000-000000000008',
    };
    const { command, query, runner } = createFixture([account, another]);
    query
      .mockReset()
      .mockResolvedValueOnce([account, another])
      .mockResolvedValueOnce(
        updateResult([{ id: account.id }, { id: another.id }]),
      )
      .mockResolvedValueOnce([{ id: account.id }, { id: account.id }]);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn()),
    ).rejects.toThrow(/postcondition/);
  });

  it('does not write on replay and rejects a missing postcondition', async () => {
    const empty = createFixture([]);
    await empty.command.runOnWorkspaceInUpgradeTransaction(
      args,
      empty.runner,
      jest.fn(),
    );
    expect(empty.query).toHaveBeenCalledTimes(1);
    const failed = createFixture();
    failed.query
      .mockReset()
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce(updateResult([], 0))
      .mockResolvedValueOnce([]);
    await expect(
      failed.command.runOnWorkspaceInUpgradeTransaction(
        args,
        failed.runner,
        jest.fn(),
      ),
    ).rejects.toThrow(/postcondition/);
  });
});
