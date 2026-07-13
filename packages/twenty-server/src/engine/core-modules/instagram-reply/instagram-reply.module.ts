import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstagramReplyApprovalRequestEntity } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-approval-request.entity';
import { InstagramReplyExecutionReceiptEntity } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-execution-receipt.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { MyahComposioModule } from 'src/modules/myah-composio/myah-composio.module';
import { InstagramReplyApprovalService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-approval.service';

import { InstagramReplyExecutionService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-execution.service';
@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    MyahComposioModule,
    TypeOrmModule.forFeature([
      InstagramReplyApprovalRequestEntity,
      InstagramReplyExecutionReceiptEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    InstagramReplyApprovalService,
    InstagramReplyExecutionService,
    provideWorkspaceScopedRepository(InstagramReplyApprovalRequestEntity),
  ],
  exports: [InstagramReplyApprovalService, InstagramReplyExecutionService],
})
export class InstagramReplyModule {}
