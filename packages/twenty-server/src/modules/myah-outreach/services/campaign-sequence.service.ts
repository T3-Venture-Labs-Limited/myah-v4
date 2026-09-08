import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type QueryRunner } from 'typeorm';
import {
  campaignSequenceSchema,
  type CampaignSequence,
  type CampaignSequenceIssue,
  validateCampaignSequence,
} from 'twenty-shared/workflow';
import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import {
  WorkflowVersionStatus,
  type WorkflowVersionWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import {
  WorkflowStatus,
  type WorkflowWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import {
  WorkflowVersionEventType,
  WorkflowStatusesUpdateJob,
} from 'src/modules/workflow/workflow-status/jobs/workflow-statuses-update.job';

const INTERNAL_REPOSITORY_OPTIONS = {
  shouldBypassPermissionChecks: true,
} as const;

const EMPTY_CAMPAIGN_SEQUENCE: CampaignSequence = {
  schemaVersion: 1,
  messages: [],
  delaysSeconds: [],
};

export type CampaignSequenceSnapshot = {
  campaignId: string;
  workflowId: string;
  versionId: string;
  sequence: CampaignSequence;
  lifecycleStatus: string | null;
  editable: boolean;
  issues: CampaignSequenceIssue[];
};

export type CampaignSequenceLoadResult =
  | { kind: 'ABSENT'; campaignId: string }
  | { kind: 'LEGACY'; campaignId: string; workflowId: string }
  | { kind: 'SEQUENCE'; snapshot: CampaignSequenceSnapshot };

export type CampaignSequenceScope = {
  workspaceId: string;
  campaignId: string;
  authContext: WorkspaceAuthContext;
};

export type SaveCampaignSequenceArgs = CampaignSequenceScope & {
  expectedVersionId: string;
  sequence: CampaignSequence;
};

export type ValidateCampaignSequenceArgs = CampaignSequenceScope & {
  expectedVersionId: string;
};

type CampaignRecord = {
  id: string;
  lifecycleStatus: string | null;
};

type LockedCampaignContext = {
  campaign: CampaignRecord;
  manager: WorkspaceEntityManager;
  queryRunner: QueryRunner;
  campaignId: string;
  workspaceId: string;
  schemaName: string;
};

type PersistedSequenceSnapshot = {
  snapshot: CampaignSequenceSnapshot;
  synchronizedWorkflowId: string | null;
};

@Injectable()
export class CampaignSequenceService {
  private readonly logger = new Logger(CampaignSequenceService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectMessageQueue(MessageQueue.workflowQueue)
    private readonly workflowQueue: MessageQueueService,
  ) {}

  async load(
    scope: CampaignSequenceScope,
  ): Promise<CampaignSequenceLoadResult> {
    const normalized = this.normalizeScope(scope);

    return this.executeInContext(normalized.authContext, async () => {
      const permissionOptions = this.permissionOptions(normalized.authContext);
      const campaignRepository =
        await this.globalWorkspaceOrmManager.getRepository<CampaignRecord>(
          normalized.workspaceId,
          'campaign',
          permissionOptions,
        );
      const campaign = await campaignRepository.findOne({
        where: { id: normalized.campaignId },
        select: { id: true, lifecycleStatus: true },
      });

      if (!campaign) {
        throw new ForbiddenException('Campaign not found or inaccessible');
      }

      const workflow = await this.findWorkflow({
        campaignId: normalized.campaignId,
        workspaceId: normalized.workspaceId,
      });

      if (!workflow) {
        return { kind: 'ABSENT', campaignId: normalized.campaignId };
      }

      const version = await this.findCurrentAuthoringVersion({
        workspaceId: normalized.workspaceId,
        workflow,
      });

      if (!version) {
        throw new InternalServerErrorException(
          'Campaign sequence version is missing',
        );
      }

      if (version.campaignSequence === null) {
        return {
          kind: 'LEGACY',
          campaignId: normalized.campaignId,
          workflowId: workflow.id,
        };
      }

      return {
        kind: 'SEQUENCE',
        snapshot: this.toSnapshot({
          campaignId: normalized.campaignId,
          workflowId: workflow.id,
          version,
          lifecycleStatus: campaign.lifecycleStatus,
          canUpdate: this.canUpdateCampaign(permissionOptions),
        }),
      };
    });
  }

  async assertCampaignSequenceReplacementAllowed(
    scope: CampaignSequenceScope,
  ): Promise<void> {
    const normalized = this.normalizeScope(scope);

    await this.withLockedCampaign(normalized, async ({ campaign }) => {
      this.assertEditableLifecycle(campaign.lifecycleStatus);
    });
  }

  async createInitial(
    scope: CampaignSequenceScope,
  ): Promise<CampaignSequenceSnapshot> {
    const normalized = this.normalizeScope(scope);

    const persisted = await this.withLockedCampaign(
      normalized,
      async (context): Promise<PersistedSequenceSnapshot> => {
        this.assertEditableLifecycle(context.campaign.lifecycleStatus);
        const workflowRepository = await this.workflowRepository(
          context.workspaceId,
        );
        const workflow = await workflowRepository.findOne(
          {
            where: { outreachCampaignId: context.campaignId },
            lock: { mode: 'pessimistic_write' },
          },
          context.manager,
        );

        if (workflow) {
          const version = await this.findCurrentAuthoringVersion({
            workspaceId: context.workspaceId,
            workflow,
            manager: context.manager,
          });

          if (!version || version.campaignSequence === null) {
            throw new ConflictException(
              'Existing Campaign outreach requires explicit replacement.',
            );
          }

          await this.synchronizeWorkflowStatusProjection(context, workflow.id);

          return {
            snapshot: this.toSnapshot({
              campaignId: context.campaignId,
              workflowId: workflow.id,
              version,
              lifecycleStatus: context.campaign.lifecycleStatus,
              canUpdate: true,
            }),
            synchronizedWorkflowId: null,
          };
        }

        const workflowId = await this.insertWorkflow(context);
        const versionId = await this.insertWorkflowVersion({
          context,
          workflowId,
          name: 'v1',
          position: 0,
          sequence: EMPTY_CAMPAIGN_SEQUENCE,
        });
        await this.synchronizeWorkflowStatusProjection(context, workflowId);

        return {
          snapshot: this.toSnapshot({
            campaignId: context.campaignId,
            workflowId,
            version: {
              id: versionId,
              workflowId,
              name: 'v1',
              position: 0,
              status: WorkflowVersionStatus.DRAFT,
              campaignSequence: EMPTY_CAMPAIGN_SEQUENCE,
            } as WorkflowVersionWorkspaceEntity,
            lifecycleStatus: context.campaign.lifecycleStatus,
            canUpdate: true,
          }),
          synchronizedWorkflowId: workflowId,
        };
      },
    );

    await this.synchronizeWorkflowAfterCommit(
      normalized.workspaceId,
      persisted.synchronizedWorkflowId,
    );

    return persisted.snapshot;
  }

  async save(
    args: SaveCampaignSequenceArgs,
  ): Promise<CampaignSequenceSnapshot> {
    const normalized = this.normalizeScope(args);
    const expectedVersionId = this.canonicalUuid(
      'expectedVersionId',
      args.expectedVersionId,
    );
    const parsedSequence = this.parseInputSequence(args.sequence);

    const persisted = await this.withLockedCampaign(
      normalized,
      async (context): Promise<PersistedSequenceSnapshot> => {
        this.assertEditableLifecycle(context.campaign.lifecycleStatus);
        const { workflow, version } = await this.lockedDefinition(context);

        if (version.id !== expectedVersionId) {
          throw new ConflictException(
            'Sequence changed. Reload before saving.',
          );
        }

        if (version.status === WorkflowVersionStatus.DRAFT) {
          await context.queryRunner.query(
            `UPDATE ${this.workflowVersionTable(context.schemaName)}
                SET "status" = 'ARCHIVED', "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = $1 AND "workflowId" = $2`,
            [version.id, workflow.id],
          );
        }
        const nextVersionId = await this.insertWorkflowVersion({
          context,
          workflowId: workflow.id,
          name: version.name,
          position: version.position,
          sequence: parsedSequence,
        });
        await this.synchronizeWorkflowStatusProjection(context, workflow.id);

        return {
          snapshot: this.toSnapshot({
            campaignId: context.campaignId,
            workflowId: workflow.id,
            version: {
              ...version,
              id: nextVersionId,
              status: WorkflowVersionStatus.DRAFT,
              trigger: null,
              steps: null,
              campaignSequence: parsedSequence,
            },
            lifecycleStatus: context.campaign.lifecycleStatus,
            canUpdate: true,
          }),
          synchronizedWorkflowId: workflow.id,
        };
      },
    );

    await this.synchronizeWorkflowAfterCommit(
      normalized.workspaceId,
      persisted.synchronizedWorkflowId,
    );

    return persisted.snapshot;
  }

  async validate(
    args: ValidateCampaignSequenceArgs,
  ): Promise<CampaignSequenceSnapshot> {
    const normalized = this.normalizeScope(args);
    const expectedVersionId = this.canonicalUuid(
      'expectedVersionId',
      args.expectedVersionId,
    );

    return this.withLockedCampaign(normalized, async (context) => {
      this.assertEditableLifecycle(context.campaign.lifecycleStatus);
      const { workflow, version } = await this.lockedDefinition(context);

      if (version.id !== expectedVersionId) {
        throw new ConflictException('Sequence changed. Reload before saving.');
      }

      return this.toSnapshot({
        campaignId: context.campaignId,
        workflowId: workflow.id,
        version,
        lifecycleStatus: context.campaign.lifecycleStatus,
        canUpdate: true,
      });
    });
  }

  private async withLockedCampaign<T>(
    scope: CampaignSequenceScope,
    callback: (context: LockedCampaignContext) => Promise<T>,
  ): Promise<T> {
    return this.executeInContext(scope.authContext, async () => {
      const permissionOptions = this.permissionOptions(scope.authContext);

      this.assertCampaignUpdatePermission(permissionOptions);

      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

      return dataSource.transaction(async (manager: WorkspaceEntityManager) => {
        const queryRunner = manager.queryRunner;

        if (!queryRunner) {
          throw new Error('Campaign sequence transaction has no query runner');
        }

        await queryRunner.query(
          'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))',
          [scope.workspaceId, scope.campaignId],
        );

        const campaignRepository =
          await this.globalWorkspaceOrmManager.getRepository<CampaignRecord>(
            scope.workspaceId,
            'campaign',
            permissionOptions,
          );
        const campaign = await campaignRepository.findOne(
          {
            where: { id: scope.campaignId },
            select: { id: true, lifecycleStatus: true },
            lock: { mode: 'pessimistic_write' },
          },
          manager,
        );

        if (!campaign) {
          throw new ForbiddenException('Campaign not found or inaccessible');
        }

        return callback({
          campaign,
          manager,
          queryRunner,
          campaignId: scope.campaignId,
          workspaceId: scope.workspaceId,
          schemaName: getWorkspaceSchemaName(scope.workspaceId),
        });
      });
    });
  }

  private async lockedDefinition(context: LockedCampaignContext) {
    const workflowRepository = await this.workflowRepository(
      context.workspaceId,
    );
    const workflow = await workflowRepository.findOne(
      {
        where: { outreachCampaignId: context.campaignId },
        lock: { mode: 'pessimistic_write' },
      },
      context.manager,
    );

    if (!workflow) {
      throw new NotFoundException('Campaign sequence does not exist');
    }

    const version = await this.findCurrentAuthoringVersion({
      workspaceId: context.workspaceId,
      workflow,
      manager: context.manager,
    });

    if (!version) {
      throw new NotFoundException('Campaign sequence version does not exist');
    }

    if (version.campaignSequence === null) {
      throw new ConflictException(
        'Existing Campaign outreach requires explicit replacement.',
      );
    }

    return {
      workflow,
      version: {
        ...version,
        campaignSequence: this.parseStoredSequence(version.campaignSequence),
      },
    };
  }

  private async findWorkflow({
    campaignId,
    workspaceId,
  }: Pick<CampaignSequenceScope, 'campaignId' | 'workspaceId'>) {
    const repository = await this.workflowRepository(workspaceId);

    return repository.findOne({ where: { outreachCampaignId: campaignId } });
  }

  private async findCurrentAuthoringVersion({
    workspaceId,
    workflow,
    manager,
  }: {
    workspaceId: string;
    workflow: WorkflowWorkspaceEntity;
    manager?: WorkspaceEntityManager;
  }) {
    const repository = await this.workflowVersionRepository(workspaceId);
    const versions = await repository.find(
      {
        where: [
          { workflowId: workflow.id, status: WorkflowVersionStatus.DRAFT },
          { workflowId: workflow.id, status: WorkflowVersionStatus.ACTIVE },
          {
            workflowId: workflow.id,
            status: WorkflowVersionStatus.DEACTIVATED,
          },
        ],
      },
      manager,
    );

    return (
      versions.find(({ status }) => status === WorkflowVersionStatus.DRAFT) ??
      versions.find(({ id }) => id === workflow.lastPublishedVersionId) ??
      versions.find(({ status }) => status === WorkflowVersionStatus.ACTIVE) ??
      versions.find(
        ({ status }) => status === WorkflowVersionStatus.DEACTIVATED,
      ) ??
      null
    );
  }

  private toSnapshot({
    campaignId,
    workflowId,
    version,
    lifecycleStatus,
    canUpdate,
  }: {
    campaignId: string;
    workflowId: string;
    version: WorkflowVersionWorkspaceEntity;
    lifecycleStatus: string | null;
    canUpdate: boolean;
  }): CampaignSequenceSnapshot {
    const sequence = this.parseStoredSequence(version.campaignSequence);

    return {
      campaignId,
      workflowId,
      versionId: this.canonicalUuid('versionId', version.id),
      sequence,
      lifecycleStatus,
      editable: lifecycleStatus === 'DRAFT' && canUpdate,
      issues: validateCampaignSequence(sequence),
    };
  }

  private parseInputSequence(value: unknown): CampaignSequence {
    const result = campaignSequenceSchema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException('Campaign sequence payload is invalid');
    }

    return result.data;
  }

  private parseStoredSequence(value: unknown): CampaignSequence {
    const result = campaignSequenceSchema.safeParse(value);

    if (!result.success) {
      throw new InternalServerErrorException(
        'Campaign sequence data is invalid',
      );
    }

    return result.data;
  }

  private normalizeScope(scope: CampaignSequenceScope): CampaignSequenceScope {
    if (scope.authContext.workspace.id !== scope.workspaceId) {
      throw new ForbiddenException('Campaign not found or inaccessible');
    }

    return {
      authContext: scope.authContext,
      workspaceId: this.canonicalUuid('workspaceId', scope.workspaceId),
      campaignId: this.canonicalUuid('campaignId', scope.campaignId),
    };
  }

  private canonicalUuid(label: string, value: string): string {
    try {
      return stringifyUuid(parseUuid(value));
    } catch {
      throw new BadRequestException(`${label} must be a UUID`);
    }
  }

  private permissionOptions(
    authContext: WorkspaceAuthContext,
  ): RolePermissionConfig {
    const context = getWorkspaceContext();
    const options = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });

    if (!options) {
      throw new ForbiddenException('Role could not be resolved');
    }

    return options;
  }

  private assertCampaignUpdatePermission(options: RolePermissionConfig): void {
    if (!this.canUpdateCampaign(options)) {
      throw new ForbiddenException('Campaign update permission is required');
    }
  }

  private canUpdateCampaign(options: RolePermissionConfig): boolean {
    if ('shouldBypassPermissionChecks' in options) return true;

    const context = getWorkspaceContext();
    const campaignObjectId = context.objectIdByNameSingular.campaign;
    const isUnion = 'unionOf' in options;
    const roleIds = isUnion ? options.unionOf : options.intersectionOf;
    const allowed = roleIds.map(
      (roleId) =>
        context.permissionsPerRoleId[roleId]?.[campaignObjectId]
          ?.canUpdateObjectRecords === true,
    );

    return isUnion ? allowed.some(Boolean) : allowed.every(Boolean);
  }

  private assertEditableLifecycle(lifecycleStatus: string | null): void {
    // STOPPED is intentionally not inferred from PAUSED/DEACTIVATED. Task 7 may
    // add a trusted STOPPED authority; until then, authoring fails closed.
    if (lifecycleStatus !== 'DRAFT') {
      throw new ConflictException('Stop Campaign outreach before editing.');
    }
  }

  private async insertWorkflow(
    context: LockedCampaignContext,
  ): Promise<string> {
    const rows = await this.queryRows<{ id: string }>(
      context.queryRunner,
      `INSERT INTO ${this.workflowTable(context.schemaName)}
        ("name", "outreachCampaignId", "position")
       VALUES ($1, $2, $3)
       RETURNING "id"`,
      ['Campaign Outreach', context.campaignId, 0],
    );
    const id = rows[0]?.id;

    if (typeof id !== 'string') {
      throw new Error('Campaign Outreach workflow creation returned no ID');
    }

    return this.canonicalUuid('workflowId', id);
  }

  private async insertWorkflowVersion({
    context,
    workflowId,
    name,
    position,
    sequence,
  }: {
    context: LockedCampaignContext;
    workflowId: string;
    name: string | null;
    position: number;
    sequence: CampaignSequence;
  }): Promise<string> {
    const rows = await this.queryRows<{ id: string }>(
      context.queryRunner,
      `INSERT INTO ${this.workflowVersionTable(context.schemaName)}
        ("name", "workflowId", "position", "status", "trigger", "steps", "campaignSequence")
       VALUES ($1, $2, $3, $4, NULL, NULL, $5::jsonb)
       RETURNING "id"`,
      [
        name,
        workflowId,
        position,
        WorkflowVersionStatus.DRAFT,
        JSON.stringify(sequence),
      ],
    );
    const id = rows[0]?.id;

    if (typeof id !== 'string') {
      throw new Error('Campaign sequence save returned no version ID');
    }

    return this.canonicalUuid('versionId', id);
  }

  private async synchronizeWorkflowStatusProjection(
    context: LockedCampaignContext,
    workflowId: string,
  ): Promise<void> {
    const versions = await this.queryRows<{ status: WorkflowVersionStatus }>(
      context.queryRunner,
      `SELECT DISTINCT "status"
         FROM ${this.workflowVersionTable(context.schemaName)}
        WHERE "workflowId" = $1 AND "deletedAt" IS NULL`,
      [workflowId],
    );
    const versionStatuses = new Set(versions.map(({ status }) => status));
    const statuses: WorkflowStatus[] = [];

    if (versionStatuses.has(WorkflowVersionStatus.DRAFT)) {
      statuses.push(WorkflowStatus.DRAFT);
    }
    if (versionStatuses.has(WorkflowVersionStatus.ACTIVE)) {
      statuses.push(WorkflowStatus.ACTIVE);
    } else if (versionStatuses.has(WorkflowVersionStatus.DEACTIVATED)) {
      statuses.push(WorkflowStatus.DEACTIVATED);
    }

    await this.queryRows(
      context.queryRunner,
      `UPDATE ${this.workflowTable(context.schemaName)}
          SET "statuses" = $2, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "statuses" IS DISTINCT FROM $2`,
      [workflowId, statuses],
    );
  }

  private async queryRows<T>(
    queryRunner: QueryRunner,
    query: string,
    parameters: unknown[],
  ): Promise<T[]> {
    const result = await queryRunner.query(query, parameters);

    // SAFETY: PostgreSQL QueryRunner returns rows directly for INSERT RETURNING,
    // or as the first tuple element when affected-row metadata is included.
    return (Array.isArray(result) && Array.isArray(result[0])
      ? result[0]
      : result) as unknown as T[];
  }

  private workflowTable(schemaName: string): string {
    return `${escapeIdentifier(schemaName)}.${escapeIdentifier('workflow')}`;
  }

  private workflowVersionTable(schemaName: string): string {
    return `${escapeIdentifier(schemaName)}.${escapeIdentifier('workflowVersion')}`;
  }

  private async synchronizeWorkflowAfterCommit(
    workspaceId: string,
    workflowId: string | null,
  ): Promise<void> {
    if (workflowId === null) return;

    try {
      await this.workflowQueue.add<{
        type: WorkflowVersionEventType.CREATE;
        workspaceId: string;
        workflowIds: string[];
      }>(WorkflowStatusesUpdateJob.name, {
        type: WorkflowVersionEventType.CREATE,
        workspaceId,
        workflowIds: [workflowId],
      });
    } catch (error) {
      // The projection is authoritative and was persisted in the transaction.
      // This best-effort job retains the established reconciliation path; a
      // later sequence write also recomputes the projection if repair is ever
      // needed.
      this.logger.error(
        `Failed to enqueue Workflow status reconciliation for ${workflowId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async workflowRepository(workspaceId: string) {
    return this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
      workspaceId,
      'workflow',
      INTERNAL_REPOSITORY_OPTIONS,
    );
  }

  private async workflowVersionRepository(workspaceId: string) {
    return this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
      workspaceId,
      'workflowVersion',
      INTERNAL_REPOSITORY_OPTIONS,
    );
  }

  private async executeInContext<T>(
    authContext: WorkspaceAuthContext,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      callback,
      authContext,
    );
  }
}
