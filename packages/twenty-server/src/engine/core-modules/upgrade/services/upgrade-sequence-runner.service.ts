import { Injectable, Logger } from '@nestjs/common';
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import {
  type WorkspaceIteratorReport,
  WorkspaceIteratorService,
} from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import {
  BackfillSystemUniqueIndexUniversalIdentifierCommand,
  SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
} from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1783093620000-backfill-system-unique-index-universal-identifier.command';
import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { CreateCampaignEmailWorkCollisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000007-create-campaign-email-work-collision';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { SynchronizeInstagramSourceControlledMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790491923604-synchronize-instagram-source-controlled-metadata.command';
import { LEGACY_2_19_PREREQUISITE_COMMAND_NAMES } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-command-names.constant';
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
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import { formatUpgradeLog } from 'src/engine/core-modules/upgrade/utils/format-upgrade-log.util';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';
import { assertUnreachable, isDefined } from 'twenty-shared/utils';

const ASSEMBLED_INSTANCES = [
  '2.20.0_CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand_1789645911003',
  '2.20.0_CreateCampaignForecastProjectionFastInstanceCommand_1789992172618',
  '2.20.0_AddConnectedAccountSendingPolicyRevisionFastInstanceCommand_1789992172619',
  '2.20.0_CreateCampaignPartnershipWorkItemFastInstanceCommand_1790000000001',
  '2.20.0_AddCampaignReplyAmbiguitySnapshotFastInstanceCommand_1790000000002',
  '2.20.0_CreateCampaignEmailBaselineFastInstanceCommand_1790000000004',
  '2.20.0_AddCampaignEmailAccountIncarnationFastInstanceCommand_1790000000005',
  '2.20.0_AddCampaignEmailWorkIdentityFastInstanceCommand_1790000000006',
  '2.20.0_CreateCampaignEmailWorkCollisionFastInstanceCommand_1790000000007',
  '2.20.0_CreateMyahCampaignReplyEvidenceFastInstanceCommand_1790141137300',
  '2.20.0_AddMyahInboxReplyDraftIncomingBaselineFastInstanceCommand_1790141137400',
  '2.20.0_MigrateManagedEmailPaymentReceiptsSlowInstanceCommand_1786000004001',
  // The registry retains the original Instagram receipt identity.
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000',
] as const;
const ASSEMBLED_WORKSPACE_TAIL = [
  '2.20.0_SynchronizeMyahPartnershipFactsCommand_1789730000001',
  '2.20.0_SynchronizeCampaignReplyAuthorityCommand_1790000000003',
  '2.20.0_RetireBrandBrainMetadataCommand_1790000000410',
  '2.20.0_RetireShopifyConnectionsCommand_1790000000411',
  '2.20.0_RetireCalendarSyncCommand_1790000000412',
  '2.20.0_RetireDashboardCommand_1790000000413',
  '2.20.0_RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand_1790161829172',
  '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
] as const;

const LEGACY_REBRAND_COMMAND_NAME =
  '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206';
const LEGACY_PROVIDER_BINDING_COMMAND_NAME =
  '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001';
const LEGACY_FINALIZE_COMMAND_NAME =
  '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059';

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
    private readonly upgradeWriteLockService: UpgradeWriteLockService,
  ) {}

  async run({
    sequence,
    options,
  }: {
    sequence: UpgradeStep[];
    options: ParsedUpgradeCommandOptions;
  }): Promise<UpgradeSequenceRunnerReport> {
    // The first authoritative cursor and workspace reads occur inside the lock.
    return this.upgradeWriteLockService.withLock(
      async () => {
        if (sequence.length === 0) {
          return { totalSuccesses: 0, totalFailures: 0 };
        }

        // The admission uses only the lock's raw reads: metadata-adapter
        // refresh reads a cursor and mutates TypeORM's in-memory shape.
        await this.assertAssembledUpgradeAdmission(sequence);
        await this.upgradeAwareEntityMetadataAdapter.refresh();

        try {
          return await this.runInner({ sequence, options });
        } finally {
          try {
            await this.upgradeAwareEntityMetadataAdapter.refresh();
          } catch (refreshError) {
            this.logger.error(
              'Failed to refresh upgrade-aware entity metadata after run',
              refreshError instanceof Error
                ? refreshError.stack
                : String(refreshError),
            );
          }
        }
      },
      { requireNoOngoingActivation: true },
    );
  }

  private async assertAssembledUpgradeAdmission(
    sequence: UpgradeStep[],
  ): Promise<void> {
    const names = sequence.map((step) => step.name);

    // Native Twenty-only unit/upgrade sequences have no 334 commands.
    if (!ASSEMBLED_INSTANCES.slice(3, 9).some((name) => names.includes(name))) {
      return;
    }

    const start = names.indexOf(ASSEMBLED_INSTANCES[0]);
    const tailStart = names.length - ASSEMBLED_WORKSPACE_TAIL.length;
    if (
      start < 0 ||
      ASSEMBLED_INSTANCES.some(
        (name, offset) =>
          names[start + offset] !== name ||
          names.filter((registered) => registered === name).length !== 1 ||
          sequence[start + offset]?.kind !==
            (offset < ASSEMBLED_INSTANCES.length - 2
              ? 'fast-instance'
              : 'slow-instance'),
      ) ||
      tailStart < start + ASSEMBLED_INSTANCES.length ||
      sequence
        .slice(start + ASSEMBLED_INSTANCES.length)
        .some((step) => step.kind !== 'workspace') ||
      ASSEMBLED_WORKSPACE_TAIL.some(
        (name, offset) =>
          names[tailStart + offset] !== name ||
          sequence[tailStart + offset]?.kind !== 'workspace' ||
          names.filter((registered) => registered === name).length !== 1,
      )
    ) {
      throw new Error('Unsupported MYAH-334 assembled upgrade sequence');
    }

    const queryRunner = this.upgradeWriteLockService.currentRunner();
    const workspaces: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM core.workspace WHERE "activationStatus"::text = ANY($1::text[]) ORDER BY id`,
      [[WorkspaceActivationStatus.ACTIVE, WorkspaceActivationStatus.SUSPENDED]],
    );
    const workspaceIds = workspaces.map(({ id }) => id);
    const histories =
      await this.upgradeMigrationService.getScopedUpgradeReceiptHistories({
        workspaceIds,
        queryRunner,
      });
    const globalHistory = histories.get(null);
    const instanceSteps = sequence
      .slice(0, tailStart)
      .filter((step) => step.kind !== 'workspace');

    if (
      globalHistory?.length !== instanceSteps.length ||
      globalHistory.some(
        (row, index) =>
          row.name !== instanceSteps[index].name ||
          row.status !== 'completed' ||
          row.isInitial ||
          row.attempt !== 1,
      )
    ) {
      throw new Error(
        'Unsupported MYAH-334 upgrade history: instance receipts require completed assembled prerequisites',
      );
    }

    for (const workspaceId of workspaceIds) {
      const history = histories.get(workspaceId.toLowerCase());
      const initial = history?.[0];
      const executed = history?.slice(1) ?? [];

      if (
        !initial ||
        initial.name !==
          ASSEMBLED_WORKSPACE_TAIL[ASSEMBLED_WORKSPACE_TAIL.length - 1] ||
        initial.status !== 'completed' ||
        !initial.isInitial ||
        executed.length > ASSEMBLED_WORKSPACE_TAIL.length ||
        executed.some(
          (row, index) =>
            row.name !== ASSEMBLED_WORKSPACE_TAIL[index] ||
            row.status !== 'completed' ||
            row.isInitial,
        )
      ) {
        throw new Error(
          `Unsupported MYAH-334 upgrade history: workspace ${workspaceId} has an unexplained, failed or out-of-order receipt`,
        );
      }
    }

    // Receipt completion is insufficient on its own: these are read-only
    // checks of the installed immutable core shape, including 0007's trigger.
    await new CreateCampaignPartnershipWorkItemFastInstanceCommand().assertPhysicalContract(
      queryRunner,
    );
    await new CreateCampaignEmailWorkCollisionFastInstanceCommand().assertPhysicalContract(
      queryRunner,
    );
    const [coreShape]: Array<{ ready: boolean }> = await queryRunner.query(
      `SELECT to_regclass('core."myahCampaignReplyEvidence"') IS NOT NULL
        AND to_regclass('core."myahCampaignReplyPending"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('core."myahInboxReplyContextDraft"')
            AND attname = 'authoredIncomingBaseline' AND NOT attisdropped
        ) AS ready`,
    );
    if (coreShape?.ready !== true) {
      throw new Error(
        'Unsupported MYAH-334 upgrade history: assembled reply core schema is absent',
      );
    }

    const requiredObjects = [
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding
        .universalIdentifier,
    ];
    const partnershipObjects = [
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
    ];
    const replyFields = [
      MYAH_STANDARD_OBJECTS.campaign.fields.replyAgentEnabled
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.replyAgentPaused
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.emailConversationBindings
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding.fields
        .campaignCreator.universalIdentifier,
    ];
    const partnershipFields = [
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
        .universalIdentifier,
      STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
    ];
    for (const workspaceId of workspaceIds) {
      const rows: Array<{ universalIdentifier: string }> =
        await queryRunner.query(
          `SELECT "universalIdentifier" FROM core."objectMetadata"
          WHERE "workspaceId" = $1::uuid AND "universalIdentifier" = ANY($2::uuid[])`,
          [workspaceId, [...requiredObjects, ...partnershipObjects]],
        );
      const present = new Set(rows.map((row) => row.universalIdentifier));
      const hasBReceipt =
        (histories.get(workspaceId.toLowerCase())?.length ?? 0) > 1;

      if (
        requiredObjects.some((id) => !present.has(id)) ||
        partnershipObjects.some((id) => present.has(id) !== hasBReceipt)
      ) {
        throw new Error(
          `Unsupported MYAH-334 upgrade history: workspace ${workspaceId} metadata does not match assembled B/reply baseline`,
        );
      }
      const fields: Array<{ universalIdentifier: string }> =
        await queryRunner.query(
          `SELECT "universalIdentifier" FROM core."fieldMetadata"
          WHERE "workspaceId" = $1::uuid AND "universalIdentifier" = ANY($2::uuid[])`,
          [workspaceId, [...replyFields, ...partnershipFields]],
        );
      const presentFields = new Set(
        fields.map((field) => field.universalIdentifier),
      );
      if (
        replyFields.some((id) => !presentFields.has(id)) ||
        partnershipFields.some((id) => presentFields.has(id) !== hasBReceipt)
      ) {
        throw new Error(
          `Unsupported MYAH-334 upgrade history: workspace ${workspaceId} has missing reply or partial partnership fields`,
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

    if (!options.dryRun) {
      await this.reconcileCommittedWorkspaceSteps({
        sequence,
        workspaceIds: allActiveOrSuspendedWorkspaceIds,
      });
    }

    const startCursor = await this.resolveStartCursor({
      sequence,
      allActiveOrSuspendedWorkspaceIds,
    });

    let totalSuccesses = 0;
    let totalFailures = 0;
    let cursor = startCursor;
    let workspaceCursors = await this.fetchWorkspaceCursors(
      allActiveOrSuspendedWorkspaceIds,
    );

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

    // The old native Rebrand cursor predates these fast prerequisites. Block
    // incomplete receipts even on a failed Rebrand retry; a completed receipt
    // set is not a physical-schema postcondition for an inconsistent database.
    if (
      [
        LEGACY_REBRAND_COMMAND_NAME,
        LEGACY_PROVIDER_BINDING_COMMAND_NAME,
        LEGACY_FINALIZE_COMMAND_NAME,
      ].includes(lastAttempted.name)
    ) {
      for (const name of LEGACY_2_19_PREREQUISITE_COMMAND_NAMES) {
        if (
          !(await this.upgradeMigrationService.isLastAttemptCompleted({
            name,
            workspaceId: null,
          }))
        ) {
          throw new Error(
            `Historical 2.19 prerequisite receipt ${name} is missing before ${lastAttempted.name}; ` +
              '2.19 prerequisite reconciliation is not available. Refusing ordered upgrade before approval consumers.',
          );
        }
      }
    }

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

  private async reconcileCommittedWorkspaceSteps({
    sequence,
    workspaceIds,
  }: {
    sequence: UpgradeStep[];
    workspaceIds: string[];
  }): Promise<void> {
    const recoverable = [
      {
        name: SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
        command: BackfillSystemUniqueIndexUniversalIdentifierCommand,
      },
      {
        name: '2.20.0_SynchronizeMyahStandardMetadataCommand_1784266302001',
        command: SynchronizeMyahStandardMetadataCommand,
      },
      {
        name: '2.20.0_RetireBrandBrainMetadataCommand_1790000000410',
        command: RetireBrandBrainMetadataCommand,
      },
      {
        name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
        command: SynchronizeInstagramSourceControlledMetadataCommand,
      },
    ] as const;
    for (const recovery of recoverable) {
      const step = sequence.find((item) => item.name === recovery.name);
      if (!step) continue;
      if (
        step.kind !== 'workspace' ||
        !(step.command instanceof recovery.command)
      )
        throw new Error(`Recovery command not registered: ${recovery.name}`);
      const queryRunner = this.upgradeWriteLockService.currentRunner();
      for (const workspaceId of workspaceIds) {
        if (
          await this.upgradeMigrationService.isLastAttemptCompleted({
            name: recovery.name,
            workspaceId,
            queryRunner,
            ...(recovery.name ===
            '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604'
              ? { requireNonInitial: true }
              : {}),
          })
        ) {
          // COMMIT and receipt are durable even if Redis callbacks failed.
          // Heal before reading any cursor or running another step.
          await step.command.reconcileCommittedUpgrade(workspaceId);
        }
      }
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

        const pendingCommands =
          this.upgradeSequenceReaderService.getPendingWorkspaceCommands({
            workspaceCommands: workspaceCommandsSegment,
            workspaceCursor,
          });

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
