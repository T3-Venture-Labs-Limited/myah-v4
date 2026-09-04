import { Module } from '@nestjs/common';

import { MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-creator-ops-tool-service.token';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkflowCommonModule } from 'src/modules/workflow/common/workflow-common.module';
import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';

@Module({
  imports: [TwentyORMModule, WorkflowCommonModule],
  providers: [
    CampaignLifecycleService,
    CampaignOutreachWorkflowLifecycleWorkspaceService,
    CampaignInfluencerService,
    MyahCreatorOpsToolWorkspaceService,
    {
      provide: MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
      useExisting: MyahCreatorOpsToolWorkspaceService,
    },
    CampaignInfluencerResolver,
  ],
  exports: [
    CampaignLifecycleService,
    CampaignOutreachWorkflowLifecycleWorkspaceService,
    CampaignInfluencerService,
    MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
  ],
})
export class MyahCampaignLifecycleModule {}
