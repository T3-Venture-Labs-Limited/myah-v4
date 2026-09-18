import { InitializeMyahInboxContactTriageWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748001-initialize-myah-inbox-contact-triage.command';

const workspaceId = '00000000-0000-4000-8000-000000000001';

describe('InitializeMyahInboxContactTriageWorkspaceCommand', () => {
  it('skips a workspace without a provisioned data source instead of failing the upgrade', async () => {
    const ensureWorkspaceTables = jest.fn();
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables } as never,
    );

    await expect(
      command.runOnWorkspace({
        workspaceId,
        options: {},
        index: 0,
        total: 1,
      }),
    ).resolves.toBeUndefined();
    expect(ensureWorkspaceTables).not.toHaveBeenCalled();
  });

  it('commits capture installation before it starts the baseline transaction', async () => {
    const events: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(async () => events.push('begin')),
      query: jest.fn(async (sql: string) => {
        events.push(
          sql.includes('baselineFenceSequence') ? 'baseline' : 'capture',
        );
        return [];
      }),
      commitTransaction: jest.fn(async () => events.push('commit')),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    });
    const ensureWorkspaceTables = jest.fn(async () => events.push('ensure'));
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    expect(events).toEqual([
      'begin',
      'ensure',
      'capture',
      'capture',
      'commit',
      'begin',
      'capture',
      'capture',
      'capture',
      'capture',
      'capture',
      'capture',
      'baseline',
      'commit',
    ]);
    expect(ensureWorkspaceTables).toHaveBeenCalledTimes(1);
  });

  it('does not resnapshot an already initialized baseline', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT status, "baselineStartedAt"')) {
          return [{ status: 'READY', baselineStartedAt: '2026-09-15' }];
        }
        return [];
      }),
    });
    const createQueryRunner = jest.fn(queryRunner);
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables: jest.fn() } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(queries).not.toContainEqual(
      expect.stringContaining('WITH source_rows'),
    );
    expect(queries).not.toContainEqual(
      expect.stringContaining('baselineFenceSequence'),
    );
  });

  it('locks every live source in deterministic table and ID order before baseline snapshots', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('conversationExists')) {
          return [{ conversationExists: true, messageExists: true }];
        }
        return [];
      }),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    });
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables: jest.fn() } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    const markerLockIndex = queries.findIndex(
      (sql) =>
        sql.includes('"myahInboxTriageMigration"') &&
        sql.includes('WHERE id=true FOR UPDATE'),
    );
    const emailLockIndex = queries.findIndex(
      (sql) =>
        sql.includes('"messageThread"') &&
        sql.includes('ORDER BY id FOR UPDATE'),
    );
    const instagramLockIndex = queries.findIndex(
      (sql) =>
        sql.includes('"_myahSocialConversation"') &&
        sql.includes('ORDER BY id FOR UPDATE'),
    );
    const tupleBaselineIndex = queries.findIndex((sql) =>
      sql.includes('WITH source_rows'),
    );
    const inboundBaselineIndex = queries.findIndex((sql) =>
      sql.includes('WITH inbound AS'),
    );

    expect(markerLockIndex).toBeGreaterThanOrEqual(0);
    expect(emailLockIndex).toBeGreaterThan(markerLockIndex);
    expect(instagramLockIndex).toBeGreaterThan(emailLockIndex);
    expect(tupleBaselineIndex).toBeGreaterThan(instagramLockIndex);
    expect(inboundBaselineIndex).toBeGreaterThan(tupleBaselineIndex);
    expect(queries[emailLockIndex]).toContain('"deletedAt" IS NULL');
    expect(queries[instagramLockIndex]).toContain('"deletedAt" IS NULL');
  });

  it('omits optional Instagram SQL when the app relations are absent', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('conversationExists')) {
          return [{ conversationExists: false, messageExists: false }];
        }
        return [];
      }),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    });
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables: jest.fn() } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    expect(
      queries.some(
        (sql) =>
          sql.includes('FROM "_myahSocialConversation"') ||
          sql.includes('FROM "_myahSocialMessage"'),
      ),
    ).toBe(false);
    expect(queries.some((sql) => sql.includes('WITH source_rows'))).toBe(true);
    expect(queries.some((sql) => sql.includes('WITH inbound'))).toBe(true);
  });

  it('uses returned identity rows when the baseline inserts identities in the same statement', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    });
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables: jest.fn() } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    const baseline = queries.find((sql) => sql.includes('WITH source_rows'));
    expect(baseline).toContain('RETURNING "contactIdentityKey", generation');
    expect(baseline).toContain('), identity_rows AS (');
    expect(baseline).toContain('FROM triage_values values JOIN identity_rows');
  });

  it('selects Email inbound baseline evidence only through a live INCOMING association', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    });
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables: jest.fn() } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    const inboundBaseline = queries.find((sql) =>
      sql.includes('WITH inbound AS'),
    );
    expect(inboundBaseline).toContain('AND EXISTS (');
    expect(inboundBaseline).toContain(
      '"messageChannelMessageAssociation" association',
    );
    expect(inboundBaseline).toContain('association."messageId"=message.id');
    expect(inboundBaseline).toContain('association."deletedAt" IS NULL');
    expect(inboundBaseline).toContain("association.direction='INCOMING'");
    expect(inboundBaseline).not.toContain('message."receivedAt" IS NOT NULL');
    expect(inboundBaseline).toContain(
      'date_trunc(\'milliseconds\', message."createdAt")',
    );
  });

  it('orders Instagram latest direction by normalized occurrence then UTC creation order key', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('conversationExists')) {
          return [{ conversationExists: true, messageExists: true }];
        }
        return [];
      }),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    });
    const command = new InitializeMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { ensureWorkspaceTables: jest.fn() } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    const sourceBaseline = queries.find((sql) =>
      sql.includes('WITH source_rows'),
    );
    expect(sourceBaseline).toContain('AS normalized_occurred_at');
    expect(sourceBaseline).toContain(
      "|| '|INSTAGRAM|' || message.id AS order_key",
    );
    expect(sourceBaseline).toContain(
      'ORDER BY normalized_occurred_at DESC, order_key DESC',
    );
    expect(sourceBaseline).not.toContain('DESC, message.id DESC');
  });
});
