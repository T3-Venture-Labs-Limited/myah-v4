import { Injectable, Optional } from '@nestjs/common';
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
  type ExpectedActionBindingWithWorkspace,
  type ProviderAcceptedOutcomeInput,
  type SafeActionExecutionReceipt,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

@Injectable()
export class ActionApprovalService {
  private readonly redactionService = new ActionReceiptRedactionService();

  constructor(
    private readonly dataSource: DataSource,
    @Optional()
    private readonly projector?: ActionReceiptProjectorService,
  ) {}

  async reserveExecution(
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<SafeActionExecutionReceipt> {
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

      return this.redactionService.toSafeReceipt(receipt);
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
    const reservation = await this.reserveExecution(input);
    await faultHooks?.afterReservation?.(reservation);
    if (reservation.state !== ActionExecutionReceiptState.PROCESSING) {
      return reservation;
    }

    const accepted = await this.recordProviderAccepted(
      reservation.id,
      await submit(reservation),
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

    if (!this.projector) {
      return { unknown: staleProcessing.affected ?? 0, projected: 0 };
    }

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

  private async reserveInTransaction(
    manager: EntityManager,
    input: ExpectedActionBindingWithWorkspace,
  ): Promise<SafeActionExecutionReceipt> {
    const binding = await manager
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
      .orderBy('binding."createdAt"', 'ASC')
      .getOne();

    if (!binding) {
      const priorReceipt = await manager.findOne(ActionExecutionReceiptEntity, {
        where: {
          workspaceId: input.workspaceId,
          idempotencyKey: computeLogicalActionKey(input),
        },
        relations: { actionApprovalBinding: { evidenceLinks: true } },
      });
      if (!priorReceipt) {
        throw new Error('An approved action binding is required');
      }
      this.assertBindingMatches(priorReceipt.actionApprovalBinding, input);

      return this.redactionService.toSafeReceipt(priorReceipt);
    }

    this.assertBindingMatches(binding, input, await this.findEvidence(manager, binding.id));
    if (binding.expiresAt <= new Date()) {
      throw new Error('Action approval binding has expired');
    }

    const idempotencyKey = computeLogicalActionKey(input);
    const priorReceipt = await manager.findOneBy(ActionExecutionReceiptEntity, {
      workspaceId: input.workspaceId,
      idempotencyKey,
    });
    if (priorReceipt) {
      return this.redactionService.toSafeReceipt(priorReceipt);
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

    return this.redactionService.toSafeReceipt(
      await manager.save(ActionExecutionReceiptEntity, receipt),
    );
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
