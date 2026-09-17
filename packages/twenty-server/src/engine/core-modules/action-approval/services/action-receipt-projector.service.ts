import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import {
  ACTION_RECEIPT_PROJECTION_WRITER,
  type ActionApprovalFaultHooks,
  type ActionReceiptProjectionInput,
  type ActionReceiptProjectionWriter,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';

@Injectable()
export class ActionReceiptProjectorService {
  constructor(
    // Reconciliation receives only a globally unique receipt ID after scanning accepted receipts across all workspaces; the receipt's workspaceId selects the projection schema.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ActionExecutionReceiptEntity)
    private readonly receiptRepository: Repository<ActionExecutionReceiptEntity>,
    @Inject(ACTION_RECEIPT_PROJECTION_WRITER)
    private readonly projectionWriter: ActionReceiptProjectionWriter,
  ) {}

  async projectReceipt(
    receiptId: string,
    faultHooks?: Pick<ActionApprovalFaultHooks, 'afterWorkspaceProjection'>,
  ): Promise<{ projected: boolean }> {
    return this.projectReceiptWithWriter(
      receiptId,
      this.projectionWriter,
      faultHooks,
    );
  }

  async projectReceiptWithWriter(
    receiptId: string,
    projectionWriter: ActionReceiptProjectionWriter,
    faultHooks?: Pick<ActionApprovalFaultHooks, 'afterWorkspaceProjection'>,
  ): Promise<{ projected: boolean }> {
    const receipt = await this.receiptRepository.findOne({
      where: { id: receiptId },
      relations: {
        actionApprovalBinding: { evidenceLinks: true },
      },
    });

    if (receipt?.state !== ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
      return { projected: false };
    }

    await projectionWriter.project(this.toProjectionInput(receipt));
    await faultHooks?.afterWorkspaceProjection?.(receipt.id);
    await this.receiptRepository.update(
      { id: receipt.id, state: ActionExecutionReceiptState.PROVIDER_ACCEPTED },
      { state: ActionExecutionReceiptState.SENT },
    );

    return { projected: true };
  }

  private toProjectionInput(
    receipt: ActionExecutionReceiptEntity,
  ): ActionReceiptProjectionInput {
    const binding = receipt.actionApprovalBinding;
    const base = {
      receiptId: receipt.id,
      workspaceId: receipt.workspaceId,
      draftId: binding.draftId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      contentDigest: binding.contentDigest,
      providerMessageId: receipt.providerMessageId,
      providerExternalMessageId: receipt.providerExternalMessageId,
      providerThreadExternalId: receipt.providerThreadExternalId,
      evidenceLinks: binding.evidenceLinks,
    };

    if (
      binding.actionName === 'send_inbox_reply' &&
      binding.actionVersion === 2 &&
      binding.myahReplyContextSnapshot?.channel === 'EMAIL' &&
      binding.myahReplyContextSnapshot.draftId === binding.draftId &&
      binding.recipientFingerprint !== null &&
      binding.sendingAccountFingerprint !== null &&
      binding.actionContextFingerprint !== null &&
      ((binding.threadId !== null &&
        binding.interactionContextType === null &&
        binding.interactionContextId === null) ||
        (binding.threadId === null &&
          binding.interactionContextType === 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT' &&
          binding.interactionContextId === binding.draftId))
    ) {
      return {
        ...base,
        actionName: 'send_inbox_reply',
        actionVersion: 2,
        threadId: binding.threadId,
        interactionContextType: binding.interactionContextType as
          | 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT'
          | null,
        interactionContextId: binding.interactionContextId,
        myahReplyContextSnapshot: binding.myahReplyContextSnapshot,
        recipientFingerprint: binding.recipientFingerprint,
        sendingAccountFingerprint: binding.sendingAccountFingerprint,
        actionContextFingerprint: binding.actionContextFingerprint,
      };
    }

    switch (binding.actionName) {
      case 'send_instagram_message':
        if (
          binding.actionVersion !== 2 ||
          (binding.actionKind !== 'START_CHAT' &&
            binding.actionKind !== 'REPLY') ||
          binding.recipientFingerprint === null ||
          binding.sendingAccountFingerprint === null ||
          binding.actionContextFingerprint === null ||
          binding.inboundMessageId !== null ||
          binding.inboundSenderIgsid !== null ||
          binding.inboundDirection !== null ||
          binding.inboundReceivedAt !== null
        ) {
          break;
        }

        return {
          ...base,
          actionName: 'send_instagram_message',
          actionVersion: 2,
          actionKind: binding.actionKind,
          threadId: binding.threadId,
          interactionContextType:
            binding.interactionContextType === 'MYAH_INBOX_INSTAGRAM_DRAFT'
              ? binding.interactionContextType
              : null,
          interactionContextId: binding.interactionContextId,
          recipientFingerprint: binding.recipientFingerprint,
          sendingAccountFingerprint: binding.sendingAccountFingerprint,
          actionContextFingerprint: binding.actionContextFingerprint,
        };
      case 'send_instagram_reply':
        if (
          binding.actionVersion !== 1 ||
          binding.threadId === null ||
          binding.actionContextFingerprint !== null ||
          binding.recipientFingerprint === null ||
          binding.sendingAccountFingerprint === null ||
          binding.inboundMessageId === null ||
          binding.inboundSenderIgsid === null ||
          binding.inboundDirection !== 'INBOUND' ||
          binding.inboundReceivedAt === null
        ) {
          break;
        }

        return {
          ...base,
          actionName: 'send_instagram_reply',
          actionVersion: 1,
          threadId: binding.threadId,
          recipientFingerprint: binding.recipientFingerprint,
          sendingAccountFingerprint: binding.sendingAccountFingerprint,
          actionContextFingerprint: null,
          inboundMessageId: binding.inboundMessageId,
          inboundSenderIgsid: binding.inboundSenderIgsid,
          inboundDirection: binding.inboundDirection,
          inboundReceivedAt: binding.inboundReceivedAt,
        };
      case 'send_outreach_email':
      case 'send_inbox_reply':
        if (
          binding.actionVersion !== 1 ||
          binding.threadId === null ||
          binding.recipientFingerprint === null ||
          binding.sendingAccountFingerprint === null ||
          binding.actionContextFingerprint === null ||
          binding.inboundMessageId !== null ||
          binding.inboundSenderIgsid !== null ||
          binding.inboundDirection !== null ||
          binding.inboundReceivedAt !== null
        ) {
          break;
        }

        return {
          ...base,
          actionName: binding.actionName,
          actionVersion: 1,
          threadId: binding.threadId,
          recipientFingerprint: binding.recipientFingerprint,
          sendingAccountFingerprint: binding.sendingAccountFingerprint,
          actionContextFingerprint: binding.actionContextFingerprint,
        };
    }

    throw new Error('Unsupported action receipt projection');
  }
}
