import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkflowCommonModule } from 'src/modules/workflow/common/workflow-common.module';
import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';

@Module({
  imports: [TwentyORMModule, WorkflowCommonModule],
  providers: [
    CampaignLifecycleService,
    CampaignOutreachWorkflowLifecycleWorkspaceService,
    CampaignInfluencerService,
    CampaignInfluencerResolver,
  ],
  exports: [
    CampaignLifecycleService,
    CampaignOutreachWorkflowLifecycleWorkspaceService,
    CampaignInfluencerService,
  ],
})
export class MyahCampaignLifecycleModule {}
