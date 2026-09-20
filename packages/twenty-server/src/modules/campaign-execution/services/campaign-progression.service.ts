import { Injectable, Optional } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type OutboundEmailAttemptReservationIdentity } from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import { type CampaignOutreachAudienceExclusionReason } from 'src/modules/campaign-execution/types/campaign-outreach-audience-review.type';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';
import { type CampaignMessageBlockerCode } from 'src/modules/myah-outreach/types/campaign-message-render.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { campaignMailboxAdvisoryKeys } from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import {
  OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION,
  OutboundEmailAttemptService,
} from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import {
  computeCampaignAttemptId,
  computeCampaignOccurrenceId,
} from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import { CampaignMessageRenderService } from 'src/modules/myah-outreach/services/campaign-message-render.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import {
  CAMPAIGN_ENROLLMENT_TERMINAL_REASONS,
  CAMPAIGN_OCCURRENCE_HOLD_REASONS,
  CAMPAIGN_OCCURRENCE_TERMINAL_REASONS,
  type CampaignEnrollmentTerminalReason,
  type CampaignOccurrenceHoldReason,
  type CampaignOccurrenceTerminalReason,
} from 'src/engine/core-modules/campaign-execution/types/campaign-execution-persistence.type';
import {
  type CampaignAcceptedProgressionInput,
  type CampaignAttemptRoutingCoordinate,
  type CampaignOccurrenceClaimResult,
  type CampaignProgressionPort,
  type CampaignProgressionTransitionResult,
} from 'src/modules/campaign-execution/types/campaign-progression.type';

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];

const isCanonicalUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );

const runnerOf = (manager: EntityManager): QueryRunner => {
  const runner = manager.queryRunner;
  if (
    !runner?.isTransactionActive ||
    runner.isReleased ||
    runner.manager !== manager
  )
    throw new Error(
      'Campaign progression requires the supplied active manager',
    );
  return runner;
};

@Injectable()
export class CampaignProgressionService implements CampaignProgressionPort {
  constructor(
    @Optional() private readonly attemptService?: OutboundEmailAttemptService,
    @Optional() private readonly capacityService?: MailboxCapacityService,
    @Optional() private readonly sequenceService?: CampaignSequenceService,
    @Optional()
    private readonly audienceService?: CampaignOutreachAudienceReviewService,
    @Optional() private readonly senderService?: CampaignSenderReadinessService,
    @Optional() private readonly renderService?: CampaignMessageRenderService,
    @Optional()
    private readonly timelineEventWriter?: CampaignTimelineEventWriterService,
  ) {}

  async claimAndReserveDueOccurrenceInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      occurrenceId: string;
    },
    manager: WorkspaceEntityManager,
  ): Promise<CampaignOccurrenceClaimResult> {
    const runner = runnerOf(manager);
    if (
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.campaignId) ||
      !isCanonicalUuid(input.occurrenceId)
    )
      return { status: 'TERMINAL' };

    const workspace = rows(
      await runner.query(
        `SELECT "activationStatus","suspendedAt","deletedAt" FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      ),
    );
    if (workspace.length !== 1) return { status: 'TERMINAL' };
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [input.workspaceId, input.campaignId],
    );
    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    const campaign = rows(
      await runner.query(
        `SELECT id,"lifecycleStatus","sequenceAuthorization" FROM "${schemaName}".campaign WHERE id=$1 FOR UPDATE`,
        [input.campaignId],
      ),
    );
    if (campaign.length !== 1) return { status: 'TERMINAL' };
    const projection = this.record(campaign[0].sequenceAuthorization);
    if (
      projection === null ||
      !isCanonicalUuid(String(projection.authorizationId)) ||
      !isCanonicalUuid(String(projection.workflowVersionId)) ||
      !Number.isSafeInteger(projection.generation)
    )
      return { status: 'CANCELLED', reason: 'AUTHORIZATION_REVOKED' };
    const authorization = rows(
      await runner.query(
        `SELECT * FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2
          AND "authorizationId"=$3 AND generation=$4 AND "workflowVersionId"=$5 FOR UPDATE`,
        [
          input.workspaceId,
          input.campaignId,
          projection.authorizationId,
          projection.generation,
          projection.workflowVersionId,
        ],
      ),
    );
    if (authorization.length !== 1)
      return { status: 'CANCELLED', reason: 'AUTHORIZATION_REVOKED' };
    const activation = rows(
      await runner.query(
        `SELECT * FROM core."campaignActivation" WHERE "workspaceId"=$1 AND "campaignId"=$2
          AND "authorizationId"=$3 AND "authorizationGeneration"=$4 AND "workflowVersionId"=$5 FOR UPDATE`,
        [
          input.workspaceId,
          input.campaignId,
          projection.authorizationId,
          projection.generation,
          projection.workflowVersionId,
        ],
      ),
    );
    if (activation.length !== 1)
      return { status: 'CANCELLED', reason: 'AUTHORIZATION_REVOKED' };
    const coordinate = rows(
      await runner.query(
        `SELECT "enrollmentId" FROM core."campaignOccurrence" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3`,
        [input.occurrenceId, input.workspaceId, input.campaignId],
      ),
    );
    if (coordinate.length !== 1) return { status: 'TERMINAL' };
    const enrollment = rows(
      await runner.query(
        `SELECT * FROM core."campaignEnrollment" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3
          AND "campaignExecutionId"=$4 AND "authorizationId"=$5 AND "authorizationGeneration"=$6 FOR UPDATE`,
        [
          coordinate[0].enrollmentId,
          input.workspaceId,
          input.campaignId,
          activation[0].campaignExecutionId,
          projection.authorizationId,
          projection.generation,
        ],
      ),
    );
    if (enrollment.length !== 1) return { status: 'TERMINAL' };
    const occurrenceRows = rows(
      await runner.query(
        `SELECT * FROM core."campaignOccurrence" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3
          AND "enrollmentId"=$4 AND "workflowVersionId"=$5 FOR UPDATE`,
        [
          input.occurrenceId,
          input.workspaceId,
          input.campaignId,
          enrollment[0].id,
          projection.workflowVersionId,
        ],
      ),
    );
    if (occurrenceRows.length !== 1) return { status: 'TERMINAL' };
    const occurrence = occurrenceRows[0];
    const attempts = rows(
      await runner.query(
        `SELECT ${OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION}
          FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "occurrenceId"=$2
          ORDER BY "attemptNumber","attemptId" FOR UPDATE`,
        [input.workspaceId, input.occurrenceId],
      ),
    );
    const observed = rows(
      await runner.query(`SELECT clock_timestamp() AS "observedAt"`),
    );
    const observedAt = new Date(String(observed[0]?.observedAt));
    if (!Number.isFinite(observedAt.getTime()))
      throw new Error('Campaign progression database clock was invalid');

    if (
      workspace[0].activationStatus !== 'ACTIVE' ||
      workspace[0].suspendedAt !== null ||
      workspace[0].deletedAt !== null
    ) {
      const reserved = attempts.filter(
        (attempt) =>
          attempt.source === 'CAMPAIGN_SEQUENCE' &&
          attempt.attemptState === 'RESERVED' &&
          attempt.capacityState === 'RESERVED',
      );
      if (reserved.length === 1) {
        if (this.attemptService === undefined)
          throw new Error(
            'Campaign inactive-workspace attempt service unavailable',
          );
        const blocked =
          await this.attemptService.blockReservedAttemptBeforeProvider(
            {
              reservation: this.reservationIdentity(reserved[0]),
              reason: 'WORKSPACE_NOT_ACTIVE',
            },
            manager,
          );
        if (blocked.status !== 'RECORDED' && blocked.status !== 'EXACT_REPLAY')
          throw new Error(
            'Campaign inactive-workspace reservation block failed',
          );
      }
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'WORKSPACE_NOT_ACTIVE',
        runner,
      );
      return { status: 'HELD', reason: 'WORKSPACE_NOT_ACTIVE' };
    }
    const persistedHoldReason =
      occurrence.state === 'HELD' ? String(occurrence.holdReason) : null;
    if (
      persistedHoldReason !== null &&
      !CAMPAIGN_OCCURRENCE_HOLD_REASONS.includes(persistedHoldReason as never)
    )
      throw new Error('Persisted Campaign hold reason is invalid');
    const recoveringHoldReason =
      persistedHoldReason as CampaignOccurrenceHoldReason | null;
    if (
      ['SUCCEEDED', 'SKIPPED', 'CANCELLED'].includes(String(occurrence.state))
    )
      return { status: 'TERMINAL' };
    if (occurrence.state === 'UNKNOWN') return { status: 'ALREADY_CLAIMED' };
    if (occurrence.state === 'IN_FLIGHT') {
      const reserved = attempts.filter(
        (attempt) =>
          attempt.source === 'CAMPAIGN_SEQUENCE' &&
          attempt.attemptState === 'RESERVED' &&
          attempt.capacityState === 'RESERVED',
      );
      if (reserved.length === 1 && attempts.length === 1) {
        const render = rows(
          await runner.query(
            `SELECT "attemptId" FROM core."campaignOutboundRender" WHERE "attemptId"=$1 AND "workspaceId"=$2 AND "renderDigest"=$3`,
            [
              reserved[0].attemptId,
              input.workspaceId,
              reserved[0].renderDigest,
            ],
          ),
        );
        const unknownAfter = new Date(String(reserved[0].unknownAfter));
        if (
          render.length === 1 &&
          observedAt.getTime() + OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS <
            unknownAfter.getTime()
        )
          return {
            status: 'DISPATCHABLE_REPLAY',
            attemptId: String(reserved[0].attemptId),
          };
        if (this.attemptService !== undefined) {
          await this.attemptService.blockReservedAttemptBeforeProvider(
            {
              reservation: this.reservationIdentity(reserved[0]),
              reason: 'RESERVATION_EXPIRED',
            },
            manager,
          );
        }
        await this.holdOccurrenceAndEnrollment(
          input.occurrenceId,
          String(enrollment[0].id),
          'DISPATCH_CONTRACT_CONFLICT',
          runner,
        );
        return { status: 'HELD', reason: 'DISPATCH_CONTRACT_CONFLICT' };
      }
      return { status: 'ALREADY_CLAIMED' };
    }
    const dueAt = new Date(String(occurrence.dueAt));
    if (dueAt.getTime() > observedAt.getTime())
      return { status: 'NOT_DUE', nextDueAt: dueAt };
    if (
      !['PENDING', 'HELD'].includes(String(occurrence.state)) ||
      enrollment[0].state !== 'ACTIVE' ||
      Number(enrollment[0].nextAuthoredMessageIndex) !==
        Number(occurrence.authoredMessageIndex)
    )
      return { status: 'TERMINAL' };
    if (campaign[0].lifecycleStatus !== 'ACTIVE') {
      const reason =
        campaign[0].lifecycleStatus === 'PAUSED'
          ? 'CAMPAIGN_PAUSED'
          : 'CAMPAIGN_COMPLETED';
      const cancelled = await this.cancelOccurrenceInTransaction(
        input.occurrenceId,
        reason,
        manager,
      );
      return cancelled.status === 'CHANGED'
        ? { status: 'CANCELLED', reason }
        : { status: 'TERMINAL' };
    }
    if (
      authorization[0].state !== 'ACTIVE' ||
      projection.state !== 'ACTIVE' ||
      projection.preparedFingerprint !== authorization[0].preparedFingerprint
    ) {
      const cancelled = await this.cancelOccurrenceInTransaction(
        input.occurrenceId,
        'AUTHORIZATION_REVOKED',
        manager,
      );
      return cancelled.status === 'CHANGED'
        ? { status: 'CANCELLED', reason: 'AUTHORIZATION_REVOKED' }
        : { status: 'TERMINAL' };
    }
    if (
      this.attemptService === undefined ||
      this.capacityService === undefined ||
      this.sequenceService === undefined ||
      this.audienceService === undefined ||
      this.senderService === undefined ||
      this.renderService === undefined
    ) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'DISPATCH_CONTRACT_CONFLICT',
        runner,
      );
      return { status: 'HELD', reason: 'DISPATCH_CONTRACT_CONFLICT' };
    }
    const binding = this.record(authorization[0].binding);
    const request = this.record(binding?.request);
    const proof = this.record(request?.preparedProof);
    const plan = await this.sequenceService.loadExecutionPlanInTransaction(
      {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        workflowVersionId: String(projection.workflowVersionId),
      },
      manager,
    );
    const orderedMessageIds = Array.isArray(proof?.orderedMessageIds)
      ? proof.orderedMessageIds
      : [];
    if (
      plan.kind !== 'READY' ||
      orderedMessageIds.length !== plan.nodes.length ||
      orderedMessageIds.some(
        (messageId: unknown, index: number) =>
          messageId !== plan.nodes[index].messageId,
      ) ||
      plan.nodes[Number(occurrence.authoredMessageIndex)]?.messageId !==
        occurrence.messageId
    ) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'MATERIAL_STALE',
        runner,
      );
      return { status: 'HELD', reason: 'MATERIAL_STALE' };
    }
    const audience = await this.audienceService.reviewInTransaction({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      schemaName,
      manager,
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    const creator = audience.eligible.find(
      (candidate) =>
        candidate.campaignCreatorId === enrollment[0].campaignCreatorId,
    );
    if (creator === undefined) {
      const excluded = audience.excluded.find(
        (candidate) =>
          candidate.campaignCreatorId === enrollment[0].campaignCreatorId,
      );
      const reason = this.enrollmentExclusionReason(excluded?.reasons ?? []);
      const skipped = rows(
        await runner.query(
          `UPDATE core."campaignOccurrence" SET state='SKIPPED',"holdReason"=NULL,"terminalReason"=$2,
            "terminalAt"=$3,"updatedAt"=clock_timestamp() WHERE id=$1 AND state IN ('PENDING','HELD')
            RETURNING "terminalAt"`,
          [input.occurrenceId, reason, observedAt],
        ),
      );
      if (skipped.length !== 1)
        throw new Error('Campaign eligibility exclusion CAS failed');
      await this.writeTerminalTimelineEvent(manager, {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        creatorId: String(enrollment[0].creatorId),
        sourceId: input.occurrenceId,
        sourceType: 'OCCURRENCE',
        terminalAt: skipped[0].terminalAt,
        reason,
      });
      const excludedEnrollment = await this.excludeEnrollmentInTransaction(
        String(enrollment[0].id),
        reason,
        manager,
      );
      if (excludedEnrollment.status !== 'CHANGED')
        throw new Error('Campaign eligibility enrollment exclusion CAS failed');
      const result: CampaignOccurrenceClaimResult = {
        status: 'EXCLUDED',
        reason,
      };
      return result;
    }
    const execution = rows(
      await runner.query(
        `SELECT *, CASE WHEN "startLocalTime"::time <= "endLocalTime"::time
          THEN (clock_timestamp() AT TIME ZONE "timeZone")::time >= "startLocalTime"::time
            AND (clock_timestamp() AT TIME ZONE "timeZone")::time < "endLocalTime"::time
          ELSE (clock_timestamp() AT TIME ZONE "timeZone")::time >= "startLocalTime"::time
            OR (clock_timestamp() AT TIME ZONE "timeZone")::time < "endLocalTime"::time END AS "insideWindow",
          (CASE WHEN (clock_timestamp() AT TIME ZONE "timeZone")::time < "startLocalTime"::time
             THEN ((clock_timestamp() AT TIME ZONE "timeZone")::date + "startLocalTime"::time)
             ELSE ((clock_timestamp() AT TIME ZONE "timeZone")::date + 1 + "startLocalTime"::time)
           END AT TIME ZONE "timeZone") AS "nextWindowAt"
          FROM core."campaignExecution" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3 FOR UPDATE`,
        [
          activation[0].campaignExecutionId,
          input.workspaceId,
          input.campaignId,
        ],
      ),
    );
    if (execution.length !== 1) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'MATERIAL_STALE',
        runner,
      );
      return { status: 'HELD', reason: 'MATERIAL_STALE' };
    }
    if (execution[0].insideWindow !== true) {
      const nextDueAt = new Date(String(execution[0].nextWindowAt));
      const deferred = await this.deferOccurrenceAndRecoverEnrollment(
        {
          occurrenceId: input.occurrenceId,
          enrollmentId: String(enrollment[0].id),
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          creatorId: String(enrollment[0].creatorId),
          recoveringHoldReason,
          nextDueAt,
        },
        manager,
      );
      return deferred
        ? { status: 'DEFERRED', nextDueAt }
        : { status: 'TERMINAL' };
    }
    const senderPool =
      await this.senderService.getCampaignEmailSenderPoolInTransaction(
        { workspaceId: input.workspaceId, campaignId: input.campaignId },
        manager,
      );
    if (
      senderPool.senderPoolFingerprint !== proof?.senderPoolFingerprint ||
      senderPool.serializationRevision !==
        proof?.senderPoolSerializationRevision ||
      senderPool.rotationPolicyId !== proof?.senderPoolRotationPolicyId
    ) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'SENDER_POOL_STALE',
        runner,
      );
      return { status: 'HELD', reason: 'SENDER_POOL_STALE' };
    }
    const ready = senderPool.mailboxes.filter(
      (mailbox): mailbox is ReadyCampaignSenderReadiness =>
        mailbox.status === 'READY' &&
        mailbox.bindingStatus === 'RESOLVED_BINDING',
    );
    if (ready.length === 0) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'SENDER_NOT_READY',
        runner,
      );
      return { status: 'HELD', reason: 'SENDER_NOT_READY' };
    }
    const node = plan.nodes[Number(occurrence.authoredMessageIndex)];
    if (node.channel !== 'EMAIL') {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'MATERIAL_STALE',
        runner,
      );
      return { status: 'HELD', reason: 'MATERIAL_STALE' };
    }
    const prior = node.replyToThread
      ? rows(
          await runner.query(
            `SELECT a.* FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
              WHERE a."workspaceId"=$1 AND a."campaignId"=$2 AND a."enrollmentId"=$3
                AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
                AND o."authoredMessageIndex" < $4 ORDER BY o."authoredMessageIndex" DESC,a."attemptNumber" DESC LIMIT 2`,
            [
              input.workspaceId,
              input.campaignId,
              enrollment[0].id,
              occurrence.authoredMessageIndex,
            ],
          ),
        )
      : [];
    if (node.replyToThread && prior.length !== 1) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'THREAD_EVIDENCE_AMBIGUOUS',
        runner,
      );
      return { status: 'HELD', reason: 'THREAD_EVIDENCE_AMBIGUOUS' };
    }
    const priorHeader =
      prior[0]?.providerHeaderMessageId ??
      prior[0]?.reconciledProviderHeaderMessageId;
    if (
      node.replyToThread &&
      (typeof priorHeader !== 'string' ||
        typeof prior[0].resolvedThreadExternalId !== 'string' ||
        typeof prior[0].projectedMessageId !== 'string' ||
        typeof prior[0].projectedMessageThreadId !== 'string')
    ) {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'THREAD_EVIDENCE_MISSING',
        runner,
      );
      return { status: 'HELD', reason: 'THREAD_EVIDENCE_MISSING' };
    }
    const selectionConstraint = node.replyToThread
      ? {
          kind: 'PINNED_REPLY' as const,
          connectedAccountId: String(prior[0].connectedAccountId),
          messageChannelId: String(prior[0].messageChannelId),
          senderHandle: String(prior[0].normalizedSenderHandle),
        }
      : { kind: 'ROTATE' as const };
    const capacity = await this.capacityService.lockAndRankForReservation(
      {
        workspaceId: input.workspaceId,
        workspaceTimeZone: String(execution[0].campaignCapacityTimeZone),
        candidates: ready,
        selectionConstraint,
      },
      manager,
    );
    if (capacity.status === 'NOT_READY') {
      const deferred = await this.deferOccurrenceAndRecoverEnrollment(
        {
          occurrenceId: input.occurrenceId,
          enrollmentId: String(enrollment[0].id),
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          creatorId: String(enrollment[0].creatorId),
          recoveringHoldReason,
          nextDueAt: capacity.nextEligibleAt,
        },
        manager,
      );
      return deferred
        ? { status: 'DEFERRED', nextDueAt: capacity.nextEligibleAt }
        : { status: 'TERMINAL' };
    }
    if (capacity.status !== 'ELIGIBLE_NOW') {
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        'CAPACITY_CONFIGURATION_INVALID',
        runner,
      );
      return { status: 'HELD', reason: 'CAPACITY_CONFIGURATION_INVALID' };
    }
    const sender = capacity.selected.sender;
    const attemptNumber =
      attempts.reduce(
        (maximum, attempt) =>
          Math.max(maximum, Number(attempt.attemptNumber) || 0),
        0,
      ) + 1;
    const attemptId = computeCampaignAttemptId(
      input.occurrenceId,
      attemptNumber,
    );
    const fixedProofs = Array.isArray(proof?.fixedMaterialProofs)
      ? proof.fixedMaterialProofs
      : [];
    const fixed = fixedProofs.find(
      (candidate: unknown) =>
        this.record(candidate)?.messageId === occurrence.messageId,
    );
    const fixedRecord = this.record(fixed);
    const render = await this.renderService.renderSequenceEmail(
      {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        campaignCreatorId: String(enrollment[0].campaignCreatorId),
        workflowVersionId: String(projection.workflowVersionId),
        messageId: String(occurrence.messageId),
      },
      {
        kind: 'DISPATCH',
        authContext: buildSystemAuthContext(input.workspaceId),
        transactionManager: manager,
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
        renderContext: {
          kind: 'CAMPAIGN_SEQUENCE_RENDER',
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          campaignCreatorId: String(enrollment[0].campaignCreatorId),
          authorizationId: String(projection.authorizationId),
          enrollmentId: String(enrollment[0].id),
          occurrenceId: input.occurrenceId,
          workflowVersionId: String(projection.workflowVersionId),
          messageId: String(occurrence.messageId),
          initiatorUserWorkspaceId: String(
            authorization[0].initiatingUserWorkspaceId,
          ),
          authorityFingerprint: String(authorization[0].preparedFingerprint),
          senderPoolFingerprint: senderPool.senderPoolFingerprint,
          fixedMaterialFingerprint: String(proof?.fixedMaterialDigest),
          connectedAccountId: sender.connectedAccountId,
          messageChannelId: sender.messageChannelId,
          senderHandle: sender.senderHandle,
          replyEvidenceId: node.replyToThread
            ? String(prior[0].attemptId)
            : null,
        },
        senderBinding: {
          connectedAccountId: sender.connectedAccountId,
          messageChannelId: sender.messageChannelId,
          senderHandle: sender.senderHandle,
          provider: sender.provider,
          senderPoolFingerprint: senderPool.senderPoolFingerprint,
        },
        replyEvidence: node.replyToThread
          ? {
              evidenceId: String(prior[0].attemptId),
              enrollmentId: String(enrollment[0].id),
              occurrenceId: String(prior[0].occurrenceId),
              priorMessageId: String(prior[0].messageId),
              normalizedRecipient: String(prior[0].normalizedRecipient),
              connectedAccountId: String(prior[0].connectedAccountId),
              messageChannelId: String(prior[0].messageChannelId),
              senderHandle: String(prior[0].normalizedSenderHandle),
              providerMessageId: priorHeader as string,
              providerThreadId: String(prior[0].resolvedThreadExternalId),
            }
          : { kind: 'NEW_THREAD' },
        fixedMaterialProof: {
          fixedMaterialFingerprint: String(proof?.fixedMaterialDigest),
          signatureDigest:
            typeof proof?.signatureDigest === 'string'
              ? proof.signatureDigest
              : null,
          orderedAttachmentProofs: Array.isArray(
            fixedRecord?.orderedAttachmentProofs,
          )
            ? (fixedRecord.orderedAttachmentProofs as never)
            : [],
        },
      },
    );
    if (render.kind !== 'READY') {
      const reason = this.renderHoldReason(
        render.blockers.map(({ code }) => code),
      );
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        reason,
        runner,
      );
      return { status: 'HELD', reason };
    }
    const reserved = await this.attemptService.reserveWithMailboxCapacity(
      {
        attemptId,
        workspaceId: input.workspaceId,
        source: 'CAMPAIGN_SEQUENCE',
        campaignId: input.campaignId,
        enrollmentId: String(enrollment[0].id),
        occurrenceId: input.occurrenceId,
        authorizationId: String(projection.authorizationId),
        workflowVersionId: String(projection.workflowVersionId),
        messageId: String(occurrence.messageId),
        attemptNumber,
        connectedAccountId: sender.connectedAccountId,
        messageChannelId: sender.messageChannelId,
        provider: sender.provider,
        normalizedSenderHandle: sender.senderHandle.trim().toLowerCase(),
        normalizedRecipient: creator.normalizedEmail,
        selectionConstraintKind: node.replyToThread ? 'PINNED_REPLY' : 'ROTATE',
        priorAcceptedEvidenceId: node.replyToThread
          ? String(prior[0].attemptId)
          : null,
        senderPoolFingerprint: senderPool.senderPoolFingerprint,
        renderDigest: render.render.renderDigest,
        reservationEvidence: { kind: 'CAMPAIGN_SEQUENCE_RESERVATION' },
        workspaceTimeZone: String(execution[0].campaignCapacityTimeZone),
        candidates: ready,
      } as Parameters<
        OutboundEmailAttemptService['reserveWithMailboxCapacity']
      >[0],
      manager,
    );
    if (reserved.status === 'NOT_READY') {
      const deferred = await this.deferOccurrenceAndRecoverEnrollment(
        {
          occurrenceId: input.occurrenceId,
          enrollmentId: String(enrollment[0].id),
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          creatorId: String(enrollment[0].creatorId),
          recoveringHoldReason,
          nextDueAt: reserved.nextEligibleAt,
        },
        manager,
      );
      return deferred
        ? { status: 'DEFERRED', nextDueAt: reserved.nextEligibleAt }
        : { status: 'TERMINAL' };
    }
    if (reserved.status !== 'RESERVED' && reserved.status !== 'EXACT_REPLAY') {
      const reason =
        reserved.status === 'BLOCKED'
          ? 'CAPACITY_CONFIGURATION_INVALID'
          : 'DISPATCH_CONTRACT_CONFLICT';
      await this.holdOccurrenceAndEnrollment(
        input.occurrenceId,
        String(enrollment[0].id),
        reason,
        runner,
      );
      return { status: 'HELD', reason };
    }
    const composed = render.render.composedEmail;
    const insertedRender = rows(
      await runner.query(
        `INSERT INTO core."campaignOutboundRender" ("attemptId","workspaceId","campaignId","enrollmentId","occurrenceId",
          "authorizationId","workflowVersionId","messageId","renderDigest","signatureDigest","rendererRevision",subject,html,text,
          "bodyWithSignature","toRecipient","inReplyTo","threadExternalId","references")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)
         ON CONFLICT ("attemptId") DO NOTHING RETURNING "attemptId"`,
        [
          attemptId,
          input.workspaceId,
          input.campaignId,
          enrollment[0].id,
          input.occurrenceId,
          projection.authorizationId,
          projection.workflowVersionId,
          occurrence.messageId,
          render.render.renderDigest,
          render.render.signature?.digest ?? null,
          render.render.rendererRevision,
          render.render.subject,
          render.render.html,
          render.render.text,
          render.render.bodyWithSignature,
          creator.normalizedEmail,
          composed.inReplyTo ?? null,
          composed.threadExternalId ?? null,
          JSON.stringify(composed.references ?? []),
        ],
      ),
    );
    if (insertedRender.length !== 1)
      throw new Error('Campaign immutable render identity collision');
    const changed = rows(
      await runner.query(
        `UPDATE core."campaignOccurrence" SET state='IN_FLIGHT',"holdReason"=NULL,"updatedAt"=clock_timestamp()
          WHERE id=$1 AND state IN ('PENDING','HELD') AND "dueAt" <= $2 RETURNING id,"updatedAt"`,
        [input.occurrenceId, observedAt],
      ),
    );
    if (changed.length !== 1)
      throw new Error('Campaign occurrence claim CAS failed');
    if (recoveringHoldReason !== null) {
      await runner.query(
        `UPDATE core."campaignEnrollment" SET "holdReason"=NULL,"updatedAt"=clock_timestamp()
          WHERE id=$1 AND state='ACTIVE' AND "holdReason"=$2`,
        [enrollment[0].id, recoveringHoldReason],
      );
      const happenedAt = new Date(String(changed[0].updatedAt)).toISOString();
      await this.timelineEventWriter?.writeInTransaction(
        {
          manager,
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
        },
        {
          businessEventKey: `hold-recovery:${input.occurrenceId}:${happenedAt}:${recoveringHoldReason}`,
          eventKind: 'HOLD_RECOVERED',
          happenedAt,
          sourceId: input.occurrenceId,
          sourceType: 'OCCURRENCE',
          creatorId: String(enrollment[0].creatorId),
          reason: recoveringHoldReason,
        },
      );
    }
    return { status: 'RESERVED', attemptId };
  }

  private async nextDueInWindow(
    campaignExecutionId: string,
    workspaceId: string,
    campaignId: string,
    candidate: Date,
    runner: QueryRunner,
  ): Promise<Date> {
    const result = rows(
      await runner.query(
        `SELECT CASE
          WHEN CASE WHEN ce."startLocalTime"::time <= ce."endLocalTime"::time
            THEN ($4::timestamptz AT TIME ZONE ce."timeZone")::time >= ce."startLocalTime"::time
              AND ($4::timestamptz AT TIME ZONE ce."timeZone")::time < ce."endLocalTime"::time
            ELSE ($4::timestamptz AT TIME ZONE ce."timeZone")::time >= ce."startLocalTime"::time
              OR ($4::timestamptz AT TIME ZONE ce."timeZone")::time < ce."endLocalTime"::time END
          THEN $4::timestamptz
          ELSE ((CASE
            WHEN ce."startLocalTime"::time <= ce."endLocalTime"::time
              AND ($4::timestamptz AT TIME ZONE ce."timeZone")::time >= ce."startLocalTime"::time
              THEN ($4::timestamptz AT TIME ZONE ce."timeZone")::date + 1
            ELSE ($4::timestamptz AT TIME ZONE ce."timeZone")::date
          END + ce."startLocalTime"::time) AT TIME ZONE ce."timeZone") END AS "dueAt"
          FROM core."campaignExecution" ce WHERE ce.id=$1 AND ce."workspaceId"=$2 AND ce."campaignId"=$3`,
        [campaignExecutionId, workspaceId, campaignId, candidate],
      ),
    );
    const dueAt = new Date(String(result[0]?.dueAt));
    if (result.length !== 1 || !Number.isFinite(dueAt.getTime()))
      throw new Error('Campaign next sending window was unavailable');
    return dueAt;
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private reservationIdentity(
    row: Record<string, unknown>,
  ): OutboundEmailAttemptReservationIdentity {
    if (row.source !== 'CAMPAIGN_SEQUENCE')
      throw new Error('Campaign reservation replay source is invalid');
    const common = {
      attemptId: String(row.attemptId),
      attemptNumber: Number(row.attemptNumber),
      authorizationId: String(row.authorizationId),
      campaignId: String(row.campaignId),
      claimedAt: new Date(String(row.claimedAt)),
      connectedAccountId: String(row.connectedAccountId),
      enrollmentId: String(row.enrollmentId),
      localDate: String(row.localDate),
      messageChannelId: String(row.messageChannelId),
      messageId: String(row.messageId),
      normalizedRecipient: String(row.normalizedRecipient),
      normalizedSenderHandle: String(row.normalizedSenderHandle),
      occurrenceId: String(row.occurrenceId),
      provider: String(row.provider),
      renderDigest: String(row.renderDigest),
      reservationEvidence: { kind: 'CAMPAIGN_SEQUENCE_RESERVATION' as const },
      senderPoolFingerprint: String(row.senderPoolFingerprint),
      slotAt: new Date(String(row.slotAt)),
      source: 'CAMPAIGN_SEQUENCE' as const,
      unknownAfter: new Date(String(row.unknownAfter)),
      workflowVersionId: String(row.workflowVersionId),
      workspaceId: String(row.workspaceId),
    };
    return row.selectionConstraintKind === 'PINNED_REPLY'
      ? {
          ...common,
          selectionConstraintKind: 'PINNED_REPLY',
          priorAcceptedEvidenceId: String(row.priorAcceptedEvidenceId),
        }
      : {
          ...common,
          selectionConstraintKind: 'ROTATE',
          priorAcceptedEvidenceId: null,
        };
  }

  private enrollmentExclusionReason(
    reasons: readonly CampaignOutreachAudienceExclusionReason[],
  ): Extract<
    CampaignEnrollmentTerminalReason,
    | 'CREATOR_MISSING'
    | 'CAMPAIGN_CREATOR_MISSING'
    | 'INVALID_STAGE'
    | 'NON_EMAIL_CONTACT_METHOD'
    | 'INVALID_EMAIL'
    | 'DUPLICATE_CREATOR_EMAIL'
    | 'SUPPRESSED_EMAIL'
    | 'OPERATOR_EXCLUDED'
  > {
    if (reasons.includes('OPERATOR_EXCLUDED')) return 'OPERATOR_EXCLUDED';
    if (reasons.includes('SUPPRESSED_EMAIL')) return 'SUPPRESSED_EMAIL';
    if (reasons.includes('DUPLICATE_CREATOR_EMAIL'))
      return 'DUPLICATE_CREATOR_EMAIL';
    if (reasons.includes('INVALID_STAGE')) return 'INVALID_STAGE';
    if (reasons.includes('NON_EMAIL_CONTACT_METHOD'))
      return 'NON_EMAIL_CONTACT_METHOD';
    if (reasons.includes('INVALID_EMAIL')) return 'INVALID_EMAIL';
    if (reasons.includes('MISSING_CREATOR')) return 'CREATOR_MISSING';
    return 'CAMPAIGN_CREATOR_MISSING';
  }

  private renderHoldReason(
    codes: readonly CampaignMessageBlockerCode[],
  ): CampaignOccurrenceHoldReason {
    if (codes.some((code) => code.startsWith('ATTACHMENT_')))
      return 'ATTACHMENTS_UNAVAILABLE';
    if (codes.includes('SENDER_POOL_STALE')) return 'SENDER_POOL_STALE';
    if (
      codes.includes('SENDER_NOT_READY') ||
      codes.includes('SENDER_UNAVAILABLE')
    )
      return 'SENDER_NOT_READY';
    if (codes.includes('THREAD_EVIDENCE_MISSING'))
      return 'THREAD_EVIDENCE_MISSING';
    if (codes.includes('THREAD_EVIDENCE_AMBIGUOUS'))
      return 'THREAD_EVIDENCE_AMBIGUOUS';
    if (codes.includes('THREAD_IDENTITY_MISMATCH'))
      return 'THREAD_SENDER_CHANGED';
    return 'MATERIAL_STALE';
  }

  async reconcileAcceptedInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
  ): Promise<{
    status:
      | 'PROGRESSED'
      | 'EXACT_REPLAY'
      | 'PROJECTION_PENDING'
      | 'TERMINAL_SUPPRESSED';
  }> {
    const locked = await this.lockAttemptGraphInTransaction(input, manager);
    if (locked === null || locked.attempt.attemptState !== 'ACCEPTED')
      return { status: 'TERMINAL_SUPPRESSED' };
    const runner = runnerOf(manager);
    const attempt: Record<string, unknown> = {
      ...locked.attempt,
      occurrenceState: locked.occurrence.state,
      authoredMessageIndex: locked.occurrence.authoredMessageIndex,
      enrollmentState: locked.enrollment.state,
      authoredMessageCount: locked.enrollment.authoredMessageCount,
      campaignCreatorId: locked.enrollment.campaignCreatorId,
      creatorId: locked.enrollment.creatorId,
    };
    if (
      typeof attempt.projectedMessageId !== 'string' ||
      typeof attempt.projectedMessageThreadId !== 'string'
    )
      return { status: 'PROJECTION_PENDING' };
    if (attempt.occurrenceState === 'SUCCEEDED')
      return { status: 'EXACT_REPLAY' };
    const acceptedAt = new Date(String(attempt.providerAcceptedAt));
    if (!Number.isFinite(acceptedAt.getTime()))
      return { status: 'TERMINAL_SUPPRESSED' };
    const wasUnknown = attempt.occurrenceState === 'UNKNOWN';
    if (attempt.enrollmentState !== 'ACTIVE') {
      const changed = rows(
        await runner.query(
          `UPDATE core."campaignOccurrence" SET state='SUCCEEDED', "holdReason"=NULL,
            "terminalReason"='PROVIDER_ACCEPTED', "terminalAt"=$2, "updatedAt"=clock_timestamp()
            WHERE id=$1 AND state IN ('IN_FLIGHT','UNKNOWN') RETURNING id`,
          [attempt.occurrenceId, attempt.providerAcceptedAt],
        ),
      );
      if (changed.length === 1)
        await this.writeAcceptedTimelineEvents(
          input,
          manager,
          attempt,
          acceptedAt,
          wasUnknown,
        );
      return { status: 'TERMINAL_SUPPRESSED' };
    }
    const acceptedIndex = Number(attempt.authoredMessageIndex);
    const authoredCount = Number(attempt.authoredMessageCount);
    if (
      !Number.isSafeInteger(acceptedIndex) ||
      !Number.isSafeInteger(authoredCount) ||
      !Number.isFinite(acceptedAt.getTime()) ||
      acceptedIndex < 0 ||
      authoredCount <= acceptedIndex
    )
      return { status: 'TERMINAL_SUPPRESSED' };
    let nextOccurrence: CampaignAcceptedProgressionInput['nextOccurrence'] =
      null;
    const mayContinue =
      acceptedIndex + 1 < authoredCount &&
      locked.campaign.lifecycleStatus === 'ACTIVE' &&
      locked.authorization.state === 'ACTIVE';
    if (mayContinue) {
      if (this.sequenceService === undefined)
        return { status: 'PROJECTION_PENDING' };
      const plan = await this.sequenceService.loadExecutionPlanInTransaction(
        {
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          workflowVersionId: input.workflowVersionId,
        },
        manager,
      );
      const nextIndex = acceptedIndex + 1;
      const nextNode =
        plan.kind === 'READY' ? plan.nodes[nextIndex] : undefined;
      const delaySeconds =
        plan.kind === 'READY' ? plan.delaysSeconds[acceptedIndex] : undefined;
      if (
        nextNode === undefined ||
        nextNode.channel !== 'EMAIL' ||
        typeof delaySeconds !== 'number' ||
        !Number.isSafeInteger(delaySeconds) ||
        delaySeconds < 0
      )
        return { status: 'TERMINAL_SUPPRESSED' };
      const dueAt = await this.nextDueInWindow(
        input.campaignExecutionId,
        input.workspaceId,
        input.campaignId,
        new Date(acceptedAt.getTime() + delaySeconds * 1000),
        runner,
      );
      nextOccurrence = {
        occurrenceId: computeCampaignOccurrenceId(
          input.enrollmentId,
          nextIndex,
          nextNode.messageId,
        ),
        workflowVersionId: input.workflowVersionId,
        messageId: nextNode.messageId,
        authoredMessageIndex: nextIndex,
        dueAt,
      };
    }
    const result = await this.reconcileAcceptedWithSnapshotInTransaction(
      {
        workspaceId: String(attempt.workspaceId),
        campaignId: String(attempt.campaignId),
        enrollmentId: String(attempt.enrollmentId),
        occurrenceId: String(attempt.occurrenceId),
        attemptId: input.attemptId,
        campaignCreatorId: String(attempt.campaignCreatorId),
        acceptedAuthoredMessageIndex: acceptedIndex,
        acceptedAt,
        nextOccurrence,
      },
      manager,
    );
    if (result.status === 'CHANGED') {
      const eventContext = {
        manager,
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
      };
      await this.writeAcceptedTimelineEvents(
        input,
        manager,
        attempt,
        acceptedAt,
        wasUnknown,
      );
      if (nextOccurrence) {
        await this.timelineEventWriter?.writeInTransaction(eventContext, {
          businessEventKey: `occurrence:${nextOccurrence.occurrenceId}:SCHEDULED`,
          eventKind: 'SCHEDULED',
          happenedAt: acceptedAt.toISOString(),
          sourceId: nextOccurrence.occurrenceId,
          sourceType: 'OCCURRENCE',
          creatorId: String(attempt.creatorId),
        });
      }
    }

    return result.status === 'EXACT_REPLAY'
      ? { status: 'EXACT_REPLAY' }
      : result.status === 'CHANGED'
        ? { status: 'PROGRESSED' }
        : { status: 'TERMINAL_SUPPRESSED' };
  }

  async reconcileDefinitelyUnacceptedInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
  ): Promise<{ status: 'HELD' | 'EXACT_REPLAY' }> {
    const locked = await this.lockAttemptGraphInTransaction(input, manager);
    if (
      locked !== null &&
      locked.occurrence.state === 'HELD' &&
      locked.occurrence.holdReason === 'DEFINITELY_UNACCEPTED_REVIEW'
    )
      return { status: 'EXACT_REPLAY' };
    if (
      locked === null ||
      locked.attempt.attemptState !== 'DEFINITELY_UNACCEPTED'
    )
      throw new Error('Definitely-unaccepted Campaign evidence is unavailable');
    const wasUnknown = locked.occurrence.state === 'UNKNOWN';
    await this.holdOccurrenceAndEnrollment(
      input.occurrenceId,
      input.enrollmentId,
      'DEFINITELY_UNACCEPTED_REVIEW',
      runnerOf(manager),
    );
    if (wasUnknown) {
      const happenedAt = new Date(
        String(locked.attempt.updatedAt),
      ).toISOString();
      await this.timelineEventWriter?.writeInTransaction(
        {
          manager,
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
        },
        {
          businessEventKey: `attempt:${input.attemptId}:UNKNOWN_RECOVERED_UNACCEPTED`,
          eventKind: 'UNKNOWN_RECOVERED_UNACCEPTED',
          happenedAt,
          sourceId: input.attemptId,
          sourceType: 'ATTEMPT',
          creatorId: String(locked.enrollment.creatorId),
          reason: String(locked.attempt.safeOutcomeReason),
        },
      );
    }
    return { status: 'HELD' };
  }

  async reconcileUnknownInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
  ): Promise<{ status: 'UNKNOWN' | 'EXACT_REPLAY' }> {
    const locked = await this.lockAttemptGraphInTransaction(input, manager);
    if (locked !== null && locked.occurrence.state === 'UNKNOWN')
      return { status: 'EXACT_REPLAY' };
    if (locked === null || locked.attempt.attemptState !== 'UNKNOWN')
      throw new Error('Unknown Campaign evidence is unavailable');
    const changed = rows(
      await runnerOf(manager).query(
        `UPDATE core."campaignOccurrence" SET state='UNKNOWN', "holdReason"=NULL,
          "terminalReason"=NULL, "terminalAt"=NULL, "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state='IN_FLIGHT' RETURNING "updatedAt"`,
        [input.occurrenceId],
      ),
    );
    if (changed.length !== 1)
      throw new Error('Unknown Campaign occurrence CAS failed');
    const happenedAt = new Date(
      String(locked.attempt.updatedAt ?? changed[0].updatedAt),
    ).toISOString();
    await this.timelineEventWriter?.writeInTransaction(
      {
        manager,
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
      },
      {
        businessEventKey: `attempt:${input.attemptId}:UNKNOWN`,
        eventKind: 'UNKNOWN',
        happenedAt,
        sourceId: input.attemptId,
        sourceType: 'ATTEMPT',
        creatorId: String(locked.enrollment.creatorId),
        reason: 'PROVIDER_OUTCOME_UNCONFIRMED',
      },
    );
    return { status: 'UNKNOWN' };
  }

  async cancelBeforeSubmissionInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      occurrenceId: string;
      reason: Extract<
        CampaignOccurrenceTerminalReason,
        | 'CAMPAIGN_PAUSED'
        | 'CAMPAIGN_COMPLETED'
        | 'AUTHORIZATION_REVOKED'
        | 'ENROLLMENT_REPLIED'
      >;
    },
    manager: WorkspaceEntityManager,
  ): Promise<{
    status:
      | 'CANCELLED'
      | 'BLOCKED_RESERVED'
      | 'PROCESSING_IN_FLIGHT'
      | 'EXACT_REPLAY';
  }> {
    if (!CAMPAIGN_OCCURRENCE_TERMINAL_REASONS.includes(input.reason))
      throw new Error('Invalid Campaign occurrence terminal reason');
    if (
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.campaignId) ||
      !isCanonicalUuid(input.occurrenceId)
    )
      return { status: 'EXACT_REPLAY' };
    const runner = runnerOf(manager);
    const workspace = rows(
      await runner.query(
        `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      ),
    );
    if (workspace.length !== 1) return { status: 'EXACT_REPLAY' };
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [input.workspaceId, input.campaignId],
    );
    const campaign = rows(
      await runner.query(
        `SELECT id FROM "${getWorkspaceSchemaName(input.workspaceId)}".campaign WHERE id=$1 FOR UPDATE`,
        [input.campaignId],
      ),
    );
    if (campaign.length !== 1) return { status: 'EXACT_REPLAY' };
    const coordinate = rows(
      await runner.query(
        `SELECT "enrollmentId" FROM core."campaignOccurrence" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3`,
        [input.occurrenceId, input.workspaceId, input.campaignId],
      ),
    );
    if (coordinate.length !== 1) return { status: 'EXACT_REPLAY' };
    const enrollment = rows(
      await runner.query(
        `SELECT id FROM core."campaignEnrollment" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3 FOR UPDATE`,
        [coordinate[0].enrollmentId, input.workspaceId, input.campaignId],
      ),
    );
    if (enrollment.length !== 1) return { status: 'EXACT_REPLAY' };
    const occurrence = rows(
      await runner.query(
        `SELECT * FROM core."campaignOccurrence" WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3 AND "enrollmentId"=$4 FOR UPDATE`,
        [
          input.occurrenceId,
          input.workspaceId,
          input.campaignId,
          coordinate[0].enrollmentId,
        ],
      ),
    );
    if (occurrence.length !== 1 || occurrence[0].state === 'CANCELLED')
      return { status: 'EXACT_REPLAY' };
    const attempts = rows(
      await runner.query(
        `SELECT ${OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION}
          FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "occurrenceId"=$2 ORDER BY "attemptNumber","attemptId" FOR UPDATE`,
        [input.workspaceId, input.occurrenceId],
      ),
    );
    if (
      attempts.some((attempt) =>
        ['PROCESSING', 'UNKNOWN', 'ACCEPTED'].includes(
          String(attempt.attemptState),
        ),
      )
    )
      return { status: 'PROCESSING_IN_FLIGHT' };
    const reserved = attempts.filter(
      (attempt) => attempt.attemptState === 'RESERVED',
    );
    if (reserved.length > 0) {
      if (this.attemptService === undefined)
        return { status: 'BLOCKED_RESERVED' };
      for (const attempt of reserved) {
        const blocked =
          await this.attemptService.blockReservedAttemptBeforeProvider(
            {
              reservation: this.reservationIdentity(attempt),
              reason:
                input.reason === 'CAMPAIGN_COMPLETED'
                  ? 'CAMPAIGN_STOPPED'
                  : input.reason === 'AUTHORIZATION_REVOKED'
                    ? 'AUTHORIZATION_STALE'
                    : input.reason,
            },
            manager,
          );
        if (blocked.status !== 'RECORDED' && blocked.status !== 'EXACT_REPLAY')
          return { status: 'BLOCKED_RESERVED' };
      }
    }
    const cancelled = await this.cancelOccurrenceInTransaction(
      input.occurrenceId,
      input.reason,
      manager,
    );
    if (cancelled.status === 'CHANGED') return { status: 'CANCELLED' };
    if (cancelled.status === 'EXACT_REPLAY') return { status: 'EXACT_REPLAY' };
    throw new Error('Campaign occurrence cancellation CAS failed');
  }

  async terminalizeReplyInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      enrollmentId: string;
      inboundEvidenceId: string;
    },
    manager: WorkspaceEntityManager,
  ): Promise<{
    status: 'REPLIED' | 'PROCESSING_IN_FLIGHT' | 'EXACT_REPLAY';
  }> {
    if (
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.campaignId) ||
      !isCanonicalUuid(input.enrollmentId) ||
      !isCanonicalUuid(input.inboundEvidenceId)
    )
      return { status: 'EXACT_REPLAY' };
    const runner = runnerOf(manager);
    const workspace = rows(
      await runner.query(
        `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      ),
    );
    if (workspace.length !== 1) return { status: 'EXACT_REPLAY' };
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [input.workspaceId, input.campaignId],
    );
    const campaign = rows(
      await runner.query(
        `SELECT id FROM "${getWorkspaceSchemaName(input.workspaceId)}".campaign WHERE id=$1 FOR UPDATE`,
        [input.campaignId],
      ),
    );
    if (campaign.length !== 1) return { status: 'EXACT_REPLAY' };
    const enrollment = rows(
      await runner.query(
        `SELECT * FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2 AND id=$3 FOR UPDATE`,
        [input.workspaceId, input.campaignId, input.enrollmentId],
      ),
    );
    if (enrollment.length !== 1) return { status: 'EXACT_REPLAY' };
    if (enrollment[0].state === 'REPLIED') return { status: 'EXACT_REPLAY' };
    await runner.query(
      `SELECT id FROM core."campaignOccurrence" WHERE "workspaceId"=$1 AND "campaignId"=$2
        AND "enrollmentId"=$3 ORDER BY "authoredMessageIndex",id FOR UPDATE`,
      [input.workspaceId, input.campaignId, input.enrollmentId],
    );
    const attempts = rows(
      await runner.query(
        `SELECT a.* FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
          WHERE o."workspaceId"=$1 AND o."campaignId"=$2 AND o."enrollmentId"=$3
          ORDER BY o."authoredMessageIndex",a."attemptNumber",a."attemptId" FOR UPDATE OF a`,
        [input.workspaceId, input.campaignId, input.enrollmentId],
      ),
    );
    const processing = attempts.some((attempt) =>
      ['PROCESSING', 'UNKNOWN', 'ACCEPTED'].includes(
        String(attempt.attemptState),
      ),
    );
    const replied = rows(
      await runner.query(
        `UPDATE core."campaignEnrollment" SET state='REPLIED', "holdReason"=NULL,
          "terminalReason"='REPLY_RECEIVED', "terminalAt"=clock_timestamp(), "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state='ACTIVE' RETURNING "terminalAt"`,
        [input.enrollmentId],
      ),
    );
    if (replied.length !== 1)
      throw new Error('Campaign reply terminalization CAS failed');
    await runner.query(
      `UPDATE core."campaignOccurrence" SET state='CANCELLED', "holdReason"=NULL,
        "terminalReason"='ENROLLMENT_REPLIED', "terminalAt"=$2, "updatedAt"=clock_timestamp()
        WHERE "enrollmentId"=$1 AND state IN ('PENDING','HELD')`,
      [input.enrollmentId, replied[0].terminalAt],
    );
    const happenedAt = new Date(String(replied[0].terminalAt)).toISOString();
    await this.timelineEventWriter?.writeInTransaction(
      { manager, workspaceId: input.workspaceId, campaignId: input.campaignId },
      {
        businessEventKey: `reply:${input.inboundEvidenceId}`,
        eventKind: 'REPLIED',
        happenedAt,
        sourceId: input.inboundEvidenceId,
        sourceType: 'MESSAGE',
        creatorId: String(enrollment[0].creatorId),
        messageId: input.inboundEvidenceId,
      },
    );
    return { status: processing ? 'PROCESSING_IN_FLIGHT' : 'REPLIED' };
  }

  async tryCompleteCampaignInTransaction(
    input: { workspaceId: string; campaignId: string },
    manager: WorkspaceEntityManager,
  ): Promise<{ status: 'COMPLETED' | 'NOT_COMPLETE' | 'EXACT_REPLAY' }> {
    if (
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.campaignId)
    )
      return { status: 'NOT_COMPLETE' };
    const runner = runnerOf(manager);
    const workspace = rows(
      await runner.query(
        `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      ),
    );
    if (workspace.length !== 1) return { status: 'NOT_COMPLETE' };
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [input.workspaceId, input.campaignId],
    );
    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    const campaign = rows(
      await runner.query(
        `SELECT id, "lifecycleStatus" FROM "${schemaName}".campaign WHERE id=$1 FOR UPDATE`,
        [input.campaignId],
      ),
    );
    if (campaign.length !== 1) return { status: 'NOT_COMPLETE' };
    if (campaign[0].lifecycleStatus === 'COMPLETED')
      return { status: 'EXACT_REPLAY' };
    if (campaign[0].lifecycleStatus !== 'ACTIVE')
      return { status: 'NOT_COMPLETE' };
    if (
      !(await this.canCompleteInTransaction(
        input.workspaceId,
        input.campaignId,
        manager,
      ))
    )
      return { status: 'NOT_COMPLETE' };
    await runner.query(
      `UPDATE "${schemaName}".campaign SET "lifecycleStatus"='COMPLETED', "updatedAt"=clock_timestamp() WHERE id=$1`,
      [input.campaignId],
    );
    await runner.query(
      `UPDATE core."campaignSequenceAuthorization" SET state='REVOKED', "revocationReason"='CAMPAIGN_COMPLETED',
        "revokedAt"=clock_timestamp(), "updatedAt"=clock_timestamp()
        WHERE "workspaceId"=$1 AND "campaignId"=$2 AND state='ACTIVE'`,
      [input.workspaceId, input.campaignId],
    );
    return { status: 'COMPLETED' };
  }

  async inspectDispatchableReservationInTransaction(
    attemptId: string,
    manager: EntityManager,
  ): Promise<
    { status: 'DISPATCHABLE_REPLAY' } | { status: 'NOT_DISPATCHABLE' }
  > {
    const result = rows(
      await runnerOf(manager).query(
        `SELECT a."attemptId"
           FROM core."outboundEmailAttempt" a
           JOIN core."campaignOccurrence" o
             ON o."workspaceId"=a."workspaceId" AND o.id=a."occurrenceId"
           JOIN core."campaignOutboundRender" r
             ON r."attemptId"=a."attemptId" AND r."workspaceId"=a."workspaceId"
            AND r."renderDigest"=a."renderDigest"
          WHERE a."attemptId"=$1 AND a.source='CAMPAIGN_SEQUENCE'
            AND a."attemptState"='RESERVED' AND a."capacityState"='RESERVED'
            AND o.state='IN_FLIGHT'
            AND clock_timestamp() + interval '30 seconds' < a."unknownAfter"
          FOR UPDATE OF o, a`,
        [attemptId],
      ),
    );
    return result.length === 1
      ? { status: 'DISPATCHABLE_REPLAY' }
      : { status: 'NOT_DISPATCHABLE' };
  }

  async holdOccurrenceInTransaction(
    occurrenceId: string,
    reason: CampaignOccurrenceHoldReason,
    manager: EntityManager,
  ): Promise<CampaignProgressionTransitionResult> {
    if (!CAMPAIGN_OCCURRENCE_HOLD_REASONS.includes(reason))
      throw new Error('Invalid Campaign occurrence hold reason');
    const runner = runnerOf(manager);
    const occurrence = rows(
      await runner.query(
        `SELECT id, "enrollmentId", state, "holdReason" FROM core."campaignOccurrence" WHERE id=$1 FOR UPDATE`,
        [occurrenceId],
      ),
    );
    if (occurrence.length !== 1) return { status: 'NOT_FOUND' };
    if (occurrence[0].state === 'HELD' && occurrence[0].holdReason === reason)
      return { status: 'EXACT_REPLAY' };
    if (
      !['PENDING', 'IN_FLIGHT', 'UNKNOWN', 'HELD'].includes(
        String(occurrence[0].state),
      )
    )
      return { status: 'STATE_CONFLICT' };
    return (await this.holdOccurrenceAndEnrollment(
      occurrenceId,
      String(occurrence[0].enrollmentId),
      reason,
      runner,
    ))
      ? { status: 'CHANGED' }
      : { status: 'STATE_CONFLICT' };
  }

  async cancelOccurrenceInTransaction(
    occurrenceId: string,
    reason: CampaignOccurrenceTerminalReason,
    manager: EntityManager,
  ): Promise<CampaignProgressionTransitionResult> {
    if (!CAMPAIGN_OCCURRENCE_TERMINAL_REASONS.includes(reason))
      throw new Error('Invalid Campaign occurrence terminal reason');
    const runner = runnerOf(manager);
    const locked = rows(
      await runner.query(
        `SELECT o.id,o.state,o."terminalReason",o."workspaceId",o."campaignId",e."creatorId"
           FROM core."campaignOccurrence" o
           JOIN core."campaignEnrollment" e ON e.id=o."enrollmentId"
          WHERE o.id=$1 FOR UPDATE OF o`,
        [occurrenceId],
      ),
    );
    if (locked.length !== 1) return { status: 'NOT_FOUND' };
    if (!['PENDING', 'IN_FLIGHT', 'HELD'].includes(String(locked[0].state)))
      return locked[0].state === 'CANCELLED' &&
        locked[0].terminalReason === reason
        ? { status: 'EXACT_REPLAY' }
        : { status: 'STATE_CONFLICT' };
    const changed = rows(
      await runner.query(
        `UPDATE core."campaignOccurrence" SET state='CANCELLED', "holdReason"=NULL,
                "terminalReason"=$2, "terminalAt"=clock_timestamp(), "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state IN ('PENDING','IN_FLIGHT','HELD') RETURNING "terminalAt"`,
        [occurrenceId, reason],
      ),
    );
    if (changed.length !== 1) return { status: 'STATE_CONFLICT' };
    await this.writeTerminalTimelineEvent(manager, {
      workspaceId: String(locked[0].workspaceId),
      campaignId: String(locked[0].campaignId),
      creatorId: String(locked[0].creatorId),
      sourceId: occurrenceId,
      sourceType: 'OCCURRENCE',
      terminalAt: changed[0].terminalAt,
      reason,
    });
    return { status: 'CHANGED' };
  }

  async markUnknownInTransaction(
    occurrenceId: string,
    manager: EntityManager,
  ): Promise<CampaignProgressionTransitionResult> {
    return this.transitionOccurrence(
      occurrenceId,
      `state='UNKNOWN', "holdReason"=NULL, "terminalReason"=NULL, "terminalAt"=NULL`,
      [],
      ['IN_FLIGHT'],
      (row) => row.state === 'UNKNOWN',
      manager,
    );
  }

  async excludeEnrollmentInTransaction(
    enrollmentId: string,
    reason: CampaignEnrollmentTerminalReason,
    manager: EntityManager,
  ): Promise<CampaignProgressionTransitionResult> {
    if (!CAMPAIGN_ENROLLMENT_TERMINAL_REASONS.includes(reason))
      throw new Error('Invalid Campaign enrollment terminal reason');
    const runner = runnerOf(manager);
    const locked = rows(
      await runner.query(
        `SELECT id,state,"terminalReason","workspaceId","campaignId","creatorId"
           FROM core."campaignEnrollment" WHERE id=$1 FOR UPDATE`,
        [enrollmentId],
      ),
    );
    if (locked.length !== 1) return { status: 'NOT_FOUND' };
    if (locked[0].state === 'EXCLUDED' && locked[0].terminalReason === reason)
      return { status: 'EXACT_REPLAY' };
    if (locked[0].state !== 'ACTIVE') return { status: 'STATE_CONFLICT' };
    const changed = rows(
      await runner.query(
        `UPDATE core."campaignEnrollment" SET state='EXCLUDED', "holdReason"=NULL,
                "terminalReason"=$2, "terminalAt"=clock_timestamp(), "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state='ACTIVE' RETURNING "terminalAt"`,
        [enrollmentId, reason],
      ),
    );
    if (changed.length !== 1) return { status: 'STATE_CONFLICT' };
    await this.writeTerminalTimelineEvent(manager, {
      workspaceId: String(locked[0].workspaceId),
      campaignId: String(locked[0].campaignId),
      creatorId: String(locked[0].creatorId),
      sourceId: enrollmentId,
      sourceType: 'ENROLLMENT',
      terminalAt: changed[0].terminalAt,
      reason,
    });
    return { status: 'CHANGED' };
  }

  private async writeTerminalTimelineEvent(
    manager: EntityManager,
    input: {
      workspaceId: string;
      campaignId: string;
      creatorId: string;
      sourceId: string;
      sourceType: 'ENROLLMENT' | 'OCCURRENCE';
      terminalAt: unknown;
      reason:
        | CampaignEnrollmentTerminalReason
        | CampaignOccurrenceTerminalReason;
    },
  ): Promise<void> {
    if (this.timelineEventWriter === undefined) return;
    const happenedAt = new Date(String(input.terminalAt)).toISOString();
    await this.timelineEventWriter.writeInTransaction(
      {
        manager: manager as WorkspaceEntityManager,
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
      },
      {
        businessEventKey: `terminal:${input.sourceType.toLowerCase()}:${input.sourceId}:${happenedAt}:${input.reason}`,
        eventKind: 'TERMINAL',
        happenedAt,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        creatorId: input.creatorId,
        reason: input.reason,
      },
    );
  }

  private async writeAcceptedTimelineEvents(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
    attempt: Record<string, unknown>,
    acceptedAt: Date,
    wasUnknown: boolean,
  ): Promise<void> {
    const context = {
      manager,
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
    };
    const event = {
      happenedAt: acceptedAt.toISOString(),
      sourceId: input.attemptId,
      sourceType: 'ATTEMPT' as const,
      creatorId: String(attempt.creatorId),
      messageId: String(attempt.projectedMessageId),
      messageThreadId: String(attempt.projectedMessageThreadId),
    };
    await this.timelineEventWriter?.writeInTransaction(context, {
      ...event,
      businessEventKey: `attempt:${input.attemptId}:MESSAGE_ACCEPTED`,
      eventKind: 'MESSAGE_ACCEPTED',
    });
    if (wasUnknown)
      await this.timelineEventWriter?.writeInTransaction(context, {
        ...event,
        businessEventKey: `attempt:${input.attemptId}:UNKNOWN_RECOVERED_ACCEPTED`,
        eventKind: 'UNKNOWN_RECOVERED_ACCEPTED',
      });
  }

  private async reconcileAcceptedWithSnapshotInTransaction(
    input: CampaignAcceptedProgressionInput,
    manager: EntityManager,
  ): Promise<CampaignProgressionTransitionResult> {
    const runner = runnerOf(manager);
    // The enclosing coordinator owns workspace/Campaign/authorization locks.
    // This method's canonical row order is enrollment -> occurrence -> attempts -> Campaign Creator.
    const enrollmentRows = rows(
      await runner.query(
        `SELECT * FROM core."campaignEnrollment"
          WHERE "workspaceId"=$1 AND "campaignId"=$2 AND id=$3 FOR UPDATE`,
        [input.workspaceId, input.campaignId, input.enrollmentId],
      ),
    );
    if (enrollmentRows.length !== 1) return { status: 'NOT_FOUND' };
    const occurrenceRows = rows(
      await runner.query(
        `SELECT * FROM core."campaignOccurrence"
          WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "enrollmentId"=$3 AND id=$4 FOR UPDATE`,
        [
          input.workspaceId,
          input.campaignId,
          input.enrollmentId,
          input.occurrenceId,
        ],
      ),
    );
    if (occurrenceRows.length !== 1) return { status: 'NOT_FOUND' };
    const attempts = rows(
      await runner.query(
        `SELECT ${OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION}
          FROM core."outboundEmailAttempt"
          WHERE "workspaceId"=$1 AND "occurrenceId"=$2
          ORDER BY "attemptNumber", "attemptId" FOR UPDATE`,
        [input.workspaceId, input.occurrenceId],
      ),
    );
    const accepted = attempts.filter(
      (attempt) =>
        attempt.attemptId === input.attemptId &&
        attempt.attemptState === 'ACCEPTED' &&
        typeof attempt.projectedMessageId === 'string' &&
        typeof attempt.projectedMessageThreadId === 'string',
    );
    if (accepted.length !== 1) return { status: 'STATE_CONFLICT' };
    const occurrence = occurrenceRows[0];
    const enrollment = enrollmentRows[0];
    if (
      occurrence.state === 'SUCCEEDED' &&
      Number(enrollment.nextAuthoredMessageIndex) >
        input.acceptedAuthoredMessageIndex
    )
      return { status: 'EXACT_REPLAY' };
    if (!['IN_FLIGHT', 'UNKNOWN'].includes(String(occurrence.state)))
      return { status: 'STATE_CONFLICT' };
    if (
      enrollment.state === 'ACTIVE' &&
      Number(enrollment.nextAuthoredMessageIndex) !==
        input.acceptedAuthoredMessageIndex
    )
      return { status: 'STATE_CONFLICT' };

    const succeeded = rows(
      await runner.query(
        `UPDATE core."campaignOccurrence" SET state='SUCCEEDED', "holdReason"=NULL,
                "terminalReason"='PROVIDER_ACCEPTED', "terminalAt"=$2, "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state IN ('IN_FLIGHT','UNKNOWN') RETURNING id`,
        [input.occurrenceId, input.acceptedAt],
      ),
    );
    if (succeeded.length !== 1) return { status: 'STATE_CONFLICT' };

    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    await runner.query(
      `UPDATE "${schemaName}"."campaignCreator"
          SET stage='CONTACTED', "updatedAt"=clock_timestamp()
        WHERE id=$1 AND "campaignId"=$2 AND stage='READY' AND "deletedAt" IS NULL`,
      [input.campaignCreatorId, input.campaignId],
    );

    if (enrollment.state !== 'ACTIVE') return { status: 'CHANGED' };
    const nextIndex = input.acceptedAuthoredMessageIndex + 1;
    if (input.nextOccurrence === null) {
      const finished = rows(
        await runner.query(
          `UPDATE core."campaignEnrollment" SET state='FINISHED', "nextAuthoredMessageIndex"="authoredMessageCount",
                  "holdReason"=NULL, "terminalReason"='SEQUENCE_COMPLETED', "terminalAt"=$2,
                  "updatedAt"=clock_timestamp()
            WHERE id=$1 AND state='ACTIVE' AND "nextAuthoredMessageIndex"=$3 RETURNING "terminalAt"`,
          [
            input.enrollmentId,
            input.acceptedAt,
            input.acceptedAuthoredMessageIndex,
          ],
        ),
      );
      if (finished.length !== 1) return { status: 'STATE_CONFLICT' };
      await this.writeTerminalTimelineEvent(manager, {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        creatorId: String(enrollment.creatorId),
        sourceId: input.enrollmentId,
        sourceType: 'ENROLLMENT',
        terminalAt: finished[0].terminalAt,
        reason: 'SEQUENCE_COMPLETED',
      });
      return { status: 'CHANGED' };
    }
    if (input.nextOccurrence.authoredMessageIndex !== nextIndex)
      throw new Error('Next Campaign occurrence index is not contiguous');
    const advanced = rows(
      await runner.query(
        `UPDATE core."campaignEnrollment" SET "nextAuthoredMessageIndex"=$2, "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state='ACTIVE' AND "nextAuthoredMessageIndex"=$3 RETURNING id`,
        [input.enrollmentId, nextIndex, input.acceptedAuthoredMessageIndex],
      ),
    );
    if (advanced.length !== 1) return { status: 'STATE_CONFLICT' };
    const inserted = rows(
      await runner.query(
        `INSERT INTO core."campaignOccurrence" (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt","holdReason","terminalReason","terminalAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,NULL,NULL,NULL,clock_timestamp(),clock_timestamp())
       ON CONFLICT ("enrollmentId","authoredMessageIndex") DO NOTHING RETURNING id`,
        [
          input.nextOccurrence.occurrenceId,
          input.workspaceId,
          input.campaignId,
          input.enrollmentId,
          input.nextOccurrence.workflowVersionId,
          input.nextOccurrence.messageId,
          input.nextOccurrence.authoredMessageIndex,
          input.nextOccurrence.dueAt,
        ],
      ),
    );
    if (inserted.length === 0) {
      const replay = rows(
        await runner.query(
          `SELECT id, "workflowVersionId", "messageId", "dueAt" FROM core."campaignOccurrence"
            WHERE "enrollmentId"=$1 AND "authoredMessageIndex"=$2`,
          [input.enrollmentId, input.nextOccurrence.authoredMessageIndex],
        ),
      );
      if (
        replay.length !== 1 ||
        replay[0].id !== input.nextOccurrence.occurrenceId ||
        replay[0].workflowVersionId !==
          input.nextOccurrence.workflowVersionId ||
        replay[0].messageId !== input.nextOccurrence.messageId ||
        new Date(String(replay[0].dueAt)).getTime() !==
          input.nextOccurrence.dueAt.getTime()
      )
        throw new Error('Next Campaign occurrence identity collision');
    }
    return { status: 'CHANGED' };
  }

  private async lockAttemptGraphInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: EntityManager,
  ): Promise<null | {
    campaign: Record<string, unknown>;
    authorization: Record<string, unknown>;
    activation: Record<string, unknown>;
    enrollment: Record<string, unknown>;
    occurrence: Record<string, unknown>;
    attempt: Record<string, unknown>;
  }> {
    if (
      ![
        input.workspaceId,
        input.campaignId,
        input.campaignExecutionId,
        input.authorizationId,
        input.activationId,
        input.workflowVersionId,
        input.enrollmentId,
        input.occurrenceId,
        input.connectedAccountId,
        input.messageChannelId,
        input.attemptId,
      ].every(isCanonicalUuid) ||
      !Number.isSafeInteger(input.authorizationGeneration) ||
      input.authorizationGeneration < 1
    )
      return null;
    const runner = runnerOf(manager);
    const workspace = rows(
      await runner.query(
        `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      ),
    );
    if (workspace.length !== 1) return null;
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [input.workspaceId, input.campaignId],
    );
    const campaign = rows(
      await runner.query(
        `SELECT id,"lifecycleStatus","sequenceAuthorization" FROM "${getWorkspaceSchemaName(input.workspaceId)}".campaign WHERE id=$1 FOR UPDATE`,
        [input.campaignId],
      ),
    );
    if (campaign.length !== 1) return null;
    const authorization = rows(
      await runner.query(
        `SELECT * FROM core."campaignSequenceAuthorization"
          WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "campaignExecutionId"=$3
            AND "authorizationId"=$4 AND generation=$5 AND "workflowVersionId"=$6 FOR UPDATE`,
        [
          input.workspaceId,
          input.campaignId,
          input.campaignExecutionId,
          input.authorizationId,
          input.authorizationGeneration,
          input.workflowVersionId,
        ],
      ),
    );
    if (authorization.length !== 1) return null;
    const activation = rows(
      await runner.query(
        `SELECT * FROM core."campaignActivation"
          WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3 AND "campaignExecutionId"=$4
            AND "authorizationId"=$5 AND "authorizationGeneration"=$6 AND "workflowVersionId"=$7 FOR UPDATE`,
        [
          input.activationId,
          input.workspaceId,
          input.campaignId,
          input.campaignExecutionId,
          input.authorizationId,
          input.authorizationGeneration,
          input.workflowVersionId,
        ],
      ),
    );
    if (activation.length !== 1) return null;
    const enrollment = rows(
      await runner.query(
        `SELECT * FROM core."campaignEnrollment"
          WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3 AND "campaignExecutionId"=$4
            AND "authorizationId"=$5 AND "authorizationGeneration"=$6 FOR UPDATE`,
        [
          input.enrollmentId,
          input.workspaceId,
          input.campaignId,
          input.campaignExecutionId,
          input.authorizationId,
          input.authorizationGeneration,
        ],
      ),
    );
    if (enrollment.length !== 1) return null;
    const occurrence = rows(
      await runner.query(
        `SELECT * FROM core."campaignOccurrence"
          WHERE id=$1 AND "workspaceId"=$2 AND "campaignId"=$3 AND "enrollmentId"=$4
            AND "workflowVersionId"=$5 FOR UPDATE`,
        [
          input.occurrenceId,
          input.workspaceId,
          input.campaignId,
          input.enrollmentId,
          input.workflowVersionId,
        ],
      ),
    );
    if (occurrence.length !== 1) return null;
    for (const key of campaignMailboxAdvisoryKeys({
      workspaceId: input.workspaceId,
      connectedAccountId: input.connectedAccountId,
      messageChannelIds: [input.messageChannelId],
    })) {
      await runner.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [key],
      );
    }
    const attempts = rows(
      await runner.query(
        `SELECT ${OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION}
          FROM core."outboundEmailAttempt"
          WHERE "workspaceId"=$1 AND "occurrenceId"=$2
          ORDER BY "attemptNumber","attemptId" FOR UPDATE`,
        [input.workspaceId, input.occurrenceId],
      ),
    );
    const exact = attempts.filter(
      (attempt) =>
        attempt.attemptId === input.attemptId &&
        attempt.campaignId === input.campaignId &&
        attempt.enrollmentId === input.enrollmentId &&
        attempt.authorizationId === input.authorizationId &&
        attempt.workflowVersionId === input.workflowVersionId &&
        attempt.connectedAccountId === input.connectedAccountId &&
        attempt.messageChannelId === input.messageChannelId,
    );
    return exact.length === 1
      ? {
          campaign: campaign[0],
          authorization: authorization[0],
          activation: activation[0],
          enrollment: enrollment[0],
          occurrence: occurrence[0],
          attempt: exact[0],
        }
      : null;
  }

  async canCompleteInTransaction(
    workspaceId: string,
    campaignId: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const result = rows(
      await runnerOf(manager).query(
        `SELECT
          EXISTS (SELECT 1 FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS "hasEnrollments",
          NOT EXISTS (SELECT 1 FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2 AND (state NOT IN ('REPLIED','EXCLUDED','FINISHED') OR "holdReason" IS NOT NULL)) AS "enrollmentsTerminal",
          NOT EXISTS (SELECT 1 FROM core."campaignOccurrence" WHERE "workspaceId"=$1 AND "campaignId"=$2 AND state IN ('PENDING','IN_FLIGHT','HELD','UNKNOWN')) AS "occurrencesResolved",
          NOT EXISTS (SELECT 1 FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "campaignId"=$2
            AND ("attemptState" IN ('RESERVED','PROCESSING','UNKNOWN')
              OR (source='CAMPAIGN_SEQUENCE' AND "attemptState"='ACCEPTED'
                AND ("projectedMessageId" IS NULL OR "projectedMessageThreadId" IS NULL)))) AS "attemptsResolved"`,
        [workspaceId, campaignId],
      ),
    );
    return (
      result.length === 1 &&
      result[0].hasEnrollments === true &&
      result[0].enrollmentsTerminal === true &&
      result[0].occurrencesResolved === true &&
      result[0].attemptsResolved === true
    );
  }

  private async deferOccurrenceAndRecoverEnrollment(
    input: {
      occurrenceId: string;
      enrollmentId: string;
      workspaceId: string;
      campaignId: string;
      creatorId: string;
      recoveringHoldReason: CampaignOccurrenceHoldReason | null;
      nextDueAt: Date;
    },
    manager: WorkspaceEntityManager,
  ): Promise<boolean> {
    const runner = runnerOf(manager);
    const changed = rows(
      await runner.query(
        `UPDATE core."campaignOccurrence" SET state='PENDING', "dueAt"=$2, "holdReason"=NULL,
          "terminalReason"=NULL, "terminalAt"=NULL, "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state IN ('PENDING','HELD') RETURNING "updatedAt"`,
        [input.occurrenceId, input.nextDueAt],
      ),
    );
    if (changed.length !== 1) return false;
    await runner.query(
      `UPDATE core."campaignEnrollment" SET "holdReason"=NULL,"updatedAt"=clock_timestamp()
        WHERE id=$1 AND state='ACTIVE' AND "holdReason" IS NOT NULL`,
      [input.enrollmentId],
    );
    if (input.recoveringHoldReason !== null) {
      const happenedAt = new Date(String(changed[0].updatedAt)).toISOString();
      await this.timelineEventWriter?.writeInTransaction(
        {
          manager,
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
        },
        {
          businessEventKey: `hold-recovery:${input.occurrenceId}:${happenedAt}:${input.recoveringHoldReason}`,
          eventKind: 'HOLD_RECOVERED',
          happenedAt,
          sourceId: input.occurrenceId,
          sourceType: 'OCCURRENCE',
          creatorId: input.creatorId,
          reason: input.recoveringHoldReason,
        },
      );
    }
    return true;
  }

  private async holdOccurrenceAndEnrollment(
    occurrenceId: string,
    enrollmentId: string,
    reason: CampaignOccurrenceHoldReason,
    runner: QueryRunner,
  ): Promise<boolean> {
    const changed = rows(
      await runner.query(
        `UPDATE core."campaignOccurrence" SET state='HELD', "holdReason"=$2,
          "terminalReason"=NULL, "terminalAt"=NULL, "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state IN ('PENDING','IN_FLIGHT','UNKNOWN','HELD')
            AND (state <> 'HELD' OR "holdReason" IS DISTINCT FROM $2)
          RETURNING "workspaceId", "campaignId", "enrollmentId", "updatedAt"`,
        [occurrenceId, reason],
      ),
    );
    await runner.query(
      `UPDATE core."campaignEnrollment" SET "holdReason"=$2, "updatedAt"=clock_timestamp()
        WHERE id=$1 AND state='ACTIVE' AND "holdReason" IS DISTINCT FROM $2`,
      [enrollmentId, reason],
    );
    if (changed.length !== 1) return false;
    if (this.timelineEventWriter === undefined) return true;
    const creator = rows(
      await runner.query(
        `SELECT "creatorId" FROM core."campaignEnrollment" WHERE id=$1`,
        [enrollmentId],
      ),
    );
    const happenedAt = new Date(String(changed[0].updatedAt)).toISOString();
    await this.timelineEventWriter.writeInTransaction(
      {
        manager: runner.manager as WorkspaceEntityManager,
        workspaceId: String(changed[0].workspaceId),
        campaignId: String(changed[0].campaignId),
      },
      {
        businessEventKey: `hold:${occurrenceId}:${happenedAt}:${reason}`,
        eventKind: 'HELD',
        happenedAt,
        sourceId: occurrenceId,
        sourceType: 'OCCURRENCE',
        creatorId:
          creator.length === 1 ? String(creator[0].creatorId) : undefined,
        reason,
      },
    );
    return true;
  }

  private async transitionOccurrence(
    occurrenceId: string,
    assignment: string,
    parameters: unknown[],
    fromStates: string[],
    isExactReplay: (row: Record<string, unknown>) => boolean,
    manager: EntityManager,
  ): Promise<CampaignProgressionTransitionResult> {
    const runner = runnerOf(manager);
    const locked = rows(
      await runner.query(
        `SELECT id, state, "holdReason", "terminalReason" FROM core."campaignOccurrence" WHERE id=$1 FOR UPDATE`,
        [occurrenceId],
      ),
    );
    if (locked.length !== 1) return { status: 'NOT_FOUND' };
    if (!fromStates.includes(String(locked[0].state)))
      return isExactReplay(locked[0])
        ? { status: 'EXACT_REPLAY' }
        : { status: 'STATE_CONFLICT' };
    const statePlaceholders = fromStates
      .map((_, index) => `$${parameters.length + index + 2}`)
      .join(',');
    const changed = rows(
      await runner.query(
        `UPDATE core."campaignOccurrence" SET ${assignment}, "updatedAt"=clock_timestamp()
          WHERE id=$1 AND state IN (${statePlaceholders}) RETURNING id`,
        [occurrenceId, ...parameters, ...fromStates],
      ),
    );
    return changed.length === 1
      ? { status: 'CHANGED' }
      : { status: 'STATE_CONFLICT' };
  }
}
