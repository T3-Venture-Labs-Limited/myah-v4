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

  it('reuses the exact nondeleted Instagram record without replacing its Composio ownership', async () => {
    const workspaceInstagramAccountRecordId =
      '5c833949-57b8-4aa2-8d8c-24d10cecf6ec';
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: workspaceInstagramAccountRecordId }])
      .mockResolvedValueOnce([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedAccount({ workspace, account, status }),
    ).resolves.toBe(workspaceInstagramAccountRecordId);

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [selectSql, selectValues] = query.mock.calls[0];
    const [updateSql] = query.mock.calls[1];

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
    expect(selectSql).toContain('"deletedAt" IS NULL');
    expect(selectSql).not.toContain(workspace.id);
    expect(selectSql).not.toContain(account.instagramUserId);
    expect(selectValues).toEqual([account.instagramUserId]);

    expect(query).toHaveBeenNthCalledWith(
      2,
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
    expect(updateSql).not.toContain('"connectedAccountId"');
    expect(updateSql).not.toContain('"composioUserId"');
    expect(updateSql).not.toContain('"authConfigId"');
    expect(updateSql).not.toContain(workspace.id);
    expect(updateSql).not.toContain(account.accountId);
    expect(updateSql).not.toContain(account.username);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('inserts a workspace record when the stable Instagram identity has no nondeleted match', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
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
    const [insertSql, insertValues] = query.mock.calls[1];

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
    expect(selectSql).toContain('"deletedAt" IS NULL');
    expect(insertSql).toContain('"id"');
    expect(insertSql).toContain('"lastError"');
    expect(insertSql).not.toContain(workspace.id);
    expect(insertSql).not.toContain(account.instagramUserId);
    expect(insertSql).not.toContain(account.accountId);
    expect(insertSql).not.toContain(account.username);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(insertValues).toContain(workspaceInstagramAccountRecordId);
    expect(query).toHaveBeenCalledTimes(2);
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
    expect(selectSql).toContain('"deletedAt" IS NULL');
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
