import { Injectable } from '@nestjs/common';

import {
  type CampaignMaterialPortResult,
  type CampaignMessageMaterialThread,
  type CampaignThreadMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

const blocked = (
  code:
    | 'THREAD_EVIDENCE_MISSING'
    | 'THREAD_EVIDENCE_AMBIGUOUS'
    | 'THREAD_IDENTITY_MISMATCH',
): CampaignMaterialPortResult<CampaignMessageMaterialThread> => ({
  kind: 'BLOCKED',
  blockers: [{ code, message: 'Campaign thread evidence is unavailable' }],
});

@Injectable()
export class CampaignThreadMaterialAdapter implements CampaignThreadMaterialPort {
  async load(
    input: Parameters<CampaignThreadMaterialPort['load']>[0],
  ): Promise<CampaignMaterialPortResult<CampaignMessageMaterialThread>> {
    if (!input.replyToThread)
      return { kind: 'READY', value: { kind: 'NEW_THREAD' } };
    if (input.context.kind !== 'DISPATCH')
      return blocked('THREAD_EVIDENCE_MISSING');
    const { context, coordinates, normalizedRecipient, sender } = input;
    if (
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
      return blocked('THREAD_IDENTITY_MISMATCH');
    const evidence = context.replyEvidence;
    if (!('evidenceId' in evidence)) return blocked('THREAD_EVIDENCE_MISSING');
    if (
      context.renderContext.enrollmentId !== evidence.enrollmentId ||
      context.renderContext.replyEvidenceId !== evidence.evidenceId ||
      context.senderBinding.connectedAccountId !== sender.connectedAccountId ||
      context.senderBinding.messageChannelId !== sender.messageChannelId ||
      context.senderBinding.senderHandle !== sender.handle
    )
      return blocked('THREAD_IDENTITY_MISMATCH');
    const manager = context.transactionManager;
    const runner = manager.queryRunner;
    if (
      !runner?.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager
    )
      return blocked('THREAD_EVIDENCE_MISSING');
    const result = await runner.query(
      `SELECT a."attemptId",a."enrollmentId",a."occurrenceId",a."messageId",a."normalizedRecipient",
              a."connectedAccountId",a."messageChannelId",a."normalizedSenderHandle",
              a."providerHeaderMessageId",a."reconciledProviderHeaderMessageId",a."resolvedThreadExternalId",
              a."projectedMessageId",a."projectedMessageThreadId"
         FROM core."outboundEmailAttempt" a
         JOIN core."campaignOccurrence" priorOccurrence
           ON priorOccurrence.id=a."occurrenceId" AND priorOccurrence."workspaceId"=a."workspaceId"
         JOIN core."campaignOccurrence" currentOccurrence
           ON currentOccurrence.id=$6 AND currentOccurrence."workspaceId"=a."workspaceId"
          AND currentOccurrence."campaignId"=a."campaignId" AND currentOccurrence."enrollmentId"=a."enrollmentId"
        WHERE a."workspaceId"=$1 AND a."campaignId"=$2 AND a."attemptId"=$3
          AND a."enrollmentId"=$4 AND a."workflowVersionId"=$5
          AND priorOccurrence."authoredMessageIndex" < currentOccurrence."authoredMessageIndex"
          AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'`,
      [
        coordinates.workspaceId,
        coordinates.campaignId,
        evidence.evidenceId,
        evidence.enrollmentId,
        coordinates.workflowVersionId,
        context.renderContext.occurrenceId,
      ],
    );
    if (!Array.isArray(result) || result.length !== 1)
      return blocked('THREAD_EVIDENCE_AMBIGUOUS');
    const row = result[0];
    const header =
      row.providerHeaderMessageId ?? row.reconciledProviderHeaderMessageId;
    if (
      row.attemptId !== evidence.evidenceId ||
      row.enrollmentId !== evidence.enrollmentId ||
      row.occurrenceId !== evidence.occurrenceId ||
      row.messageId !== evidence.priorMessageId ||
      row.normalizedRecipient !== normalizedRecipient ||
      row.normalizedRecipient !== evidence.normalizedRecipient ||
      row.connectedAccountId !== sender.connectedAccountId ||
      row.connectedAccountId !== evidence.connectedAccountId ||
      row.messageChannelId !== sender.messageChannelId ||
      row.messageChannelId !== evidence.messageChannelId ||
      row.normalizedSenderHandle !== sender.handle ||
      row.normalizedSenderHandle !== evidence.senderHandle ||
      typeof header !== 'string' ||
      header.length === 0 ||
      header !== evidence.providerMessageId ||
      typeof row.resolvedThreadExternalId !== 'string' ||
      row.resolvedThreadExternalId.length === 0 ||
      row.resolvedThreadExternalId !== evidence.providerThreadId ||
      typeof row.projectedMessageId !== 'string' ||
      typeof row.projectedMessageThreadId !== 'string'
    )
      return blocked('THREAD_IDENTITY_MISMATCH');
    return { kind: 'READY', value: { kind: 'REPLY', evidence } };
  }
}
