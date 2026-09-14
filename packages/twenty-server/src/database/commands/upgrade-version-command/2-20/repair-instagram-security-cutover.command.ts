import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { DataSource } from 'typeorm';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { repairInstagramSecurityChecks } from 'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util';
import { INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY } from 'src/engine/core-modules/upgrade/constants/instagram-2-20-upgrade-name-compatibility.constant';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';

@Command({
  name: 'upgrade:2-20:repair-instagram-security-cutover',
  description:
    'Verify/repair Instagram cutover across all eligible workspaces without changing upgrade history; requires maintenance, drained old runners and stable membership',
})
export class RepairInstagramSecurityCutoverCommand extends CommandRunner {
  private readonly logger = new Logger(
    RepairInstagramSecurityCutoverCommand.name,
  );

  constructor(
    @InjectDataSource() private readonly coreDataSource: DataSource,
    private readonly iterator: WorkspaceIteratorService,
    private readonly verifier: VerifyInstagramSecurityCutoverWorkspaceCommand,
    private readonly migration: UpgradeMigrationService,
    private readonly reader: UpgradeSequenceReaderService,
  ) {
    super();
  }

  @Option({
    flags: '-d, --dry-run',
    description: 'Read-only prerequisite and proposed-work inspection',
  })
  parseDryRun(): boolean {
    return true;
  }

  async preflightHistory(workspaceIds: string[]): Promise<void> {
    const sequence = this.reader.getUpgradeSequence();
    const names = (await this.coreDataSource.query(
      'SELECT DISTINCT name FROM core."upgradeMigration"',
    )) as { name: string }[];
    for (const { name } of names) {
      const reserved = INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY.find(
        (identity) => name.split('_').includes(identity.className),
      );
      if (reserved && reserved.durableName !== name) {
        throw new Error(
          'Instagram cutover reserved upgrade identity mismatch; history was not changed',
        );
      }
    }
    const global =
      await this.migration.getLastAttemptedCommandNameOrThrow(workspaceIds);
    const instance =
      await this.migration.getLastAttemptedInstanceCommandOrThrow();
    const workspaces =
      await this.migration.getWorkspaceLastAttemptedCommandNameOrThrow(
        workspaceIds,
      );
    this.reader.locateStepInSequenceOrThrow({
      sequence,
      stepName: global.name,
    });
    const instanceCursor = this.reader.locateStepInSequenceOrThrow({
      sequence,
      stepName: instance.name,
    });
    for (const workspaceId of workspaceIds) {
      const cursor = workspaces.get(workspaceId);
      if (!cursor) {
        throw new Error('Instagram cutover workspace initialization missing');
      }
      this.reader.locateStepInSequenceOrThrow({
        sequence,
        stepName: cursor.name,
      });
    }
    const cutoverCursor = this.reader.locateStepInSequenceOrThrow({
      sequence,
      stepName:
        '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000',
    });
    if (
      instanceCursor < cutoverCursor ||
      sequence[instanceCursor].kind === 'workspace' ||
      instance.status !== 'completed'
    ) {
      throw new Error(
        'Finish genuine prerequisite instance upgrades before Instagram cutover verification',
      );
    }
    const prerequisites = sequence
      .slice(0, cutoverCursor + 1)
      .filter((step) => step.kind !== 'workspace')
      .map((step) => step.name);
    const failed = await this.coreDataSource.query(
      `SELECT count(*)::text AS count FROM core."upgradeMigration" m
       WHERE m."workspaceId" IS NULL AND m."isInitial" = false
         AND m.name = ANY($1::text[]) AND m.status = 'failed'
         AND m.attempt = (SELECT max(s.attempt) FROM core."upgradeMigration" s
           WHERE s.name = m.name AND s."workspaceId" IS NULL)`,
      [prerequisites],
    );
    if (failed[0]?.count !== '0') {
      throw new Error(
        'Outstanding failed prerequisite instance attempts must finish before verification',
      );
    }
  }

  override async run(
    passedParams: string[],
    options: { dryRun?: boolean } = {},
  ): Promise<void> {
    if (
      passedParams.length > 0 ||
      Object.keys(options).some((key) => key !== 'dryRun')
    ) {
      throw new Error(
        'Instagram cutover release sweep does not accept workspace filters or positional arguments',
      );
    }
    const statuses = [
      WorkspaceActivationStatus.ACTIVE,
      WorkspaceActivationStatus.SUSPENDED,
    ];
    let completed = 0;
    let targets = 0;
    try {
      const workspaces = (await this.coreDataSource.query(
        `SELECT id FROM core.workspace WHERE "deletedAt" IS NULL
         AND "activationStatus" = ANY($1) ORDER BY id`,
        [statuses],
      )) as { id: string }[];
      const workspaceIds = workspaces.map((workspace) => workspace.id);
      targets = workspaceIds.length;
      await this.preflightHistory(workspaceIds);
      // [] means discovery in the existing iterator, not an empty pinned set.
      if (targets > 0) {
        const report = await this.iterator.iterate({
          workspaceIds,
          activationStatuses: statuses,
          dryRun: true,
          callback: async (context) => {
            try {
              await this.verifier.preflight({
                ...context,
                options: { dryRun: true },
              });
            } catch {
              throw new Error('Instagram cutover workspace preflight failed');
            }
          },
        });
        if (report.fail.length > 0 || report.success.length !== targets) {
          throw new Error('Instagram cutover all-workspace preflight failed');
        }
      }
      const core = await repairInstagramSecurityChecks(
        this.coreDataSource,
        options,
      );
      this.logger.log(
        `Instagram cutover core: proposed=${core.proposedRepairs}, repaired=${core.completedRepairs}, targets=${targets}`,
      );
      if (targets > 0) {
        const report = await this.iterator.iterate({
          workspaceIds,
          activationStatuses: statuses,
          dryRun: options.dryRun,
          callback: async (context) => {
            try {
              await this.verifier.runOnWorkspace({
                ...context,
                options: { ...options },
              });
              completed++;
            } catch {
              throw new Error(
                'Instagram cutover workspace verification failed; partial changes may be committed',
              );
            }
          },
        });
        if (report.fail.length > 0 || report.success.length !== targets) {
          throw new Error('Instagram cutover workspace sweep failed');
        }
      }
      this.logger.log(
        `Instagram cutover ${options.dryRun ? 'dry-run' : 'verified'}: targets=${targets}, completed=${completed}; no history writes`,
      );
    } catch {
      // Do not export provider bodies, history errorMessage fields or SQL values.
      this.logger.error(
        `Instagram cutover failed: targets=${targets}, completed=${completed}; partial changes may be committed; idempotent retry requires prerequisite review`,
      );
      throw new Error(
        'Instagram cutover verification failed; history unchanged, partial repair possible. Finish prerequisites and drain old runners before retry',
      );
    }
  }
}
