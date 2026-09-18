import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { MyahInboxTriageReceiptRecoveryCronCommand } from 'src/engine/core-modules/myah-inbox/jobs/myah-inbox-triage-receipt-recovery.cron-command';
import {
  MyahInboxTriageReceiptRecoveryCronJob,
  MyahInboxTriageReceiptRecoveryJob,
} from 'src/engine/core-modules/myah-inbox/jobs/myah-inbox-triage-receipt-recovery.job';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';

@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    MessageQueueModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  providers: [
    MyahInboxContactTriageSchemaService,
    MyahInboxContactTriageService,
    MyahInboxContactTriageLifecycleService,
    MyahInboxContactTriageReceiptService,
    MyahInboxTriageReceiptRecoveryJob,
    MyahInboxTriageReceiptRecoveryCronJob,
    MyahInboxTriageReceiptRecoveryCronCommand,
  ],
  exports: [
    MyahInboxContactTriageSchemaService,
    MyahInboxContactTriageService,
    MyahInboxContactTriageLifecycleService,
    MyahInboxContactTriageReceiptService,
  ],
})
export class MyahInboxContactTriageModule {}
