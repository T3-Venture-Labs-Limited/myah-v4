import { CatchUpMyahInboxContactTriageWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748002-catch-up-myah-inbox-contact-triage.command';

const workspaceId = '00000000-0000-4000-8000-000000000001';

describe('CatchUpMyahInboxContactTriageWorkspaceCommand', () => {
  it('drains through a fence until empty and marks the marker READY only after its pending recheck', async () => {
    const events: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('baselineStartedAt')) {
          events.push('lock-fence');
          return [{ status: 'MIGRATING', baselineStartedAt: '2026-09-15' }];
        }
        if (sql.includes('max(sequence)')) {
          events.push('max');
          return [{ sequence: '4' }];
        }
        if (sql.includes('count(*)')) {
          events.push('pending');
          return [{ count: '0' }];
        }
        if (sql.includes("status='READY'")) events.push('ready');
        return [];
      }),
    });
    const drain = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const command = new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { drain } as never,
    );

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    expect(drain).toHaveBeenNthCalledWith(1, {
      workspaceId,
      throughSequence: '4',
      purpose: 'CATCH_UP',
    });
    expect(drain).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['lock-fence', 'max', 'max', 'pending', 'ready']);
  });

  it('leaves an already READY marker unchanged when a retry would otherwise fail', async () => {
    const queries: string[] = [];
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('baselineStartedAt')) {
          return [{ status: 'READY', baselineStartedAt: '2026-09-15' }];
        }
        return [];
      }),
    });
    const drain = jest.fn().mockRejectedValue(new Error('must not drain'));
    const command = new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { drain } as never,
    );

    await expect(
      command.runOnWorkspace({
        workspaceId,
        dataSource: { createQueryRunner: queryRunner } as never,
        options: {},
        index: 0,
        total: 1,
      }),
    ).resolves.toBeUndefined();

    expect(drain).not.toHaveBeenCalled();
    expect(queries).not.toContainEqual(
      expect.stringContaining("status='CATCH_UP'"),
    );
  });

  it('logs the locked migration status before advancing the fence', async () => {
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('baselineStartedAt')) {
          return [{ status: 'MIGRATING', baselineStartedAt: '2026-09-15' }];
        }
        if (sql.includes('max(sequence)')) return [{ sequence: '0' }];
        if (sql.includes('count(*)')) return [{ count: '0' }];
        return [];
      }),
    });
    const command = new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { drain: jest.fn().mockResolvedValue(0) } as never,
    );
    const log = jest.spyOn((command as any).logger, 'log');

    await command.runOnWorkspace({
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    });

    expect(log).toHaveBeenCalledWith(
      `contact-triage catch-up status workspace=${workspaceId} status=MIGRATING`,
    );
  });

  it('retries a whole fence after a mid-catch-up failure', async () => {
    const queryRunner = () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('baselineStartedAt'))
          return [{ status: 'MIGRATING', baselineStartedAt: '2026-09-15' }];
        if (sql.includes('max(sequence)')) return [{ sequence: '0' }];
        if (sql.includes('count(*)')) return [{ count: '0' }];
        return [];
      }),
    });
    const drain = jest.fn().mockRejectedValueOnce(new Error('temporary'));
    const command = new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { drain } as never,
    );
    const args = {
      workspaceId,
      dataSource: { createQueryRunner: queryRunner } as never,
      options: {},
      index: 0,
      total: 1,
    };

    await expect(command.runOnWorkspace(args)).rejects.toThrow('temporary');
    drain.mockResolvedValueOnce(0);
    await expect(command.runOnWorkspace(args)).resolves.toBeUndefined();
    expect(drain).toHaveBeenCalledTimes(2);
  });
});
