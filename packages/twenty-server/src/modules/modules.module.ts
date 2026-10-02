import { Module } from '@nestjs/common';

import { ConnectedAccountModule } from 'src/modules/connected-account/connected-account.module';
import { CampaignExecutionOrchestrationModule } from 'src/modules/campaign-execution/campaign-execution-orchestration.module';
import { MessagingModule } from 'src/modules/messaging/messaging.module';
import { MyahUnipileModule } from 'src/modules/myah-unipile/myah-unipile.module';
import { OnboardingInviteSuggestionsModule } from 'src/modules/onboarding-invite-suggestions/onboarding-invite-suggestions.module';
import { WorkflowModule } from 'src/modules/workflow/workflow.module';
import { WorkspaceMemberModule } from 'src/modules/workspace-member/workspace-member.module';

@Module({
  imports: [
    MessagingModule,
    CampaignExecutionOrchestrationModule,
    ConnectedAccountModule,
    MyahUnipileModule,
    OnboardingInviteSuggestionsModule,
    WorkflowModule,
    WorkspaceMemberModule,
  ],
  providers: [],
  exports: [],
})
export class ModulesModule {}
