import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import {
  ACTION_RECEIPT_PROJECTION_WRITER,
  type ActionApprovalFaultHooks,
  type ActionReceiptProjectionWriter,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';

@Injectable()
export class ActionReceiptProjectorService {
  constructor(
    @InjectRepository(ActionExecutionReceiptEntity)
    private readonly receiptRepository: Repository<ActionExecutionReceiptEntity>,
    @Inject(ACTION_RECEIPT_PROJECTION_WRITER)
    private readonly projectionWriter: ActionReceiptProjectionWriter,
  ) {}

  async projectReceipt(
    receiptId: string,
    faultHooks?: Pick<ActionApprovalFaultHooks, 'afterWorkspaceProjection'>,
  ): Promise<{ projected: boolean }> {
    const receipt = await this.receiptRepository.findOne({
      where: { id: receiptId },
      relations: { actionApprovalBinding: true },
    });

    if (receipt?.state !== ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
      return { projected: false };
    }

    await this.projectionWriter.project({
      receiptId: receipt.id,
      workspaceId: receipt.workspaceId,
      draftId: receipt.actionApprovalBinding.draftId,
    });
    await faultHooks?.afterWorkspaceProjection?.(receipt.id);
    await this.receiptRepository.update(
      { id: receipt.id, state: ActionExecutionReceiptState.PROVIDER_ACCEPTED },
      { state: ActionExecutionReceiptState.SENT },
    );

    return { projected: true };
  }
}
