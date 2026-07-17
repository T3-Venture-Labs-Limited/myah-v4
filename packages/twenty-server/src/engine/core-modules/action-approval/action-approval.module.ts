import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActionApprovalReconciliationCronCommand } from 'src/engine/core-modules/action-approval/crons/commands/action-approval-reconciliation.cron.command';
import { ActionApprovalReconciliationCronJob } from 'src/engine/core-modules/action-approval/crons/action-approval-reconciliation.cron.job';
import { ActionApprovalResolver } from 'src/engine/core-modules/action-approval/action-approval.resolver';
import { InstagramReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ActionReceiptRedactionService } from 'src/engine/core-modules/action-approval/services/action-receipt-redaction.service';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { ACTION_RECEIPT_PROJECTION_WRITER } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    WorkspaceCacheModule,
    PermissionsModule,
    TypeOrmModule.forFeature([
      ActionApprovalBindingEntity,
      ActionApprovalBindingEvidenceLinkEntity,
      ActionExecutionReceiptEntity,
      WorkspaceEntity,
      ObjectMetadataEntity,
      UserWorkspaceEntity,
    ]),
  ],
  providers: [
    ActionApprovalService,
    ActionReceiptProjectorService,
    ActionApprovalResolver,
    ActionReceiptRedactionService,
    ActionReceiptWorkspaceProjectionWriterService,
    InstagramReplyActionDefinition,
    ActionApprovalReconciliationCronJob,
    ActionApprovalReconciliationCronCommand,
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
