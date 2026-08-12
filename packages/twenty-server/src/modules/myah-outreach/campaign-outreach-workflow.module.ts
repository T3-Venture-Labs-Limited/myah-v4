import { Module } from '@nestjs/common';

import { RecordPositionModule } from 'src/engine/core-modules/record-position/record-position.module';
import { CampaignOutreachWorkflowResolver } from 'src/modules/myah-outreach/resolvers/campaign-outreach-workflow.resolver';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';

@Module({
  imports: [RecordPositionModule],
  providers: [
    CampaignOutreachWorkflowResolver,
    CampaignOutreachWorkflowService,
  ],
  exports: [CampaignOutreachWorkflowService],
})
export class CampaignOutreachWorkflowModule {}
