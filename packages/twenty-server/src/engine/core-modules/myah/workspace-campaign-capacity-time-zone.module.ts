import { Module } from '@nestjs/common';

import { WorkspaceCampaignCapacityTimeZoneAuthorizationService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone-authorization.service';
import { WorkspaceCampaignCapacityTimeZoneService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone.service';
import { WorkspaceCampaignCapacityTimeZoneAuthorizationPort } from 'src/engine/core-modules/myah/types/workspace-campaign-capacity-time-zone.type';

@Module({
  providers: [
    WorkspaceCampaignCapacityTimeZoneAuthorizationService,
    {
      provide: WorkspaceCampaignCapacityTimeZoneAuthorizationPort,
      useExisting: WorkspaceCampaignCapacityTimeZoneAuthorizationService,
    },
    WorkspaceCampaignCapacityTimeZoneService,
  ],
  exports: [WorkspaceCampaignCapacityTimeZoneService],
})
export class WorkspaceCampaignCapacityTimeZoneModule {}
