import { Module } from '@nestjs/common';

import { CalendarModule } from 'src/modules/calendar/calendar.module';
import { ConnectedAccountModule } from 'src/modules/connected-account/connected-account.module';
import { CampaignExecutionOrchestrationModule } from 'src/modules/campaign-execution/campaign-execution-orchestration.module';
import { MessagingModule } from 'src/modules/messaging/messaging.module';
import { MyahShopifyModule } from 'src/modules/myah-shopify/myah-shopify.module';
import { MyahStandardAppsModule } from 'src/modules/myah-standard-apps/myah-standard-apps.module';
import { MyahUnipileModule } from 'src/modules/myah-unipile/myah-unipile.module';
import { OnboardingInviteSuggestionsModule } from 'src/modules/onboarding-invite-suggestions/onboarding-invite-suggestions.module';
import { WorkflowModule } from 'src/modules/workflow/workflow.module';
import { WorkspaceMemberModule } from 'src/modules/workspace-member/workspace-member.module';

@Module({
  imports: [
    MessagingModule,
    CalendarModule,
    CampaignExecutionOrchestrationModule,
    ConnectedAccountModule,
    MyahShopifyModule,
    MyahStandardAppsModule,
    MyahUnipileModule,
    OnboardingInviteSuggestionsModule,
    WorkflowModule,
    WorkspaceMemberModule,
  ],
  providers: [],
  exports: [],
})
export class ModulesModule {}
