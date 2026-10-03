import { Injectable, Logger } from '@nestjs/common';

import { createHash } from 'node:crypto';
import { INSTAGRAM_MESSAGE_MAX_BODY_BYTES } from 'twenty-shared/constants';
import { getUtf8ByteLength } from 'twenty-shared/utils';

import { MyahAgentService } from 'src/engine/core-modules/myah-agent/services/myah-agent.service';
import { InstagramMessageComposerService } from 'src/engine/core-modules/instagram-message/services/instagram-message-composer.service';
import { type InstagramComposerAuthenticatedContext } from 'src/engine/core-modules/instagram-message/services/instagram-message-composer.types';
import { InstagramMessageRecipientService } from 'src/engine/core-modules/instagram-message/services/instagram-message-recipient.service';
import { type InstagramMessageSendResult } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as Row[])
    : Array.isArray(value)
      ? (value as Row[])
      : [];

// The composer draft id is derived from the occurrence so a retried dispatch
// replays the same send instead of creating a second message.
export const campaignInstagramDraftId = (occurrenceId: string): string => {
  const hash = createHash('sha256')
    .update(`campaign-instagram-step:v1:${occurrenceId}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

// Only the supported creator variables are rendered in Instagram text.
export const renderCampaignInstagramText = (
  text: string,
  creator: { name: string | null; email: string | null },
): string =>
  text
    .replace(/\{\{\s*creator\.name\s*\}\}/g, creator.name?.trim() || 'there')
    .replace(/\{\{\s*creator\.email\s*\}\}/g, creator.email?.trim() ?? '')
    .trim();

// Sends Campaign Instagram steps through the existing Instagram composer, which
// owns recipient resolution (reuse an existing chat or open one), the send
// budget, receipts and unknown-outcome reconciliation (MYAH-445).
@Injectable()
export class CampaignInstagramStepService {
  private readonly logger = new Logger(CampaignInstagramStepService.name);

  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly progression: CampaignProgressionService,
    private readonly sequence: CampaignSequenceService,
    private readonly agentSettings: MyahAgentService,
    private readonly recipients: InstagramMessageRecipientService,
    private readonly composer: InstagramMessageComposerService,
  ) {}

  async dispatch(
    workspaceId: string,
    campaignId: string,
    occurrenceId: string,
  ): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const step = await dataSource.transaction(async (manager) =>
      this.loadStep(
        { workspaceId, campaignId, occurrenceId },
        manager as WorkspaceEntityManager,
      ),
    );
    if (step === null) return;

    const settle = (
      outcome: Parameters<
        CampaignProgressionService['reconcileInstagramOccurrenceInTransaction']
      >[0]['outcome'],
      extra: {
        receiptId?: string | null;
        nextEligibleAt?: Date | null;
        holdReason?: 'MATERIAL_STALE' | 'SENDER_NOT_READY';
      } = {},
    ) =>
      dataSource.transaction((manager) =>
        this.progression.reconcileInstagramOccurrenceInTransaction(
          {
            workspaceId,
            campaignId,
            occurrenceId,
            receiptId: extra.receiptId ?? null,
            outcome,
            acceptedAt: new Date(),
            nextEligibleAt: extra.nextEligibleAt,
            holdReason: extra.holdReason,
          },
          manager as WorkspaceEntityManager,
        ),
      );

    if (getUtf8ByteLength(step.body) > INSTAGRAM_MESSAGE_MAX_BODY_BYTES) {
      await settle('HOLD', { holdReason: 'MATERIAL_STALE' });
      return;
    }
    const setting = await this.agentSettings.getCampaignSettingRecord(
      workspaceId,
      campaignId,
    );
    const context: InstagramComposerAuthenticatedContext = {
      workspaceId,
      // The person who started the Campaign authorized these sends.
      initiatorUserWorkspaceId: step.initiatingUserWorkspaceId,
      workspaceMemberId: step.initiatingWorkspaceMemberId,
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    };
    const recipient = { creatorRecordId: step.creatorId };
    const draftId = campaignInstagramDraftId(occurrenceId);

    let result: InstagramMessageSendResult;
    try {
      const prepared = await this.recipients.prepare({ recipient }, context);
      if (prepared.status === 'BLOCKED') {
        if (prepared.code === 'TARGET_LOCKED')
          await settle('LIMITED', {
            nextEligibleAt: new Date(Date.now() + 10 * 60_000),
          });
        else
          await settle('HOLD', {
            holdReason:
              prepared.code === 'ACCOUNT_UNAVAILABLE'
                ? 'SENDER_NOT_READY'
                : 'MATERIAL_STALE',
          });
        return;
      }
      if (
        setting.instagramAccountId !== null &&
        prepared.sender.accountRecordId !== setting.instagramAccountId
      ) {
        await settle('HOLD', { holdReason: 'SENDER_NOT_READY' });
        return;
      }
      result = await this.composer.send(
        {
          recipient,
          draftId,
          expectedAccountRecordId: prepared.sender.accountRecordId,
          expectedPreparationFingerprint: prepared.preparationFingerprint,
          body: step.body,
        },
        context,
      );
    } catch (error) {
      // The composer may have reserved a receipt before failing; recovery
      // reads the attempt by draft id and never sends twice.
      this.logger.warn(
        `Campaign Instagram step ${occurrenceId} could not be sent: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      const attempt = await this.composer
        .getAttempt(draftId, context)
        .catch(() => null);
      if (attempt?.receiptId)
        await settle('UNKNOWN', { receiptId: attempt.receiptId });
      else await settle('HOLD', { holdReason: 'MATERIAL_STALE' });
      return;
    }
    await this.settleResult(result, settle);
  }

  // IN_FLIGHT/UNKNOWN Instagram steps whose receipt settled since dispatch.
  async recover(
    workspaceId: string,
    campaignId: string,
    occurrenceId: string,
  ): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const [occurrence] = rows(
      await dataSource.query(
        `SELECT o.state, o."actionExecutionReceiptId", r.state AS "receiptState"
           FROM core."campaignOccurrence" o
           LEFT JOIN core."actionExecutionReceipt" r ON r.id = o."actionExecutionReceiptId"
          WHERE o.id=$1 AND o."workspaceId"=$2`,
        [occurrenceId, workspaceId],
        undefined,
        { shouldBypassPermissionChecks: true },
      ),
    );
    if (!occurrence) return;
    if (occurrence.actionExecutionReceiptId === null) {
      // Never reached the composer, or crashed before linking: dispatch again
      // (the derived draft id makes this a replay if a send exists).
      if (occurrence.state === 'IN_FLIGHT')
        await this.dispatch(workspaceId, campaignId, occurrenceId);
      return;
    }
    const state = String(occurrence.receiptState);
    if (state !== 'SENT' && state !== 'PROVIDER_ACCEPTED' && state !== 'FAILED')
      return;
    await dataSource.transaction((manager) =>
      this.progression.reconcileInstagramOccurrenceInTransaction(
        {
          workspaceId,
          campaignId,
          occurrenceId,
          receiptId: String(occurrence.actionExecutionReceiptId),
          outcome: state === 'FAILED' ? 'FAILED' : 'ACCEPTED',
          acceptedAt: new Date(),
        },
        manager as WorkspaceEntityManager,
      ),
    );
  }

  private async settleResult(
    result: InstagramMessageSendResult,
    settle: (
      outcome: 'ACCEPTED' | 'UNKNOWN' | 'FAILED' | 'LIMITED' | 'HOLD',
      extra?: { receiptId?: string | null; nextEligibleAt?: Date | null },
    ) => Promise<unknown>,
  ): Promise<void> {
    const receiptId = result.receiptId;
    if (result.status === 'SENT' || result.status === 'PROVIDER_ACCEPTED')
      await settle('ACCEPTED', { receiptId });
    else if (result.status === 'BLOCKED')
      await settle('LIMITED', {
        receiptId: null,
        nextEligibleAt:
          'nextEligibleAt' in result ? result.nextEligibleAt : null,
      });
    else if (result.status === 'FAILED') await settle('FAILED', { receiptId });
    else await settle('UNKNOWN', { receiptId });
  }

  private async loadStep(
    input: { workspaceId: string; campaignId: string; occurrenceId: string },
    manager: WorkspaceEntityManager,
  ): Promise<null | {
    creatorId: string;
    body: string;
    initiatingUserWorkspaceId: string;
    initiatingWorkspaceMemberId: string;
  }> {
    const runner = manager.queryRunner!;
    const [occurrence] = rows(
      await runner.query(
        `SELECT o.state, o."messageId", o."workflowVersionId", e."creatorId", auth.binding
           FROM core."campaignOccurrence" o
           JOIN core."campaignEnrollment" e ON e.id = o."enrollmentId"
           JOIN core."campaignSequenceAuthorization" auth
             ON auth."authorizationId" = e."authorizationId" AND auth.generation = e."authorizationGeneration"
          WHERE o.id=$1 AND o."workspaceId"=$2 AND o."campaignId"=$3`,
        [input.occurrenceId, input.workspaceId, input.campaignId],
      ),
    );
    if (!occurrence || occurrence.state !== 'IN_FLIGHT') return null;
    const binding = occurrence.binding as {
      request?: {
        preparedProof?: {
          initiatingUserWorkspaceId?: string;
          initiatingWorkspaceMemberId?: string;
        };
      };
    } | null;
    const proof = binding?.request?.preparedProof;
    if (!proof?.initiatingUserWorkspaceId || !proof.initiatingWorkspaceMemberId)
      return null;
    const text = await this.sequence.loadInstagramTextByVersionInTransaction(
      {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        workflowVersionId: String(occurrence.workflowVersionId),
        messageId: String(occurrence.messageId),
      },
      manager,
    );
    const creatorRepository = await this.orm.getRepository<{
      id: string;
      name: string | null;
      email: string | null;
    }>(input.workspaceId, 'creator', { shouldBypassPermissionChecks: true });
    const creator = await creatorRepository.findOne(
      {
        where: { id: String(occurrence.creatorId) },
        select: { id: true, name: true, email: true },
      },
      manager,
    );
    return {
      creatorId: String(occurrence.creatorId),
      body: renderCampaignInstagramText(text, {
        name: typeof creator?.name === 'string' ? creator.name : null,
        email: typeof creator?.email === 'string' ? creator.email : null,
      }),
      initiatingUserWorkspaceId: proof.initiatingUserWorkspaceId,
      initiatingWorkspaceMemberId: proof.initiatingWorkspaceMemberId,
    };
  }
}
