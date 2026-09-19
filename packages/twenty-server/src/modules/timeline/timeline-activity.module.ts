import { Module } from '@nestjs/common';

import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { ObjectMetadataRepositoryModule } from 'src/engine/object-metadata-repository/object-metadata-repository.module';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';
import {
  CampaignTimelineFindManyPostQueryHook,
  CampaignTimelineFindOnePostQueryHook,
} from 'src/modules/timeline/query-hooks/campaign-timeline.post-query-hooks';
import { CampaignTimelineVisibilityService } from 'src/modules/timeline/services/campaign-timeline-visibility.service';
import { TimelineActivityService } from 'src/modules/timeline/services/timeline-activity.service';
import { TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

@Module({
  imports: [
    ObjectMetadataRepositoryModule.forFeature([
      TimelineActivityWorkspaceEntity,
    ]),
    TwentyORMModule,
    FeatureFlagModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
    MessagingQueryHookModule,
  ],
  providers: [
    TimelineActivityService,
    CampaignTimelineVisibilityService,
    CampaignTimelineFindManyPostQueryHook,
    CampaignTimelineFindOnePostQueryHook,
  ],
  exports: [TimelineActivityService],
})
export class TimelineActivityModule {}
