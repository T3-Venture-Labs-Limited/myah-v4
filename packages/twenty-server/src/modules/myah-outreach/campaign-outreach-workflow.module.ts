import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { CampaignOutreachWorkflowResolver } from 'src/modules/myah-outreach/resolvers/campaign-outreach-workflow.resolver';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { LegacyCampaignSequenceCleanupWorkspaceService } from 'src/modules/myah-outreach/services/legacy-campaign-sequence-cleanup.workspace-service';
import { WorkflowTriggerModule } from 'src/modules/workflow/workflow-trigger/workflow-trigger.module';

@Module({
  imports: [PermissionsModule, WorkflowTriggerModule],
  providers: [
    CampaignOutreachWorkflowResolver,
    CampaignOutreachWorkflowService,
    CampaignSequenceService,
    LegacyCampaignSequenceCleanupWorkspaceService,
  ],
  exports: [CampaignOutreachWorkflowService, CampaignSequenceService],
})
export class CampaignOutreachWorkflowModule {}
