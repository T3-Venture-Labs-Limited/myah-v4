import { Module } from '@nestjs/common';

import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { MyahCampaignCreateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-many.pre-query.hook';
import { MyahCampaignCreateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-one.pre-query.hook';
import { MyahCampaignUpdateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-many.pre-query.hook';
import { MyahCampaignUpdateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-one.pre-query.hook';

@Module({
  imports: [MyahCampaignLifecycleModule],
  providers: [
    MyahCampaignCreateOnePreQueryHook,
    MyahCampaignCreateManyPreQueryHook,
    MyahCampaignUpdateOnePreQueryHook,
    MyahCampaignUpdateManyPreQueryHook,
  ],
})
export class MyahCampaignQueryHookModule {}
