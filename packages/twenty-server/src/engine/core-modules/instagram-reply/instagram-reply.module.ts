import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';
import { MyahComposioModule } from 'src/modules/myah-composio/myah-composio.module';

@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
    MyahComposioModule,
  ],
  providers: [InstagramReplyDraftService],
  exports: [InstagramReplyDraftService],
})
export class InstagramReplyModule {}
