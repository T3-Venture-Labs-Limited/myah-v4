import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ActionReceiptRedactionService } from 'src/engine/core-modules/action-approval/services/action-receipt-redaction.service';

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
  ],
  exports: [
    ActionApprovalService,
    ActionReceiptProjectorService,
    ActionReceiptRedactionService,
  ],
})
export class ActionApprovalModule {}
