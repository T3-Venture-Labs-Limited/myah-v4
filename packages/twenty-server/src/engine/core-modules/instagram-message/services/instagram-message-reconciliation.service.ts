import { Inject, Injectable } from '@nestjs/common';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { type InstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import {
  INSTAGRAM_MESSAGE_AUTHORITY_READER,
  type InstagramMessageAuthorityReader,
} from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.type';
import { InstagramMessageReceiptProjectionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-receipt-projection.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import {
  hasContradictoryUnipileInstagramSenderEvidence,
  type UnipileInstagramMessage,
  unipileInstagramMessageDirection,
} from 'src/modules/myah-unipile/types/unipile-v1.type';
const CLEAR_NOT_SENT_MINIMUM_AGE_MS = 24 * 60 * 60 * 1000;

export type InstagramMessageReconciliationInspection =
  | { kind: 'MATCH'; chatId: string; messageId: string }
  | { kind: 'NO_MATCH_COMPLETE' }
  | { kind: 'INDETERMINATE' };

@Injectable()
export class InstagramMessageReconciliationService {
  constructor(
    @InjectWorkspaceScopedRepository(ActionExecutionReceiptEntity)
    private readonly receiptRepository: WorkspaceScopedRepository<ActionExecutionReceiptEntity>,
    @InjectWorkspaceScopedRepository(InstagramActionReservationEntity)
    private readonly reservationRepository: WorkspaceScopedRepository<InstagramActionReservationEntity>,
    private readonly actionApprovalService: ActionApprovalService,
    @Inject(INSTAGRAM_MESSAGE_AUTHORITY_READER)
    private readonly authorityReader: InstagramMessageAuthorityReader,
    private readonly unipileClient: UnipileV1ClientService,
    private readonly projector: ActionReceiptProjectorService,
    private readonly messageProjectionWriter: InstagramMessageReceiptProjectionService,
    private readonly budgetService: InstagramActionBudgetService,
  ) {}

  async inspectUnknown(input: {
    workspaceId: string;
    receiptId: string;
  }): Promise<InstagramMessageReconciliationInspection> {
    const receipt = await this.receiptRepository.findOne(input.workspaceId, {
      where: {
        id: input.receiptId,
        workspaceId: input.workspaceId,
        state: ActionExecutionReceiptState.UNKNOWN,
      },
      relations: { actionApprovalBinding: { evidenceLinks: true } },
    });
    if (
      !receipt ||
      receipt.actionApprovalBinding.actionName !== 'send_instagram_message' ||
      receipt.actionApprovalBinding.actionVersion !== 2
    ) {
      throw new Error('Unknown Instagram message receipt is unavailable');
    }
    // Existing v2 START bindings lack a verified messaging-ID snapshot and
    // attendee namespace contract. Future START support must review both.
    if (receipt.actionApprovalBinding.actionKind === 'START_CHAT') {
      return { kind: 'INDETERMINATE' };
    }
    const reservation = await this.reservationRepository.findOne(
      input.workspaceId,
      {
        where: {
          workspaceId: input.workspaceId,
          actionExecutionReceiptId: input.receiptId,
        },
      },
    );
    if (!reservation?.providerAttemptedAt) {
      return { kind: 'INDETERMINATE' };
    }
    const stored = receipt.actionApprovalBinding;
    const binding = await this.actionApprovalService.getApprovedBinding({
      workspaceId: input.workspaceId,
      approvalBindingId: stored.id,
      initiatorUserWorkspaceId: stored.initiatorUserWorkspaceId,
      threadId: stored.threadId,
      interactionContextType:
        stored.interactionContextType === 'MYAH_INBOX_INSTAGRAM_DRAFT'
          ? stored.interactionContextType
          : null,
      interactionContextId: stored.interactionContextId,
    });
    const authority = await this.authorityReader.rebuildForReconciliation({
      workspaceId: input.workspaceId,
      binding,
    });

    try {
      const matches = await this.findMatches(
        reservation.providerAttemptedAt,
        authority,
      );

      if (matches.length === 1) {
        return {
          kind: 'MATCH',
          chatId: matches[0].chatId,
          messageId: matches[0].messageId,
        };
      }
      return matches.length === 0 &&
        Date.now() - reservation.providerAttemptedAt.getTime() >=
          CLEAR_NOT_SENT_MINIMUM_AGE_MS
        ? { kind: 'NO_MATCH_COMPLETE' }
        : { kind: 'INDETERMINATE' };
    } catch {
      return { kind: 'INDETERMINATE' };
    }
  }

  async reconcile(input: {
    workspaceId: string;
    receiptId: string;
  }): Promise<InstagramMessageReconciliationInspection> {
    const inspection = await this.inspectUnknown(input);
    if (inspection.kind !== 'MATCH') return inspection;

    await this.actionApprovalService.recordProviderAccepted(input.receiptId, {
      code: 'accepted',
      acceptedAt: new Date(),
      providerExternalMessageId: inspection.messageId,
      providerThreadExternalId: inspection.chatId,
    });
    await this.finalizeProviderAccepted(input);

    return inspection;
  }

  async finalizeProviderAccepted(input: {
    workspaceId: string;
    receiptId: string;
  }): Promise<void> {
    await this.projector.projectReceiptWithWriter(
      input.receiptId,
      this.messageProjectionWriter,
    );
    await this.budgetService.releaseStartTargetForReceipt({
      workspaceId: input.workspaceId,
      actionExecutionReceiptId: input.receiptId,
      reason: 'PROJECTED',
    });
  }

  async repairTerminalTarget(input: {
    workspaceId: string;
    receiptId: string;
    state:
      | ActionExecutionReceiptState.SENT
      | ActionExecutionReceiptState.FAILED;
  }): Promise<void> {
    await this.budgetService.releaseStartTargetForReceipt({
      workspaceId: input.workspaceId,
      actionExecutionReceiptId: input.receiptId,
      reason:
        input.state === ActionExecutionReceiptState.SENT
          ? 'PROJECTED'
          : 'RESOLVED',
    });
  }
  private async findMatches(
    dispatchBoundary: Date,
    authority: InstagramMessageActionAuthority,
  ): Promise<Array<{ chatId: string; messageId: string }>> {
    const { account, draft } = authority.canonicalGraph;
    const chatIds: string[] = [];

    if (draft.kind === 'REPLY') {
      chatIds.push(draft.providerConversationId!);
    } else {
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let pageCount = 0;
      do {
        const page = await this.unipileClient.listChats({
          accountId: account.unipileAccountId,
          cursor,
          after: null,
          limit: 250,
        });
        chatIds.push(
          ...page.chats
            .filter(
              ({ attendeeProviderId }) =>
                attendeeProviderId === draft.recipientProviderId,
            )
            .map(({ chatId }) => chatId),
        );
        pageCount += 1;
        if (
          page.nextCursor &&
          (seenCursors.has(page.nextCursor) || pageCount >= 100)
        ) {
          throw new Error('Unipile chat traversal is incomplete');
        }
        if (page.nextCursor) seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (cursor);
    }

    const matches: Array<{ chatId: string; messageId: string }> = [];
    const after = new Date(
      dispatchBoundary.getTime() - 5 * 60 * 1000,
    ).toISOString();
    for (const chatId of chatIds) {
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let pageCount = 0;
      do {
        const page = await this.unipileClient.listMessages({
          accountId: account.unipileAccountId,
          chatId,
          cursor,
          after,
          limit: 250,
        });
        matches.push(
          ...page.messages
            .filter((message) =>
              this.matches(message, authority, dispatchBoundary),
            )
            .map(({ messageId }) => ({ chatId, messageId })),
        );
        pageCount += 1;
        if (
          page.nextCursor &&
          (seenCursors.has(page.nextCursor) || pageCount >= 100)
        ) {
          throw new Error('Unipile message traversal is incomplete');
        }
        if (page.nextCursor) seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (cursor);
    }

    return matches;
  }

  private matches(
    message: UnipileInstagramMessage,
    authority: InstagramMessageActionAuthority,
    dispatchBoundary: Date,
  ): boolean {
    const { account, draft } = authority.canonicalGraph;

    if (
      hasContradictoryUnipileInstagramSenderEvidence(
        message,
        account.instagramUserId,
        draft.recipientProviderId,
      )
    ) {
      throw new Error('Instagram message sender evidence is contradictory');
    }

    if (
      message.deleted ||
      message.hidden ||
      message.isEvent ||
      message.text === null ||
      computeActionContentDigest(message.text) !==
        authority.expectedActionBinding.contentDigest
    ) {
      return false;
    }

    const direction = unipileInstagramMessageDirection(
      message,
      account.instagramUserId,
      draft.recipientProviderId,
    );

    if (direction === 'INBOUND') return false;
    if (direction === 'UNKNOWN') {
      throw new Error('Instagram message sender evidence is indeterminate');
    }

    const timestamp =
      message.timestamp === null ? NaN : Date.parse(message.timestamp);

    // Search overlap can reveal uncertainty, but cannot prove this dispatch.
    if (!Number.isFinite(timestamp) || timestamp < dispatchBoundary.getTime()) {
      throw new Error('Instagram message dispatch timing is indeterminate');
    }

    return true;
  }
}
