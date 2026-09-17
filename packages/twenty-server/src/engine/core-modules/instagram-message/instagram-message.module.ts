import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { InstagramActionBudgetModule } from 'src/engine/core-modules/instagram-action-budget/instagram-action-budget.module';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { InstagramSendOutcomeResolutionEntity } from 'src/engine/core-modules/instagram-message/entities/instagram-send-outcome-resolution.entity';
import { ResolveInstagramOutcomePermissionGuard } from 'src/engine/core-modules/instagram-message/guards/resolve-instagram-outcome-permission.guard';
import { InstagramMessageReconciliationCronCommand } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.cron.command';
import { InstagramMessageReconciliationJob } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.job';
import { InstagramMessageResolver } from 'src/engine/core-modules/instagram-message/resolvers/instagram-message.resolver';
import { InstagramSendOutcomeResolutionResolver } from 'src/engine/core-modules/instagram-message/resolvers/instagram-send-outcome-resolution.resolver';
import { InstagramMessageAuthorityReaderService } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.service';
import { INSTAGRAM_MESSAGE_AUTHORITY_READER } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.type';
import { InstagramMessageDraftService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft.service';
import { InstagramMessageComposerService } from 'src/engine/core-modules/instagram-message/services/instagram-message-composer.service';
import { InstagramMessageDraftLockService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft-lock.service';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { InstagramMessageRecipientService } from 'src/engine/core-modules/instagram-message/services/instagram-message-recipient.service';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';
import { InstagramMessageReceiptProjectionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-receipt-projection.service';
import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { InstagramSendOutcomeResolutionService } from 'src/engine/core-modules/instagram-message/services/instagram-send-outcome-resolution.service';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { MyahUnipileModule } from 'src/modules/myah-unipile/myah-unipile.module';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

@Module({
  imports: [
    ActionApprovalModule,
    InstagramActionBudgetModule,
    MessageQueueModule,
    MyahModule,
    MyahUnipileModule,
    PermissionsModule,
    GlobalWorkspaceDataSourceModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      ObjectMetadataEntity,
      ActionExecutionReceiptEntity,
      InstagramActionReservationEntity,
      InstagramSendOutcomeResolutionEntity,
      UnipileInstagramAccountBindingEntity,
    ]),
  ],
  providers: [
    InstagramMessageResolver,
    InstagramSendOutcomeResolutionResolver,
    InstagramMessageAuthorityReaderService,
    ResolveInstagramOutcomePermissionGuard,
    InstagramMessageDraftLockService,
    InstagramMessageDraftService,
    InstagramMessageComposerService,
    InstagramMessagePermissionService,
    InstagramMessageRecordAccessService,
    InstagramMessageRecipientService,
    InstagramMessageReceiptProjectionService,
    InstagramMessageReconciliationService,
    InstagramMessageSendService,
    InstagramSendOutcomeResolutionService,
    InstagramMessageReconciliationJob,
    InstagramMessageReconciliationCronCommand,
    provideWorkspaceScopedRepository(InstagramActionReservationEntity),
    provideWorkspaceScopedRepository(ActionExecutionReceiptEntity),
    provideWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity),
    {
      provide: INSTAGRAM_MESSAGE_AUTHORITY_READER,
      useExisting: InstagramMessageAuthorityReaderService,
    },
  ],
  exports: [
    InstagramMessageAuthorityReaderService,
    InstagramMessageDraftService,
    InstagramMessageComposerService,
    InstagramMessageDraftLockService,
    InstagramMessagePermissionService,
    InstagramMessageRecordAccessService,
    InstagramMessageRecipientService,
    InstagramMessageReceiptProjectionService,
    InstagramMessageReconciliationService,
    InstagramMessageSendService,
    InstagramSendOutcomeResolutionService,
    InstagramMessageReconciliationCronCommand,
  ],
})
export class InstagramMessageModule {}
