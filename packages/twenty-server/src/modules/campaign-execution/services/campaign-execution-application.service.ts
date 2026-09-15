import { Injectable } from '@nestjs/common';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import {
  buildCampaignFixedMaterialDigest,
  buildCampaignPreparedFingerprint,
  buildCampaignSenderAuthorityDigest,
  buildCampaignSequenceIdentityDigest,
} from 'src/modules/campaign-execution/utils/campaign-launch-proof.util';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { CampaignSequenceFixedMaterialService } from 'src/modules/myah-outreach/services/campaign-sequence-fixed-material.service';

import { type CampaignExecutionMutationResultDTO } from '../dtos/campaign-execution.dto';

const blocked = (reason: string): CampaignExecutionMutationResultDTO => ({
  status: 'BLOCKED',
  lifecycleStatus: null,
  reason,
  replayed: false,
  changed: false,
  inFlightCount: null,
});

@Injectable()
export class CampaignExecutionApplicationService {
  constructor(
    private readonly execution: CampaignExecutionService,
    private readonly sequence: CampaignSequenceService,
    private readonly senderReadiness: CampaignSenderReadinessService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly fixedMaterial: CampaignSequenceFixedMaterialService,
  ) {}

  async start(
    campaignId: string,
    startIdempotencyKey: string,
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignExecutionMutationResultDTO> {
    if (authContext.type !== 'user')
      return blocked('USER_AUTHENTICATION_REQUIRED');

    const replay = await this.execution.lookupStartReplay({
      workspaceId: authContext.workspace.id,
      campaignId,
      authContext,
      startIdempotencyKey,
    });
    if (replay !== null) {
      if (replay.status === 'BLOCKED') return blocked(replay.reason);
      return {
        status: replay.mayActivate ? 'STARTED' : 'ACKNOWLEDGED',
        lifecycleStatus: replay.mayActivate ? 'ACTIVE' : null,
        reason: null,
        replayed: true,
        changed: false,
        inFlightCount: null,
      };
    }

    // Preparation is deliberately completed before CampaignExecutionService
    // acquires any Workspace/Campaign lock. No provider send is reachable here.
    const loaded = await this.sequence.load({
      workspaceId: authContext.workspace.id,
      campaignId,
      authContext,
    });
    if (loaded.kind !== 'SEQUENCE') return blocked('SEQUENCE_UNAVAILABLE');

    const { snapshot } = loaded;
    if (snapshot.issues.length > 0 || snapshot.sequence.messages.length === 0)
      return blocked('SEQUENCE_UNAVAILABLE');
    if (
      snapshot.sequence.messages.some((message) => message.channel !== 'EMAIL')
    )
      return blocked('EMAIL_ONLY');

    const emails = snapshot.sequence.messages.filter(
      (message) => message.channel === 'EMAIL',
    );
    // Attachment byte proofs require the controlled material-storage boundary.
    // Until that boundary is runtime-wired, fail closed rather than authorizing
    // unverifiable attachment material.
    if (
      emails.some(
        (message) => message.channel === 'EMAIL' && message.files.length > 0,
      )
    )
      return blocked('ATTACHMENTS_UNAVAILABLE');

    const senderPool = await this.senderReadiness.getCampaignEmailSenderPool(
      { campaignId },
      authContext,
    );
    const readySenders = senderPool.mailboxes.filter(
      (mailbox) =>
        mailbox.bindingStatus === 'RESOLVED_BINDING' &&
        mailbox.status === 'READY',
    );
    if (readySenders.length === 0)
      return blocked('AT_LEAST_ONE_READY_EMAIL_MAILBOX_REQUIRED');

    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    let queryResult: unknown;
    try {
      queryResult = await queryRunner.query(
        `SELECT ce."timeZone", ce."startLocalTime"::text, ce."endLocalTime"::text,
                ce."campaignCapacityTimeZone", workspace."campaignCapacityTimeZone" AS "workspaceCapacityTimeZone"
           FROM core."campaignExecution" ce
           JOIN core.workspace workspace ON workspace.id = ce."workspaceId"
          WHERE ce."workspaceId" = $1 AND ce."campaignId" = $2`,
        [authContext.workspace.id, campaignId],
      );
    } finally {
      await queryRunner.release();
    }
    const rows = (
      Array.isArray(queryResult) && Array.isArray(queryResult[0])
        ? queryResult[0]
        : queryResult
    ) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length !== 1)
      return blocked('MISSING_SENDING_WINDOW');
    const row = rows[0];
    if (
      typeof row.timeZone !== 'string' ||
      typeof row.startLocalTime !== 'string' ||
      typeof row.endLocalTime !== 'string' ||
      typeof row.campaignCapacityTimeZone !== 'string' ||
      row.campaignCapacityTimeZone !== row.workspaceCapacityTimeZone
    )
      return blocked('WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE');

    const nodes = emails.map((message) => ({
      messageId: message.id,
      channel: 'EMAIL' as const,
      replyToThread: message.replyToThread,
    }));
    const orderedMessageIds = nodes.map(({ messageId }) => messageId);
    const fixedMaterial = await this.fixedMaterial.loadSequenceFixedMaterial({
      workspaceId: authContext.workspace.id,
      campaignId,
      workflowVersionId: snapshot.versionId,
      orderedMessageIds,
      authContext,
    });
    if (fixedMaterial.kind === 'BLOCKED') {
      const attachmentsUnavailable = fixedMaterial.blockers.some((blocker) =>
        blocker.code.startsWith('ATTACHMENT_'),
      );
      return blocked(
        attachmentsUnavailable ? 'ATTACHMENTS_UNAVAILABLE' : 'MATERIAL_STALE',
      );
    }
    if (
      fixedMaterial.value.messages.some(
        (message, index) =>
          message.messageId !== orderedMessageIds[index] ||
          message.replyToThread !== emails[index].replyToThread,
      )
    )
      return blocked('MATERIAL_STALE');
    const fixedMaterialProofs = fixedMaterial.value.messages.map((message) => ({
      messageId: message.messageId,
      orderedAttachmentProofs: message.orderedAttachmentProofs,
    }));
    const fixedMaterialDigest = buildCampaignFixedMaterialDigest({
      signatureDigest: fixedMaterial.value.signatureDigest,
      messages: fixedMaterial.value.messages,
    });
    const sequenceDigest = buildCampaignSequenceIdentityDigest({
      workspaceId: authContext.workspace.id,
      campaignId,
      workflowId: snapshot.workflowId,
      workflowVersionId: snapshot.versionId,
      nodes,
      delaysSeconds: snapshot.sequence.delaysSeconds.map(
        (delaySeconds) => delaySeconds as number,
      ),
    });
    const senderAuthorityDigest = buildCampaignSenderAuthorityDigest({
      readySenderBindings: readySenders,
      senderPoolFingerprint: senderPool.senderPoolFingerprint,
      senderPoolSerializationRevision: senderPool.serializationRevision,
      senderPoolRotationPolicyId: senderPool.rotationPolicyId,
    });
    const preparedFingerprint = buildCampaignPreparedFingerprint({
      workspaceId: authContext.workspace.id,
      campaignId,
      workflowId: snapshot.workflowId,
      workflowVersionId: snapshot.versionId,
      initiatingUserWorkspaceId: authContext.userWorkspaceId,
      initiatingUserId: authContext.user.id,
      initiatingWorkspaceMemberId: authContext.workspaceMemberId,
      sequenceDigest,
      fixedMaterialDigest,
      senderAuthorityDigest,
    });

    const result = await this.execution.startCampaign({
      workspaceId: authContext.workspace.id,
      campaignId,
      authContext,
      startIdempotencyKey,
      request: {
        preparedProof: {
          kind: 'PREPARED',
          workspaceId: authContext.workspace.id,
          campaignId,
          workflowId: snapshot.workflowId,
          workflowVersionId: snapshot.versionId,
          initiatingUserWorkspaceId: authContext.userWorkspaceId,
          initiatingUserId: authContext.user.id,
          initiatingWorkspaceMemberId: authContext.workspaceMemberId,
          orderedMessageIds,
          usedChannels: ['EMAIL'],
          sequenceDigest,
          fixedMaterialDigest,
          senderAuthorityDigest,
          preparedFingerprint,
          signatureDigest: fixedMaterial.value.signatureDigest,
          fixedMaterialProofs,
          senderPoolFingerprint: senderPool.senderPoolFingerprint,
          senderPoolSerializationRevision: senderPool.serializationRevision,
          senderPoolRotationPolicyId: senderPool.rotationPolicyId,
        },
        reviewedWindow: {
          timeZone: row.timeZone,
          startLocalTime: row.startLocalTime,
          endLocalTime: row.endLocalTime,
        },
        campaignCapacityTimeZone: row.campaignCapacityTimeZone,
      },
    });

    if (result.status === 'BLOCKED') return blocked(result.reason);
    if (result.status === 'REPLAYED' && !result.mayActivate) {
      return {
        status: 'ACKNOWLEDGED',
        lifecycleStatus: null,
        reason: null,
        replayed: true,
        changed: false,
        inFlightCount: null,
      };
    }
    return {
      status: 'STARTED',
      lifecycleStatus: 'ACTIVE',
      reason: null,
      replayed: result.status === 'REPLAYED',
      changed: result.status === 'ACTIVATED',
      inFlightCount: null,
    };
  }

  async updateSendingWindow(
    campaignId: string,
    window: Readonly<{
      timeZone: string;
      startLocalTime: string;
      endLocalTime: string;
    }>,
    authContext: WorkspaceAuthContext,
  ): Promise<
    Readonly<{
      status: 'UPDATED' | 'UNCHANGED' | 'BLOCKED';
      reason: string | null;
    }>
  > {
    const result = await this.execution.updateSendingWindow({
      workspaceId: authContext.workspace.id,
      campaignId,
      authContext,
      window,
    });
    return result.status === 'BLOCKED'
      ? { status: 'BLOCKED', reason: result.reason }
      : { status: result.status, reason: null };
  }

  async stop(
    campaignId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignExecutionMutationResultDTO> {
    const result = await this.execution.pauseCampaign({
      workspaceId: authContext.workspace.id,
      campaignId,
      authContext,
    });
    if (result.status === 'BLOCKED') return blocked(result.reason);
    return {
      status: 'STOPPED',
      lifecycleStatus: 'STOPPED',
      reason: null,
      replayed: false,
      changed: result.changed,
      inFlightCount: result.inFlightCount,
    };
  }
}
