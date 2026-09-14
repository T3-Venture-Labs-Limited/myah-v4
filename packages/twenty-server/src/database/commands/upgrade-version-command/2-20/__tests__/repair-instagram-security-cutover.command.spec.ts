import { DiscoveryService } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { type DataSource } from 'typeorm';

import {
  type WorkspaceIteratorArgs,
  type WorkspaceIteratorService,
} from 'src/database/commands/command-runners/workspace-iterator.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { type VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { RepairInstagramSecurityCutoverCommand } from 'src/database/commands/upgrade-version-command/2-20/repair-instagram-security-cutover.command';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { repairInstagramSecurityChecks } from 'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util';
import { INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY } from 'src/engine/core-modules/upgrade/constants/instagram-2-20-upgrade-name-compatibility.constant';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';

jest.mock(
  'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util',
  () => ({ repairInstagramSecurityChecks: jest.fn() }),
);

const slow =
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';
const backfill =
  '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000';
const tail =
  '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534';

const fixture = () => {
  const providers = [
    ...INSTANCE_COMMANDS,
    ...Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ),
  ] as Function[];
  const registry = new UpgradeCommandRegistryService({
    getProviders: () =>
      providers.map((metatype) => ({
        metatype,
        instance: Object.create(metatype.prototype),
      })),
  } as DiscoveryService);
  registry.onModuleInit();
  const reader = new UpgradeSequenceReaderService(registry);
  const events: string[] = [];
  const ids = ['a', 'b'];
  const state = {
    global: backfill,
    instance: slow,
    instanceStatus: 'completed',
    workspace: backfill,
    failed: '0',
    preflightFail: '',
    mutationFail: '',
    forcedReportFail: 0,
    passes: 0,
  };
  const names = [
    { name: '1.0.0_UnrelatedUnsupportedHistory_1' },
    ...INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY.map(({ durableName }) => ({
      name: durableName,
    })),
  ];
  const core = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM core.workspace')) {
        events.push('discover');
        return ids.map((id) => ({ id }));
      }
      if (sql.includes('SELECT DISTINCT name')) return names;
      if (sql.includes('count(*)')) return [{ count: state.failed }];
      throw new Error('unexpected SQL');
    }),
  };
  const migration = {
    getLastAttemptedCommandNameOrThrow: jest.fn(async () => ({
      name: state.global,
      status: 'completed',
    })),
    getLastAttemptedInstanceCommandOrThrow: jest.fn(async () => ({
      name: state.instance,
      status: state.instanceStatus,
    })),
    getWorkspaceLastAttemptedCommandNameOrThrow: jest.fn(
      async () =>
        new Map(
          ids.map((id) => [id, { name: state.workspace, status: 'completed' }]),
        ),
    ),
    recordUpgradeMigration: jest.fn(),
    markAsWorkspaceInitial: jest.fn(),
  };
  const verifier = {
    preflight: jest.fn(async ({ workspaceId }) => {
      events.push(`preflight:${workspaceId}`);
      if (state.preflightFail === workspaceId) throw new Error('secret body');
    }),
    runOnWorkspace: jest.fn(async ({ workspaceId }) => {
      events.push(`verify:${workspaceId}`);
      if (state.mutationFail === workspaceId) throw new Error('secret body');
    }),
  };
  const iterator = {
    iterate: jest.fn(async (args: WorkspaceIteratorArgs) => {
      state.passes++;
      const report = {
        fail: [] as { workspaceId: string; error: Error }[],
        success: [] as { workspaceId: string }[],
      };
      for (const [index, workspaceId] of args.workspaceIds!.entries()) {
        try {
          await args.callback({
            workspaceId,
            index,
            total: args.workspaceIds!.length,
            dataSource: {} as never,
          });
          report.success.push({ workspaceId });
        } catch (error) {
          report.fail.push({ workspaceId, error: error as Error });
        }
      }
      if (state.forcedReportFail === state.passes)
        report.fail.push({
          workspaceId: 'iterator',
          error: new Error('secret iterator error'),
        });
      return report;
    }),
  };
  jest.mocked(repairInstagramSecurityChecks).mockImplementation(async () => {
    events.push('core');
    return {
      dryRun: false,
      proposedRepairs: 2,
      completedRepairs: 2,
      constraints: [],
    };
  });
  const command = new RepairInstagramSecurityCutoverCommand(
    core as unknown as DataSource,
    iterator as unknown as WorkspaceIteratorService,
    verifier as unknown as VerifyInstagramSecurityCutoverWorkspaceCommand,
    migration as unknown as UpgradeMigrationService,
    reader,
  );
  return {
    command,
    events,
    state,
    ids,
    names,
    core,
    migration,
    verifier,
    iterator,
    reader,
  };
};

describe('RepairInstagramSecurityCutoverCommand', () => {
  beforeEach(() => jest.clearAllMocks());
  it('pins all targets, preflights all before mutation, and calls callbacks without any history writer', async () => {
    const f = fixture();
    await f.command.run([], {});
    expect(f.events).toEqual([
      'discover',
      'preflight:a',
      'preflight:b',
      'core',
      'verify:a',
      'verify:b',
    ]);
    for (const [args] of f.iterator.iterate.mock.calls)
      expect(args.workspaceIds).toEqual(['a', 'b']);
    expect(f.migration.recordUpgradeMigration).not.toHaveBeenCalled();
    expect(f.migration.markAsWorkspaceInitial).not.toHaveBeenCalled();
    expect(
      f.core.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql)),
    ).toBe(true);
    expect(f.core.query).toHaveBeenCalledWith(
      expect.stringContaining('"deletedAt" IS NULL'),
      [['ACTIVE', 'SUSPENDED']],
    );
  });

  it('second-workspace preflight failure prevents even the first core mutation', async () => {
    const f = fixture();
    f.state.preflightFail = 'b';
    await expect(f.command.run([], {})).rejects.toThrow('verification failed');
    expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    expect(f.verifier.runOnWorkspace).not.toHaveBeenCalled();
  });

  it.each([1, 2])('checks iterator fail report on pass %s', async (pass) => {
    const f = fixture();
    f.state.forcedReportFail = pass;
    await expect(f.command.run([], {})).rejects.toThrow('verification failed');
    expect(repairInstagramSecurityChecks).toHaveBeenCalledTimes(pass - 1);
  });

  it('preserves partial failure and supports retry without history writes', async () => {
    const f = fixture();
    f.state.mutationFail = 'b';
    await expect(f.command.run([], {})).rejects.toThrow(
      'partial repair possible',
    );
    expect(f.events).toContain('verify:a');
    f.state.mutationFail = '';
    await f.command.run([], {});
    expect(repairInstagramSecurityChecks).toHaveBeenCalledTimes(2);
    expect(f.migration.recordUpgradeMigration).not.toHaveBeenCalled();
  });

  it('zero targets skips both iterator passes but still validates history and repairs core', async () => {
    const f = fixture();
    f.ids.splice(0);
    await f.command.run([], {});
    expect(f.events).toEqual(['discover', 'core']);
    expect(f.iterator.iterate).not.toHaveBeenCalled();
    expect(f.migration.getLastAttemptedCommandNameOrThrow).toHaveBeenCalledWith(
      [],
    );
    expect(
      f.migration.getLastAttemptedInstanceCommandOrThrow,
    ).toHaveBeenCalled();
  });

  it('zero targets is not an exemption from initialization', async () => {
    const f = fixture();
    f.ids.splice(0);
    f.migration.getLastAttemptedCommandNameOrThrow.mockRejectedValue(
      new Error('uninitialized'),
    );
    await expect(f.command.run([], {})).rejects.toThrow();
    expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
  });

  it('forwards dry-run to core and every callback, without mutating options', async () => {
    const f = fixture();
    const options = Object.freeze({ dryRun: true });
    await f.command.run([], options);
    expect(repairInstagramSecurityChecks).toHaveBeenCalledWith(f.core, {
      dryRun: true,
    });
    for (const [args] of f.verifier.runOnWorkspace.mock.calls)
      expect(args).toMatchObject({ options: { dryRun: true } });
  });

  it.each(['global', 'instance', 'workspace'] as const)(
    'rejects unknown selected %s cursor with actual reader',
    async (scope) => {
      const f = fixture();
      f.state[scope] = '2.20.0_unknown_1';
      await expect(f.command.run([], {})).rejects.toThrow();
      expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    },
  );

  it.each([backfill, tail, slow])(
    'accepts initialized selected workspace cursor %s without replaying it',
    async (cursor) => {
      const f = fixture();
      f.state.workspace = cursor;
      f.state.global = cursor;
      await f.command.run([], {});
      expect(f.verifier.runOnWorkspace).toHaveBeenCalledTimes(2);
      expect(f.migration.recordUpgradeMigration).not.toHaveBeenCalled();
    },
  );

  it.each(['failed', 'before-slow', 'workspace-instance', 'outstanding'])(
    'requires completed instance prerequisites: %s',
    async (mode) => {
      const f = fixture();
      if (mode === 'failed') f.state.instanceStatus = 'failed';
      if (mode === 'before-slow')
        f.state.instance =
          INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY[3].durableName;
      if (mode === 'workspace-instance') f.state.instance = backfill;
      if (mode === 'outstanding') f.state.failed = '1';
      await expect(f.command.run([], {})).rejects.toThrow();
      expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    },
  );

  it.each(
    INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY.flatMap((identity) => [
      `${identity.version}_${identity.className}_${identity.timestamp}`,
      `9.0.0_${identity.className}_42`,
      `${identity.durableName}_alternate`,
    ]),
  )(
    'rejects reserved non-durable identity %s in any stored scope or initial attempt',
    async (name) => {
      const f = fixture();
      f.names.push({ name });
      await expect(f.command.preflightHistory(f.ids)).rejects.toThrow(
        'identity mismatch',
      );
      expect(f.core.query).toHaveBeenCalledWith(
        'SELECT DISTINCT name FROM core."upgradeMigration"',
      );
    },
  );

  it('does not reject unrelated unsupported non-selected history', async () => {
    const f = fixture();
    await expect(f.command.preflightHistory(f.ids)).resolves.toBeUndefined();
  });

  it.each([
    { workspaceId: new Set(['a']) },
    { startFromWorkspaceId: 'a' },
    { workspaceCountLimit: 1 },
  ])('exposes no partial sweep filter %p', async (options) => {
    const f = fixture();
    await expect(f.command.run([], options as never)).rejects.toThrow(
      'filters',
    );
    expect(f.core.query).not.toHaveBeenCalled();
  });
});
