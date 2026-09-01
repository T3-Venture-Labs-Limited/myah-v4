import { ForbiddenException, Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import {
  MyahInboxReplyActionDefinition,
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
  type MyahInboxReplyActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { type SafeActionExecutionReceipt } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MyahInboxReplySendOutcome,
  MyahInboxReplySendReadinessStatus,
  type MyahInboxReplySendReadiness,
  type MyahInboxReplySendResult,
  type MyahInboxReplySendStatus,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send.dto';
import { MyahInboxDraftSaveStatus } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';
import { classifyMessageOutboundError } from 'src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util';

type MyahInboxReplySendRequestContext = {
  authContext: WorkspaceAuthContext;
  user: AuthContextUser | undefined;
  workspace: WorkspaceEntity;
  userWorkspaceId: string;
  workspaceMemberId: string;
  threadId: string;
};

export type MyahInboxReplySendRequest = MyahInboxReplySendRequestContext & {
  expectedDraftRevision: number;
};

export type MyahInboxReplySendStatusRequest =
  MyahInboxReplySendRequestContext & {
    receiptId: string;
  };

const readinessReasons: Record<MyahInboxReplyUnavailableCode, string> = {
  [MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE]:
    'This Inbox thread is unavailable for a reply.',
  [MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE]:
    'The sending mailbox is unavailable for this reply.',
  [MyahInboxReplyUnavailableCode.RECIPIENT_UNAVAILABLE]:
    'The reply recipient is unavailable.',
  [MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED]:
    'Reconnect the sending mailbox before sending this reply.',
  [MyahInboxReplyUnavailableCode.MAILBOX_INELIGIBLE]:
    'The sending mailbox is not eligible to send this reply.',
};

const readinessStatuses: Record<
  MyahInboxReplyUnavailableCode,
  MyahInboxReplySendReadinessStatus
> = {
  [MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE]:
    MyahInboxReplySendReadinessStatus.THREAD_UNAVAILABLE,
  [MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE]:
    MyahInboxReplySendReadinessStatus.SENDER_UNAVAILABLE,
  [MyahInboxReplyUnavailableCode.RECIPIENT_UNAVAILABLE]:
    MyahInboxReplySendReadinessStatus.RECIPIENT_UNAVAILABLE,
  [MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED]:
    MyahInboxReplySendReadinessStatus.RECONNECT_REQUIRED,
  [MyahInboxReplyUnavailableCode.MAILBOX_INELIGIBLE]:
    MyahInboxReplySendReadinessStatus.MAILBOX_INELIGIBLE,
};

@Injectable()
export class MyahInboxReplySendService {
  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    private readonly actionDefinition: MyahInboxReplyActionDefinition,
    private readonly messageOutboundService: MessagingMessageOutboundService,
    private readonly projector: ActionReceiptProjectorService,
    private readonly myahInboxMutationService: MyahInboxMutationService,
  ) {}
  async getReadiness(
    input: MyahInboxReplySendRequestContext,
  ): Promise<MyahInboxReplySendReadiness> {
    this.assertUserRequest(input);

    try {
      await this.actionDefinition.getReadableDraftSnapshot({
        workspaceId: input.workspace.id,
        initiatorUserWorkspaceId: input.userWorkspaceId,
        messageThreadId: input.threadId,
      });

      const executionState =
        await this.actionApprovalService.getInboxReplyDraftExecutionState({
          workspaceId: input.workspace.id,
          draftId: input.threadId,
        });

      if (executionState === 'UNKNOWN') {
        return {
          status: MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN,
          reason: 'The previous delivery outcome is unknown.',
        };
      }
      if (executionState === 'PENDING') {
        return {
          status: MyahInboxReplySendReadinessStatus.OUTCOME_PENDING,
          reason: 'The previous delivery is still being confirmed.',
        };
      }

      await this.actionDefinition.buildAuthority({
        workspaceId: input.workspace.id,
        initiatorUserWorkspaceId: input.userWorkspaceId,
        messageThreadId: input.threadId,
      });

      return { status: MyahInboxReplySendReadinessStatus.READY, reason: null };
    } catch (error) {
      return this.toReadiness(error);
    }
  }

  async send(
    input: MyahInboxReplySendRequest,
  ): Promise<MyahInboxReplySendResult> {
    this.assertUserRequest(input);

    const preparation = await this.prepareSend(input);

    if ('result' in preparation) {
      return preparation.result;
    }

    const { authority, receipt } = preparation;
    const graph = authority.canonicalGraph;
    let sent: SendMessageResult;
    try {
      sent = await this.messageOutboundService.sendMessage(
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
    } catch (error) {
      return this.recordProviderFailure(input, authority, receipt.id, error);
    }

    try {
      await this.actionApprovalService.recordProviderAccepted(receipt.id, {
        code: 'accepted',
        acceptedAt: new Date(),
        providerMessageId: sent.headerMessageId,
        providerExternalMessageId: sent.messageExternalId,
        providerThreadExternalId: sent.threadExternalId,
      });
    } catch {
      return this.toUnknownOutcome(input, receipt.id, authority);
    }

    try {
      await this.projector.projectReceipt(receipt.id);
    } catch {
      // Reconciliation retries this provider-free projection without issuing a send.
    }

    return this.getStatus({ ...input, receiptId: receipt.id });
  }

  private async prepareSend(input: MyahInboxReplySendRequest): Promise<
    | { result: MyahInboxReplySendResult }
    | {
        authority: MyahInboxReplyActionAuthority;
        receipt: SafeActionExecutionReceipt;
      }
  > {
    try {
      return await this.actionApprovalService.executeInboxReplyLocked(
        { workspaceId: input.workspace.id, draftId: input.threadId },
        async () => {
          let authority: MyahInboxReplyActionAuthority;
          try {
            authority = await this.actionDefinition.buildAuthority({
              workspaceId: input.workspace.id,
              initiatorUserWorkspaceId: input.userWorkspaceId,
              messageThreadId: input.threadId,
              expectedDraftRevision: input.expectedDraftRevision,
            });
          } catch {
            return { result: this.toStaleOutcome(input) };
          }

          let binding: { id: string };
          try {
            binding =
              await this.actionApprovalService.createApprovedInboxReplyBinding(
                authority.expectedActionBinding,
              );
          } catch {
            return { result: this.toStaleOutcome(input) };
          }

          let rebuilt: MyahInboxReplyActionAuthority;
          try {
            rebuilt = await this.actionDefinition.rebuildExecutionAuthority({
              workspaceId: input.workspace.id,
              binding: authority.expectedActionBinding,
            });
          } catch {
            await this.invalidateBinding(input, binding.id);

            return { result: this.toStaleOutcome(input) };
          }

          try {
            const reservation =
              await this.actionApprovalService.reserveExecutionForBinding({
                approvalBindingId: binding.id,
                expectedActionBinding: rebuilt.expectedActionBinding,
              });

            if (
              !reservation.created ||
              reservation.receipt.state !==
                ActionExecutionReceiptState.PROCESSING
            ) {
              return {
                result: this.toReceiptOutcome(
                  input,
                  reservation.receipt,
                  rebuilt,
                ),
              };
            }

            return { authority: rebuilt, receipt: reservation.receipt };
          } catch {
            await this.invalidateBinding(input, binding.id);

            return { result: this.toStaleOutcome(input) };
          }
        },
      );
    } catch {
      return { result: this.toStaleOutcome(input) };
    }
  }

  async getStatus(
    input: MyahInboxReplySendStatusRequest,
  ): Promise<MyahInboxReplySendStatus> {
    this.assertUserRequest(input);

    try {
      const draft = await this.actionDefinition.getReadableDraftSnapshot({
        workspaceId: input.workspace.id,
        initiatorUserWorkspaceId: input.userWorkspaceId,
        messageThreadId: input.threadId,
      });
      const receipt =
        await this.actionApprovalService.findInboxReplyExecutionReceipt({
          workspaceId: input.workspace.id,
          receiptId: input.receiptId,
          draftId: input.threadId,
          initiatorUserWorkspaceId: input.userWorkspaceId,
          messageThreadMetadataId: draft.messageThreadMetadataId,
        });

      if (!receipt) {
        return {
          outcome: MyahInboxReplySendOutcome.STALE,
          receiptId: null,
          revision: 0,
          body: null,
        };
      }

      return {
        outcome: this.toOutcome(receipt.state),
        receiptId: receipt.id,
        revision: draft.revision,
        body: draft.body,
      };
    } catch {
      return {
        outcome: MyahInboxReplySendOutcome.STALE,
        receiptId: null,
        revision: 0,
        body: null,
      };
    }
  }

  private async recordProviderFailure(
    input: MyahInboxReplySendRequest,
    authority: MyahInboxReplyActionAuthority,
    receiptId: string,
    error: unknown,
  ): Promise<MyahInboxReplySendResult> {
    if (classifyMessageOutboundError(error).kind !== 'rejected') {
      return this.toUnknownOutcome(input, receiptId, authority);
    }

    try {
      const draft =
        await this.myahInboxMutationService.saveMyahInboxDraftAfterProviderFailure(
          {
            ...input,
            expectedRevision: authority.canonicalGraph.draftRevision,
            body: authority.canonicalGraph.draftBody,
          },
        );
      if (draft.status !== MyahInboxDraftSaveStatus.SAVED) {
        return this.toUnknownOutcome(input, receiptId, authority);
      }

      const receipt =
        await this.actionApprovalService.recordProviderTerminalState({
          receiptId,
          state: ActionExecutionReceiptState.FAILED,
          code: 'failed',
        });
      if (receipt.state !== ActionExecutionReceiptState.FAILED) {
        return this.toReceiptOutcome(input, receipt, authority);
      }

      return {
        outcome: MyahInboxReplySendOutcome.FAILED,
        receiptId,
        revision: draft.revision,
        body: draft.body,
      };
    } catch {
      return this.toUnknownOutcome(input, receiptId, authority);
    }
  }

  private async toUnknownOutcome(
    input: MyahInboxReplySendRequest,
    receiptId: string,
    authority?: MyahInboxReplyActionAuthority,
  ): Promise<MyahInboxReplySendResult> {
    try {
      await this.actionApprovalService.recordProviderTerminalState({
        receiptId,
        state: ActionExecutionReceiptState.UNKNOWN,
        code: 'unknown',
      });
    } catch {
      // The public result remains unknown when the receipt store is unavailable.
    }

    return this.toResult(
      MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
      authority,
      input,
    );
  }

  private async invalidateBinding(
    input: MyahInboxReplySendRequest,
    approvalBindingId: string,
  ): Promise<void> {
    try {
      await this.actionApprovalService.invalidateApprovedInboxReplyBinding({
        workspaceId: input.workspace.id,
        approvalBindingId,
        initiatorUserWorkspaceId: input.userWorkspaceId,
        threadId: input.threadId,
        draftId: input.threadId,
      });
    } catch {
      // A stale outcome is safer than exposing cleanup storage failures.
    }
  }

  private toReadiness(error: unknown): MyahInboxReplySendReadiness {
    if (error instanceof MyahInboxReplyUnavailableError) {
      return {
        status: readinessStatuses[error.code],
        reason: readinessReasons[error.code],
      };
    }

    return {
      status: MyahInboxReplySendReadinessStatus.THREAD_UNAVAILABLE,
      reason:
        readinessReasons[MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE],
    };
  }

  private toReceiptOutcome(
    input: MyahInboxReplySendRequest,
    receipt: SafeActionExecutionReceipt,
    authority: MyahInboxReplyActionAuthority,
  ): MyahInboxReplySendResult {
    return this.toResult(
      this.toOutcome(receipt.state),
      receipt.id,
      authority,
      input,
    );
  }

  private toStaleOutcome(
    input: MyahInboxReplySendRequest,
  ): MyahInboxReplySendResult {
    return {
      outcome: MyahInboxReplySendOutcome.STALE,
      receiptId: null,
      revision: input.expectedDraftRevision,
      body: null,
    };
  }

  private toResult(
    outcome: MyahInboxReplySendOutcome,
    receiptId: string,
    authority?: MyahInboxReplyActionAuthority,
    input?: MyahInboxReplySendRequest,
  ): MyahInboxReplySendResult {
    return {
      outcome,
      receiptId,
      revision:
        authority?.canonicalGraph.draftRevision ??
        input?.expectedDraftRevision ??
        0,
      body: authority?.canonicalGraph.draftBody ?? null,
    };
  }

  private toOutcome(state: string): MyahInboxReplySendOutcome {
    switch (state) {
      case ActionExecutionReceiptState.SENT:
        return MyahInboxReplySendOutcome.SENT;
      case ActionExecutionReceiptState.FAILED:
      case ActionExecutionReceiptState.BLOCKED:
        return MyahInboxReplySendOutcome.FAILED;
      case ActionExecutionReceiptState.UNKNOWN:
        return MyahInboxReplySendOutcome.UNKNOWN;
      case ActionExecutionReceiptState.PROCESSING:
      case ActionExecutionReceiptState.PROVIDER_ACCEPTED:
        return MyahInboxReplySendOutcome.SENDING;
      default:
        return MyahInboxReplySendOutcome.UNKNOWN;
    }
  }

  private assertUserRequest(
    input: MyahInboxReplySendRequestContext,
  ): asserts input is MyahInboxReplySendRequestContext & {
    authContext: Extract<WorkspaceAuthContext, { type: 'user' }>;
    user: AuthContextUser;
  } {
    if (
      !isUserAuthContext(input.authContext) ||
      !isDefined(input.authContext.user) ||
      !isDefined(input.user) ||
      input.authContext.user.id !== input.user.id ||
      input.authContext.workspace.id !== input.workspace.id ||
      input.authContext.userWorkspaceId !== input.userWorkspaceId ||
      input.authContext.workspaceMemberId !== input.workspaceMemberId
    ) {
      throw new ForbiddenException(
        'The Myah Inbox requires matching authenticated user context',
      );
    }
  }
}
