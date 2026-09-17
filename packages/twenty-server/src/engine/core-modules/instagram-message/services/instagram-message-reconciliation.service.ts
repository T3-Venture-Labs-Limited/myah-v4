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
type ReconciliationIdentity = {
  actionVersion: 2 | 3;
  kind: 'START_CHAT' | 'REPLY';
  accountId: string;
  senderId: string;
  attendeeId: string;
  chatId: string | null;
  contentDigest: string;
};
const CLEAR_NOT_SENT_MINIMUM_AGE_MS = 24 * 60 * 60 * 1000;

export type InstagramMessageReconciliationInspection =
  | { kind: 'MATCH'; chatId: string; messageId: string }
  | { kind: 'NO_MATCH_COMPLETE' }
  | { kind: 'NOT_DISPATCHED' }
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
        state: ActionExecutionReceiptState.UNKNOWN,
      },
      relations: { actionApprovalBinding: { evidenceLinks: true } },
    });
    if (
      !receipt ||
      receipt.actionApprovalBinding.actionName !== 'send_instagram_message' ||
      (receipt.actionApprovalBinding.actionVersion !== 2 &&
        receipt.actionApprovalBinding.actionVersion !== 3)
    ) {
      throw new Error('Unknown Instagram message receipt is unavailable');
    }
    // Historical START identity cannot be recovered or upgraded from v2.
    if (
      receipt.actionApprovalBinding.actionVersion === 2 &&
      receipt.actionApprovalBinding.actionKind === 'START_CHAT'
    ) {
      return { kind: 'INDETERMINATE' };
    }
    if (
      receipt.actionApprovalBinding.actionVersion === 3 &&
      (receipt.workspaceId !== input.workspaceId ||
        receipt.actionApprovalBinding.workspaceId !== input.workspaceId ||
        receipt.actionApprovalBinding.id !== receipt.actionApprovalBindingId)
    )
      throw new Error('Unknown Instagram message receipt is unavailable');
    const reservation = await this.reservationRepository.findOne(
      input.workspaceId,
      {
        where: {
          actionExecutionReceiptId: input.receiptId,
        },
      },
    );
    if (
      !reservation?.providerAttemptedAt ||
      !Number.isFinite(reservation.providerAttemptedAt.getTime())
    ) {
      // `beforeDispatch` commits providerAttemptedAt before the provider write is
      // issued, so its absence proves no provider write was ever attempted: a
      // crash between receipt creation and dispatch leaves no message behind. This
      // must stay resolvable — the target reads as unresolved while the receipt is
      // open, so leaving it INDETERMINATE would lock the recipient permanently.
      return { kind: 'NOT_DISPATCHED' };
    }
    const stored = receipt.actionApprovalBinding;
    const binding = await this.actionApprovalService.getApprovedBinding({
      workspaceId: input.workspaceId,
      approvalBindingId: stored.id,
      initiatorUserWorkspaceId: stored.initiatorUserWorkspaceId,
      threadId: stored.threadId,
      interactionContextType:
        stored.interactionContextType === 'MYAH_INBOX_INSTAGRAM_DRAFT' ||
        stored.interactionContextType === 'MYAH_INSTAGRAM_MESSAGE_DRAFT'
          ? stored.interactionContextType
          : null,
      interactionContextId: stored.interactionContextId,
    });
    let identity: ReconciliationIdentity;
    if (binding.actionName !== 'send_instagram_message')
      throw new Error('Unknown Instagram message receipt is unavailable');
    if (binding.actionVersion === 3) {
      try {
        const { snapshot, contentDigest } =
          await this.authorityReader.readV3RecoveryContext({
            workspaceId: input.workspaceId,
            binding,
          });
        identity = {
          actionVersion: 3,
          kind: snapshot.actionKind,
          accountId: snapshot.unipileAccountId,
          senderId: snapshot.instagramUserId,
          attendeeId: snapshot.providerMessagingId,
          chatId: snapshot.providerChatId,
          contentDigest,
        };
      } catch {
        return { kind: 'INDETERMINATE' };
      }
    } else {
      const authority = await this.authorityReader.rebuildForReconciliation({
        workspaceId: input.workspaceId,
        binding,
      });
      const { account, draft } = authority.canonicalGraph;
      identity = {
        actionVersion: 2,
        kind: draft.kind,
        accountId: account.unipileAccountId,
        senderId: account.instagramUserId,
        attendeeId: draft.recipientProviderId,
        chatId: draft.providerConversationId,
        contentDigest: binding.contentDigest,
      };
    }

    try {
      const matches = await this.findMatches(
        reservation.providerAttemptedAt,
        identity,
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
    if (inspection.kind === 'NOT_DISPATCHED') {
      await this.settleNotDispatched(input);

      return inspection;
    }
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

  // A receipt with no provider attempt is provably unsent, so it settles to a
  // terminal failure and its target claim is released. The release runs first and
  // refuses once providerAttemptedAt is set, so a raced dispatch can never be
  // marked failed here.
  private async settleNotDispatched(input: {
    workspaceId: string;
    receiptId: string;
  }): Promise<void> {
    const reservation = await this.reservationRepository.findOne(
      input.workspaceId,
      { where: { actionExecutionReceiptId: input.receiptId } },
    );
    if (reservation) {
      await this.budgetService.releasePreDispatch({
        workspaceId: input.workspaceId,
        reservationId: reservation.id,
        reason: 'NOT_DISPATCHED',
      });
    }
    await this.actionApprovalService.recordProviderTerminalState({
      receiptId: input.receiptId,
      state: ActionExecutionReceiptState.FAILED,
      code: 'failed',
    });
  }

  async finalizeProviderAccepted(input: {
    workspaceId: string;
    receiptId: string;
  }): Promise<void> {
    const projection = await this.projector.projectReceiptWithWriter(
      input.receiptId,
      this.messageProjectionWriter,
    );
    if (!projection.projected) {
      const receipt = await this.receiptRepository.findOne(input.workspaceId, {
        where: {
          id: input.receiptId,
          state: ActionExecutionReceiptState.SENT,
        },
      });
      if (!receipt || receipt.state !== ActionExecutionReceiptState.SENT)
        throw new Error('Verified Instagram send projection is incomplete');
    }
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
    identity: ReconciliationIdentity,
  ): Promise<Array<{ chatId: string; messageId: string }>> {
    const chatIds = new Set<string>();
    const seenChats = new Map<string, string>();

    if (identity.kind === 'REPLY') {
      chatIds.add(identity.chatId!);
    } else {
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let pageCount = 0;
      do {
        const page = await this.unipileClient.listChats({
          accountId: identity.accountId,
          cursor,
          after: null,
          limit: 250,
        });
        for (const chat of page.chats) {
          if (
            chat.accountId !== identity.accountId ||
            chat.type !== 'ONE_TO_ONE' ||
            !chat.chatId ||
            (seenChats.has(chat.chatId) &&
              seenChats.get(chat.chatId) !== chat.attendeeProviderId)
          )
            throw new Error('Instagram chat evidence is contradictory');
          seenChats.set(chat.chatId, chat.attendeeProviderId);
          if (chat.attendeeProviderId === identity.attendeeId)
            chatIds.add(chat.chatId);
        }
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
      if (identity.actionVersion === 3) {
        const chat = await this.unipileClient.getChat({
          accountId: identity.accountId,
          chatId,
          expectedAttendeeId: identity.attendeeId,
        });
        if (
          chat.accountId !== identity.accountId ||
          chat.chatId !== chatId ||
          chat.accountType !== 'INSTAGRAM' ||
          chat.type !== 'ONE_TO_ONE' ||
          chat.attendeeProviderId !== identity.attendeeId
        )
          throw new Error('Instagram chat evidence is contradictory');
      }
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let pageCount = 0;
      do {
        const page = await this.unipileClient.listMessages({
          accountId: identity.accountId,
          chatId,
          cursor,
          after,
          limit: 250,
        });
        matches.push(
          ...page.messages
            .filter((message) =>
              this.matches(message, identity, dispatchBoundary, chatId),
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
    identity: ReconciliationIdentity,
    dispatchBoundary: Date,
    chatId: string,
  ): boolean {
    if (
      identity.actionVersion === 3 &&
      (message.accountId !== identity.accountId ||
        message.chatId !== chatId ||
        !message.messageId)
    )
      throw new Error('Instagram message identity is contradictory');

    if (
      hasContradictoryUnipileInstagramSenderEvidence(
        message,
        identity.senderId,
        identity.attendeeId,
      )
    ) {
      throw new Error('Instagram message sender evidence is contradictory');
    }

    if (
      message.deleted ||
      message.hidden ||
      message.isEvent ||
      message.text === null ||
      computeActionContentDigest(message.text) !== identity.contentDigest
    ) {
      return false;
    }

    const direction = unipileInstagramMessageDirection(
      message,
      identity.senderId,
      identity.attendeeId,
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
