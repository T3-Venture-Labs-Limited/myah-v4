import { types as nodeUtilTypes } from 'node:util';

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

const EXECUTION_SEQUENCE_MAX_DEPTH = 12;
const EXECUTION_SEQUENCE_MAX_VISITS = 10_000;
// Execution accepts at most 1 MiB of UTF-8 serialized authored sequence data.
// Aligning the authoring UX/schema limit is intentionally deferred.
const MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES = 1_048_576;

const EXECUTION_SEQUENCE_KEYS = [
  'schemaVersion',
  'messages',
  'delaysSeconds',
] as const;
const EXECUTION_EMAIL_KEYS = [
  'id',
  'channel',
  'subject',
  'body',
  'files',
  'replyToThread',
] as const;
const EXECUTION_INSTAGRAM_KEYS = ['id', 'channel', 'text'] as const;
const EXECUTION_FILE_KEYS = [
  'id',
  'name',
  'size',
  'type',
  'createdAt',
] as const;

type ExecutionPlainValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ExecutionPlainValue[]
  | { [key: string]: ExecutionPlainValue };

type ExecutionSequenceDataShape =
  | 'SEQUENCE'
  | 'MESSAGES'
  | 'MESSAGE'
  | 'FILES'
  | 'FILE'
  | 'DELAYS'
  | 'VALUE';

type ExecutionSequenceVisitBudget = {
  count: number;
  codeUnits: number;
  maxBytes: number;
  utf8Bytes: number;
};

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
  versionStatus: WorkflowVersionStatus;
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

export type PublishCampaignSequenceArgs = CampaignSequenceScope & {
  expectedVersionId: string;
};

export type LoadCampaignSequenceEmailByVersionArgs = CampaignSequenceScope & {
  workflowVersionId: string;
  messageId: string;
};

type CampaignSequenceEmail = Extract<
  CampaignSequence['messages'][number],
  { channel: 'EMAIL' }
>;

export type ValidatedCampaignSequenceEmail = {
  workspaceId: string;
  campaignId: string;
  workflowId: string;
  workflowVersionId: string;
  messageId: string;
  subject: string;
  body: string;
  files: CampaignSequenceEmail['files'];
  replyToThread: boolean;
  issues: CampaignSequenceIssue[];
};

export type LoadCampaignSequenceExecutionPlanArgs = {
  workspaceId: string;
  campaignId: string;
  workflowVersionId: string;
};

export type CampaignSequenceExecutionPlanNode =
  | Readonly<{
      messageId: string;
      channel: 'EMAIL';
      replyToThread: boolean;
    }>
  | Readonly<{
      messageId: string;
      channel: 'INSTAGRAM';
    }>;

export type CampaignSequenceExecutionDependencyIntegrityReason =
  | 'CAMPAIGN_NOT_FOUND'
  | 'WORKFLOW_NOT_FOUND'
  | 'WORKFLOW_VERSION_NOT_FOUND'
  | 'WORKFLOW_VERSION_NOT_CURRENT_ACTIVE'
  | 'SEQUENCE_NOT_AUTHORED'
  | 'SEQUENCE_MALFORMED';

export type CampaignSequenceExecutionPlan = Readonly<{
  kind: 'READY';
  workspaceId: string;
  campaignId: string;
  workflowId: string;
  workflowVersionId: string;
  nodes: readonly CampaignSequenceExecutionPlanNode[];
  delaysSeconds: readonly number[];
}>;

export type CampaignSequenceExecutionPlanLoadResult =
  | CampaignSequenceExecutionPlan
  | Readonly<{
      kind: 'BLOCKED_SEQUENCE_INVALID';
      issues: readonly Readonly<CampaignSequenceIssue>[];
    }>
  | Readonly<{
      kind: 'BLOCKED_DEPENDENCY_INTEGRITY';
      reason: CampaignSequenceExecutionDependencyIntegrityReason;
    }>;

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

  async loadEmailByVersion(
    args: LoadCampaignSequenceEmailByVersionArgs,
  ): Promise<ValidatedCampaignSequenceEmail> {
    const normalized = this.normalizeScope(args);
    const workflowVersionId = this.canonicalUuid(
      'workflowVersionId',
      args.workflowVersionId,
    );
    const messageId = this.canonicalUuid('messageId', args.messageId);

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
        select: { id: true },
      });

      if (!campaign) {
        throw new ForbiddenException('Campaign not found or inaccessible');
      }

      const workflow = await this.findWorkflow({
        campaignId: normalized.campaignId,
        workspaceId: normalized.workspaceId,
      });

      if (!workflow) {
        throw new NotFoundException('Campaign sequence version not found');
      }

      const workflowVersionRepository = await this.workflowVersionRepository(
        normalized.workspaceId,
      );
      const version = await workflowVersionRepository.findOne({
        where: { id: workflowVersionId, workflowId: workflow.id },
      });

      if (!version) {
        throw new NotFoundException('Campaign sequence version not found');
      }

      if (version.campaignSequence === null) {
        throw new ConflictException('Campaign sequence version is legacy');
      }

      const sequence = this.parseStoredSequence(version.campaignSequence);
      const matchingMessages = sequence.messages.filter(
        (message) => message.id === messageId,
      );

      if (matchingMessages.length === 0) {
        throw new NotFoundException('Campaign sequence email not found');
      }
      if (matchingMessages.length > 1) {
        throw new InternalServerErrorException(
          'Campaign sequence data is invalid',
        );
      }

      const message = matchingMessages[0];

      if (message.channel !== 'EMAIL') {
        throw new ConflictException(
          'Campaign sequence message is not an email',
        );
      }

      return {
        workspaceId: normalized.workspaceId,
        campaignId: normalized.campaignId,
        workflowId: workflow.id,
        workflowVersionId,
        messageId,
        subject: message.subject,
        body: message.body,
        files: message.files,
        replyToThread: message.replyToThread,
        issues: validateCampaignSequence(sequence),
      };
    });
  }

  async loadEmailByVersionInTransaction(
    args: LoadCampaignSequenceEmailByVersionArgs,
    manager: WorkspaceEntityManager,
  ): Promise<ValidatedCampaignSequenceEmail> {
    const runner = manager.queryRunner;
    if (
      !runner?.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager
    )
      throw new InternalServerErrorException(
        'Campaign sequence material requires the supplied active transaction',
      );
    const normalized = this.normalizeScope(args);
    const workflowVersionId = this.canonicalUuid(
      'workflowVersionId',
      args.workflowVersionId,
    );
    const messageId = this.canonicalUuid('messageId', args.messageId);
    const schemaName = getWorkspaceSchemaName(normalized.workspaceId);
    const rows = await runner.query(
      `SELECT workflow.id AS "workflowId", version."campaignSequence"
         FROM ${this.workflowTable(schemaName)} workflow
         JOIN ${this.workflowVersionTable(schemaName)} version
           ON version.id=$2 AND version."workflowId"=workflow.id
        WHERE workflow."outreachCampaignId"=$1
          AND workflow."deletedAt" IS NULL AND version."deletedAt" IS NULL
        FOR KEY SHARE OF workflow, version`,
      [normalized.campaignId, workflowVersionId],
    );
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new NotFoundException('Campaign sequence version not found');
    const workflowId = rows[0].workflowId;
    if (typeof workflowId !== 'string' || rows[0].campaignSequence === null)
      throw new ConflictException('Campaign sequence version is legacy');
    const sequence = this.parseStoredSequence(rows[0].campaignSequence);
    const matches = sequence.messages.filter(
      (message) => message.id === messageId && message.channel === 'EMAIL',
    );
    if (matches.length !== 1)
      throw new ConflictException('Campaign sequence email is invalid');
    const message = matches[0];
    if (message.channel !== 'EMAIL')
      throw new ConflictException('Campaign sequence email is invalid');
    return {
      workspaceId: normalized.workspaceId,
      campaignId: normalized.campaignId,
      workflowId,
      workflowVersionId,
      messageId,
      subject: message.subject,
      body: message.body,
      files: message.files,
      replyToThread: message.replyToThread,
      issues: validateCampaignSequence(sequence),
    };
  }

  async loadExecutionPlanInTransaction(
    args: LoadCampaignSequenceExecutionPlanArgs,
    manager: WorkspaceEntityManager,
  ): Promise<CampaignSequenceExecutionPlanLoadResult> {
    const queryRunner = manager.queryRunner;

    if (
      !queryRunner ||
      queryRunner.isTransactionActive !== true ||
      queryRunner.isReleased !== false
    ) {
      throw new InternalServerErrorException(
        'Campaign sequence execution plan requires an active transaction',
      );
    }

    const workspaceId = this.canonicalUuid('workspaceId', args.workspaceId);
    const campaignId = this.canonicalUuid('campaignId', args.campaignId);
    const workflowVersionId = this.canonicalUuid(
      'workflowVersionId',
      args.workflowVersionId,
    );
    const schemaName = getWorkspaceSchemaName(workspaceId);

    try {
      const campaignRows = await this.queryExecutionRows(
        queryRunner,
        `SELECT "id"
           FROM ${escapeIdentifier(schemaName)}.${escapeIdentifier('campaign')}
          WHERE "id" = $1 AND "deletedAt" IS NULL
          LIMIT 1`,
        [campaignId],
        ['id'],
        1,
      );
      const campaignRow = this.singleExecutionRecord(campaignRows);

      if (
        campaignRow === null ||
        this.canonicalOwnUuid(campaignRow, 'id') !== campaignId
      ) {
        return this.executionDependencyBlocker('CAMPAIGN_NOT_FOUND');
      }

      const workflowRows = await this.queryExecutionRows(
        queryRunner,
        `SELECT "id", "outreachCampaignId", "lastPublishedVersionId"
           FROM ${this.workflowTable(schemaName)}
          WHERE "outreachCampaignId" = $1 AND "deletedAt" IS NULL
          LIMIT 2`,
        [campaignId],
        ['id', 'outreachCampaignId', 'lastPublishedVersionId'],
        2,
      );

      if (workflowRows.length === 0) {
        return this.executionDependencyBlocker('WORKFLOW_NOT_FOUND');
      }
      if (workflowRows.length !== 1) {
        return this.executionDependencyBlocker('SEQUENCE_MALFORMED');
      }

      const workflow = this.singleExecutionRecord(workflowRows);
      const workflowId = this.canonicalOwnUuid(workflow, 'id');
      const ownedCampaignId = this.canonicalOwnUuid(
        workflow,
        'outreachCampaignId',
      );

      if (workflowId === null || ownedCampaignId !== campaignId) {
        return this.executionDependencyBlocker('WORKFLOW_NOT_FOUND');
      }

      const versionRows = await this.queryExecutionRows(
        queryRunner,
        `SELECT "id", "workflowId", "status",
                octet_length("campaignSequence"::text) AS "campaignSequenceBytes",
                CASE
                  WHEN "campaignSequence" IS NOT NULL
                   AND octet_length("campaignSequence"::text) <= $3
                    THEN "campaignSequence"
                  ELSE NULL
                END AS "campaignSequence"
           FROM ${this.workflowVersionTable(schemaName)}
          WHERE "id" = $1 AND "workflowId" = $2 AND "deletedAt" IS NULL
          LIMIT 1`,
        [workflowVersionId, workflowId, MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES],
        [
          'id',
          'workflowId',
          'status',
          'campaignSequenceBytes',
          'campaignSequence',
        ],
        1,
        ['campaignSequenceBytes', 'campaignSequence'],
      );
      const version = this.singleExecutionRecord(versionRows);

      if (
        version === null ||
        this.canonicalOwnUuid(version, 'id') !== workflowVersionId ||
        this.canonicalOwnUuid(version, 'workflowId') !== workflowId
      ) {
        return this.executionDependencyBlocker('WORKFLOW_VERSION_NOT_FOUND');
      }

      const lastPublishedVersionId = this.canonicalOwnUuid(
        workflow,
        'lastPublishedVersionId',
      );
      const status = this.ownDataProperty(version, 'status');

      if (
        lastPublishedVersionId !== workflowVersionId ||
        status?.value !== WorkflowVersionStatus.ACTIVE
      ) {
        return this.executionDependencyBlocker(
          'WORKFLOW_VERSION_NOT_CURRENT_ACTIVE',
        );
      }

      const storedSequenceBytes = this.ownDataProperty(
        version,
        'campaignSequenceBytes',
      )?.value;
      const storedSequence = Object.getOwnPropertyDescriptor(
        version,
        'campaignSequence',
      );
      const sequenceIsAbsent =
        storedSequence === undefined ||
        ('value' in storedSequence &&
          (storedSequence.value === null ||
            storedSequence.value === undefined));

      if (
        (storedSequenceBytes === null || storedSequenceBytes === undefined) &&
        sequenceIsAbsent
      ) {
        return this.executionDependencyBlocker('SEQUENCE_NOT_AUTHORED');
      }
      if (
        typeof storedSequenceBytes !== 'number' ||
        !Number.isSafeInteger(storedSequenceBytes) ||
        storedSequenceBytes <= 0 ||
        storedSequenceBytes > MAX_CAMPAIGN_SEQUENCE_EXECUTION_BYTES ||
        sequenceIsAbsent ||
        !storedSequence ||
        !('value' in storedSequence)
      ) {
        return this.executionDependencyBlocker('SEQUENCE_MALFORMED');
      }

      const sequence = this.parseExecutionSequence(
        storedSequence.value,
        storedSequenceBytes,
      );

      if (sequence === null) {
        return this.executionDependencyBlocker('SEQUENCE_MALFORMED');
      }

      const issues = validateCampaignSequence(sequence);

      if (issues.length > 0) {
        return Object.freeze({
          kind: 'BLOCKED_SEQUENCE_INVALID' as const,
          issues: Object.freeze(
            issues.map((sequenceIssue) => Object.freeze({ ...sequenceIssue })),
          ),
        });
      }

      const nodes = Object.freeze(
        sequence.messages.map(
          (message): CampaignSequenceExecutionPlanNode =>
            Object.freeze(
              message.channel === 'EMAIL'
                ? {
                    messageId: message.id,
                    channel: message.channel,
                    replyToThread: message.replyToThread,
                  }
                : { messageId: message.id, channel: message.channel },
            ),
        ),
      );
      const delaysSeconds = Object.freeze(
        sequence.delaysSeconds.map((delay) => delay as number),
      );

      return Object.freeze({
        kind: 'READY' as const,
        workspaceId,
        campaignId,
        workflowId,
        workflowVersionId,
        nodes,
        delaysSeconds,
      });
    } catch {
      throw new InternalServerErrorException(
        'Campaign sequence execution plan could not be loaded',
      );
    }
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

  async publish(
    args: PublishCampaignSequenceArgs,
  ): Promise<CampaignSequenceSnapshot> {
    const normalized = this.normalizeScope(args);
    const expectedVersionId = this.canonicalUuid(
      'expectedVersionId',
      args.expectedVersionId,
    );
    const persisted = await this.withLockedCampaign(
      normalized,
      async (context): Promise<PersistedSequenceSnapshot> => {
        this.assertEditableLifecycle(context.campaign.lifecycleStatus);
        const { workflow, version } = await this.lockedDefinition(context);

        if (version.id !== expectedVersionId) {
          throw new ConflictException(
            'Sequence changed. Reload before publishing.',
          );
        }
        const sequence = this.parseStoredSequence(version.campaignSequence);
        const issues = validateCampaignSequence(sequence);
        if (
          issues.length > 0 ||
          sequence.messages.length === 0 ||
          sequence.messages.some(
            (message) =>
              message.channel !== 'EMAIL' ||
              (message.channel === 'EMAIL' && message.files.length > 0),
          )
        ) {
          throw new ConflictException(
            'Only a valid nonempty email-only sequence without attachments can be published.',
          );
        }

        if (version.status === WorkflowVersionStatus.ACTIVE) {
          if (workflow.lastPublishedVersionId !== expectedVersionId) {
            throw new ConflictException(
              'Sequence changed. Reload before publishing.',
            );
          }
        } else if (version.status === WorkflowVersionStatus.DRAFT) {
          await context.queryRunner.query(
            `UPDATE ${this.workflowVersionTable(context.schemaName)}
                SET "status" = 'DEACTIVATED', "updatedAt" = CURRENT_TIMESTAMP
              WHERE "workflowId" = $1 AND "status" = 'ACTIVE' AND "deletedAt" IS NULL`,
            [workflow.id],
          );
          const activated = await this.queryRows<{ id: string }>(
            context.queryRunner,
            `UPDATE ${this.workflowVersionTable(context.schemaName)}
                SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = $1 AND "workflowId" = $2 AND "status" = 'DRAFT'
              RETURNING "id"`,
            [expectedVersionId, workflow.id],
          );
          if (activated.length !== 1 || activated[0].id !== expectedVersionId) {
            throw new ConflictException(
              'Sequence changed. Reload before publishing.',
            );
          }
          const workflowRows = await this.queryRows<{ id: string }>(
            context.queryRunner,
            `UPDATE ${this.workflowTable(context.schemaName)}
                SET "lastPublishedVersionId" = $2, "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = $1
              RETURNING "id"`,
            [workflow.id, expectedVersionId],
          );
          if (workflowRows.length !== 1 || workflowRows[0].id !== workflow.id) {
            throw new Error('Campaign sequence publication was inconsistent');
          }
        } else {
          throw new ConflictException(
            'Sequence changed. Reload before publishing.',
          );
        }

        await this.synchronizeWorkflowStatusProjection(context, workflow.id);
        return {
          snapshot: this.toSnapshot({
            campaignId: context.campaignId,
            workflowId: workflow.id,
            version: { ...version, status: WorkflowVersionStatus.ACTIVE },
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
      versionStatus: version.status,
      editable:
        (lifecycleStatus === 'DRAFT' || lifecycleStatus === 'PAUSED') &&
        canUpdate,
      issues: validateCampaignSequence(sequence),
    };
  }

  private async queryExecutionRows(
    queryRunner: QueryRunner,
    query: string,
    parameters: unknown[],
    expectedRowKeys: readonly string[],
    maximumRows: number,
    optionalRowKeys: readonly string[] = [],
  ): Promise<Record<string, unknown>[]> {
    // QueryRunner and Promise resolution are trusted infrastructure. JavaScript
    // may read an outer Proxy's `then` before this awaited boundary; every
    // resolved value is rejected as a Proxy before structural reflection.
    const result: unknown = await queryRunner.query(query, parameters);
    const outerValues = this.executionArrayValues(
      result,
      Math.max(maximumRows, 2),
    );
    const firstValue = outerValues[0];
    const hasTupleRows = this.isExecutionArray(firstValue);
    let rowValues = outerValues;

    if (hasTupleRows) {
      if (
        outerValues.length !== 2 ||
        typeof outerValues[1] !== 'number' ||
        !Number.isSafeInteger(outerValues[1]) ||
        outerValues[1] < 0
      ) {
        throw new TypeError('Campaign sequence query result tuple is invalid');
      }

      rowValues = this.executionArrayValues(firstValue, maximumRows);
    }

    if (rowValues.length > maximumRows) {
      throw new TypeError('Campaign sequence query returned too many rows');
    }

    return rowValues.map((row) =>
      this.normalizeExecutionRow(row, expectedRowKeys, optionalRowKeys),
    );
  }

  private isExecutionArray(value: unknown): boolean {
    if (nodeUtilTypes.isProxy(value)) {
      throw new TypeError('Campaign sequence query data must not be a Proxy');
    }

    return Array.isArray(value);
  }

  private executionArrayValues(
    value: unknown,
    maximumLength: number,
  ): unknown[] {
    if (nodeUtilTypes.isProxy(value)) {
      throw new TypeError('Campaign sequence arrays must not be Proxies');
    }
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      throw new TypeError('Campaign sequence query data must be an array');
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor?.value;

    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      typeof length !== 'number' ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > maximumLength
    ) {
      throw new TypeError('Campaign sequence array length is invalid');
    }

    const values: unknown[] = [];

    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError('Campaign sequence arrays must be dense data');
      }

      values.push(descriptor.value);
    }

    return values;
  }

  private normalizeExecutionRow(
    value: unknown,
    expectedKeys: readonly string[],
    optionalKeys: readonly string[],
  ): Record<string, unknown> {
    if (nodeUtilTypes.isProxy(value)) {
      throw new TypeError('Campaign sequence rows must not be Proxies');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('Campaign sequence query row is invalid');
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Campaign sequence query row must be plain');
    }

    const actualKeys = Reflect.ownKeys(value);
    const allowedKeys = new Set([...expectedKeys, ...optionalKeys]);

    if (actualKeys.length > allowedKeys.size) {
      throw new TypeError('Campaign sequence query row has too many fields');
    }
    if (actualKeys.some((key) => typeof key === 'symbol')) {
      throw new TypeError('Campaign sequence query row must use string keys');
    }

    const stringKeys = actualKeys as string[];
    const optionalKeySet = new Set(optionalKeys);

    if (
      stringKeys.some((key) => !allowedKeys.has(key)) ||
      expectedKeys.some(
        (key) => !optionalKeySet.has(key) && !stringKeys.includes(key),
      )
    ) {
      throw new TypeError('Campaign sequence query row has invalid fields');
    }

    const row: Record<string, unknown> = Object.create(null);

    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (!descriptor) {
        throw new TypeError('Campaign sequence query row field is missing');
      }
      if (!('value' in descriptor)) {
        if (key !== 'campaignSequence') {
          throw new TypeError(
            'Campaign sequence query row must use data fields',
          );
        }

        Object.defineProperty(row, key, descriptor);
        continue;
      }

      Object.defineProperty(row, key, {
        configurable: true,
        enumerable: true,
        value: descriptor.value,
        writable: true,
      });
    }

    return row;
  }

  private assertExactExecutionKeys(
    actualKeys: readonly string[],
    expectedKeys: readonly string[],
  ): void {
    const expectedKeySet = new Set(expectedKeys);

    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key) => !expectedKeySet.has(key))
    ) {
      throw new TypeError('Campaign sequence data has undeclared fields');
    }
  }

  private executionDependencyBlocker(
    reason: CampaignSequenceExecutionDependencyIntegrityReason,
  ): CampaignSequenceExecutionPlanLoadResult {
    return Object.freeze({
      kind: 'BLOCKED_DEPENDENCY_INTEGRITY' as const,
      reason,
    });
  }

  private singleExecutionRecord(
    rows: Record<string, unknown>[],
  ): Record<string, unknown> | null {
    return rows.length === 1 ? rows[0] : null;
  }

  private ownDataProperty(
    record: Record<string, unknown> | null,
    key: string,
  ): PropertyDescriptor | null {
    if (record === null) return null;

    const descriptor = Object.getOwnPropertyDescriptor(record, key);

    return descriptor && 'value' in descriptor ? descriptor : null;
  }

  private canonicalOwnUuid(
    record: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = this.ownDataProperty(record, key)?.value;

    if (typeof value !== 'string') return null;

    try {
      return stringifyUuid(parseUuid(value));
    } catch {
      return null;
    }
  }

  private parseExecutionSequence(
    value: unknown,
    serializedBytes: number,
  ): CampaignSequence | null {
    try {
      const detachedValue = this.clonePlainExecutionData(
        value,
        'SEQUENCE',
        new WeakSet(),
        {
          count: 0,
          codeUnits: 0,
          maxBytes: serializedBytes,
          utf8Bytes: 0,
        },
        0,
      );
      const result = campaignSequenceSchema.safeParse(detachedValue);

      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  private clonePlainExecutionData(
    value: unknown,
    shape: ExecutionSequenceDataShape,
    seen: WeakSet<object>,
    budget: ExecutionSequenceVisitBudget,
    depth: number,
  ): ExecutionPlainValue {
    if (nodeUtilTypes.isProxy(value)) {
      throw new TypeError('Campaign sequence data must not be a Proxy');
    }
    if (depth > EXECUTION_SEQUENCE_MAX_DEPTH) {
      throw new TypeError('Campaign sequence data is too deep');
    }

    budget.count += 1;

    if (budget.count > EXECUTION_SEQUENCE_MAX_VISITS) {
      throw new TypeError('Campaign sequence data is too large');
    }
    if (typeof value === 'string') {
      budget.codeUnits += value.length;

      if (budget.codeUnits > budget.maxBytes) {
        throw new TypeError('Campaign sequence string data is too large');
      }

      budget.utf8Bytes += Buffer.byteLength(value, 'utf8');

      if (budget.utf8Bytes > budget.maxBytes) {
        throw new TypeError('Campaign sequence string data is too large');
      }

      return value;
    }
    if (
      value === null ||
      value === undefined ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value !== 'object')
      throw new TypeError('Campaign sequence data must be plain JSON');
    if (seen.has(value)) {
      throw new TypeError('Campaign sequence data must be a tree');
    }

    seen.add(value);

    if (this.executionShapeIsArray(shape)) {
      const remainingVisits = EXECUTION_SEQUENCE_MAX_VISITS - budget.count;
      const values = this.executionArrayValues(value, remainingVisits);
      const elementShape = this.executionArrayElementShape(shape);
      const clone: ExecutionPlainValue[] = [];

      for (const element of values) {
        clone.push(
          this.clonePlainExecutionData(
            element,
            elementShape,
            seen,
            budget,
            depth + 1,
          ),
        );
      }

      return clone;
    }
    if (shape === 'VALUE' || Array.isArray(value)) {
      throw new TypeError('Campaign sequence data shape is invalid');
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Campaign sequence data must be plain JSON');
    }

    const actualKeys = Reflect.ownKeys(value);
    const maximumKeys = this.executionObjectMaximumKeys(shape);

    if (actualKeys.length > maximumKeys) {
      throw new TypeError('Campaign sequence data has too many fields');
    }
    if (budget.count + actualKeys.length > EXECUTION_SEQUENCE_MAX_VISITS) {
      throw new TypeError('Campaign sequence data is too large');
    }

    budget.count += actualKeys.length;

    if (actualKeys.some((key) => typeof key === 'symbol')) {
      throw new TypeError('Campaign sequence data must use string keys');
    }

    const stringKeys = actualKeys as string[];
    const expectedKeys = this.executionObjectKeys(
      shape,
      value as Record<string, unknown>,
    );

    this.assertExactExecutionKeys(stringKeys, expectedKeys);

    const clone: Record<string, ExecutionPlainValue> = Object.create(null);

    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (!descriptor || !('value' in descriptor)) {
        throw new TypeError('Campaign sequence data must not use accessors');
      }

      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: this.clonePlainExecutionData(
          descriptor.value,
          this.executionChildShape(shape, key),
          seen,
          budget,
          depth + 1,
        ),
        writable: true,
      });
    }

    return clone;
  }

  private executionShapeIsArray(shape: ExecutionSequenceDataShape): boolean {
    return shape === 'MESSAGES' || shape === 'FILES' || shape === 'DELAYS';
  }

  private executionArrayElementShape(
    shape: ExecutionSequenceDataShape,
  ): ExecutionSequenceDataShape {
    if (shape === 'MESSAGES') return 'MESSAGE';
    if (shape === 'FILES') return 'FILE';
    if (shape === 'DELAYS') return 'VALUE';

    throw new TypeError('Campaign sequence array shape is invalid');
  }

  private executionObjectMaximumKeys(
    shape: ExecutionSequenceDataShape,
  ): number {
    if (shape === 'SEQUENCE') return EXECUTION_SEQUENCE_KEYS.length;
    if (shape === 'FILE') return EXECUTION_FILE_KEYS.length;
    if (shape === 'MESSAGE') return EXECUTION_EMAIL_KEYS.length;

    throw new TypeError('Campaign sequence object shape is invalid');
  }

  private executionObjectKeys(
    shape: ExecutionSequenceDataShape,
    value: Record<string, unknown>,
  ): readonly string[] {
    if (shape === 'SEQUENCE') return EXECUTION_SEQUENCE_KEYS;
    if (shape === 'FILE') return EXECUTION_FILE_KEYS;
    if (shape !== 'MESSAGE') {
      throw new TypeError('Campaign sequence object shape is invalid');
    }

    const channel = Object.getOwnPropertyDescriptor(value, 'channel');

    if (!channel || !('value' in channel)) {
      throw new TypeError('Campaign sequence channel must be a data field');
    }
    if (channel.value === 'EMAIL') return EXECUTION_EMAIL_KEYS;
    if (channel.value === 'INSTAGRAM') return EXECUTION_INSTAGRAM_KEYS;

    throw new TypeError('Campaign sequence channel is invalid');
  }

  private executionChildShape(
    shape: ExecutionSequenceDataShape,
    key: string,
  ): ExecutionSequenceDataShape {
    if (shape === 'SEQUENCE') {
      if (key === 'messages') return 'MESSAGES';
      if (key === 'delaysSeconds') return 'DELAYS';
    }
    if (shape === 'MESSAGE' && key === 'files') return 'FILES';

    return 'VALUE';
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
    // The dedicated Campaign Stop operation is the only trusted path to PAUSED;
    // user-facing outreach authoring represents that internal state as stopped.
    if (lifecycleStatus !== 'DRAFT' && lifecycleStatus !== 'PAUSED') {
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
