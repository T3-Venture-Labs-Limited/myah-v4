import { Global, Module } from '@nestjs/common';

import { MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-campaign-outreach-tool-service.token';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { CampaignOutreachWorkflowModule } from 'src/modules/myah-outreach/campaign-outreach-workflow.module';
import { CampaignOutreachToolAccessGuardService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool-access-guard.service';
import { CampaignOutreachToolWorkspaceService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool.workspace-service';

@Global()
@Module({
  imports: [
    CampaignOutreachWorkflowModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
  ],
  providers: [
    CampaignOutreachToolAccessGuardService,
    CampaignOutreachToolWorkspaceService,
    {
      provide: MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN,
      useExisting: CampaignOutreachToolWorkspaceService,
    },
  ],
  exports: [MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN],
})
export class CampaignOutreachToolsModule {}
