import { Injectable } from '@nestjs/common';

import {
  MyahInboxReplyActionDefinition,
  type MyahInboxReplyActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { type MyahInboxReplyExpectedActionBindingWithWorkspace } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { type SafeActionExecutionReceipt } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import {
  MyahInboxDraftSaveStatus,
  type MyahInboxDraftSaveResult,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';
import { AgentActorContextService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { classifyMessageOutboundError } from 'src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util';

export type ExecuteApprovedInboxReplyInput = {
  approvalBindingId: string;
  binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
  workspaceId: string;
};

export type MyahInboxReplyExecutionResult = {
  receipt: SafeActionExecutionReceipt;
  authority: MyahInboxReplyActionAuthority | null;
  draft: MyahInboxDraftSaveResult | null;
};

@Injectable()
export class MyahInboxReplyApprovedExecutionService {
  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    private readonly actionDefinition: MyahInboxReplyActionDefinition,
    private readonly messageOutboundService: MessagingMessageOutboundService,
    private readonly projector: ActionReceiptProjectorService,
    private readonly myahInboxMutationService: MyahInboxMutationService,
    private readonly agentActorContextService: AgentActorContextService,
  ) {}

  async execute(
    input: ExecuteApprovedInboxReplyInput,
  ): Promise<MyahInboxReplyExecutionResult> {
    const binding = this.getExpectedBinding(input);
    const reservation =
      await this.actionApprovalService.executeInboxReplyLocked(
        { workspaceId: input.workspaceId, draftId: binding.draftId },
        async () => {
          const existingReceipt =
            await this.actionApprovalService.findExecutionReceiptForBinding({
              workspaceId: input.workspaceId,
              approvalBindingId: input.approvalBindingId,
            });

          if (existingReceipt) {
            return {
              authority: null,
              created: false,
              receipt: existingReceipt,
            };
          }

          const authority =
            await this.actionDefinition.rebuildExecutionAuthority({
              workspaceId: input.workspaceId,
              binding,
            });
          const receiptReservation =
            await this.actionApprovalService.reserveExecutionForBinding({
              approvalBindingId: input.approvalBindingId,
              expectedActionBinding: authority.expectedActionBinding,
            });

          return {
            authority,
            created: receiptReservation.created,
            receipt: receiptReservation.receipt,
          };
        },
      );

    if (reservation.authority === null) {
      if (
        reservation.receipt.state ===
        ActionExecutionReceiptState.PROVIDER_ACCEPTED
      ) {
        await this.reconcileProjection(reservation.receipt.id);
      }

      return { receipt: reservation.receipt, authority: null, draft: null };
    }

    if (
      !reservation.created ||
      reservation.receipt.state !== ActionExecutionReceiptState.PROCESSING
    ) {
      if (
        reservation.receipt.state ===
        ActionExecutionReceiptState.PROVIDER_ACCEPTED
      ) {
        await this.reconcileProjection(reservation.receipt.id);
      }

      return {
        receipt: reservation.receipt,
        authority: reservation.authority,
        draft: null,
      };
    }

    return this.executeReservedReceipt({
      binding: input.binding,
      receipt: reservation.receipt,
      authority: reservation.authority,
    });
  }

  private async executeReservedReceipt({
    binding,
    receipt,
    authority,
  }: {
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
    receipt: SafeActionExecutionReceipt;
    authority: MyahInboxReplyActionAuthority;
  }): Promise<MyahInboxReplyExecutionResult> {
    const graph = authority.canonicalGraph;

    try {
      const sent = await this.messageOutboundService.sendMessage(
        {
          to: [graph.recipientEmail],
          subject: graph.subject,
          body: graph.draftBody.markdown,
          html: escapeHtml(graph.draftBody.markdown),
          attachments: [],
          inReplyTo: graph.inReplyTo,
          threadExternalId: graph.providerThreadExternalId ?? undefined,
        },
        graph.connectedAccount,
      );
      const accepted = await this.actionApprovalService.recordProviderAccepted(
        receipt.id,
        {
          code: 'accepted',
          acceptedAt: new Date(),
          providerMessageId: sent.headerMessageId,
          providerExternalMessageId: sent.messageExternalId,
          providerThreadExternalId: sent.threadExternalId,
        },
      );

      await this.reconcileProjection(receipt.id);

      return { receipt: accepted, authority, draft: null };
    } catch (error) {
      if (classifyMessageOutboundError(error).kind !== 'rejected') {
        return this.toUnknownOutcome({ receipt, authority });
      }

      return this.recordProviderFailure({ binding, receipt, authority });
    }
  }

  private async recordProviderFailure({
    binding,
    receipt,
    authority,
  }: {
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
    receipt: SafeActionExecutionReceipt;
    authority: MyahInboxReplyActionAuthority;
  }): Promise<MyahInboxReplyExecutionResult> {
    try {
      const actor =
        await this.agentActorContextService.buildUserAndAgentActorContext(
          binding.initiatorUserWorkspaceId,
          binding.workspaceId,
        );
      if (
        actor.userWorkspaceId !== binding.initiatorUserWorkspaceId ||
        actor.authContext.workspace.id !== binding.workspaceId ||
        actor.authContext.userWorkspaceId !==
          binding.initiatorUserWorkspaceId ||
        actor.authContext.user.id !== actor.userId ||
        actor.authContext.workspaceMemberId !==
          actor.actorContext.workspaceMemberId
      ) {
        throw new Error(
          'The approved Inbox reply actor context is unavailable',
        );
      }

      const draft =
        await this.myahInboxMutationService.saveMyahInboxDraftAfterProviderFailure(
          {
            authContext: actor.authContext,
            user: actor.authContext.user,
            workspace: actor.authContext.workspace,
            workspaceMemberId: actor.authContext.workspaceMemberId,
            threadId: authority.canonicalGraph.messageThreadId,
            expectedRevision: authority.canonicalGraph.draftRevision,
            body: authority.canonicalGraph.draftBody,
          },
        );
      if (draft.status !== MyahInboxDraftSaveStatus.SAVED) {
        return this.toUnknownOutcome({ receipt, authority });
      }

      const failed =
        await this.actionApprovalService.recordProviderTerminalState({
          receiptId: receipt.id,
          state: ActionExecutionReceiptState.FAILED,
          code: 'failed',
        });

      return { receipt: failed, authority, draft };
    } catch {
      return this.toUnknownOutcome({ receipt, authority });
    }
  }

  private async toUnknownOutcome({
    receipt,
    authority,
  }: {
    receipt: SafeActionExecutionReceipt;
    authority: MyahInboxReplyActionAuthority;
  }): Promise<MyahInboxReplyExecutionResult> {
    try {
      const unknown =
        await this.actionApprovalService.recordProviderTerminalState({
          receiptId: receipt.id,
          state: ActionExecutionReceiptState.UNKNOWN,
          code: 'unknown',
        });

      return { receipt: unknown, authority, draft: null };
    } catch {
      return {
        receipt: { ...receipt, state: ActionExecutionReceiptState.UNKNOWN },
        authority,
        draft: null,
      };
    }
  }

  private async reconcileProjection(receiptId: string): Promise<void> {
    try {
      await this.projector.projectReceipt(receiptId);
    } catch {
      // Reconciliation retries this provider-free projection without issuing a send.
    }
  }

  private getExpectedBinding({
    binding,
    workspaceId,
  }: ExecuteApprovedInboxReplyInput): MyahInboxReplyExpectedActionBindingWithWorkspace {
    if (
      binding.workspaceId !== workspaceId ||
      binding.actionName !== 'send_inbox_reply' ||
      binding.actionVersion !== 1
    ) {
      throw new Error('An approved Inbox reply binding is required');
    }

    return binding;
  }
}
