import { Inject, Injectable } from '@nestjs/common';

import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import {
  type ExpectedActionBindingWithWorkspace,
  type InstagramMessageInteractionContextType,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import {
  type InstagramActionBudgetBlockedResult,
  type InstagramActionBudgetReservedResult,
} from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.types';
import {
  INSTAGRAM_MESSAGE_AUTHORITY_READER,
  type InstagramMessageAuthorityReader,
} from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.type';
import { InstagramMessageDraftLockService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft-lock.service';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
import { InstagramMessageReceiptProjectionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-receipt-projection.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

export type ExecuteApprovedInstagramMessageInput = {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  approvalBindingId: string;
  threadId: string | null;
  interactionContextType?: InstagramMessageInteractionContextType | null;
  interactionContextId?: string | null;
  rolePermissionConfig: RolePermissionConfig;
};

export type SendDirectInstagramMessageInput = {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  draftId: string;
  expectedRevision: number;
  rolePermissionConfig: RolePermissionConfig;
};

export type InstagramMessageSendResult =
  | {
      status: 'SENT' | 'PROVIDER_ACCEPTED' | 'FAILED' | 'UNKNOWN' | 'BLOCKED';
      receiptId: string;
    }
  | (InstagramActionBudgetBlockedResult & { receiptId: string });

@Injectable()
export class InstagramMessageSendService {
  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    @Inject(INSTAGRAM_MESSAGE_AUTHORITY_READER)
    private readonly authorityReader: InstagramMessageAuthorityReader,
    private readonly draftLockService: InstagramMessageDraftLockService,
    private readonly budgetService: InstagramActionBudgetService,
    private readonly unipileClient: UnipileV1ClientService,
    private readonly projector: ActionReceiptProjectorService,
    private readonly messageProjectionWriter: InstagramMessageReceiptProjectionService,
    private readonly permissionService: InstagramMessagePermissionService,
    private readonly recordAccessService: InstagramMessageRecordAccessService,
  ) {}

  async sendDirect(
    input: SendDirectInstagramMessageInput,
  ): Promise<InstagramMessageSendResult> {
    const actionKind = await this.authorityReader.getDraftActionKind({
      workspaceId: input.workspaceId,
      draftId: input.draftId,
      expectedRevision: input.expectedRevision,
    });
    await this.permissionService.assertCanSend({
      actionKind,
      rolePermissionConfig: input.rolePermissionConfig,
      workspaceId: input.workspaceId,
    });
    if (actionKind === 'START_CHAT') {
      throw new Error('Instagram first-contact sending is unavailable');
    }
    const authority = await this.authorityReader.createDirectAuthority({
      workspaceId: input.workspaceId,
      initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
      draftId: input.draftId,
      expectedRevision: input.expectedRevision,
    });
    const binding =
      await this.actionApprovalService.createApprovedInstagramMessageBinding(
        authority.expectedActionBinding,
      );

    return this.executeApproved({
      workspaceId: input.workspaceId,
      initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
      approvalBindingId: binding.id,
      threadId: null,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
      interactionContextId: input.draftId,
      rolePermissionConfig: input.rolePermissionConfig,
    });
  }

  async executeApproved(
    input: ExecuteApprovedInstagramMessageInput,
  ): Promise<InstagramMessageSendResult> {
    const binding = await this.actionApprovalService.getApprovedBinding({
      workspaceId: input.workspaceId,
      approvalBindingId: input.approvalBindingId,
      initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
      threadId: input.threadId,
      interactionContextType: input.interactionContextType ?? null,
      interactionContextId: input.interactionContextId ?? null,
    });
    if (binding.actionName !== 'send_instagram_message') {
      throw new Error('An Instagram message v2 binding is required');
    }
    await this.permissionService.assertCanSend({
      actionKind: binding.actionKind,
      rolePermissionConfig: input.rolePermissionConfig,
      workspaceId: input.workspaceId,
    });

    return this.draftLockService.withLock(
      { workspaceId: input.workspaceId, draftId: binding.draftId },
      () => this.executeApprovedWithLockHeld(input, binding),
    );
  }

  private async executeApprovedWithLockHeld(
    input: ExecuteApprovedInstagramMessageInput,
    binding: Extract<
      ExpectedActionBindingWithWorkspace,
      { actionName: 'send_instagram_message' }
    >,
  ): Promise<InstagramMessageSendResult> {
    const existingReceipt =
      await this.actionApprovalService.findExecutionReceiptForBinding({
        workspaceId: input.workspaceId,
        approvalBindingId: input.approvalBindingId,
      });
    if (existingReceipt) {
      return this.finishExistingReceipt(
        existingReceipt.id,
        existingReceipt.state,
        input.workspaceId,
        binding.actionKind,
      );
    }
    // START bindings lack verified immutable messaging identity. Receipt recovery
    // must stay ahead of this fresh-execution boundary.
    if (binding.actionKind === 'START_CHAT') {
      throw new Error('Instagram first-contact sending is unavailable');
    }

    const accessibleDraft =
      await this.recordAccessService.assertCanExecuteDraft({
        workspaceId: input.workspaceId,
        draftId: binding.draftId,
        rolePermissionConfig: input.rolePermissionConfig,
      });
    const authority = await this.authorityReader.rebuildExecutionAuthority({
      workspaceId: input.workspaceId,
      binding,
    });

    if (
      accessibleDraft.instagramAccountRecordId !==
      authority.canonicalGraph.account.workspaceInstagramAccountRecordId
    ) {
      throw new Error('Instagram account is unavailable');
    }
    const executionReservation =
      await this.actionApprovalService.reserveExecutionForBinding({
        approvalBindingId: input.approvalBindingId,
        expectedActionBinding: authority.expectedActionBinding,
      });
    if (!executionReservation.created) {
      return this.finishExistingReceipt(
        executionReservation.receipt.id,
        executionReservation.receipt.state,
        input.workspaceId,
        binding.actionKind,
      );
    }

    const receiptId = executionReservation.receipt.id;
    let budgetReservation:
      | InstagramActionBudgetBlockedResult
      | InstagramActionBudgetReservedResult;
    try {
      budgetReservation = await this.budgetService.reserve({
        workspaceId: input.workspaceId,
        instagramAccountRecordId:
          authority.canonicalGraph.account.workspaceInstagramAccountRecordId,
        actionExecutionReceiptId: receiptId,
        actionKind: authority.canonicalGraph.draft.kind,
        targetFingerprint: authority.expectedActionBinding.recipientFingerprint,
      });
    } catch {
      await this.actionApprovalService.recordProviderTerminalState({
        receiptId,
        state: ActionExecutionReceiptState.FAILED,
        code: 'failed',
      });

      return { status: 'FAILED', receiptId };
    }
    if (budgetReservation.status === 'BLOCKED') {
      return { ...budgetReservation, receiptId };
    }

    try {
      await this.authorityReader.assertReadyAfterReservation(authority);
    } catch {
      await this.budgetService.releasePreDispatch({
        workspaceId: input.workspaceId,
        reservationId: budgetReservation.reservationId,
        reason: 'INSTAGRAM_TARGET_CHANGED',
      });
      await this.actionApprovalService.recordProviderTerminalState({
        receiptId,
        state: ActionExecutionReceiptState.BLOCKED,
        code: 'blocked',
      });

      return { status: 'BLOCKED', receiptId };
    }

    let providerAttempted = false;
    try {
      const beforeDispatch = async () => {
        await this.budgetService.markProviderAttempted({
          workspaceId: input.workspaceId,
          reservationId: budgetReservation.reservationId,
        });
        providerAttempted = true;
      };
      const draft = authority.canonicalGraph.draft;
      const account = authority.canonicalGraph.account;
      const providerOutcome =
        draft.kind === 'START_CHAT'
          ? await this.unipileClient.startChat(
              {
                accountId: account.unipileAccountId,
                attendeeId: draft.recipientProviderId,
                text: draft.body.trim(),
              },
              { beforeDispatch },
            )
          : await this.unipileClient.sendMessage(
              {
                accountId: account.unipileAccountId,
                chatId: draft.providerConversationId!,
                text: draft.body.trim(),
              },
              { beforeDispatch },
            );

      if (providerOutcome.kind === 'KNOWN_REJECTION') {
        await this.actionApprovalService.recordProviderTerminalState({
          receiptId,
          state: ActionExecutionReceiptState.FAILED,
          code: 'failed',
        });
        if (draft.kind === 'START_CHAT') {
          await this.budgetService.releaseStartTarget({
            workspaceId: input.workspaceId,
            reservationId: budgetReservation.reservationId,
            reason: 'KNOWN_REJECTION',
          });
        }

        return { status: 'FAILED', receiptId };
      }

      if (providerOutcome.kind === 'UNKNOWN') {
        await this.actionApprovalService.recordProviderTerminalState({
          receiptId,
          state: ActionExecutionReceiptState.UNKNOWN,
          code: 'unknown',
        });

        return { status: 'UNKNOWN', receiptId };
      }
      const acceptedChatId =
        'chatId' in providerOutcome.value &&
        typeof providerOutcome.value.chatId === 'string'
          ? providerOutcome.value.chatId
          : null;
      if (draft.kind === 'START_CHAT' && !acceptedChatId) {
        throw new Error('Unipile Start Chat response is incomplete');
      }
      const providerThreadExternalId =
        draft.kind === 'START_CHAT'
          ? acceptedChatId!
          : draft.providerConversationId!;
      await this.actionApprovalService.recordProviderAccepted(receiptId, {
        code: 'accepted',
        acceptedAt: new Date(),
        providerExternalMessageId: providerOutcome.value.messageId,
        providerThreadExternalId,
      });

      try {
        await this.projector.projectReceiptWithWriter(
          receiptId,
          this.messageProjectionWriter,
        );
        if (draft.kind === 'START_CHAT') {
          await this.budgetService.releaseStartTarget({
            workspaceId: input.workspaceId,
            reservationId: budgetReservation.reservationId,
            reason: 'PROJECTED',
          });
        }

        return { status: 'SENT', receiptId };
      } catch {
        return { status: 'PROVIDER_ACCEPTED', receiptId };
      }
    } catch {
      if (!providerAttempted) {
        await this.budgetService.releasePreDispatch({
          workspaceId: input.workspaceId,
          reservationId: budgetReservation.reservationId,
          reason: 'PROVIDER_DISPATCH_NOT_STARTED',
        });
        await this.actionApprovalService.recordProviderTerminalState({
          receiptId,
          state: ActionExecutionReceiptState.FAILED,
          code: 'failed',
        });

        return { status: 'FAILED', receiptId };
      }

      await this.actionApprovalService.recordProviderTerminalState({
        receiptId,
        state: ActionExecutionReceiptState.UNKNOWN,
        code: 'unknown',
      });

      return { status: 'UNKNOWN', receiptId };
    }
  }

  private async finishExistingReceipt(
    receiptId: string,
    state: string,
    workspaceId: string,
    actionKind: 'START_CHAT' | 'REPLY',
  ): Promise<InstagramMessageSendResult> {
    if (actionKind === 'START_CHAT') {
      if (state === ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
        return { status: 'PROVIDER_ACCEPTED', receiptId };
      }
      if (state === ActionExecutionReceiptState.PROCESSING) {
        throw new Error('Instagram message execution is pending');
      }
    }
    if (state === ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
      try {
        await this.projector.projectReceiptWithWriter(
          receiptId,
          this.messageProjectionWriter,
        );
        await this.budgetService.releaseStartTargetForReceipt({
          workspaceId,
          actionExecutionReceiptId: receiptId,
          reason: 'PROJECTED',
        });

        return { status: 'SENT', receiptId };
      } catch {
        return { status: 'PROVIDER_ACCEPTED', receiptId };
      }
    }

    if (state === ActionExecutionReceiptState.SENT) {
      await this.budgetService.releaseStartTargetForReceipt({
        workspaceId,
        actionExecutionReceiptId: receiptId,
        reason: 'PROJECTED',
      });

      return { status: 'SENT', receiptId };
    }

    if (state === ActionExecutionReceiptState.UNKNOWN) {
      return { status: 'UNKNOWN', receiptId };
    }

    if (state === ActionExecutionReceiptState.BLOCKED) {
      return { status: 'BLOCKED', receiptId };
    }

    await this.budgetService.releaseStartTargetForReceipt({
      workspaceId,
      actionExecutionReceiptId: receiptId,
      reason: 'RESOLVED',
    });

    return { status: 'FAILED', receiptId };
  }
}
