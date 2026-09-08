import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { type QueryRunner } from 'typeorm';
import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import {
  CampaignSequenceService,
  type CampaignSequenceSnapshot,
} from 'src/modules/myah-outreach/services/campaign-sequence.service';
import {
  WorkflowStatusesUpdateJob,
  WorkflowVersionEventType,
} from 'src/modules/workflow/workflow-status/jobs/workflow-statuses-update.job';
import { WorkflowTriggerWorkspaceService } from 'src/modules/workflow/workflow-trigger/workspace-services/workflow-trigger.workspace-service';

export type LegacyCampaignSequenceReplacementInspection = {
  campaignId: string;
  expectedWorkflowId: string;
  pendingRunIds: string[];
  retainedRunIds: string[];
  state: 'READY' | 'ALREADY_REPLACED';
};

type LegacyCampaignSequenceReplacementArgs = {
  authContext: WorkspaceAuthContext;
  campaignId: string;
  expectedWorkflowId: string;
  workspaceId: string;
};

type LockedReplacementPlan = LegacyCampaignSequenceReplacementInspection & {
  legacyVersionIds: string[];
  shouldArchiveLegacyDefinition: boolean;
};

type CampaignRow = {
  campaignLifecycleStatus: string | null;
};

type WorkflowRow = {
  activeWorkflowId?: string;
  deletedAt?: string | null;
  expectedWorkflowId?: string;
};

type WorkflowVersionRow = {
  campaignSequence: unknown | null;
  id: string;
  status: string;
};

type WorkflowRunRow = {
  id: string;
  status: string;
};

const PENDING_RUN_STATUSES = new Set(['NOT_STARTED', 'ENQUEUED']);
const SAFE_RUN_STATUSES: ReadonlySet<string> = new Set<string>([
  ...PENDING_RUN_STATUSES,
  'COMPLETED',
  'STOPPED',
]);

@Injectable()
export class LegacyCampaignSequenceCleanupWorkspaceService {
  private readonly logger = new Logger(
    LegacyCampaignSequenceCleanupWorkspaceService.name,
  );

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly campaignSequenceService: CampaignSequenceService,
    private readonly workflowTriggerWorkspaceService: WorkflowTriggerWorkspaceService,
    @InjectMessageQueue(MessageQueue.workflowQueue)
    private readonly workflowQueue: MessageQueueService,
  ) {}

  async inspectLegacyCampaignSequenceReplacement(
    args: LegacyCampaignSequenceReplacementArgs,
  ): Promise<LegacyCampaignSequenceReplacementInspection> {
    const normalized = await this.normalizeAndAuthorize(args);
    const plan = await this.withLockedReplacementPlan(normalized, false);

    return this.toInspection(plan);
  }

  async replaceLegacyCampaignSequence(
    args: LegacyCampaignSequenceReplacementArgs,
  ): Promise<CampaignSequenceSnapshot> {
    const normalized = await this.normalizeAndAuthorize(args);
    const plan = await this.withLockedReplacementPlan(normalized, false);

    for (const workflowRunId of plan.pendingRunIds) {
      await this.workflowTriggerWorkspaceService.stopPendingLegacyCampaignWorkflowRunForReplacement(
        workflowRunId,
        normalized.workspaceId,
      );
    }

    const committedPlan =
      plan.shouldArchiveLegacyDefinition || plan.pendingRunIds.length > 0
        ? await this.withLockedReplacementPlan(
            normalized,
            plan.shouldArchiveLegacyDefinition,
          )
        : plan;

    await this.reconcileArchivedLegacyDefinition(normalized, committedPlan);

    // Creation intentionally follows committed archival and reconciliation.
    // If creation fails, the retained soft-deleted workflow is the retry receipt;
    // the same expectedWorkflowId resumes safely without deleting history.
    return this.campaignSequenceService.createInitial({
      authContext: normalized.authContext,
      campaignId: normalized.campaignId,
      workspaceId: normalized.workspaceId,
    });
  }

  private async normalizeAndAuthorize(
    args: LegacyCampaignSequenceReplacementArgs,
  ): Promise<LegacyCampaignSequenceReplacementArgs> {
    const normalized = {
      ...args,
      expectedWorkflowId: this.canonicalUuid(
        'expectedWorkflowId',
        args.expectedWorkflowId,
      ),
    };

    await this.campaignSequenceService.assertCampaignSequenceReplacementAllowed(
      {
        authContext: normalized.authContext,
        campaignId: normalized.campaignId,
        workspaceId: normalized.workspaceId,
      },
    );

    return normalized;
  }

  private async withLockedReplacementPlan(
    args: LegacyCampaignSequenceReplacementArgs,
    shouldArchive: boolean,
  ): Promise<LockedReplacementPlan> {
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

    return dataSource.transaction(async (manager: WorkspaceEntityManager) => {
      const queryRunner = manager.queryRunner;

      if (!queryRunner) {
        throw new Error('Legacy Campaign sequence cleanup has no query runner');
      }

      await queryRunner.query(
        'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))',
        [args.workspaceId, args.campaignId],
      );

      const plan = await this.buildLockedReplacementPlan(queryRunner, args);

      if (shouldArchive && plan.shouldArchiveLegacyDefinition) {
        await this.archiveLegacyDefinition(queryRunner, args, plan);
      }

      return plan;
    });
  }

  private async buildLockedReplacementPlan(
    queryRunner: QueryRunner,
    args: LegacyCampaignSequenceReplacementArgs,
  ): Promise<LockedReplacementPlan> {
    const schemaName = getWorkspaceSchemaName(args.workspaceId);
    const campaignTable = this.table(schemaName, 'campaign');
    const workflowTable = this.table(schemaName, 'workflow');
    const [campaign] = await this.queryRows<CampaignRow>(
      queryRunner,
      `SELECT "lifecycleStatus" AS "campaignLifecycleStatus"
         FROM ${campaignTable}
        WHERE "id" = $1 AND "deletedAt" IS NULL
        FOR UPDATE`,
      [args.campaignId],
    );

    if (campaign?.campaignLifecycleStatus !== 'DRAFT') {
      throw new ConflictException(
        'Campaign outreach must remain stopped while replacing the legacy definition.',
      );
    }

    const [activeWorkflow] = await this.queryRows<WorkflowRow>(
      queryRunner,
      `SELECT "id" AS "activeWorkflowId"
         FROM ${workflowTable}
        WHERE "outreachCampaignId" = $1 AND "deletedAt" IS NULL
        FOR UPDATE`,
      [args.campaignId],
    );
    const [expectedWorkflow] = await this.queryRows<WorkflowRow>(
      queryRunner,
      `SELECT "id" AS "expectedWorkflowId", "deletedAt"
         FROM ${workflowTable}
        WHERE "id" = $1 AND "outreachCampaignId" = $2
        FOR UPDATE`,
      [args.expectedWorkflowId, args.campaignId],
    );

    if (!expectedWorkflow) {
      throw new ConflictException(
        'Legacy Campaign sequence changed. Inspect again before replacing.',
      );
    }

    const expectedVersions = await this.lockedVersions(
      queryRunner,
      schemaName,
      args.expectedWorkflowId,
    );

    if (
      expectedVersions.length === 0 ||
      expectedVersions.some(({ campaignSequence }) => campaignSequence !== null)
    ) {
      throw new ConflictException(
        'Expected workflow is not a legacy Campaign sequence definition.',
      );
    }

    const runs = await this.lockedRuns(
      queryRunner,
      schemaName,
      args.expectedWorkflowId,
    );
    const unsafeRun = runs.find(({ status }) => !SAFE_RUN_STATUSES.has(status));

    if (unsafeRun) {
      throw new ConflictException(
        `Legacy Campaign sequence run ${unsafeRun.id} is still ${unsafeRun.status}. Stop it before replacing the definition.`,
      );
    }

    if (!activeWorkflow) {
      if (expectedWorkflow.deletedAt === null) {
        throw new ConflictException(
          'Legacy Campaign sequence state is inconsistent. Inspect again.',
        );
      }

      return this.alreadyReplacedPlan(args, expectedVersions, runs);
    }

    if (activeWorkflow.activeWorkflowId !== args.expectedWorkflowId) {
      const activeVersions = await this.lockedVersions(
        queryRunner,
        schemaName,
        activeWorkflow.activeWorkflowId ?? '',
      );

      if (
        expectedWorkflow.deletedAt !== null &&
        activeVersions.length > 0 &&
        activeVersions.every(
          ({ campaignSequence }) => campaignSequence !== null,
        )
      ) {
        return this.alreadyReplacedPlan(args, expectedVersions, runs);
      }

      throw new ConflictException(
        'Legacy Campaign sequence changed. Inspect again before replacing.',
      );
    }

    return {
      campaignId: args.campaignId,
      expectedWorkflowId: args.expectedWorkflowId,
      legacyVersionIds: expectedVersions.map(({ id }) => id),
      pendingRunIds: runs
        .filter(({ status }) => PENDING_RUN_STATUSES.has(status))
        .map(({ id }) => id),
      retainedRunIds: runs.map(({ id }) => id),
      shouldArchiveLegacyDefinition: true,
      state: 'READY',
    };
  }

  private async archiveLegacyDefinition(
    queryRunner: QueryRunner,
    args: LegacyCampaignSequenceReplacementArgs,
    plan: LockedReplacementPlan,
  ): Promise<void> {
    const schemaName = getWorkspaceSchemaName(args.workspaceId);
    const automatedTriggerTable = this.table(
      schemaName,
      'workflowAutomatedTrigger',
    );
    const workflowVersionTable = this.table(schemaName, 'workflowVersion');
    const workflowTable = this.table(schemaName, 'workflow');

    if (plan.pendingRunIds.length > 0) {
      throw new ConflictException(
        'Legacy Campaign sequence changed while stopping. Retry replacement.',
      );
    }

    await this.queryRows(
      queryRunner,
      `DELETE FROM ${automatedTriggerTable}
        WHERE "workflowId" = $1`,
      [args.expectedWorkflowId],
    );
    await this.queryRows(
      queryRunner,
      `UPDATE ${workflowVersionTable}
          SET "status" = 'DEACTIVATED',
              "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP),
              "updatedAt" = CURRENT_TIMESTAMP
        WHERE "workflowId" = $1 AND "deletedAt" IS NULL`,
      [args.expectedWorkflowId],
    );
    await this.queryRows(
      queryRunner,
      `UPDATE ${workflowTable}
          SET "statuses" = $3,
              "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP),
              "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "outreachCampaignId" = $2
          AND "deletedAt" IS NULL`,
      [args.expectedWorkflowId, args.campaignId, []],
    );
  }

  private async reconcileArchivedLegacyDefinition(
    args: LegacyCampaignSequenceReplacementArgs,
    plan: LockedReplacementPlan,
  ): Promise<void> {
    for (const workflowVersionId of plan.legacyVersionIds) {
      try {
        await this.workflowTriggerWorkspaceService.reconcileLegacyCampaignWorkflowVersionAfterReplacement(
          workflowVersionId,
          args.workspaceId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to reconcile archived legacy Campaign WorkflowVersion ${workflowVersionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    try {
      await this.workflowQueue.add(WorkflowStatusesUpdateJob.name, {
        type: WorkflowVersionEventType.DELETE,
        workspaceId: args.workspaceId,
        workflowIds: [args.expectedWorkflowId],
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue archived legacy Campaign Workflow reconciliation ${args.expectedWorkflowId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private lockedVersions(
    queryRunner: QueryRunner,
    schemaName: string,
    workflowId: string,
  ): Promise<WorkflowVersionRow[]> {
    return this.queryRows(
      queryRunner,
      `SELECT "id", "status", "campaignSequence"
         FROM ${this.table(schemaName, 'workflowVersion')}
        WHERE "workflowId" = $1
        FOR UPDATE`,
      [workflowId],
    );
  }

  private lockedRuns(
    queryRunner: QueryRunner,
    schemaName: string,
    workflowId: string,
  ): Promise<WorkflowRunRow[]> {
    return this.queryRows(
      queryRunner,
      `SELECT "id", "status"
         FROM ${this.table(schemaName, 'workflowRun')}
        WHERE "workflowId" = $1
        FOR UPDATE`,
      [workflowId],
    );
  }

  private alreadyReplacedPlan(
    args: LegacyCampaignSequenceReplacementArgs,
    versions: WorkflowVersionRow[],
    runs: WorkflowRunRow[],
  ): LockedReplacementPlan {
    return {
      campaignId: args.campaignId,
      expectedWorkflowId: args.expectedWorkflowId,
      legacyVersionIds: versions.map(({ id }) => id),
      pendingRunIds: runs
        .filter(({ status }) => PENDING_RUN_STATUSES.has(status))
        .map(({ id }) => id),
      retainedRunIds: runs.map(({ id }) => id),
      shouldArchiveLegacyDefinition: false,
      state: 'ALREADY_REPLACED',
    };
  }

  private toInspection(
    plan: LockedReplacementPlan,
  ): LegacyCampaignSequenceReplacementInspection {
    const {
      legacyVersionIds: _legacyVersionIds,
      shouldArchiveLegacyDefinition: _shouldArchive,
      ...inspection
    } = plan;

    return inspection;
  }

  private table(schemaName: string, tableName: string): string {
    return `${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}`;
  }

  private async queryRows<T>(
    queryRunner: QueryRunner,
    query: string,
    parameters: unknown[],
  ): Promise<T[]> {
    const result = await queryRunner.query(query, parameters);

    // SAFETY: PostgreSQL QueryRunner returns rows directly, or as the first
    // tuple element when affected-row metadata is included.
    return (Array.isArray(result) && Array.isArray(result[0])
      ? result[0]
      : result) as unknown as T[];
  }

  private canonicalUuid(field: string, value: string): string {
    try {
      const normalized = stringifyUuid(parseUuid(value)).toLowerCase();

      if (value !== normalized) {
        throw new Error('UUID must use canonical lowercase form');
      }

      return normalized;
    } catch {
      throw new BadRequestException(`${field} must be a canonical UUID`);
    }
  }
}
