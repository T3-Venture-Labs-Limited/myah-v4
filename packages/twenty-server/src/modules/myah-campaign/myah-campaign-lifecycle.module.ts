import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';

@Module({
  imports: [TwentyORMModule],
  providers: [CampaignLifecycleService, CampaignInfluencerService, CampaignInfluencerResolver],
  exports: [CampaignLifecycleService, CampaignInfluencerService],
})
export class MyahCampaignLifecycleModule {}
