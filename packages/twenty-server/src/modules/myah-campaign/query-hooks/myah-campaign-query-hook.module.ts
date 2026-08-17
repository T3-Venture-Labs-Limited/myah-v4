import { Module } from '@nestjs/common';

import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { MyahCampaignCreateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-many.pre-query.hook';
import { MyahCampaignCreateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-create-one.pre-query.hook';
import { MyahCampaignUpdateManyPreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-many.pre-query.hook';
import { MyahCampaignUpdateOnePreQueryHook } from 'src/modules/myah-campaign/query-hooks/myah-campaign-update-one.pre-query.hook';
import {
  MyahCampaignDeleteManyPostQueryHook,
  MyahCampaignDeleteOnePostQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-delete.post-query.hooks';
import {
  MyahCampaignDestroyManyPreQueryHook,
  MyahCampaignDestroyOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-destroy.pre-query.hooks';
import {
  MyahCreatorListMemberCreateManyPreQueryHook,
  MyahCreatorListMemberCreateOnePreQueryHook,
  MyahCreatorListMemberDeleteManyPreQueryHook,
  MyahCreatorListMemberDeleteOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-creator-list-member.pre-query.hooks';
@Module({
  imports: [MyahCampaignLifecycleModule],
  providers: [
    MyahCampaignCreateOnePreQueryHook,
    MyahCampaignCreateManyPreQueryHook,
    MyahCampaignUpdateManyPreQueryHook,
    MyahCampaignUpdateOnePreQueryHook,
    MyahCampaignDeleteOnePostQueryHook,
    MyahCampaignDeleteManyPostQueryHook,
    MyahCampaignDestroyOnePreQueryHook,
    MyahCampaignDestroyManyPreQueryHook,
    MyahCreatorListMemberCreateOnePreQueryHook,
    MyahCreatorListMemberCreateManyPreQueryHook,
    MyahCreatorListMemberDeleteOnePreQueryHook,
    MyahCreatorListMemberDeleteManyPreQueryHook,
  ],
})
export class MyahCampaignQueryHookModule {}
