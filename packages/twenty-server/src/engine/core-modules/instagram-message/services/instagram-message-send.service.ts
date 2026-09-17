import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { computeInstagramActionTargetFingerprints } from 'src/engine/core-modules/instagram-action-budget/utils/instagram-action-target-fingerprint.util';
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
    await this.recordAccessService.assertCanExecuteDraft({
      workspaceId: input.workspaceId,
      draftId: input.draftId,
      rolePermissionConfig: input.rolePermissionConfig,
    });
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
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
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
      () => this.executeApprovedWithDraftLockHeld(input, binding),
    );
  }

  /**
   * Executes on an already-held draft advisory-lock session. Composer orchestration
   * uses this seam after taking its handle lock followed by the draft lock; callers
   * must never wrap it in a second `withLock` connection.
   */
  async executeApprovedWithDraftLockHeld(
    input: ExecuteApprovedInstagramMessageInput,
    binding: Extract<
      ExpectedActionBindingWithWorkspace,
      { actionName: 'send_instagram_message' }
    >,
  ): Promise<InstagramMessageSendResult> {
    if (
      input.workspaceId !== binding.workspaceId ||
      input.initiatorUserWorkspaceId !== binding.initiatorUserWorkspaceId ||
      input.threadId !== binding.threadId ||
      (input.interactionContextType ?? null) !==
        binding.interactionContextType ||
      (input.interactionContextId ?? null) !== binding.interactionContextId
    ) {
      throw new Error('Instagram approval context changed');
    }
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
        binding.actionVersion,
      );
    }
    // Legacy START bindings have no verified immutable messaging identity.
    if (binding.actionVersion === 2 && binding.actionKind === 'START_CHAT') {
      throw new Error('Instagram first-contact sending is unavailable');
    }

    await this.permissionService.assertCanSend({
      actionKind: binding.actionKind,
      workspaceId: input.workspaceId,
      rolePermissionConfig: input.rolePermissionConfig,
    });
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
        binding.actionVersion,
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
        ...(binding.actionVersion === 3
          ? {
              ...computeInstagramActionTargetFingerprints({
                instagramAccountRecordId:
                  binding.instagramMessageSnapshot.instagramAccountRecordId,
                normalizedHandle:
                  binding.instagramMessageSnapshot.publicIdentifier,
                providerId: binding.instagramMessageSnapshot.providerId,
                providerMessagingId:
                  binding.instagramMessageSnapshot.providerMessagingId,
              }),
              providerMessagingId:
                binding.instagramMessageSnapshot.providerMessagingId,
            }
          : {
              targetFingerprint:
                authority.expectedActionBinding.recipientFingerprint,
            }),
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
      await this.permissionService.assertCanSend({
        actionKind: binding.actionKind,
        workspaceId: input.workspaceId,
        rolePermissionConfig: input.rolePermissionConfig,
      });
      if (binding.actionVersion === 3) {
        const currentDraft =
          await this.recordAccessService.assertCanExecuteDraft({
            workspaceId: input.workspaceId,
            draftId: binding.draftId,
            rolePermissionConfig: input.rolePermissionConfig,
          });
        if (
          currentDraft.instagramAccountRecordId !==
          binding.instagramMessageSnapshot.instagramAccountRecordId
        )
          throw new Error('Instagram account changed');
      }
      if (binding.actionVersion === 3) {
        const currentBinding =
          await this.actionApprovalService.getApprovedBinding(input);
        const evidenceKey = (links: typeof binding.evidenceLinks) =>
          JSON.stringify(
            links
              .map(({ objectMetadataId, recordId, role }) =>
                JSON.stringify([objectMetadataId, recordId, role]),
              )
              .sort(),
          );
        if (
          computeLogicalActionKey(currentBinding) !==
            computeLogicalActionKey(binding) ||
          evidenceKey(currentBinding.evidenceLinks) !==
            evidenceKey(binding.evidenceLinks)
        )
          throw new Error('Instagram approval changed');
      }
      // Provider verification and the final local fingerprint comparison run last.
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
                attendeeId:
                  binding.actionVersion === 3
                    ? binding.instagramMessageSnapshot.providerMessagingId
                    : draft.recipientProviderId,
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
      if (
        !providerOutcome.value.messageId ||
        (draft.kind === 'START_CHAT' && !acceptedChatId) ||
        (draft.kind === 'REPLY' &&
          acceptedChatId !== null &&
          acceptedChatId !== draft.providerConversationId)
      ) {
        throw new Error(
          'Unipile message response is incomplete or contradictory',
        );
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
        const projection = await this.projector.projectReceiptWithWriter(
          receiptId,
          this.messageProjectionWriter,
        );
        if (!projection.projected)
          return { status: 'PROVIDER_ACCEPTED', receiptId };
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
    actionVersion: 2 | 3,
  ): Promise<InstagramMessageSendResult> {
    if (
      actionVersion === 3 &&
      state === ActionExecutionReceiptState.PROCESSING
    ) {
      throw new Error('Instagram message execution is pending');
    }
    if (actionVersion === 2 && actionKind === 'START_CHAT') {
      if (state === ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
        return { status: 'PROVIDER_ACCEPTED', receiptId };
      }
      if (state === ActionExecutionReceiptState.PROCESSING) {
        throw new Error('Instagram message execution is pending');
      }
    }
    if (state === ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
      try {
        const projection = await this.projector.projectReceiptWithWriter(
          receiptId,
          this.messageProjectionWriter,
        );
        if (!projection.projected)
          return { status: 'PROVIDER_ACCEPTED', receiptId };
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
