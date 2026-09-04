import { ForbiddenException, Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import {
  MyahInboxReplyActionDefinition,
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
  type MyahInboxReplyActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
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
import {
  MyahInboxReplyApprovedExecutionService,
  type MyahInboxReplyExecutionResult,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-approved-execution.service';

type MyahInboxReplySendRequestContext = {
  authContext: WorkspaceAuthContext;
  user: AuthContextUser | undefined;
  workspace: { id: string };
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
    private readonly approvedExecutionService: MyahInboxReplyApprovedExecutionService,
  ) {}

  async getReadiness(
    input: MyahInboxReplySendRequestContext,
  ): Promise<MyahInboxReplySendReadiness> {
    this.assertUserRequest(input);

    let draftState: Pick<MyahInboxReplySendReadiness, 'revision' | 'body'> = {
      revision: 0,
      body: null,
    };

    try {
      const draft = await this.actionDefinition.getReadableDraftSnapshot({
        workspaceId: input.workspace.id,
        initiatorUserWorkspaceId: input.userWorkspaceId,
        messageThreadId: input.threadId,
      });

      draftState = { revision: draft.revision, body: draft.body };

      const executionState =
        await this.actionApprovalService.getInboxReplyDraftExecutionState({
          workspaceId: input.workspace.id,
          draftId: input.threadId,
        });

      if (executionState === 'UNKNOWN') {
        return {
          status: MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN,
          reason: 'The previous delivery outcome is unknown.',
          ...draftState,
        };
      }
      if (executionState === 'PENDING') {
        return {
          status: MyahInboxReplySendReadinessStatus.OUTCOME_PENDING,
          reason: 'The previous delivery is still being confirmed.',
          ...draftState,
        };
      }

      await this.actionDefinition.buildAuthority({
        workspaceId: input.workspace.id,
        initiatorUserWorkspaceId: input.userWorkspaceId,
        messageThreadId: input.threadId,
      });

      return {
        status: MyahInboxReplySendReadinessStatus.READY,
        reason: null,
        ...draftState,
      };
    } catch (error) {
      return this.toReadiness(error, draftState);
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

    try {
      const execution = await this.approvedExecutionService.execute({
        approvalBindingId: preparation.binding.id,
        binding: preparation.authority.expectedActionBinding,
        workspaceId: input.workspace.id,
      });

      return this.toExecutionResult(input, execution);
    } catch {
      await this.invalidateBinding(input, preparation.binding.id);

      return this.toStaleOutcome(input);
    }
  }

  private async prepareSend(input: MyahInboxReplySendRequest): Promise<
    | { result: MyahInboxReplySendResult }
    | {
        authority: MyahInboxReplyActionAuthority;
        binding: ActionApprovalBindingEntity;
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

          try {
            const createdBinding =
              await this.actionApprovalService.createApprovedInboxReplyBinding(
                authority.expectedActionBinding,
              );

            return {
              authority,
              binding: {
                id: createdBinding.id,
                ...authority.expectedActionBinding,
              } as ActionApprovalBindingEntity,
            };
          } catch {
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

  private async toExecutionResult(
    input: MyahInboxReplySendRequest,
    execution: MyahInboxReplyExecutionResult,
  ): Promise<MyahInboxReplySendResult> {
    if (
      execution.receipt.state === ActionExecutionReceiptState.PROVIDER_ACCEPTED
    ) {
      return this.getStatus({ ...input, receiptId: execution.receipt.id });
    }

    if (
      execution.receipt.state === ActionExecutionReceiptState.FAILED &&
      execution.draft !== null
    ) {
      return {
        outcome: MyahInboxReplySendOutcome.FAILED,
        receiptId: execution.receipt.id,
        revision: execution.draft.revision,
        body: execution.draft.body,
      };
    }

    return this.toReceiptOutcome(input, execution.receipt, execution.authority);
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

  private toReadiness(
    error: unknown,
    draftState: Pick<MyahInboxReplySendReadiness, 'revision' | 'body'>,
  ): MyahInboxReplySendReadiness {
    if (error instanceof MyahInboxReplyUnavailableError) {
      return {
        status: readinessStatuses[error.code],
        reason: readinessReasons[error.code],
        ...draftState,
      };
    }

    return {
      status: MyahInboxReplySendReadinessStatus.THREAD_UNAVAILABLE,
      reason:
        readinessReasons[MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE],
      ...draftState,
    };
  }

  private toReceiptOutcome(
    input: MyahInboxReplySendRequest,
    receipt: SafeActionExecutionReceipt,
    authority: MyahInboxReplyActionAuthority | null,
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
    authority: MyahInboxReplyActionAuthority | null | undefined,
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
