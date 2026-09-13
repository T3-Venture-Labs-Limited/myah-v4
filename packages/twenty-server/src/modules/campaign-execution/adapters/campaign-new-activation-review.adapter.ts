import { Injectable } from '@nestjs/common';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';
import {
  type CampaignNewActivationReviewPort,
  type CampaignNewActivationReviewResult,
} from 'src/modules/campaign-execution/types/campaign-execution.type';
import {
  buildCampaignFixedMaterialDigest,
  buildCampaignPreparedFingerprint,
  buildCampaignSenderAuthorityDigest,
  buildCampaignSequenceIdentityDigest,
} from 'src/modules/campaign-execution/utils/campaign-launch-proof.util';
import { CampaignSequenceFixedMaterialService } from 'src/modules/myah-outreach/services/campaign-sequence-fixed-material.service';

const blocked = (): CampaignNewActivationReviewResult =>
  Object.freeze({ status: 'BLOCKED', reason: 'CURRENT_REVIEW_INVALID' });

@Injectable()
export class CampaignNewActivationReviewAdapter implements CampaignNewActivationReviewPort {
  constructor(
    private readonly senderReadiness: CampaignSenderReadinessService,
    private readonly audienceReview: CampaignOutreachAudienceReviewService,
    private readonly fixedMaterial: CampaignSequenceFixedMaterialService,
  ) {}

  async revalidateNewActivationInTransaction(
    input: Parameters<
      CampaignNewActivationReviewPort['revalidateNewActivationInTransaction']
    >[0],
  ): Promise<CampaignNewActivationReviewResult> {
    const { context, execution, plan, request } = input;
    const runner = context.manager.queryRunner;

    if (
      !runner ||
      !runner.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== context.manager
    ) {
      throw new Error(
        'Campaign activation review requires the supplied active manager',
      );
    }

    if (
      execution.window.timeZone !== request.reviewedWindow.timeZone ||
      execution.window.startLocalTime !==
        request.reviewedWindow.startLocalTime ||
      execution.window.endLocalTime !== request.reviewedWindow.endLocalTime ||
      execution.campaignCapacityTimeZone !== input.campaignCapacityTimeZone ||
      request.campaignCapacityTimeZone !== input.campaignCapacityTimeZone ||
      plan.nodes.some((node) => node.channel !== 'EMAIL')
    ) {
      return blocked();
    }

    const emailNodes = plan.nodes as readonly Readonly<{
      messageId: string;
      channel: 'EMAIL';
      replyToThread: boolean;
    }>[];
    const proof = request.preparedProof;
    const sequenceDigest = buildCampaignSequenceIdentityDigest({
      workspaceId: context.workspaceId,
      campaignId: context.campaignId,
      workflowId: plan.workflowId,
      workflowVersionId: plan.workflowVersionId,
      nodes: emailNodes,
      delaysSeconds: plan.delaysSeconds,
    });
    const auth = context.actorPermissionContext.authContext;

    if (
      proof.sequenceDigest !== sequenceDigest ||
      auth.type !== 'user' ||
      proof.initiatingUserWorkspaceId !== auth.userWorkspaceId ||
      proof.initiatingUserId !== auth.user.id ||
      proof.initiatingWorkspaceMemberId !== auth.workspaceMemberId
    ) {
      return blocked();
    }

    const fixedMaterial = await this.fixedMaterial.loadSequenceFixedMaterial(
      {
        workspaceId: context.workspaceId,
        campaignId: context.campaignId,
        workflowVersionId: plan.workflowVersionId,
        orderedMessageIds: emailNodes.map(({ messageId }) => messageId),
        authContext: auth,
      },
      context.manager,
    );
    if (fixedMaterial.kind !== 'READY') return blocked();
    const currentProofs = fixedMaterial.value.messages.map((message) => ({
      messageId: message.messageId,
      orderedAttachmentProofs: message.orderedAttachmentProofs,
    }));
    const currentFixedDigest = buildCampaignFixedMaterialDigest({
      signatureDigest: fixedMaterial.value.signatureDigest,
      messages: fixedMaterial.value.messages,
    });
    if (
      currentFixedDigest !== proof.fixedMaterialDigest ||
      fixedMaterial.value.signatureDigest !== proof.signatureDigest ||
      JSON.stringify(currentProofs) !==
        JSON.stringify(proof.fixedMaterialProofs) ||
      fixedMaterial.value.messages.some(
        (message, index) =>
          message.messageId !== proof.orderedMessageIds[index] ||
          message.messageId !== emailNodes[index]?.messageId ||
          message.replyToThread !== emailNodes[index]?.replyToThread,
      )
    )
      return blocked();

    const senderPool =
      await this.senderReadiness.getCampaignEmailSenderPoolInTransaction(
        { workspaceId: context.workspaceId, campaignId: context.campaignId },
        context.manager,
      );
    const readySenders = senderPool.mailboxes.filter(
      (mailbox) =>
        mailbox.bindingStatus === 'RESOLVED_BINDING' &&
        mailbox.status === 'READY',
    );

    if (
      readySenders.length === 0 ||
      senderPool.senderPoolFingerprint !== proof.senderPoolFingerprint ||
      senderPool.serializationRevision !==
        proof.senderPoolSerializationRevision ||
      senderPool.rotationPolicyId !== proof.senderPoolRotationPolicyId ||
      buildCampaignSenderAuthorityDigest({
        readySenderBindings: readySenders,
        senderPoolFingerprint: senderPool.senderPoolFingerprint,
        senderPoolSerializationRevision: senderPool.serializationRevision,
        senderPoolRotationPolicyId: senderPool.rotationPolicyId,
      }) !== proof.senderAuthorityDigest ||
      buildCampaignPreparedFingerprint({
        workspaceId: proof.workspaceId,
        campaignId: proof.campaignId,
        workflowId: proof.workflowId,
        workflowVersionId: proof.workflowVersionId,
        initiatingUserWorkspaceId: proof.initiatingUserWorkspaceId,
        initiatingUserId: proof.initiatingUserId,
        initiatingWorkspaceMemberId: proof.initiatingWorkspaceMemberId,
        sequenceDigest: proof.sequenceDigest,
        fixedMaterialDigest: proof.fixedMaterialDigest,
        senderAuthorityDigest: proof.senderAuthorityDigest,
      }) !== proof.preparedFingerprint
    ) {
      return blocked();
    }

    const audience = await this.audienceReview.reviewInTransaction({
      workspaceId: context.workspaceId,
      campaignId: context.campaignId,
      schemaName: context.schemaName,
      manager: context.manager,
      rolePermissionConfig: context.actorPermissionContext.rolePermissionConfig,
    });
    if (audience.eligible.length === 0) return blocked();

    const eligibleCreators = audience.eligible.map(
      ({ campaignCreatorId, creatorId }) =>
        Object.freeze({
          campaignCreatorId,
          creatorId,
          usableMessageIds: Object.freeze(
            emailNodes.map(({ messageId }) => messageId),
          ),
        }),
    );

    return Object.freeze({
      status: 'READY',
      eligibleCreators: Object.freeze(eligibleCreators),
    });
  }
}
