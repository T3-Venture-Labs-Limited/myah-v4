import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ActionReceiptRedactionService } from 'src/engine/core-modules/action-approval/services/action-receipt-redaction.service';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { ACTION_RECEIPT_PROJECTION_WRITER } from 'src/engine/core-modules/action-approval/types/action-approval.type';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActionApprovalBindingEntity,
      ActionApprovalBindingEvidenceLinkEntity,
      ActionExecutionReceiptEntity,
    ]),
  ],
  providers: [
    ActionApprovalService,
    ActionReceiptProjectorService,
    ActionReceiptRedactionService,
    ActionReceiptWorkspaceProjectionWriterService,
    {
      provide: ACTION_RECEIPT_PROJECTION_WRITER,
      useExisting: ActionReceiptWorkspaceProjectionWriterService,
    },
  ],
  exports: [
    ActionApprovalService,
    ActionReceiptProjectorService,
    ActionReceiptRedactionService,
  ],
})
export class ActionApprovalModule {}
