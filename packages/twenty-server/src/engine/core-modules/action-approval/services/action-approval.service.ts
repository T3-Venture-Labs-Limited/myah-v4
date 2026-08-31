import { Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';

import {
  ActionApprovalBindingEntity,
  ActionApprovalBindingState,
} from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ActionReceiptRedactionService } from 'src/engine/core-modules/action-approval/services/action-receipt-redaction.service';
import {
  type ActionApprovalFaultHooks,
  type ActionExecutionReservation,
  type ExpectedActionBindingWithWorkspace,
  type MyahInboxReplyExpectedActionBinding,
  type ProviderAcceptedOutcomeInput,
  type SafeActionExecutionReceipt,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import {
  getMyahInboxReplyAdvisoryLockKey,
  MYAH_INBOX_REPLY_ADVISORY_LOCK_QUERY,
} from 'src/engine/core-modules/action-approval/utils/myah-inbox-reply-advisory-lock.util';
import { AgentChatThreadEntity } from 'src/engine/metadata-modules/ai/ai-chat/entities/agent-chat-thread.entity';

const ACTION_APPROVAL_TTL_MS = 30 * 60 * 1000;
const RECONCILIATION_BATCH_SIZE = 25;

type PendingBindingDecisionInput = {
  workspaceId: string;
  userWorkspaceId: string;
  threadId: string;
  approvalBindingId: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
};

type PendingBindingDecisionOutcome =
  | { accepted: true }
  | { accepted: false; state: ActionApprovalBindingState.EXPIRED };

@Injectable()
export class ActionApprovalService {
  private readonly redactionService = new ActionReceiptRedactionService();

  constructor(
    private readonly dataSource: DataSource,
    private readonly projector: ActionReceiptProjectorService,
  ) {}

  async executeInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(operation);
  }

  async executeInboxReplyLocked<T>(
    input: { workspaceId: string; draftId: string },
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(MYAH_INBOX_REPLY_ADVISORY_LOCK_QUERY, [
        getMyahInboxReplyAdvisoryLockKey(input.workspaceId, input.draftId),
      ]);

      return operation(manager);
    });
  }

  async createPendingBinding(
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<{ id: string }> {
    return this.dataSource.transaction(async (manager) => {
      const binding = await manager.save(
        ActionApprovalBindingEntity,
        manager.create(ActionApprovalBindingEntity, {
          workspaceId: input.workspaceId,
          initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
          actionName: input.actionName,
          actionVersion: input.actionVersion,
          draftId: input.draftId,
          contentDigest: input.contentDigest,
          recipientFingerprint: input.recipientFingerprint,
          sendingAccountFingerprint: input.sendingAccountFingerprint,
          actionContextFingerprint: input.actionContextFingerprint ?? null,
          inboundMessageId:
            input.actionName === 'send_instagram_reply'
              ? input.inboundMessageId
              : null,
          inboundSenderIgsid:
            input.actionName === 'send_instagram_reply'
              ? input.inboundSenderIgsid
              : null,
          inboundDirection:
            input.actionName === 'send_instagram_reply'
              ? input.inboundDirection
              : null,
          inboundReceivedAt:
            input.actionName === 'send_instagram_reply'
              ? input.inboundReceivedAt
              : null,
          threadId: input.threadId,
          state: ActionApprovalBindingState.PENDING,
          expiresAt: new Date(Date.now() + ACTION_APPROVAL_TTL_MS),
          decidedAt: null,
        }),
      );
      await manager.save(
        ActionApprovalBindingEvidenceLinkEntity,
        input.evidenceLinks.map((evidence) =>
          manager.create(ActionApprovalBindingEvidenceLinkEntity, {
            actionApprovalBindingId: binding.id,
            ...evidence,
          }),
        ),
      );

      return { id: binding.id };
    });
  }

  async createApprovedInboxReplyBinding(
    input: MyahInboxReplyExpectedActionBinding & { workspaceId: string },
  ): Promise<{ id: string }> {
    return this.dataSource.transaction(async (manager) => {
      const decidedAt = new Date();
      const binding = await manager.save(
        ActionApprovalBindingEntity,
        manager.create(ActionApprovalBindingEntity, {
          workspaceId: input.workspaceId,
          initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
          actionName: input.actionName,
          actionVersion: input.actionVersion,
          draftId: input.draftId,
          contentDigest: input.contentDigest,
          recipientFingerprint: input.recipientFingerprint,
          sendingAccountFingerprint: input.sendingAccountFingerprint,
          actionContextFingerprint: input.actionContextFingerprint,
          inboundMessageId: null,
          inboundSenderIgsid: null,
          inboundDirection: null,
          inboundReceivedAt: null,
          threadId: input.threadId,
          state: ActionApprovalBindingState.APPROVED,
          expiresAt: new Date(decidedAt.getTime() + ACTION_APPROVAL_TTL_MS),
          decidedAt,
        }),
      );
      await manager.save(
        ActionApprovalBindingEvidenceLinkEntity,
        input.evidenceLinks.map((evidence) =>
          manager.create(ActionApprovalBindingEvidenceLinkEntity, {
            actionApprovalBindingId: binding.id,
            ...evidence,
          }),
        ),
      );

      return { id: binding.id };
    });
  }

  async getBindingForViewer({
    bindingId,
    workspaceId,
    userWorkspaceId,
  }: {
    bindingId: string;
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<ActionApprovalBindingEntity> {
    const binding = await this.dataSource
      .getRepository(ActionApprovalBindingEntity)
      .findOne({
        where: { id: bindingId, workspaceId },
        relations: { evidenceLinks: true },
      });
    if (!binding || binding.initiatorUserWorkspaceId !== userWorkspaceId) {
      throw new Error('Action approval evidence was not found');
    }
    const thread = await this.dataSource
      .getRepository(AgentChatThreadEntity)
      .findOne({
        where: {
          id: binding.threadId,
          workspaceId,
          userWorkspaceId,
        },
      });
    if (!thread) {
      throw new Error('Action approval evidence was not found');
    }

    return binding;
  }

  async decidePendingBinding(
    input: PendingBindingDecisionInput,
  ): Promise<void> {
    const outcome = await this.executeInTransaction((manager) =>
      this.decidePendingBindingInTransaction(manager, input),
    );

    if (!outcome.accepted) {
      throw new Error('An action approval binding is not pending');
    }
  }

  async decidePendingBindingInTransaction(
    manager: EntityManager,
    {
      workspaceId,
      userWorkspaceId,
      threadId,
      approvalBindingId,
      decision,
    }: PendingBindingDecisionInput,
  ): Promise<PendingBindingDecisionOutcome> {
    const binding = await manager.findOne(ActionApprovalBindingEntity, {
      where: { id: approvalBindingId, workspaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      binding &&
      binding.state === ActionApprovalBindingState.PENDING &&
      binding.expiresAt <= new Date()
    ) {
      binding.state = ActionApprovalBindingState.EXPIRED;
      await manager.save(ActionApprovalBindingEntity, binding);

      return { accepted: false, state: ActionApprovalBindingState.EXPIRED };
    }
    if (
      !binding ||
      binding.initiatorUserWorkspaceId !== userWorkspaceId ||
      binding.threadId !== threadId ||
      binding.state !== ActionApprovalBindingState.PENDING
    ) {
      throw new Error('An action approval binding is not pending');
    }

    binding.state =
      decision === 'approved'
        ? ActionApprovalBindingState.APPROVED
        : decision === 'rejected'
          ? ActionApprovalBindingState.REJECTED
          : ActionApprovalBindingState.CHANGES_REQUESTED;
    binding.decidedAt = new Date();
    await manager.save(ActionApprovalBindingEntity, binding);

    return { accepted: true };
  }

  async restorePendingBinding({
    workspaceId,
    threadId,
    approvalBindingId,
  }: {
    workspaceId: string;
    threadId: string;
    approvalBindingId: string;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const binding = await manager.findOne(ActionApprovalBindingEntity, {
        where: { id: approvalBindingId, workspaceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !binding ||
        binding.threadId !== threadId ||
        binding.state === ActionApprovalBindingState.PENDING ||
        binding.state === ActionApprovalBindingState.CONSUMED
      ) {
        throw new Error('An action approval binding cannot be restored');
      }
      const receipt = await manager.findOneBy(ActionExecutionReceiptEntity, {
        actionApprovalBindingId: binding.id,
      });
      if (receipt) {
        throw new Error('An action approval binding cannot be restored');
      }

      binding.state = ActionApprovalBindingState.PENDING;
      binding.decidedAt = null;
      await manager.save(ActionApprovalBindingEntity, binding);
    });
  }

  async invalidateApprovedInboxReplyBinding({
    workspaceId,
    approvalBindingId,
    initiatorUserWorkspaceId,
    threadId,
    draftId,
  }: {
    workspaceId: string;
    approvalBindingId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    draftId: string;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const binding = await manager.findOne(ActionApprovalBindingEntity, {
        where: { id: approvalBindingId, workspaceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !binding ||
        binding.actionName !== 'send_inbox_reply' ||
        binding.initiatorUserWorkspaceId !== initiatorUserWorkspaceId ||
        binding.threadId !== threadId ||
        binding.draftId !== draftId ||
        binding.state !== ActionApprovalBindingState.APPROVED
      ) {
        throw new Error(
          'An approved Inbox reply binding cannot be invalidated',
        );
      }
      const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
        where: { workspaceId, actionApprovalBindingId: binding.id },
      });
      if (receipt) {
        throw new Error(
          'An approved Inbox reply binding cannot be invalidated',
        );
      }

      binding.state = ActionApprovalBindingState.CHANGES_REQUESTED;
      binding.decidedAt = new Date();
      await manager.save(ActionApprovalBindingEntity, binding);
    });
  }

  async getApprovedBinding({
    workspaceId,
    approvalBindingId,
    initiatorUserWorkspaceId,
    threadId,
  }: {
    workspaceId: string;
    approvalBindingId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
  }): Promise<ExpectedActionBindingWithWorkspace> {
    const authorizedBinding = await this.dataSource.transaction(
      async (manager) => {
        const binding = await manager.findOne(ActionApprovalBindingEntity, {
          where: { id: approvalBindingId, workspaceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          binding &&
          binding.expiresAt <= new Date() &&
          (binding.state === ActionApprovalBindingState.PENDING ||
            binding.state === ActionApprovalBindingState.APPROVED)
        ) {
          binding.state = ActionApprovalBindingState.EXPIRED;
          await manager.save(ActionApprovalBindingEntity, binding);
        }
        if (
          binding == null ||
          (binding.state !== ActionApprovalBindingState.APPROVED &&
            binding.state !== ActionApprovalBindingState.CONSUMED) ||
          binding.initiatorUserWorkspaceId !== initiatorUserWorkspaceId ||
          binding.threadId !== threadId
        ) {
          return null;
        }
        const evidenceLinks = await this.findEvidence(manager, binding.id);
        const commonBinding = {
          workspaceId: binding.workspaceId,
          draftId: binding.draftId,
          contentDigest: binding.contentDigest,
          recipientFingerprint: binding.recipientFingerprint ?? '',
          sendingAccountFingerprint: binding.sendingAccountFingerprint ?? '',
          threadId: binding.threadId,
          initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
          evidenceLinks,
        };

        switch (binding.actionName) {
          case 'send_instagram_reply':
            if (
              binding.actionVersion !== 1 ||
              binding.actionContextFingerprint != null ||
              binding.inboundMessageId == null ||
              binding.inboundSenderIgsid == null ||
              binding.inboundDirection !== 'INBOUND' ||
              binding.inboundReceivedAt == null
            ) {
              return null;
            }

            return {
              ...commonBinding,
              actionName: 'send_instagram_reply' as const,
              actionVersion: 1 as const,
              actionContextFingerprint: null,
              inboundMessageId: binding.inboundMessageId,
              inboundSenderIgsid: binding.inboundSenderIgsid,
              inboundDirection: binding.inboundDirection,
              inboundReceivedAt: binding.inboundReceivedAt,
            };
          case 'send_outreach_email':
            if (
              binding.actionVersion !== 1 ||
              binding.actionContextFingerprint?.length !== 64 ||
              binding.recipientFingerprint == null ||
              binding.sendingAccountFingerprint == null ||
              binding.inboundMessageId != null ||
              binding.inboundSenderIgsid != null ||
              binding.inboundDirection != null ||
              binding.inboundReceivedAt != null
            ) {
              return null;
            }

            return {
              ...commonBinding,
              actionName: 'send_outreach_email' as const,
              actionVersion: 1 as const,
              actionContextFingerprint: binding.actionContextFingerprint,
            };
          case 'send_inbox_reply':
            if (
              binding.actionVersion !== 1 ||
              binding.actionContextFingerprint?.length !== 64 ||
              binding.recipientFingerprint == null ||
              binding.sendingAccountFingerprint == null ||
              binding.inboundMessageId != null ||
              binding.inboundSenderIgsid != null ||
              binding.inboundDirection != null ||
              binding.inboundReceivedAt != null
            ) {
              return null;
            }

            return {
              ...commonBinding,
              actionName: 'send_inbox_reply' as const,
              actionVersion: 1 as const,
              actionContextFingerprint: binding.actionContextFingerprint,
            };
          default:
            return null;
        }
      },
    );

    if (!authorizedBinding) {
      throw new Error('An approved action binding is required');
    }

    return authorizedBinding;
  }

  async findExecutionReceiptForBinding({
    workspaceId,
    approvalBindingId,
  }: {
    workspaceId: string;
    approvalBindingId: string;
  }): Promise<SafeActionExecutionReceipt | null> {
    const receipt = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({
        where: { workspaceId, actionApprovalBindingId: approvalBindingId },
      });

    return receipt ? this.redactionService.toSafeReceipt(receipt) : null;
  }

  async findExecutionReceipt({
    workspaceId,
    receiptId,
    actionName,
    draftId,
    initiatorUserWorkspaceId,
  }: {
    workspaceId: string;
    receiptId: string;
    actionName: ExpectedActionBindingWithWorkspace['actionName'];
    draftId: string;
    initiatorUserWorkspaceId: string;
  }): Promise<SafeActionExecutionReceipt | null> {
    const receipt = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({
        where: {
          id: receiptId,
          workspaceId,
          actionApprovalBinding: {
            actionName,
            draftId,
            initiatorUserWorkspaceId,
          },
        },
      });

    return receipt ? this.redactionService.toSafeReceipt(receipt) : null;
  }

  async findInboxReplyExecutionReceipt({
    workspaceId,
    receiptId,
    draftId,
    initiatorUserWorkspaceId,
    messageThreadMetadataId,
  }: {
    workspaceId: string;
    receiptId: string;
    draftId: string;
    initiatorUserWorkspaceId: string;
    messageThreadMetadataId: string;
  }): Promise<SafeActionExecutionReceipt | null> {
    const receipt = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({
        where: {
          id: receiptId,
          workspaceId,
          actionApprovalBinding: {
            actionName: 'send_inbox_reply',
            draftId,
            initiatorUserWorkspaceId,
          },
        },
        relations: { actionApprovalBinding: { evidenceLinks: true } },
      });
    if (
      !receipt ||
      !receipt.actionApprovalBinding.evidenceLinks.some(
        (evidence) =>
          evidence.objectMetadataId === messageThreadMetadataId &&
          evidence.recordId === draftId &&
          evidence.role === 'draft',
      )
    ) {
      return null;
    }

    return this.redactionService.toSafeReceipt(receipt);
  }

  async isDraftExecutionLocked({
    workspaceId,
    actionName,
    draftId,
  }: {
    workspaceId: string;
    actionName: ExpectedActionBindingWithWorkspace['actionName'];
    draftId: string;
  }): Promise<boolean> {
    const bindings = await this.dataSource
      .getRepository(ActionApprovalBindingEntity)
      .find({
        where: {
          workspaceId,
          actionName,
          draftId,
          state: In([
            ActionApprovalBindingState.APPROVED,
            ActionApprovalBindingState.CONSUMED,
          ]),
        },
        relations: { receipts: true },
      });
    const lockingReceiptStates = new Set([
      ActionExecutionReceiptState.PROCESSING,
      ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      ActionExecutionReceiptState.UNKNOWN,
    ]);

    return bindings.some((binding) =>
      binding.state === ActionApprovalBindingState.APPROVED
        ? binding.expiresAt > new Date() && binding.receipts.length === 0
        : binding.state === ActionApprovalBindingState.CONSUMED &&
          binding.receipts.some((receipt) =>
            lockingReceiptStates.has(receipt.state),
          ),
    );
  }

  async getInboxReplyDraftExecutionState({
    workspaceId,
    initiatorUserWorkspaceId,
    draftId,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    draftId: string;
  }): Promise<'PENDING' | 'UNKNOWN' | null> {
    const bindings = await this.dataSource
      .getRepository(ActionApprovalBindingEntity)
      .find({
        where: {
          workspaceId,
          initiatorUserWorkspaceId,
          actionName: 'send_inbox_reply',
          draftId,
          state: In([
            ActionApprovalBindingState.APPROVED,
            ActionApprovalBindingState.CONSUMED,
          ]),
        },
        relations: { receipts: true },
      });

    if (
      bindings.some(
        (binding) =>
          binding.state === ActionApprovalBindingState.CONSUMED &&
          binding.receipts.some(
            (receipt) => receipt.state === ActionExecutionReceiptState.UNKNOWN,
          ),
      )
    ) {
      return 'UNKNOWN';
    }

    return bindings.some(
      (binding) =>
        (binding.state === ActionApprovalBindingState.APPROVED &&
          binding.expiresAt > new Date() &&
          binding.receipts.length === 0) ||
        (binding.state === ActionApprovalBindingState.CONSUMED &&
          binding.receipts.some((receipt) =>
            [
              ActionExecutionReceiptState.PROCESSING,
              ActionExecutionReceiptState.PROVIDER_ACCEPTED,
            ].includes(receipt.state),
          )),
    )
      ? 'PENDING'
      : null;
  }

  async reserveExecutionForBinding({
    approvalBindingId,
    expectedActionBinding,
  }: {
    approvalBindingId: string;
    expectedActionBinding: ExpectedActionBindingWithWorkspace;
  }): Promise<ActionExecutionReservation> {
    try {
      const reservation = await this.dataSource.transaction((manager) =>
        this.reserveBindingInTransaction(
          manager,
          approvalBindingId,
          expectedActionBinding,
        ),
      );
      if (!reservation) {
        throw new Error('An approved action binding is required');
      }

      return reservation;
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const receipt = await this.dataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOne({
          where: {
            workspaceId: expectedActionBinding.workspaceId,
            idempotencyKey: computeLogicalActionKey(expectedActionBinding),
          },
          relations: { actionApprovalBinding: { evidenceLinks: true } },
        });
      if (!receipt) {
        throw error;
      }
      this.assertBindingMatches(
        receipt.actionApprovalBinding,
        expectedActionBinding,
      );
      if (receipt.actionApprovalBindingId !== approvalBindingId) {
        await this.dataSource.transaction((manager) =>
          this.convergeInboxReplyBindingInTransaction(
            manager,
            approvalBindingId,
            expectedActionBinding,
          ),
        );
      }

      return {
        created: false,
        receipt: this.redactionService.toSafeReceipt(receipt),
      };
    }
  }

  async recordProviderTerminalState({
    receiptId,
    state,
    code,
  }: {
    receiptId: string;
    state:
      | ActionExecutionReceiptState.BLOCKED
      | ActionExecutionReceiptState.FAILED
      | ActionExecutionReceiptState.UNKNOWN;
    code: 'blocked' | 'failed' | 'unknown';
  }): Promise<SafeActionExecutionReceipt> {
    if (
      (state === ActionExecutionReceiptState.BLOCKED && code !== 'blocked') ||
      (state === ActionExecutionReceiptState.FAILED && code !== 'failed') ||
      (state === ActionExecutionReceiptState.UNKNOWN && code !== 'unknown')
    ) {
      throw new Error('Unsafe provider outcome');
    }

    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
        where: { id: receiptId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new Error('Action execution receipt was not found');
      }
      if (receipt.state !== ActionExecutionReceiptState.PROCESSING) {
        return this.redactionService.toSafeReceipt(receipt);
      }

      receipt.state = state;
      receipt.providerMessageId = null;
      receipt.providerCode = code;
      receipt.redactedOutcome = code;

      return this.redactionService.toSafeReceipt(
        await manager.save(ActionExecutionReceiptEntity, receipt),
      );
    });
  }

  async reserveExecution(
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<ActionExecutionReservation> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.reserveInTransaction(manager, input),
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const receipt = await this.dataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOne({
          where: {
            workspaceId: input.workspaceId,
            idempotencyKey: computeLogicalActionKey(input),
          },
          relations: { actionApprovalBinding: { evidenceLinks: true } },
        });
      if (!receipt) {
        throw error;
      }
      this.assertBindingMatches(receipt.actionApprovalBinding, input);

      return {
        created: false,
        receipt: this.redactionService.toSafeReceipt(receipt),
      };
    }
  }

  async execute(
    input: ExpectedActionBindingWithWorkspace,
    submit: (
      receipt: SafeActionExecutionReceipt,
    ) => Promise<ProviderAcceptedOutcomeInput>,
    faultHooks?: Pick<
      ActionApprovalFaultHooks,
      'afterReservation' | 'afterProviderAccepted'
    >,
  ): Promise<SafeActionExecutionReceipt> {
    const { created, receipt } = await this.reserveExecution(input);
    await faultHooks?.afterReservation?.(receipt);
    if (!created || receipt.state !== ActionExecutionReceiptState.PROCESSING) {
      return receipt;
    }

    const accepted = await this.recordProviderAccepted(
      receipt.id,
      await submit(receipt),
    );
    await faultHooks?.afterProviderAccepted?.(accepted);

    return accepted;
  }

  async recordProviderAccepted(
    receiptId: string,
    outcome: ProviderAcceptedOutcomeInput,
  ): Promise<SafeActionExecutionReceipt> {
    const acceptedOutcome =
      this.redactionService.toAcceptedProviderOutcome(outcome);

    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
        where: { id: receiptId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!receipt) {
        throw new Error('Action execution receipt was not found');
      }
      if (receipt.state === ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
        return this.redactionService.toSafeReceipt(receipt);
      }
      if (
        receipt.state !== ActionExecutionReceiptState.PROCESSING &&
        receipt.state !== ActionExecutionReceiptState.UNKNOWN
      ) {
        throw new Error(
          'Action execution receipt cannot accept a provider result',
        );
      }

      receipt.state = ActionExecutionReceiptState.PROVIDER_ACCEPTED;
      receipt.providerMessageId = acceptedOutcome.providerMessageId ?? null;
      receipt.providerExternalMessageId =
        acceptedOutcome.providerExternalMessageId ?? null;
      receipt.providerThreadExternalId =
        acceptedOutcome.providerThreadExternalId ?? null;
      receipt.providerCode = acceptedOutcome.code;
      receipt.redactedOutcome = acceptedOutcome.code;

      return this.redactionService.toSafeReceipt(
        await manager.save(ActionExecutionReceiptEntity, receipt),
      );
    });
  }

  async reconcile({
    processingBefore,
  }: {
    processingBefore: Date;
  }): Promise<{ unknown: number; projected: number; failed: number }> {
    const receiptRepository = this.dataSource.getRepository(
      ActionExecutionReceiptEntity,
    );
    const staleReceiptIds = await receiptRepository
      .createQueryBuilder('receipt')
      .select('receipt.id', 'id')
      .where('receipt.state = :state', {
        state: ActionExecutionReceiptState.PROCESSING,
      })
      .andWhere('receipt."updatedAt" < :processingBefore', { processingBefore })
      .orderBy('receipt.updatedAt', 'ASC')
      .addOrderBy('receipt.id', 'ASC')
      .take(RECONCILIATION_BATCH_SIZE)
      .getRawMany<{ id: string }>();
    const staleProcessing =
      staleReceiptIds.length === 0
        ? { affected: 0 }
        : await this.dataSource
            .createQueryBuilder()
            .update(ActionExecutionReceiptEntity)
            .set({ state: ActionExecutionReceiptState.UNKNOWN })
            .where('id IN (:...ids)', {
              ids: staleReceiptIds.map(({ id }) => id),
            })
            .andWhere('state = :state', {
              state: ActionExecutionReceiptState.PROCESSING,
            })
            .execute();

    const acceptedReceiptIds = await receiptRepository
      .createQueryBuilder('receipt')
      .select('receipt.id', 'id')
      .where('receipt.state = :state', {
        state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      })
      .orderBy('receipt.updatedAt', 'ASC')
      .addOrderBy('receipt.id', 'ASC')
      .take(RECONCILIATION_BATCH_SIZE)
      .getRawMany<{ id: string }>();
    let projected = 0;
    let failed = 0;
    for (const { id } of acceptedReceiptIds) {
      try {
        const result = await this.projector.projectReceipt(id);
        if (result.projected) {
          projected += 1;
        }
      } catch {
        await this.dataSource
          .createQueryBuilder()
          .update(ActionExecutionReceiptEntity)
          .set({ updatedAt: new Date() })
          .where('id = :id', { id })
          .andWhere('state = :state', {
            state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
          })
          .execute();
        failed += 1;
      }
    }

    return { unknown: staleProcessing.affected ?? 0, projected, failed };
  }

  private async reserveBindingInTransaction(
    manager: EntityManager,
    approvalBindingId: string,
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<ActionExecutionReservation | null> {
    const idempotencyKey = computeLogicalActionKey(input);
    const priorReceipt = await manager.findOne(ActionExecutionReceiptEntity, {
      where: { workspaceId: input.workspaceId, idempotencyKey },
      relations: { actionApprovalBinding: { evidenceLinks: true } },
    });
    if (priorReceipt) {
      this.assertBindingMatches(priorReceipt.actionApprovalBinding, input);
      if (priorReceipt.actionApprovalBindingId !== approvalBindingId) {
        await this.convergeInboxReplyBindingInTransaction(
          manager,
          approvalBindingId,
          input,
        );
      }

      return {
        created: false,
        receipt: this.redactionService.toSafeReceipt(priorReceipt),
      };
    }

    const binding = await manager.findOne(ActionApprovalBindingEntity, {
      where: { id: approvalBindingId, workspaceId: input.workspaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      binding &&
      binding.expiresAt <= new Date() &&
      (binding.state === ActionApprovalBindingState.PENDING ||
        binding.state === ActionApprovalBindingState.APPROVED)
    ) {
      binding.state = ActionApprovalBindingState.EXPIRED;
      await manager.save(ActionApprovalBindingEntity, binding);
      return null;
    }
    if (
      !binding ||
      binding.state !== ActionApprovalBindingState.APPROVED ||
      binding.expiresAt <= new Date()
    ) {
      throw new Error('An approved action binding is required');
    }
    this.assertBindingMatches(
      binding,
      input,
      await this.findEvidence(manager, binding.id),
    );

    binding.state = ActionApprovalBindingState.CONSUMED;
    await manager.save(ActionApprovalBindingEntity, binding);

    const receipt = manager.create(ActionExecutionReceiptEntity, {
      workspaceId: input.workspaceId,
      actionApprovalBindingId: binding.id,
      idempotencyKey,
      state: ActionExecutionReceiptState.PROCESSING,
      providerMessageId: null,
      providerCode: null,
      redactedOutcome: null,
    });

    return {
      created: true,
      receipt: this.redactionService.toSafeReceipt(
        await manager.save(ActionExecutionReceiptEntity, receipt),
      ),
    };
  }

  private async convergeInboxReplyBindingInTransaction(
    manager: EntityManager,
    approvalBindingId: string,
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<void> {
    const binding = await manager.findOne(ActionApprovalBindingEntity, {
      where: { id: approvalBindingId, workspaceId: input.workspaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!binding) {
      throw new Error('An approved action binding is required');
    }
    this.assertBindingMatches(
      binding,
      input,
      await this.findEvidence(manager, binding.id),
    );
    const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
      where: {
        workspaceId: input.workspaceId,
        actionApprovalBindingId: binding.id,
      },
    });
    if (!receipt && binding.state === ActionApprovalBindingState.APPROVED) {
      binding.state = ActionApprovalBindingState.CHANGES_REQUESTED;
      binding.decidedAt = new Date();
      await manager.save(ActionApprovalBindingEntity, binding);
    }
  }
  private async reserveInTransaction(
    manager: EntityManager,
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<ActionExecutionReservation> {
    const idempotencyKey = computeLogicalActionKey(input);
    const priorReceipt = await manager.findOne(ActionExecutionReceiptEntity, {
      where: {
        workspaceId: input.workspaceId,
        idempotencyKey,
      },
      relations: { actionApprovalBinding: { evidenceLinks: true } },
    });
    if (priorReceipt) {
      this.assertBindingMatches(priorReceipt.actionApprovalBinding, input);

      return {
        created: false,
        receipt: this.redactionService.toSafeReceipt(priorReceipt),
      };
    }

    const candidateQuery = manager
      .getRepository(ActionApprovalBindingEntity)
      .createQueryBuilder('binding')
      .setLock('pessimistic_write')
      .where('binding."workspaceId" = :workspaceId', input)
      .andWhere('binding."actionName" = :actionName', input)
      .andWhere('binding."actionVersion" = :actionVersion', input)
      .andWhere('binding."draftId" = :draftId', input)
      .andWhere('binding."contentDigest" = :contentDigest', input)
      .andWhere('binding."recipientFingerprint" = :recipientFingerprint', input)
      .andWhere(
        'binding."sendingAccountFingerprint" = :sendingAccountFingerprint',
        input,
      )
      .andWhere('binding.state = :state', {
        state: ActionApprovalBindingState.APPROVED,
      })
      .andWhere('binding."expiresAt" > :now', { now: new Date() });

    if (input.actionName === 'send_instagram_reply') {
      candidateQuery
        .andWhere('binding."actionContextFingerprint" IS NULL')
        .andWhere('binding."inboundMessageId" = :inboundMessageId', input)
        .andWhere('binding."inboundSenderIgsid" = :inboundSenderIgsid', input)
        .andWhere('binding."inboundDirection" = :inboundDirection', input)
        .andWhere('binding."inboundReceivedAt" = :inboundReceivedAt', input);
    } else {
      candidateQuery
        .andWhere(
          'binding."actionContextFingerprint" = :actionContextFingerprint',
          input,
        )
        .andWhere('binding."inboundMessageId" IS NULL')
        .andWhere('binding."inboundSenderIgsid" IS NULL')
        .andWhere('binding."inboundDirection" IS NULL')
        .andWhere('binding."inboundReceivedAt" IS NULL');
    }

    const candidates = await candidateQuery
      .orderBy('binding."createdAt"', 'ASC')
      .getMany();

    let binding: ActionApprovalBindingEntity | undefined;
    for (const candidate of candidates) {
      try {
        this.assertBindingMatches(
          candidate,
          input,
          await this.findEvidence(manager, candidate.id),
        );
        binding = candidate;
        break;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== 'Action evidence does not match approved binding'
        ) {
          throw error;
        }
      }
    }
    if (!binding) {
      const racedReceipt = await manager.findOne(ActionExecutionReceiptEntity, {
        where: {
          workspaceId: input.workspaceId,
          idempotencyKey,
        },
        relations: { actionApprovalBinding: { evidenceLinks: true } },
      });
      if (racedReceipt) {
        this.assertBindingMatches(racedReceipt.actionApprovalBinding, input);

        return {
          created: false,
          receipt: this.redactionService.toSafeReceipt(racedReceipt),
        };
      }
      throw new Error(
        candidates.length > 0
          ? 'Action evidence does not match approved binding'
          : 'An approved action binding is required',
      );
    }

    binding.state = ActionApprovalBindingState.CONSUMED;
    await manager.save(ActionApprovalBindingEntity, binding);

    const receipt = manager.create(ActionExecutionReceiptEntity, {
      workspaceId: input.workspaceId,
      actionApprovalBindingId: binding.id,
      idempotencyKey,
      state: ActionExecutionReceiptState.PROCESSING,
      providerMessageId: null,
      providerCode: null,
      redactedOutcome: null,
    });

    return {
      created: true,
      receipt: this.redactionService.toSafeReceipt(
        await manager.save(ActionExecutionReceiptEntity, receipt),
      ),
    };
  }

  private async findEvidence(manager: EntityManager, bindingId: string) {
    return manager.find(ActionApprovalBindingEvidenceLinkEntity, {
      where: { actionApprovalBindingId: bindingId },
      order: {
        objectMetadataId: 'ASC',
        recordId: 'ASC',
        role: 'ASC',
      },
    });
  }

  private assertBindingMatches(
    binding: ActionApprovalBindingEntity,
    input: ExpectedActionBindingWithWorkspace,
    evidence = binding.evidenceLinks,
  ): void {
    if (
      binding.workspaceId !== input.workspaceId ||
      binding.actionName !== input.actionName ||
      binding.actionVersion !== input.actionVersion ||
      binding.draftId !== input.draftId ||
      binding.contentDigest !== input.contentDigest ||
      binding.recipientFingerprint !== input.recipientFingerprint ||
      binding.sendingAccountFingerprint !== input.sendingAccountFingerprint ||
      (binding.actionContextFingerprint ?? null) !==
        (input.actionContextFingerprint ?? null) ||
      binding.threadId !== input.threadId ||
      binding.initiatorUserWorkspaceId !== input.initiatorUserWorkspaceId
    ) {
      throw new Error('Action binding does not match execution request');
    }

    if (
      input.actionName === 'send_instagram_reply'
        ? binding.inboundMessageId !== input.inboundMessageId ||
          binding.inboundSenderIgsid !== input.inboundSenderIgsid ||
          binding.inboundDirection !== input.inboundDirection ||
          binding.inboundReceivedAt?.getTime() !==
            input.inboundReceivedAt.getTime()
        : binding.inboundMessageId != null ||
          binding.inboundSenderIgsid != null ||
          binding.inboundDirection != null ||
          binding.inboundReceivedAt != null
    ) {
      throw new Error('Action binding does not match execution request');
    }

    const actual = evidence
      .map(({ objectMetadataId, recordId, role }) =>
        JSON.stringify([objectMetadataId, recordId, role]),
      )
      .sort();
    const expected = input.evidenceLinks
      .map(({ objectMetadataId, recordId, role }) =>
        JSON.stringify([objectMetadataId, recordId, role]),
      )
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('Action evidence does not match approved binding');
    }
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    );
  }
}
