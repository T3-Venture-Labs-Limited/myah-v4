import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

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
  type ProviderAcceptedOutcomeInput,
  type SafeActionExecutionReceipt,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

const ACTION_APPROVAL_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class ActionApprovalService {
  private readonly redactionService = new ActionReceiptRedactionService();

  constructor(
    private readonly dataSource: DataSource,
    private readonly projector: ActionReceiptProjectorService,
  ) {}

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

  async decidePendingBinding({
    workspaceId,
    userWorkspaceId,
    threadId,
    approvalBindingId,
    decision,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
    threadId: string;
    approvalBindingId: string;
    decision: 'approved' | 'rejected' | 'changes_requested';
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const binding = await manager.findOne(ActionApprovalBindingEntity, {
        where: { id: approvalBindingId, workspaceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !binding ||
        binding.initiatorUserWorkspaceId !== userWorkspaceId ||
        binding.threadId !== threadId ||
        binding.state !== ActionApprovalBindingState.PENDING ||
        binding.expiresAt <= new Date()
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
    });
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
    const binding = await this.dataSource
      .getRepository(ActionApprovalBindingEntity)
      .findOne({
        where: { id: approvalBindingId, workspaceId },
        relations: { evidenceLinks: true },
      });

    if (
      !binding ||
      binding.state !== ActionApprovalBindingState.APPROVED ||
      binding.expiresAt <= new Date() ||
      binding.initiatorUserWorkspaceId !== initiatorUserWorkspaceId ||
      binding.threadId !== threadId
    ) {
      throw new Error('An approved action binding is required');
    }

    return {
      workspaceId: binding.workspaceId,
      actionName: binding.actionName as 'send_instagram_reply',
      actionVersion: binding.actionVersion as 1,
      draftId: binding.draftId,
      contentDigest: binding.contentDigest,
      recipientFingerprint: binding.recipientFingerprint ?? '',
      sendingAccountFingerprint: binding.sendingAccountFingerprint ?? '',
      threadId: binding.threadId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      evidenceLinks: binding.evidenceLinks,
    };
  }

  async reserveExecutionForBinding({
    approvalBindingId,
    expectedActionBinding,
  }: {
    approvalBindingId: string;
    expectedActionBinding: ExpectedActionBindingWithWorkspace;
  }): Promise<ActionExecutionReservation> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.reserveBindingInTransaction(
          manager,
          approvalBindingId,
          expectedActionBinding,
        ),
      );
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
      if (!receipt || receipt.actionApprovalBindingId !== approvalBindingId) {
        throw error;
      }
      this.assertBindingMatches(
        receipt.actionApprovalBinding,
        expectedActionBinding,
      );

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

      const receipt = await this.dataSource.getRepository(
        ActionExecutionReceiptEntity,
      ).findOne({
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
    const acceptedOutcome = this.redactionService.toAcceptedProviderOutcome(outcome);

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
      if (receipt.state !== ActionExecutionReceiptState.PROCESSING) {
        throw new Error('Action execution receipt cannot accept a provider result');
      }

      receipt.state = ActionExecutionReceiptState.PROVIDER_ACCEPTED;
      receipt.providerMessageId = null;
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
  }): Promise<{ unknown: number; projected: number }> {
    const staleProcessing = await this.dataSource
      .createQueryBuilder()
      .update(ActionExecutionReceiptEntity)
      .set({ state: ActionExecutionReceiptState.UNKNOWN })
      .where('state = :state', { state: ActionExecutionReceiptState.PROCESSING })
      .andWhere('"updatedAt" < :processingBefore', { processingBefore })
      .execute();

    const acceptedReceipts = await this.dataSource.getRepository(
      ActionExecutionReceiptEntity,
    ).find({
      where: { state: ActionExecutionReceiptState.PROVIDER_ACCEPTED },
      select: { id: true },
    });
    let projected = 0;
    for (const receipt of acceptedReceipts) {
      const result = await this.projector.projectReceipt(receipt.id);
      if (result.projected) {
        projected += 1;
      }
    }

    return { unknown: staleProcessing.affected ?? 0, projected };
  }

  private async reserveBindingInTransaction(
    manager: EntityManager,
    approvalBindingId: string,
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<ActionExecutionReservation> {
    const idempotencyKey = computeLogicalActionKey(input);
    const priorReceipt = await manager.findOne(ActionExecutionReceiptEntity, {
      where: { workspaceId: input.workspaceId, idempotencyKey },
      relations: { actionApprovalBinding: { evidenceLinks: true } },
    });
    if (priorReceipt) {
      if (priorReceipt.actionApprovalBindingId !== approvalBindingId) {
        throw new Error('An approved action binding is required');
      }
      this.assertBindingMatches(priorReceipt.actionApprovalBinding, input);

      return {
        created: false,
        receipt: this.redactionService.toSafeReceipt(priorReceipt),
      };
    }

    const binding = await manager.findOne(ActionApprovalBindingEntity, {
      where: { id: approvalBindingId, workspaceId: input.workspaceId },
      relations: { evidenceLinks: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !binding ||
      binding.state !== ActionApprovalBindingState.APPROVED ||
      binding.expiresAt <= new Date()
    ) {
      throw new Error('An approved action binding is required');
    }
    this.assertBindingMatches(binding, input);

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

    const candidates = await manager
      .getRepository(ActionApprovalBindingEntity)
      .createQueryBuilder('binding')
      .setLock('pessimistic_write')
      .where('binding."workspaceId" = :workspaceId', input)
      .andWhere('binding."actionName" = :actionName', input)
      .andWhere('binding."actionVersion" = :actionVersion', input)
      .andWhere('binding."draftId" = :draftId', input)
      .andWhere('binding."contentDigest" = :contentDigest', input)
      .andWhere(
        'binding."recipientFingerprint" = :recipientFingerprint',
        input,
      )
      .andWhere(
        'binding."sendingAccountFingerprint" = :sendingAccountFingerprint',
        input,
      )
      .andWhere('binding.state = :state', {
        state: ActionApprovalBindingState.APPROVED,
      })
      .andWhere('binding."expiresAt" > :now', { now: new Date() })
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
      binding.sendingAccountFingerprint !== input.sendingAccountFingerprint
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
    return typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code: string }).code === '23505';
  }
}
