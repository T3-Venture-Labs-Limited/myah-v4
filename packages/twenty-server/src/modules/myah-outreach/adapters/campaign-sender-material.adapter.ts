import { Injectable } from '@nestjs/common';

import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import {
  type CampaignMaterialPortResult,
  type CampaignMessageMaterial,
  type CampaignSenderMaterialPort,
  type CampaignSenderReadiness,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

const blocked = (
  code: 'SENDER_NOT_READY' | 'SENDER_POOL_STALE' | 'SENDER_PROJECTION_STALE',
): CampaignMaterialPortResult<CampaignMessageMaterial['sender']> => ({
  kind: 'BLOCKED',
  blockers: [{ code, message: 'Campaign sender material is unavailable' }],
});

@Injectable()
export class CampaignSenderMaterialAdapter implements CampaignSenderMaterialPort {
  constructor(private readonly readiness: CampaignSenderReadinessService) {}

  async load(
    input: Parameters<CampaignSenderMaterialPort['load']>[0],
  ): Promise<CampaignMaterialPortResult<CampaignMessageMaterial['sender']>> {
    if (input.context.kind !== 'DISPATCH') return blocked('SENDER_NOT_READY');
    const { context, coordinates } = input;
    const manager = context.transactionManager;
    const runner = manager.queryRunner;
    if (
      !runner?.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager ||
      context.authContext.type !== 'system' ||
      context.authContext.workspace.id !== coordinates.workspaceId ||
      context.renderContext.workspaceId !== coordinates.workspaceId ||
      context.renderContext.campaignId !== coordinates.campaignId ||
      context.renderContext.campaignCreatorId !==
        coordinates.campaignCreatorId ||
      context.renderContext.workflowVersionId !==
        coordinates.workflowVersionId ||
      context.renderContext.messageId !== coordinates.messageId
    )
      return blocked('SENDER_PROJECTION_STALE');
    const pool = await this.readiness.getCampaignEmailSenderPoolInTransaction(
      {
        workspaceId: coordinates.workspaceId,
        campaignId: coordinates.campaignId,
      },
      manager,
    );
    if (
      pool.senderPoolFingerprint !==
        context.senderBinding.senderPoolFingerprint ||
      pool.senderPoolFingerprint !== context.renderContext.senderPoolFingerprint
    )
      return blocked('SENDER_POOL_STALE');
    const sender = pool.mailboxes.find(
      (candidate) =>
        candidate.connectedAccountId ===
          context.senderBinding.connectedAccountId &&
        candidate.messageChannelId === context.senderBinding.messageChannelId,
    );
    if (
      sender?.status !== 'READY' ||
      sender.bindingStatus !== 'RESOLVED_BINDING' ||
      sender.provider !== context.senderBinding.provider ||
      sender.senderHandle !== context.senderBinding.senderHandle ||
      sender.connectedAccountId !== context.renderContext.connectedAccountId ||
      sender.messageChannelId !== context.renderContext.messageChannelId ||
      sender.senderHandle !== context.renderContext.senderHandle
    )
      return blocked('SENDER_NOT_READY');
    const authorizedEmailSenderPool: CampaignSenderReadiness[] =
      pool.mailboxes.map((mailbox) =>
        mailbox.bindingStatus === 'MISSING_CORE_BINDING'
          ? mailbox
          : {
              ...mailbox,
              reason:
                mailbox.reason === null
                  ? null
                  : mailbox.reason === 'ACCOUNT_UNAVAILABLE'
                    ? 'ACCOUNT_UNAVAILABLE'
                    : 'ACCOUNT_NOT_READY',
            },
      );
    return {
      kind: 'READY',
      value: {
        connectedAccountId: sender.connectedAccountId,
        messageChannelId: sender.messageChannelId,
        handle: sender.senderHandle,
        provider: sender.provider,
        senderPoolFingerprint: pool.senderPoolFingerprint,
        authorizedEmailSenderPool,
        projectedSlotAt: null,
        isPreviewProjection: false,
      },
    };
  }
}
