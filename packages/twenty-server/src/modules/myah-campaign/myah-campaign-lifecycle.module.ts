import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';

@Module({
  imports: [TwentyORMModule],
  providers: [CampaignLifecycleService],
  exports: [CampaignLifecycleService],
})
export class MyahCampaignLifecycleModule {}
