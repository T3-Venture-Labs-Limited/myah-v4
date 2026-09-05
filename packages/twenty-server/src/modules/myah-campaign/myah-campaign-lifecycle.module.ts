import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CacheLockModule } from 'src/engine/core-modules/cache-lock/cache-lock.module';
import { MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-creator-ops-tool-service.token';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { WorkflowCommonModule } from 'src/modules/workflow/common/workflow-common.module';
import { CampaignAccountResolver } from 'src/modules/myah-campaign/resolvers/campaign-account.resolver';
import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';

@Module({
  imports: [
    CacheLockModule,
    TwentyORMModule,
    WorkflowCommonModule,
    MessagingSendManagerModule,
    TypeOrmModule.forFeature([ConnectedAccountEntity, MessageChannelEntity]),
  ],
  providers: [
    CampaignLifecycleService,
    CampaignAccountService,
    CampaignOutreachWorkflowLifecycleWorkspaceService,
    CampaignInfluencerService,
    MyahCreatorOpsToolWorkspaceService,
    {
      provide: MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
      useExisting: MyahCreatorOpsToolWorkspaceService,
    },
    CampaignInfluencerResolver,
    CampaignAccountResolver,
  ],
  exports: [
    CampaignLifecycleService,
    CampaignAccountService,
    CampaignOutreachWorkflowLifecycleWorkspaceService,
    CampaignInfluencerService,
    MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
  ],
})
export class MyahCampaignLifecycleModule {}
