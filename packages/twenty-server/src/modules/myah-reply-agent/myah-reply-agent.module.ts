import { forwardRef, Module } from '@nestjs/common';

import { BillingModule } from 'src/engine/core-modules/billing/billing.module';
import { InstagramMessageModule } from 'src/engine/core-modules/instagram-message/instagram-message.module';
import { MyahAgentModule } from 'src/engine/core-modules/myah-agent/myah-agent.module';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { AiAgentExecutionModule } from 'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module';
import { AiBillingModule } from 'src/engine/metadata-modules/ai/ai-billing/ai-billing.module';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { CampaignExecutionOrchestrationModule } from 'src/modules/campaign-execution/campaign-execution-orchestration.module';
import { MyahReplyAgentJob } from 'src/modules/myah-reply-agent/jobs/myah-reply-agent.job';
import { MyahCreatorMessageTriggerService } from 'src/modules/myah-reply-agent/services/myah-creator-message-trigger.service';
import { MyahReplyAgentContextService } from 'src/modules/myah-reply-agent/services/myah-reply-agent-context.service';
import { MyahReplyAgentService } from 'src/modules/myah-reply-agent/services/myah-reply-agent.service';
import { MyahReplyAgentReviewResolver } from 'src/modules/myah-reply-agent/resolvers/myah-reply-agent-review.resolver';
import { MyahReplyAgentReviewService } from 'src/modules/myah-reply-agent/services/myah-reply-agent-review.service';

@Module({
  imports: [
    CampaignExecutionOrchestrationModule,
    MyahInboxModule,
    MyahAgentModule,
    InstagramMessageModule,
    forwardRef(() => AiAgentExecutionModule),
    AiModelsModule,
    AiBillingModule,
    BillingModule,
    GlobalWorkspaceDataSourceModule,
    PermissionsModule,
  ],
  providers: [
    MyahCreatorMessageTriggerService,
    MyahReplyAgentContextService,
    MyahReplyAgentService,
    MyahReplyAgentJob,
    MyahReplyAgentReviewService,
    MyahReplyAgentReviewResolver,
  ],
  exports: [MyahCreatorMessageTriggerService, MyahReplyAgentService],
})
export class MyahReplyAgentModule {}
