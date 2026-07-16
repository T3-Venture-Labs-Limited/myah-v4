import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstagramReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ActionReceiptRedactionService } from 'src/engine/core-modules/action-approval/services/action-receipt-redaction.service';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { ACTION_RECEIPT_PROJECTION_WRITER } from 'src/engine/core-modules/action-approval/types/action-approval.type';

@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    TypeOrmModule.forFeature([
      ActionApprovalBindingEntity,
      ActionApprovalBindingEvidenceLinkEntity,
      ActionExecutionReceiptEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    ActionApprovalService,
    ActionReceiptProjectorService,
    ActionReceiptRedactionService,
    ActionReceiptWorkspaceProjectionWriterService,
    InstagramReplyActionDefinition,
    {
      provide: ACTION_RECEIPT_PROJECTION_WRITER,
      useExisting: ActionReceiptWorkspaceProjectionWriterService,
    },
  ],
  exports: [
    ActionApprovalService,
    ActionReceiptProjectorService,
    ActionReceiptRedactionService,
    InstagramReplyActionDefinition,
  ],
})
export class ActionApprovalModule {}
