import { Injectable } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

import { campaignMailboxAdvisoryKeys } from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';
import {
  type FinalSubmissionAuthorityRevalidationResult,
  type FinalSubmissionAuthorityRevalidator,
} from 'src/modules/campaign-execution/types/outbound-email-dispatch.type';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { normalizeCampaignCreatorEmail } from 'src/modules/myah-outreach/utils/normalize-campaign-creator-email.util';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);
const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];
const activeRunner = (manager: EntityManager): QueryRunner => {
  const runner = manager.queryRunner;
  if (
    !runner?.isTransactionActive ||
    runner.isReleased ||
    runner.manager !== manager
  )
    throw new Error(
      'Campaign final authority requires the supplied active manager',
    );
  return runner;
};
const reject = (
  reason: Extract<
    FinalSubmissionAuthorityRevalidationResult,
    { status: 'REJECTED' }
  >['reason'],
): FinalSubmissionAuthorityRevalidationResult => ({
  status: 'REJECTED',
  reason,
});
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const exactArray = (left: unknown, right: readonly unknown[]): boolean =>
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
const recipient = (value: string | string[]): string | null => {
  const values = Array.isArray(value) ? value : [value];
  return values.length === 1 ? normalizeCampaignCreatorEmail(values[0]) : null;
};

@Injectable()
export class CampaignFinalSubmissionAuthorityAdapter implements FinalSubmissionAuthorityRevalidator {
  constructor(
    private readonly audience: CampaignOutreachAudienceReviewService,
    private readonly senderReadiness: CampaignSenderReadinessService,
    private readonly sequence: CampaignSequenceService,
  ) {}

  async revalidate(
    input: Parameters<FinalSubmissionAuthorityRevalidator['revalidate']>[0],
    manager: EntityManager,
  ): Promise<FinalSubmissionAuthorityRevalidationResult> {
    if (
      input.kind !== 'CAMPAIGN_SEQUENCE_FINAL' ||
      input.submission.source !== 'CAMPAIGN_SEQUENCE'
    )
      return reject('DISPATCH_CONTRACT_CONFLICT');
    const submission = input.submission;
    if (
      ![
        submission.workspaceId,
        submission.campaignId,
        submission.campaignExecutionId,
        submission.authorizationId,
        submission.activationId,
        submission.workflowVersionId,
        submission.enrollmentId,
        submission.occurrenceId,
        submission.connectedAccountId,
        submission.messageChannelId,
        submission.attemptId,
        submission.messageId,
      ].every(isUuid) ||
      !Number.isSafeInteger(submission.authorizationGeneration) ||
      submission.authorizationGeneration < 1
    )
      return reject('DISPATCH_CONTRACT_CONFLICT');

    const runner = activeRunner(manager);
    const workspace = records(
      await runner.query(
        `SELECT "activationStatus","suspendedAt","deletedAt" FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [submission.workspaceId],
      ),
    );
    if (
      workspace.length !== 1 ||
      workspace[0].activationStatus !== 'ACTIVE' ||
      workspace[0].suspendedAt !== null ||
      workspace[0].deletedAt !== null
    )
      return reject('WORKSPACE_NOT_ACTIVE');

    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [submission.workspaceId, submission.campaignId],
    );
    const schemaName = getWorkspaceSchemaName(submission.workspaceId);
    const campaign = records(
      await runner.query(
        `SELECT id,"lifecycleStatus","sequenceAuthorization" FROM "${schemaName}".campaign WHERE id=$1 FOR UPDATE`,
        [submission.campaignId],
      ),
    );
    if (campaign.length !== 1) return reject('CAMPAIGN_STOPPED');
    if (campaign[0].lifecycleStatus === 'PAUSED')
      return reject('CAMPAIGN_PAUSED');
    if (campaign[0].lifecycleStatus !== 'ACTIVE')
      return reject('CAMPAIGN_STOPPED');

    const authorization = records(
      await runner.query(
        `SELECT * FROM core."campaignSequenceAuthorization"
          WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "campaignExecutionId"=$3
            AND "authorizationId"=$4 AND generation=$5 AND "workflowVersionId"=$6 FOR UPDATE`,
        [
          submission.workspaceId,
          submission.campaignId,
          submission.campaignExecutionId,
          submission.authorizationId,
          submission.authorizationGeneration,
          submission.workflowVersionId,
        ],
      ),
    );
    if (authorization.length !== 1 || authorization[0].state !== 'ACTIVE')
      return reject('AUTHORIZATION_STALE');
    const projection = object(campaign[0].sequenceAuthorization);
    if (
      projection?.authorizationId !== submission.authorizationId ||
      projection.generation !== submission.authorizationGeneration ||
      projection.workflowVersionId !== submission.workflowVersionId ||
      projection.state !== 'ACTIVE' ||
      projection.preparedFingerprint !== authorization[0].preparedFingerprint
    )
      return reject('AUTHORIZATION_STALE');

    const binding = object(authorization[0].binding);
    const request = object(binding?.request);
    const proof = object(request?.preparedProof);
    if (
      binding?.campaignExecutionId !== submission.campaignExecutionId ||
      binding?.authorizationId !== submission.authorizationId ||
      binding?.generation !== submission.authorizationGeneration ||
      binding?.workflowVersionId !== submission.workflowVersionId ||
      proof?.preparedFingerprint !== authorization[0].preparedFingerprint
    )
      return reject('AUTHORIZATION_STALE');

    const activation = records(
      await runner.query(
        `SELECT id FROM core."campaignActivation" WHERE id=$1 AND "workspaceId"=$2
          AND "campaignId"=$3 AND "campaignExecutionId"=$4 AND "authorizationId"=$5
          AND "authorizationGeneration"=$6 AND "workflowVersionId"=$7 FOR UPDATE`,
        [
          submission.activationId,
          submission.workspaceId,
          submission.campaignId,
          submission.campaignExecutionId,
          submission.authorizationId,
          submission.authorizationGeneration,
          submission.workflowVersionId,
        ],
      ),
    );
    if (activation.length !== 1) return reject('AUTHORIZATION_STALE');

    const enrollment = records(
      await runner.query(
        `SELECT * FROM core."campaignEnrollment" WHERE id=$1 AND "workspaceId"=$2
          AND "campaignId"=$3 AND "campaignExecutionId"=$4 AND "authorizationId"=$5
          AND "authorizationGeneration"=$6 FOR UPDATE`,
        [
          submission.enrollmentId,
          submission.workspaceId,
          submission.campaignId,
          submission.campaignExecutionId,
          submission.authorizationId,
          submission.authorizationGeneration,
        ],
      ),
    );
    if (enrollment.length !== 1) return reject('AUTHORIZATION_STALE');
    if (enrollment[0].state === 'REPLIED') return reject('ENROLLMENT_REPLIED');
    if (
      enrollment[0].state !== 'ACTIVE' ||
      Number(enrollment[0].nextAuthoredMessageIndex) < 0
    )
      return reject('OCCURRENCE_CANCELLED');

    const occurrence = records(
      await runner.query(
        `SELECT * FROM core."campaignOccurrence" WHERE id=$1 AND "workspaceId"=$2
          AND "campaignId"=$3 AND "enrollmentId"=$4 AND "workflowVersionId"=$5
          AND "messageId"=$6 FOR UPDATE`,
        [
          submission.occurrenceId,
          submission.workspaceId,
          submission.campaignId,
          submission.enrollmentId,
          submission.workflowVersionId,
          submission.messageId,
        ],
      ),
    );
    if (occurrence.length !== 1 || occurrence[0].state !== 'IN_FLIGHT')
      return reject('OCCURRENCE_CANCELLED');
    if (
      Number(enrollment[0].nextAuthoredMessageIndex) !==
      Number(occurrence[0].authoredMessageIndex)
    )
      return reject('AUTHORIZATION_STALE');

    for (const key of campaignMailboxAdvisoryKeys({
      workspaceId: submission.workspaceId,
      connectedAccountId: submission.connectedAccountId,
      messageChannelIds: [submission.messageChannelId],
    }))
      await runner.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [key],
      );

    const accountAndChannel = records(
      await runner.query(
        `SELECT account.id,account.provider,account.handle,account."dailySendLimit",
                account."minimumSendIntervalMs",channel.id AS "channelId"
           FROM core."connectedAccount" account JOIN core."messageChannel" channel
             ON channel.id=$3 AND channel."connectedAccountId"=account.id AND channel."workspaceId"=account."workspaceId"
          WHERE account.id=$1 AND account."workspaceId"=$2 FOR UPDATE OF account,channel`,
        [
          submission.connectedAccountId,
          submission.workspaceId,
          submission.messageChannelId,
        ],
      ),
    );
    if (accountAndChannel.length !== 1) return reject('SENDER_NOT_READY');

    const attempts = records(
      await runner.query(
        `SELECT * FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "occurrenceId"=$2
          ORDER BY "attemptNumber","attemptId" FOR UPDATE`,
        [submission.workspaceId, submission.occurrenceId],
      ),
    );
    const exact = attempts.filter(
      (attempt) =>
        attempt.attemptId === submission.attemptId &&
        attempt.source === 'CAMPAIGN_SEQUENCE' &&
        attempt.attemptState === 'RESERVED' &&
        attempt.capacityState === 'RESERVED' &&
        attempt.campaignId === submission.campaignId &&
        attempt.enrollmentId === submission.enrollmentId &&
        attempt.authorizationId === submission.authorizationId &&
        attempt.workflowVersionId === submission.workflowVersionId &&
        attempt.messageId === submission.messageId &&
        attempt.connectedAccountId === submission.connectedAccountId &&
        attempt.messageChannelId === submission.messageChannelId &&
        attempt.provider === submission.provider &&
        attempt.normalizedSenderHandle === submission.normalizedSenderHandle &&
        attempt.normalizedRecipient === submission.normalizedRecipient &&
        attempt.renderDigest === submission.renderDigest,
    );
    if (
      exact.length !== 1 ||
      attempts.some(
        (attempt) =>
          attempt !== exact[0] &&
          ['RESERVED', 'PROCESSING', 'UNKNOWN', 'ACCEPTED'].includes(
            String(attempt.attemptState),
          ),
      )
    )
      return reject('DISPATCH_CONTRACT_CONFLICT');
    const attempt = exact[0];

    const plan = await this.sequence.loadExecutionPlanInTransaction(
      {
        workspaceId: submission.workspaceId,
        campaignId: submission.campaignId,
        workflowVersionId: submission.workflowVersionId,
      },
      manager as WorkspaceEntityManager,
    );
    if (
      plan.kind !== 'READY' ||
      !exactArray(
        proof?.orderedMessageIds,
        plan.nodes.map(({ messageId }) => messageId),
      ) ||
      plan.nodes[Number(occurrence[0].authoredMessageIndex)]?.messageId !==
        submission.messageId
    )
      return reject('MATERIAL_STALE');

    const pool =
      await this.senderReadiness.getCampaignEmailSenderPoolInTransaction(
        {
          workspaceId: submission.workspaceId,
          campaignId: submission.campaignId,
        },
        manager as WorkspaceEntityManager,
      );
    if (
      pool.senderPoolFingerprint !== attempt.senderPoolFingerprint ||
      pool.senderPoolFingerprint !== proof?.senderPoolFingerprint ||
      pool.serializationRevision !== proof?.senderPoolSerializationRevision ||
      pool.rotationPolicyId !== proof?.senderPoolRotationPolicyId
    )
      return reject('SENDER_NOT_READY');
    const selected = pool.mailboxes.find(
      (mailbox) =>
        mailbox.connectedAccountId === submission.connectedAccountId &&
        mailbox.messageChannelId === submission.messageChannelId,
    );
    if (
      selected?.status !== 'READY' ||
      selected.provider !== submission.provider ||
      selected.senderHandle !== submission.normalizedSenderHandle
    )
      return reject('SENDER_NOT_READY');

    const review = await this.audience.reviewInTransaction({
      workspaceId: submission.workspaceId,
      campaignId: submission.campaignId,
      schemaName,
      manager: manager as WorkspaceEntityManager,
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    const audience = review.eligible.find(
      (candidate) =>
        candidate.campaignCreatorId === enrollment[0].campaignCreatorId,
    );
    if (audience === undefined) {
      const excluded = review.excluded.find(
        (candidate) =>
          candidate.campaignCreatorId === enrollment[0].campaignCreatorId,
      );
      if (excluded?.reasons.includes('SUPPRESSED_EMAIL'))
        return reject('RECIPIENT_SUPPRESSED');
      if (excluded?.reasons.includes('DUPLICATE_CREATOR_EMAIL'))
        return reject('AUDIENCE_DUPLICATE');
      if (excluded?.reasons.includes('INVALID_STAGE'))
        return reject('AUDIENCE_STAGE_INVALID');
      return reject('AUDIENCE_CONTACT_INVALID');
    }
    if (
      audience.creatorId !== enrollment[0].creatorId ||
      audience.normalizedEmail !== submission.normalizedRecipient ||
      recipient(input.materialEvidence.sendMessageInput.to) !==
        submission.normalizedRecipient
    )
      return reject('AUDIENCE_CONTACT_INVALID');

    const window = records(
      await runner.query(
        `SELECT (CURRENT_TIMESTAMP AT TIME ZONE ce."timeZone")::time >= ce."startLocalTime"::time
                    AND (CURRENT_TIMESTAMP AT TIME ZONE ce."timeZone")::time < ce."endLocalTime"::time AS "insideWindow"
           FROM core."campaignExecution" ce WHERE ce.id=$1 AND ce."workspaceId"=$2 AND ce."campaignId"=$3 FOR UPDATE`,
        [
          submission.campaignExecutionId,
          submission.workspaceId,
          submission.campaignId,
        ],
      ),
    );
    if (window.length !== 1 || window[0].insideWindow !== true)
      return reject('AUTHORIZATION_STALE');

    const renders = records(
      await runner.query(
        `SELECT * FROM core."campaignOutboundRender" WHERE "attemptId"=$1 AND "workspaceId"=$2
          AND "campaignId"=$3 AND "enrollmentId"=$4 AND "occurrenceId"=$5
          AND "authorizationId"=$6 AND "workflowVersionId"=$7 AND "messageId"=$8
          AND "renderDigest"=$9`,
        [
          submission.attemptId,
          submission.workspaceId,
          submission.campaignId,
          submission.enrollmentId,
          submission.occurrenceId,
          submission.authorizationId,
          submission.workflowVersionId,
          submission.messageId,
          submission.renderDigest,
        ],
      ),
    );
    if (renders.length !== 1) return reject('MATERIAL_STALE');
    const render = renders[0];
    const send = input.materialEvidence.sendMessageInput;
    const attachments = send.attachments ?? [];
    const fixedProofs = Array.isArray(proof?.fixedMaterialProofs)
      ? proof.fixedMaterialProofs
      : [];
    const fixed = fixedProofs.find(
      (candidate) => object(candidate)?.messageId === submission.messageId,
    );
    if (
      render.subject !== send.subject ||
      render.html !== send.html ||
      render.text !== send.body ||
      render.toRecipient !== submission.normalizedRecipient ||
      render.inReplyTo !== (send.inReplyTo ?? null) ||
      render.threadExternalId !== (send.threadExternalId ?? null) ||
      !exactArray(render.references, send.references ?? []) ||
      attachments.length !== 0 ||
      !exactArray(object(fixed)?.orderedAttachmentProofs, []) ||
      render.signatureDigest !== (proof?.signatureDigest ?? null)
    )
      return reject('MATERIAL_STALE');

    if (attempt.selectionConstraintKind === 'PINNED_REPLY') {
      const prior = records(
        await runner.query(
          `SELECT "attemptId","connectedAccountId","messageChannelId","normalizedSenderHandle",
                  "providerHeaderMessageId","reconciledProviderHeaderMessageId","resolvedThreadExternalId",
                  "projectedMessageId","projectedMessageThreadId"
             FROM core."outboundEmailAttempt" WHERE "attemptId"=$1 AND "workspaceId"=$2
               AND source='CAMPAIGN_SEQUENCE' AND "attemptState"='ACCEPTED'`,
          [attempt.priorAcceptedEvidenceId, submission.workspaceId],
        ),
      );
      const evidence = prior[0];
      const header =
        evidence?.providerHeaderMessageId ??
        evidence?.reconciledProviderHeaderMessageId;
      if (
        prior.length !== 1 ||
        evidence.connectedAccountId !== submission.connectedAccountId ||
        evidence.messageChannelId !== submission.messageChannelId ||
        evidence.normalizedSenderHandle !== submission.normalizedSenderHandle ||
        typeof header !== 'string' ||
        header.length === 0 ||
        render.inReplyTo !== header ||
        render.threadExternalId !== evidence.resolvedThreadExternalId ||
        typeof evidence.projectedMessageId !== 'string' ||
        typeof evidence.projectedMessageThreadId !== 'string'
      )
        return reject('THREAD_EVIDENCE_INVALID');
    } else if (
      attempt.selectionConstraintKind !== 'ROTATE' ||
      render.inReplyTo !== null ||
      render.threadExternalId !== null
    )
      return reject('THREAD_EVIDENCE_INVALID');

    const projectedMessageId = computeCampaignProjectedMessageId(
      submission.attemptId,
    );
    if (input.materialEvidence.projectedMessageId !== projectedMessageId)
      return reject('DISPATCH_CONTRACT_CONFLICT');
    return { status: 'AUTHORIZED', submission, projectedMessageId };
  }
}
