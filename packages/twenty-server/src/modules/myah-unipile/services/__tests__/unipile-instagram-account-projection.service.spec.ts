import { ConflictException } from '@nestjs/common';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { FieldActorSource } from 'twenty-shared/types';

type UnipileInstagramAccountProjectionInput = {
  workspace: { id: string };
  account: {
    accountId: string;
    instagramUserId: string;
    username: string | null;
  };
  status: 'ACTIVE';
};

type UnipileInstagramAccountStatusInput = {
  workspace: { id: string };
  workspaceInstagramAccountRecordId: string;
  status: 'ACTIVE' | 'NEEDS_RECONNECT';
  lastError: string | null;
};

type UnipileInstagramAccountStatus = {
  id: string;
  username: string | null;
  status: 'ACTIVE' | 'NEEDS_RECONNECT';
  lastCheckedAt: string | null;
  lastError: string | null;
};

type UnipileInstagramAccountProjectionService = {
  getAccountStatus: (input: {
    workspace: { id: string };
    workspaceInstagramAccountRecordId: string;
  }) => Promise<UnipileInstagramAccountStatus | null>;
  markAccountStatus: (
    input: UnipileInstagramAccountStatusInput,
  ) => Promise<void>;
  upsertVerifiedAccount: (
    input: UnipileInstagramAccountProjectionInput,
  ) => Promise<string>;
};

type UnipileInstagramAccountProjectionServiceModule = {
  UnipileInstagramAccountProjectionService: new (globalWorkspaceOrmManager: {
    executeInWorkspaceContext: jest.Mock;
    getGlobalWorkspaceDataSource: jest.Mock;
  }) => UnipileInstagramAccountProjectionService;
};

const loadProjectionServiceModule = ():
  | UnipileInstagramAccountProjectionServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-account-projection.service') as UnipileInstagramAccountProjectionServiceModule;
  } catch {
    return undefined;
  }
};

const workspace = { id: '20202020-1c25-4d02-bf25-6aeccf7ea419' };
const account = {
  accountId: 'unipile-account-123',
  instagramUserId: '17841400000000001',
  username: 'verified.creator',
};
const status = 'ACTIVE' as const;
const lastCheckedAt = '2026-09-04T12:34:56.000Z';
const queryOptions = { shouldBypassPermissionChecks: true };

const createProjectionService = (query: jest.Mock) => {
  const getGlobalWorkspaceDataSource = jest.fn().mockResolvedValue({ query });
  const executeInWorkspaceContext = jest
    .fn()
    .mockImplementation(async (callback: () => Promise<unknown>) => callback());
  const projectionServiceModule = loadProjectionServiceModule();

  expect(projectionServiceModule).toBeDefined();

  if (!projectionServiceModule) {
    return undefined;
  }

  return {
    service:
      new projectionServiceModule.UnipileInstagramAccountProjectionService({
        executeInWorkspaceContext,
        getGlobalWorkspaceDataSource,
      }),
    executeInWorkspaceContext,
    getGlobalWorkspaceDataSource,
  };
};

type IdentityRecord = {
  id: string;
  igUserId: string;
  unipileAccountId: string | null;
  deletedAt: string | null;
};

// In-memory SQL seam only: not a PostgreSQL uniqueness or native restore test.
const createIdentityQuery = (records: IdentityRecord[]) =>
  jest.fn(async (sql: string, values: unknown[]) => {
    if (sql.includes('SELECT')) {
      const identity = sql.includes('WHERE "igUserId"')
        ? 'igUserId'
        : 'unipileAccountId';

      return records
        .filter(
          (record) =>
            record[identity] === values[0] &&
            (!sql.includes('"deletedAt" IS NULL') || record.deletedAt === null),
        )
        .map((record) => ({ ...record }));
    }

    if (sql.includes('UPDATE')) {
      const rows = records
        .filter(
          (record) =>
            record.id === values[11] &&
            (!sql.includes('"deletedAt" IS NULL') || record.deletedAt === null),
        )
        .map(({ id }) => ({ id }));

      // TypeORM's PostgreSQL raw UPDATE result, including RETURNING.
      return [rows, rows.length];
    }

    return [];
  });

const originalRecord: IdentityRecord = {
  id: '5c833949-57b8-4aa2-8d8c-24d10cecf6ec',
  igUserId: account.instagramUserId,
  unipileAccountId: account.accountId,
  deletedAt: null,
};
const deletedAt = '2026-09-01T00:00:00.000Z';
const restoreRequired = 'Instagram account requires explicit restore';
const identityConflict = 'Instagram account identity conflict';

const otherProviderHolder: IdentityRecord = {
  ...originalRecord,
  id: 'd9e165ba-a630-41f6-9c1e-7299362f74cc',
  igUserId: 'different-instagram-identity',
};

describe('UnipileInstagramAccountProjectionService', () => {
  let providerFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(lastCheckedAt));
    providerFetch = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new Error('Provider calls are not part of projection'),
      );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([
    {
      name: 'deleted matching Instagram identity with the same provider ID',
      records: [{ ...originalRecord, deletedAt }],
      message: restoreRequired,
    },
    {
      name: 'deleted matching Instagram identity with a previous provider ID',
      records: [
        { ...originalRecord, deletedAt, unipileAccountId: 'previous-provider' },
      ],
      message: restoreRequired,
    },
    {
      name: 'deleted legacy Instagram identity with no provider ID',
      records: [{ ...originalRecord, deletedAt, unipileAccountId: null }],
      message: restoreRequired,
    },
    ...[null, deletedAt].flatMap((holderDeletedAt) => [
      {
        name: `${holderDeletedAt ? 'deleted' : 'live'} other provider holder without an Instagram match`,
        records: [{ ...otherProviderHolder, deletedAt: holderDeletedAt }],
        message: identityConflict,
      },
      {
        name: `live Instagram match colliding with a ${holderDeletedAt ? 'deleted' : 'live'} provider holder`,
        records: [
          { ...originalRecord, unipileAccountId: 'previous-provider' },
          { ...otherProviderHolder, deletedAt: holderDeletedAt },
        ],
        message: identityConflict,
      },
    ]),
    {
      name: 'deleted Instagram match colliding with another deleted provider holder',
      records: [
        { ...originalRecord, deletedAt, unipileAccountId: 'previous-provider' },
        { ...otherProviderHolder, deletedAt },
      ],
      message: identityConflict,
    },
  ])(
    'rejects $name without any write or identity disclosure',
    async ({ records, message }) => {
      const before = structuredClone(records);
      const query = createIdentityQuery(records);
      const subject = createProjectionService(query);

      if (!subject) {
        return;
      }

      const operation = subject.service.upsertVerifiedAccount({
        workspace,
        account,
        status,
      });

      await expect(operation).rejects.toBeInstanceOf(ConflictException);
      await expect(operation).rejects.toThrow(new ConflictException(message));
      expect(query.mock.calls.every(([sql]) => sql.includes('SELECT'))).toBe(
        true,
      );
      expect(records).toEqual(before);
      for (const [sql, values, runner, options] of (query as jest.Mock).mock
        .calls) {
        expect(sql).toContain(
          `FROM "${getWorkspaceSchemaName(workspace.id)}"."_myahInstagramAccount"`,
        );
        expect(sql).not.toContain('"deletedAt" IS NULL');
        expect(sql).not.toContain(account.instagramUserId);
        expect(sql).not.toContain(account.accountId);
        expect(values).toEqual([
          sql.includes('WHERE "igUserId"')
            ? account.instagramUserId
            : account.accountId,
        ]);
        expect(runner).toBeUndefined();
        expect(options).toEqual(queryOptions);
      }
      expect(providerFetch).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate Instagram identities including a deleted match', async () => {
    const query = createIdentityQuery([
      { ...originalRecord },
      { ...originalRecord, id: otherProviderHolder.id, deletedAt },
    ]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).rejects.toThrow(
      'Multiple Instagram accounts match the verified Instagram identity',
    );
    expect(query.mock.calls.every(([sql]) => sql.includes('SELECT'))).toBe(
      true,
    );
  });

  it('reuses the original UUID only after explicit restore in mock state', async () => {
    const record = { ...originalRecord, deletedAt: deletedAt as string | null };
    const query = createIdentityQuery([record]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).rejects.toThrow(restoreRequired);
    expect(record.deletedAt).toBe(deletedAt);
    expect(query.mock.calls.every(([sql]) => sql.includes('SELECT'))).toBe(
      true,
    );

    // Simulate an independently authorized restore of this UUID, not projection recovery.
    record.deletedAt = null;
    query.mockClear();

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).resolves.toBe(originalRecord.id);
    expect(
      query.mock.calls.filter(([sql]) => sql.includes('UPDATE')),
    ).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(
      false,
    );
    expect(query.mock.calls.some(([sql]) => /"deletedAt"\s*=/.test(sql))).toBe(
      false,
    );
    expect(record.id).toBe(originalRecord.id);
  });

  it('does not mutate or verify an account deleted between lookup and update', async () => {
    const record = { ...originalRecord };
    const identityQuery = createIdentityQuery([record]);
    const query = jest.fn(async (sql: string, values: unknown[]) => {
      if (sql.includes('UPDATE')) {
        record.deletedAt = deletedAt;
      }

      return identityQuery(sql, values);
    });
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).rejects.toThrow('Instagram account verification update failed');
    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE'));

    expect(update?.[0]).toContain('"deletedAt" IS NULL');
    expect(update?.[0]).toContain('RETURNING "id"');
    expect(record.deletedAt).toBe(deletedAt);
    expect(query.mock.calls.some(([sql]) => /"deletedAt"\s*=/.test(sql))).toBe(
      false,
    );
  });

  it.each([null, 'previous-provider', account.accountId])(
    'allows a verified live Instagram identity with provider holder %s',
    async (unipileAccountId) => {
      const query = createIdentityQuery([
        { ...originalRecord, unipileAccountId },
      ]);
      const subject = createProjectionService(query);

      if (!subject) {
        return;
      }

      await expect(
        subject.service.upsertVerifiedAccount({ workspace, account, status }),
      ).resolves.toBe(originalRecord.id);
      expect(
        query.mock.calls.filter(([sql]) => sql.includes('UPDATE')),
      ).toEqual([
        [
          expect.any(String),
          expect.arrayContaining([account.accountId, originalRecord.id]),
          undefined,
          queryOptions,
        ],
      ]);
      expect(query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(
        false,
      );
    },
  );

  it('requires the conditional update to return the original UUID', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ...originalRecord }])
      .mockResolvedValueOnce([{ id: originalRecord.id }])
      .mockResolvedValueOnce([[{ id: otherProviderHolder.id }], 1]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).rejects.toThrow('Instagram account verification update failed');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it.each([
    { name: 'zero affected and returned rows', result: [[], 0] },
    {
      name: 'zero affected rows with one returned row',
      result: [[{ id: originalRecord.id }], 0],
    },
    {
      name: 'two affected rows with one returned row',
      result: [[{ id: originalRecord.id }], 2],
    },
    { name: 'one affected row without returned rows', result: [[], 1] },
    {
      name: 'one affected row with two returned rows',
      result: [[{ id: originalRecord.id }, { id: otherProviderHolder.id }], 1],
    },
    {
      name: 'two affected and returned rows',
      result: [[{ id: originalRecord.id }, { id: otherProviderHolder.id }], 2],
    },
    {
      name: 'rows-only result instead of the TypeORM UPDATE tuple',
      result: [{ id: originalRecord.id }],
    },
  ])('rejects $name without a fallback write', async ({ result }) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ...originalRecord }])
      .mockResolvedValueOnce([{ id: originalRecord.id }])
      .mockResolvedValueOnce(result);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).rejects.toThrow('Instagram account verification update failed');
    expect(query).toHaveBeenCalledTimes(3);
    const [updateSql, updateValues, runner, options] = query.mock.calls[2];

    expect(updateSql).toContain(
      `UPDATE "${getWorkspaceSchemaName(workspace.id)}"."_myahInstagramAccount"`,
    );
    expect(updateSql).toContain('WHERE "id" = $12');
    expect(updateSql).toContain('"deletedAt" IS NULL');
    expect(updateSql).toContain('RETURNING "id"');
    expect(updateSql).not.toMatch(/"deletedAt"\s*=/);
    expect(updateValues[11]).toBe(originalRecord.id);
    expect(runner).toBeUndefined();
    expect(options).toEqual(queryOptions);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('reuses the exact nondeleted Instagram record without replacing its Composio ownership', async () => {
    const workspaceInstagramAccountRecordId =
      '5c833949-57b8-4aa2-8d8c-24d10cecf6ec';
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: workspaceInstagramAccountRecordId, deletedAt: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([[{ id: workspaceInstagramAccountRecordId }], 1]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).resolves.toBe(workspaceInstagramAccountRecordId);

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [selectSql, selectValues] = query.mock.calls[0];
    const [updateSql] = query.mock.calls[2];

    expect(subject.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ type: 'system', workspace }),
    );
    expect(subject.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`FROM "${schemaName}"."_myahInstagramAccount"`),
      [account.instagramUserId],
      undefined,
      queryOptions,
    );
    expect(selectSql).toContain('"igUserId" = $1');
    expect(selectSql).not.toContain('"deletedAt" IS NULL');
    expect(selectSql).not.toContain(workspace.id);
    expect(selectSql).not.toContain(account.instagramUserId);
    expect(selectValues).toEqual([account.instagramUserId]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE "unipileAccountId" = $1'),
      [account.accountId],
      undefined,
      queryOptions,
    );
    expect(query.mock.calls[1][0]).not.toContain('"deletedAt" IS NULL');

    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`UPDATE "${schemaName}"."_myahInstagramAccount"`),
      [
        '@verified.creator',
        '@verified.creator',
        account.accountId,
        account.username,
        status,
        lastCheckedAt,
        null,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        workspaceInstagramAccountRecordId,
      ],
      undefined,
      queryOptions,
    );
    expect(updateSql).toContain('"unipileAccountId" = $3');
    expect(updateSql).toContain('"status" = $5');
    expect(updateSql).toContain('"lastError" = $7');
    expect(updateSql).toContain('WHERE "id" = $12');
    expect(updateSql).toContain('"deletedAt" IS NULL');
    expect(updateSql).toContain('RETURNING "id"');
    expect(updateSql).not.toContain('"connectedAccountId"');
    expect(updateSql).not.toContain('"composioUserId"');
    expect(updateSql).not.toContain('"authConfigId"');
    expect(updateSql).not.toContain(workspace.id);
    expect(updateSql).not.toContain(account.accountId);
    expect(updateSql).not.toContain(account.username);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('inserts a workspace record only when neither identity has a holder', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    const workspaceInstagramAccountRecordId =
      await subject.service.upsertVerifiedAccount({
        workspace,
        account,
        status,
      });
    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [selectSql] = query.mock.calls[0];
    const [insertSql, insertValues] = query.mock.calls[2];

    expect(workspaceInstagramAccountRecordId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`FROM "${schemaName}"."_myahInstagramAccount"`),
      [account.instagramUserId],
      undefined,
      queryOptions,
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE "unipileAccountId" = $1'),
      [account.accountId],
      undefined,
      queryOptions,
    );
    expect(query.mock.calls[1][0]).not.toContain('"deletedAt" IS NULL');
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        `INSERT INTO "${schemaName}"."_myahInstagramAccount"`,
      ),
      [
        workspaceInstagramAccountRecordId,
        '@verified.creator',
        '@verified.creator',
        account.accountId,
        account.instagramUserId,
        account.username,
        status,
        lastCheckedAt,
        null,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
      ],
      undefined,
      queryOptions,
    );
    expect(selectSql).toContain('"igUserId" = $1');
    expect(selectSql).not.toContain('"deletedAt" IS NULL');
    expect(insertSql).toContain('"id"');
    expect(insertSql).toContain('"lastError"');
    expect(insertSql).not.toContain(workspace.id);
    expect(insertSql).not.toContain(account.instagramUserId);
    expect(insertSql).not.toContain(account.accountId);
    expect(insertSql).not.toContain(account.username);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(insertValues).toContain(workspaceInstagramAccountRecordId);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects an ambiguous stable Instagram identity without writing a record', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: '5c833949-57b8-4aa2-8d8c-24d10cecf6ec' },
        { id: 'd9e165ba-a630-41f6-9c1e-7299362f74cc' },
      ]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).rejects.toThrow(ConflictException);

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [selectSql, selectValues] = query.mock.calls[0];

    expect(query).toHaveBeenCalledTimes(1);
    expect(selectSql).toContain(`FROM "${schemaName}"."_myahInstagramAccount"`);
    expect(selectSql).toContain('"igUserId" = $1');
    expect(selectSql).not.toContain('"deletedAt" IS NULL');
    expect(selectSql).not.toContain(workspace.id);
    expect(selectSql).not.toContain(account.instagramUserId);
    expect(selectValues).toEqual([account.instagramUserId]);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('reads only the safe status fields from the exact nondeleted workspace Instagram account', async () => {
    const workspaceInstagramAccountRecordId =
      '5c833949-57b8-4aa2-8d8c-24d10cecf6ec';
    const accountStatus = {
      id: workspaceInstagramAccountRecordId,
      username: 'verified.creator',
      status: 'ACTIVE' as const,
      lastCheckedAt,
      lastError: null,
    };
    const query = jest.fn().mockResolvedValueOnce([accountStatus]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.getAccountStatus({
        workspace,
        workspaceInstagramAccountRecordId,
      }),
    ).resolves.toEqual(accountStatus);

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [selectSql, selectValues] = query.mock.calls[0];
    const selectedColumns = selectSql
      .match(/SELECT\s+([\s\S]*?)\s+FROM/)?.[1]
      .replace(/\s+/g, ' ')
      .trim();

    expect(subject.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ type: 'system', workspace }),
    );
    expect(subject.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`FROM "${schemaName}"."_myahInstagramAccount"`),
      [workspaceInstagramAccountRecordId],
      undefined,
      queryOptions,
    );
    expect(selectedColumns).toBe(
      '"id", "username", "status", "lastCheckedAt", "lastError"',
    );
    expect(selectSql).toContain('"id" = $1');
    expect(selectSql).toContain('"deletedAt" IS NULL');
    expect(selectSql).not.toContain(workspace.id);
    expect(selectSql).not.toContain(workspaceInstagramAccountRecordId);
    expect(selectValues).toEqual([workspaceInstagramAccountRecordId]);
    for (const protectedColumn of [
      '"unipileAccountId"',
      '"connectedAccountId"',
      '"composioUserId"',
      '"authConfigId"',
    ]) {
      expect(selectSql).not.toContain(protectedColumn);
    }
    expect(providerFetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns null when the exact nondeleted workspace Instagram account is absent', async () => {
    const workspaceInstagramAccountRecordId =
      '5c833949-57b8-4aa2-8d8c-24d10cecf6ec';
    const query = jest.fn().mockResolvedValueOnce([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.getAccountStatus({
        workspace,
        workspaceInstagramAccountRecordId,
      }),
    ).resolves.toBeNull();

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [selectSql, selectValues] = query.mock.calls[0];
    const selectedColumns = selectSql
      .match(/SELECT\s+([\s\S]*?)\s+FROM/)?.[1]
      .replace(/\s+/g, ' ')
      .trim();

    expect(subject.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ type: 'system', workspace }),
    );
    expect(subject.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`FROM "${schemaName}"."_myahInstagramAccount"`),
      [workspaceInstagramAccountRecordId],
      undefined,
      queryOptions,
    );
    expect(selectedColumns).toBe(
      '"id", "username", "status", "lastCheckedAt", "lastError"',
    );
    expect(selectSql).toContain('"id" = $1');
    expect(selectSql).toContain('"deletedAt" IS NULL');
    expect(selectSql).not.toContain(workspace.id);
    expect(selectSql).not.toContain(workspaceInstagramAccountRecordId);
    expect(selectValues).toEqual([workspaceInstagramAccountRecordId]);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('updates only the status projection of the exact nondeleted workspace Instagram account', async () => {
    const workspaceInstagramAccountRecordId =
      '5c833949-57b8-4aa2-8d8c-24d10cecf6ec';
    const lastError = 'Unipile account is unavailable: [REDACTED]';
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: workspaceInstagramAccountRecordId }]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.markAccountStatus({
        workspace,
        workspaceInstagramAccountRecordId,
        status: 'NEEDS_RECONNECT',
        lastError,
      }),
    ).resolves.toBeUndefined();

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [updateSql, updateValues] = query.mock.calls[0];

    expect(subject.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ type: 'system', workspace }),
    );
    expect(subject.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`UPDATE "${schemaName}"."_myahInstagramAccount"`),
      [
        'NEEDS_RECONNECT',
        lastCheckedAt,
        lastError,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        workspaceInstagramAccountRecordId,
      ],
      undefined,
      queryOptions,
    );
    expect(updateSql).toContain('"status" = $1');
    expect(updateSql).toContain('"lastCheckedAt" = $2');
    expect(updateSql).toContain('"lastError" = $3');
    expect(updateSql).toContain('WHERE "id" = $8');
    expect(updateSql).toContain('"deletedAt" IS NULL');
    expect(updateSql).toContain('RETURNING "id"');
    for (const protectedColumn of [
      '"unipileAccountId"',
      '"connectedAccountId"',
      '"composioUserId"',
      '"authConfigId"',
      '"igUserId"',
      '"username"',
    ]) {
      expect(updateSql).not.toContain(protectedColumn);
    }
    expect(updateSql).not.toContain(workspace.id);
    expect(updateSql).not.toContain(workspaceInstagramAccountRecordId);
    expect(updateValues).toContain(workspaceInstagramAccountRecordId);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects with a generic conflict when the exact nondeleted workspace Instagram account was not updated', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.markAccountStatus({
        workspace,
        workspaceInstagramAccountRecordId:
          '5c833949-57b8-4aa2-8d8c-24d10cecf6ec',
        status: 'NEEDS_RECONNECT',
        lastError: null,
      }),
    ).rejects.toThrow(ConflictException);

    const [updateSql] = query.mock.calls[0];

    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      [
        'NEEDS_RECONNECT',
        lastCheckedAt,
        null,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        '5c833949-57b8-4aa2-8d8c-24d10cecf6ec',
      ],
      undefined,
      queryOptions,
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(updateSql).toContain('WHERE "id" = $8');
    expect(updateSql).toContain('"deletedAt" IS NULL');
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
