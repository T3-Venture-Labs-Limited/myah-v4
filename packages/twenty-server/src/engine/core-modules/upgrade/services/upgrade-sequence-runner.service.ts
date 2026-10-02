import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  type WorkspaceIteratorReport,
  WorkspaceIteratorService,
} from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import {
  UpgradeMigrationService,
  WorkspaceLastAttemptedCommand,
} from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import {
  type InstanceUpgradeStep,
  type UpgradeStep,
  type WorkspaceUpgradeStep,
  UpgradeSequenceReaderService,
} from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { formatUpgradeLog } from 'src/engine/core-modules/upgrade/utils/format-upgrade-log.util';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';
import { assertUnreachable, isDefined } from 'twenty-shared/utils';

const PARTNERSHIP_FACTS_B =
  '2.20.0_SynchronizeMyahPartnershipFactsCommand_1789730000001';
const REPLY_TAIL =
  '2.20.0_SynchronizeCampaignReplyAuthorityCommand_1790000000003';
const BEFORE_F =
  '2.20.0_CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand_1789645911003';
const FORECAST =
  '2.20.0_CreateCampaignForecastProjectionFastInstanceCommand_1789992172618';
const POLICY =
  '2.20.0_AddConnectedAccountSendingPolicyRevisionFastInstanceCommand_1789992172619';
const F =
  '2.20.0_CreateCampaignPartnershipWorkItemFastInstanceCommand_1790000000001';
const G =
  '2.20.0_AddCampaignReplyAmbiguitySnapshotFastInstanceCommand_1790000000002';
const EMAIL_BASELINE =
  '2.20.0_CreateCampaignEmailBaselineFastInstanceCommand_1790000000004';
const EMAIL_ACCOUNT_INCARNATION =
  '2.20.0_AddCampaignEmailAccountIncarnationFastInstanceCommand_1790000000005';
const EMAIL_WORK_IDENTITY =
  '2.20.0_AddCampaignEmailWorkIdentityFastInstanceCommand_1790000000006';
const EMAIL_WORK_COLLISION =
  '2.20.0_CreateCampaignEmailWorkCollisionFastInstanceCommand_1790000000007';
const PAYMENT_SLOW =
  '2.20.0_MigrateManagedEmailPaymentReceiptsSlowInstanceCommand_1786000004001';
// Registry compatibility retains the original Instagram receipt identity.
const INSTAGRAM_SLOW =
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';

export type UpgradeSequenceRunnerReport = {
  totalSuccesses: number;
  totalFailures: number;
};

@Injectable()
export class UpgradeSequenceRunnerService {
  private readonly logger = new Logger(UpgradeSequenceRunnerService.name);

  constructor(
    private readonly upgradeMigrationService: UpgradeMigrationService,
    private readonly instanceCommandRunnerService: InstanceCommandRunnerService,
    private readonly workspaceCommandRunnerService: WorkspaceCommandRunnerService,
    private readonly upgradeSequenceReaderService: UpgradeSequenceReaderService,
    private readonly upgradeAwareEntityMetadataAdapter: UpgradeAwareEntityMetadataAdapter,
    private readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceVersionService: WorkspaceVersionService,
    @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  async run({
    sequence,
    options,
  }: {
    sequence: UpgradeStep[];
    options: ParsedUpgradeCommandOptions;
  }): Promise<UpgradeSequenceRunnerReport> {
    if (sequence.length === 0) {
      return { totalSuccesses: 0, totalFailures: 0 };
    }

    await this.upgradeAwareEntityMetadataAdapter.refresh();

    try {
      return await this.runInner({ sequence, options });
    } finally {
      try {
        await this.upgradeAwareEntityMetadataAdapter.refresh();
      } catch (refreshError) {
        this.logger.error(
          `Failed to refresh upgrade-aware entity metadata after run`,
          refreshError instanceof Error
            ? refreshError.stack
            : String(refreshError),
        );
      }
    }
  }

  private async runInner({
    sequence,
    options,
  }: {
    sequence: UpgradeStep[];
    options: ParsedUpgradeCommandOptions;
  }): Promise<UpgradeSequenceRunnerReport> {
    const allActiveOrSuspendedWorkspaceIds =
      await this.workspaceVersionService.getActiveOrSuspendedWorkspaceIds();

    let workspaceCursors = await this.fetchWorkspaceCursors(
      allActiveOrSuspendedWorkspaceIds,
    );
    await this.assertReplyOnlyUpgradeAdmission({
      sequence,
      workspaceIds: allActiveOrSuspendedWorkspaceIds,
      workspaceCursors,
    });

    const startCursor = await this.resolveStartCursor({
      sequence,
      allActiveOrSuspendedWorkspaceIds,
    });

    let totalSuccesses = 0;
    let totalFailures = 0;
    let cursor = startCursor;

    while (cursor < sequence.length) {
      const step = sequence[cursor];

      if (step.kind === 'fast-instance' || step.kind === 'slow-instance') {
        if (
          (isDefined(options.workspaceIds) &&
            options.workspaceIds.length > 0) ||
          isDefined(options.startFromWorkspaceId) ||
          isDefined(options.workspaceCountLimit)
        ) {
          this.logger.log(
            formatUpgradeLog({
              humanMessage:
                `Stopping before instance step "${step.name}": ` +
                'upgrade was run with a workspace filter (-w, --start-from-workspace-id, or --workspace-count-limit). ' +
                'Instance commands require all workspaces to be aligned.',
              event: 'sequence.stopped',
              logFields: {
                before: step.name,
                reason: 'workspace-filter-active',
              },
            }),
          );

          break;
        }

        const previousStep = cursor > 0 ? sequence[cursor - 1] : undefined;

        if (previousStep?.kind === 'workspace' && !options.dryRun) {
          this.enforceWorkspacesCompletedPreviousWorkspaceSegment({
            sequence,
            previousWorkspaceStep: previousStep,
            workspaceCursors,
          });
        }

        if (options.dryRun) {
          this.logger.log(
            formatUpgradeLog({
              humanMessage: `(dry run) Would run ${step.kind} step "${step.name}"`,
              event: 'instance.dry-run',
              logFields: {
                kind: step.kind,
                name: step.name,
                version: step.version,
                dryRun: true,
              },
            }),
          );
        } else {
          await this.runInstanceStep({
            instanceStep: step,
            skipDataMigration:
              step.kind === 'slow-instance' &&
              allActiveOrSuspendedWorkspaceIds.length === 0 &&
              !step.command.runDataMigrationWithoutWorkspaces,
          });

          await this.upgradeAwareEntityMetadataAdapter.refresh();
        }

        cursor++;
        continue;
      }

      const workspaceCommandsSegment =
        this.upgradeSequenceReaderService.collectWorkspaceCommandsStartingFrom({
          sequence,
          fromWorkspaceCommand: step,
        });

      const report = await this.resumeWorkspaceCommandsFromCursors({
        workspaceCommandsSegment,
        workspaceCursors,
        allActiveOrSuspendedWorkspaceIds,
        options,
      });

      totalSuccesses += report.success.length;
      totalFailures += report.fail.length;

      if (report.fail.length > 0) {
        this.logger.error(
          formatUpgradeLog({
            humanMessage:
              `Workspace steps ended with ${report.fail.length} failure(s). ` +
              'Aborting — cannot proceed to next instance step.',
            event: 'sequence.aborted',
            logFields: {
              failures: report.fail.length,
              reason: 'workspace-failures',
            },
          }),
        );

        return { totalSuccesses, totalFailures };
      }

      cursor += workspaceCommandsSegment.length;

      workspaceCursors = await this.fetchWorkspaceCursors(
        allActiveOrSuspendedWorkspaceIds,
      );
    }

    return { totalSuccesses, totalFailures };
  }

  private async resolveStartCursor({
    sequence,
    allActiveOrSuspendedWorkspaceIds,
  }: {
    sequence: UpgradeStep[];
    allActiveOrSuspendedWorkspaceIds: string[];
  }): Promise<number> {
    const lastAttempted =
      await this.upgradeMigrationService.getLastAttemptedCommandNameOrThrow(
        allActiveOrSuspendedWorkspaceIds,
      );

    const lastAttemptedCursor =
      this.upgradeSequenceReaderService.locateStepInSequenceOrThrow({
        sequence,
        stepName: lastAttempted.name,
      });

    const lastAttemptedStep = sequence[lastAttemptedCursor];

    switch (lastAttemptedStep.kind) {
      case 'fast-instance':
      case 'slow-instance': {
        return lastAttempted.status === 'completed'
          ? lastAttemptedCursor + 1
          : lastAttemptedCursor;
      }
      case 'workspace': {
        const workspaceSliceBounds =
          this.upgradeSequenceReaderService.getWorkspaceSegmentBounds({
            sequence,
            workspaceCommand: lastAttemptedStep,
          });

        await this.validateWorkspaceCursorsAreInWorkspaceSegment({
          sequence,
          allActiveOrSuspendedWorkspaceIds,
          workspaceSliceBounds,
        });

        return workspaceSliceBounds.startCursor;
      }
      default:
        assertUnreachable(lastAttemptedStep);
    }
  }

  private async validateWorkspaceCursorsAreInWorkspaceSegment({
    allActiveOrSuspendedWorkspaceIds,
    sequence,
    workspaceSliceBounds: { startCursor, endCursor },
  }: {
    sequence: UpgradeStep[];
    allActiveOrSuspendedWorkspaceIds: string[];
    workspaceSliceBounds: { startCursor: number; endCursor: number };
  }): Promise<void> {
    const workspaceCursors =
      await this.upgradeMigrationService.getWorkspaceLastAttemptedCommandNameOrThrow(
        allActiveOrSuspendedWorkspaceIds,
      );
    const precedingStep =
      startCursor > 0 ? sequence[startCursor - 1] : undefined;

    const invalidWorkspaces: Array<{
      workspaceId: string;
      cursorName: string;
      cursorStatus: string;
    }> = [];

    for (const [workspaceId, workspaceCursor] of workspaceCursors) {
      const cursorPosition =
        this.upgradeSequenceReaderService.locateStepInSequenceOrThrow({
          sequence,
          stepName: workspaceCursor.name,
        });

      const isWithinSegment =
        cursorPosition >= startCursor && cursorPosition <= endCursor;

      const isAtPrecedingInstanceCommandCompleted =
        isDefined(precedingStep) &&
        precedingStep.kind !== 'workspace' &&
        cursorPosition === startCursor - 1 &&
        workspaceCursor.status === 'completed';

      if (!isWithinSegment && !isAtPrecedingInstanceCommandCompleted) {
        invalidWorkspaces.push({
          workspaceId,
          cursorName: workspaceCursor.name,
          cursorStatus: workspaceCursor.status,
        });
      }
    }

    if (invalidWorkspaces.length > 0) {
      const details = invalidWorkspaces
        .map(
          ({ workspaceId, cursorName, cursorStatus }) =>
            `${workspaceId} at "${cursorName}" (${cursorStatus})`,
        )
        .join(', ');

      throw new Error(
        `${invalidWorkspaces.length} workspace(s) have invalid cursors for ` +
          `workspace segment [${startCursor}..${endCursor}]: ${details}`,
      );
    }
  }

  private async assertReplyOnlyUpgradeAdmission({
    sequence,
    workspaceIds,
    workspaceCursors,
  }: {
    sequence: UpgradeStep[];
    workspaceIds: string[];
    workspaceCursors: Map<string, WorkspaceLastAttemptedCommand>;
  }): Promise<void> {
    const names = sequence.map((step) => step.name);
    const hasReplyCommands = [
      F,
      G,
      EMAIL_BASELINE,
      EMAIL_ACCOUNT_INCARNATION,
      EMAIL_WORK_IDENTITY,
      EMAIL_WORK_COLLISION,
      PARTNERSHIP_FACTS_B,
      REPLY_TAIL,
    ].some((name) => names.includes(name));
    if (!hasReplyCommands) return; // Unrelated native Twenty sequences remain unaffected.

    const expectedInstances = [
      BEFORE_F,
      FORECAST,
      POLICY,
      F,
      G,
      EMAIL_BASELINE,
      EMAIL_ACCOUNT_INCARNATION,
      EMAIL_WORK_IDENTITY,
      EMAIL_WORK_COLLISION,
      PAYMENT_SLOW,
      INSTAGRAM_SLOW,
    ];
    const beforeFPosition = names.indexOf(BEFORE_F);
    const lastInstancePosition = names.indexOf(INSTAGRAM_SLOW);
    const workspaceStart = beforeFPosition + expectedInstances.length;
    if (
      beforeFPosition < 0 ||
      expectedInstances.some(
        (name, offset) =>
          names[beforeFPosition + offset] !== name ||
          names.filter((registeredName) => registeredName === name).length !==
            1 ||
          sequence[beforeFPosition + offset]?.kind !==
            (offset < 9 ? 'fast-instance' : 'slow-instance'),
      ) ||
      sequence
        .slice(workspaceStart)
        .some((step) => step.kind !== 'workspace') ||
      names[sequence.length - 2] !== PARTNERSHIP_FACTS_B ||
      names[sequence.length - 1] !== REPLY_TAIL ||
      [PARTNERSHIP_FACTS_B, REPLY_TAIL].some(
        (name) =>
          names.filter((registeredName) => registeredName === name).length !==
          1,
      )
    ) {
      throw new Error(
        'Unsupported MYAH-334 upgrade sequence: expected exact provenance/forecast/policy/F/G/Email baseline/account incarnation/work identity/collision, payment/Instagram slow, then B/reply-only workspace tail; verify registered commands before upgrade',
      );
    }
    if (!this.dataSource) {
      throw new Error(
        'Unsupported MYAH-334 upgrade history: ledger data source unavailable',
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const histories =
        await this.upgradeMigrationService.getScopedUpgradeReceiptHistories({
          workspaceIds,
          queryRunner,
        });
      const globalHistory = histories.get(null);
      const globalCursor =
        await this.upgradeMigrationService.getLastAttemptedCommandNameOrThrow(
          workspaceIds,
        );
      const globalPosition = names.indexOf(globalCursor.name);
      for (const workspaceId of workspaceIds) {
        const history = histories.get(workspaceId.toLowerCase());
        const cursor = workspaceCursors.get(workspaceId);
        if (
          globalPosition !== lastInstancePosition ||
          !history ||
          history.length !== 1 ||
          history[0].name !== REPLY_TAIL ||
          history[0].status !== 'completed' ||
          !history[0].isInitial ||
          cursor?.name !== REPLY_TAIL ||
          cursor.status !== 'completed' ||
          !cursor.isInitial
        ) {
          const reason =
            history?.find(
              (row) =>
                row.name !== REPLY_TAIL ||
                row.status !== 'completed' ||
                !row.isInitial,
            ) ?? history?.[0];
          throw new Error(
            `Unsupported MYAH-334 upgrade history: workspace ${workspaceId} at ${reason?.name ?? cursor?.name ?? 'missing receipt'} (${reason?.status ?? cursor?.status ?? 'missing'}); only a candidate-created reply-tail initial checkpoint without conflicting receipts is admitted. Preserve applied B; reconcile older history separately`,
          );
        }
      }
      if (
        !globalHistory?.length ||
        globalPosition < beforeFPosition ||
        globalPosition > lastInstancePosition ||
        globalCursor.status !== 'completed' ||
        !globalHistory.some(
          (row) =>
            row.name === globalCursor.name &&
            row.status === 'completed' &&
            !row.isInitial,
        )
      ) {
        throw new Error(
          `Unsupported MYAH-334 upgrade history: instance cursor ${globalCursor.name} (${globalCursor.status}); initialize this candidate through ${BEFORE_F} before F/G`,
        );
      }
      for (const prerequisite of expectedInstances.slice(
        0,
        globalPosition - beforeFPosition + 1,
      )) {
        if (
          !globalHistory.some(
            (row) =>
              row.name === prerequisite &&
              row.status === 'completed' &&
              !row.isInitial,
          )
        ) {
          throw new Error(
            `Unsupported MYAH-334 upgrade history: instance command ${prerequisite} has no completed receipt before ${globalCursor.name}; reconcile before reply-only upgrade`,
          );
        }
      }
      for (const row of globalHistory) {
        const position = names.indexOf(row.name);
        if (
          row.status !== 'completed' ||
          row.isInitial ||
          position < 0 ||
          position > lastInstancePosition ||
          sequence[position].kind === 'workspace'
        ) {
          throw new Error(
            `Unsupported MYAH-334 upgrade history: instance command ${row.name} (${row.status}); reconcile outside reply-only upgrade`,
          );
        }
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async fetchWorkspaceCursors(
    allActiveOrSuspendedWorkspaceIds: string[],
  ): Promise<Map<string, WorkspaceLastAttemptedCommand>> {
    return this.upgradeMigrationService.getWorkspaceLastAttemptedCommandNameOrThrow(
      allActiveOrSuspendedWorkspaceIds,
    );
  }

  private async runInstanceStep({
    instanceStep,
    skipDataMigration,
  }: {
    instanceStep: InstanceUpgradeStep;
    skipDataMigration: boolean;
  }): Promise<void> {
    switch (instanceStep.kind) {
      case 'fast-instance': {
        const result =
          await this.instanceCommandRunnerService.runFastInstanceCommand({
            command: instanceStep.command,
            name: instanceStep.name,
          });

        if (result.status === 'failed') {
          throw result.error;
        }

        return;
      }
      case 'slow-instance': {
        const result =
          await this.instanceCommandRunnerService.runSlowInstanceCommand({
            command: instanceStep.command,
            name: instanceStep.name,
            skipDataMigration,
          });

        if (result.status === 'failed') {
          throw result.error;
        }

        return;
      }
      default:
        assertUnreachable(instanceStep);
    }
  }

  private async resumeWorkspaceCommandsFromCursors({
    workspaceCommandsSegment,
    workspaceCursors,
    allActiveOrSuspendedWorkspaceIds,
    options,
  }: {
    workspaceCommandsSegment: WorkspaceUpgradeStep[];
    workspaceCursors: Map<string, WorkspaceLastAttemptedCommand>;
    allActiveOrSuspendedWorkspaceIds: string[];
    options: ParsedUpgradeCommandOptions;
  }): Promise<WorkspaceIteratorReport> {
    const workspaceIds = this.deriveWorkspaceIdsToProcess({
      allActiveOrSuspendedWorkspaceIds,
      options,
    });

    return this.workspaceIteratorService.iterate({
      workspaceIds,
      dryRun: options.dryRun,
      callback: async (context) => {
        const workspaceCursor = workspaceCursors.get(context.workspaceId);

        if (!workspaceCursor) {
          throw new Error(
            `No upgrade migration found for workspace ${context.workspaceId}. This should never occur.`,
          );
        }

        const pendingCommands = this.upgradeSequenceReaderService
          .getPendingWorkspaceCommands({
            workspaceCommands: workspaceCommandsSegment,
            workspaceCursor,
          })
          .filter((command) => command.name !== PARTNERSHIP_FACTS_B);

        await this.workspaceCommandRunnerService.runWorkspaceCommands({
          iteratorContext: context,
          options,
          workspaceCommands: pendingCommands,
        });
      },
    });
  }

  private deriveWorkspaceIdsToProcess({
    allActiveOrSuspendedWorkspaceIds,
    options,
  }: {
    allActiveOrSuspendedWorkspaceIds: string[];
    options: ParsedUpgradeCommandOptions;
  }): string[] {
    if (isDefined(options.workspaceIds) && options.workspaceIds.length > 0) {
      return options.workspaceIds;
    }

    let workspaceIds = allActiveOrSuspendedWorkspaceIds;

    if (isDefined(options.startFromWorkspaceId)) {
      workspaceIds = workspaceIds.filter(
        (id) => id >= options.startFromWorkspaceId!,
      );
    }

    if (isDefined(options.workspaceCountLimit)) {
      workspaceIds = workspaceIds.slice(0, options.workspaceCountLimit);
    }

    return workspaceIds;
  }

  private enforceWorkspacesCompletedPreviousWorkspaceSegment({
    sequence,
    previousWorkspaceStep,
    workspaceCursors,
  }: {
    sequence: UpgradeStep[];
    previousWorkspaceStep: WorkspaceUpgradeStep;
    workspaceCursors: Map<string, WorkspaceLastAttemptedCommand>;
  }): void {
    const barrierCursor =
      this.upgradeSequenceReaderService.locateStepInSequenceOrThrow({
        sequence,
        stepName: previousWorkspaceStep.name,
      });

    for (const [workspaceId, workspaceCursor] of workspaceCursors) {
      const cursorPosition =
        this.upgradeSequenceReaderService.locateStepInSequenceOrThrow({
          sequence,
          stepName: workspaceCursor.name,
        });

      const isAtBarrierAndCompleted =
        cursorPosition === barrierCursor &&
        workspaceCursor.status === 'completed';

      if (!isAtBarrierAndCompleted) {
        throw new Error(
          `Cannot run instance step: workspace ${workspaceId} ` +
            `has not completed "${previousWorkspaceStep.name}" ` +
            `(cursor: "${workspaceCursor.name}", status: "${workspaceCursor.status}")`,
        );
      }
    }
  }
}
