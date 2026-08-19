import { forwardRef, Module } from '@nestjs/common';

import { BillingModule } from 'src/engine/core-modules/billing/billing.module';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyBriefingService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { AiAgentExecutionModule } from 'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module';
import { AiBillingModule } from 'src/engine/metadata-modules/ai/ai-billing/ai-billing.module';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';

@Module({
  imports: [
    AiBillingModule,
    AiModelsModule,
    BillingModule,
    forwardRef(() => AiAgentExecutionModule),
    MessagingQueryHookModule,
    forwardRef(() => ToolProviderModule),
  ],
  providers: [
    MyahInboxMutationService,
    MyahInboxQueryService,
    MyahInboxReplyBriefingService,
    MyahInboxReplyProposalService,
    MyahInboxToolWorkspaceService,
    BrandBrainPreflightService,
    {
      provide: MYAH_INBOX_TOOL_SERVICE_TOKEN,
      useExisting: MyahInboxToolWorkspaceService,
    },
    MyahInboxResolver,
  ],
  exports: [
    MyahInboxMutationService,
    MyahInboxQueryService,
    MYAH_INBOX_TOOL_SERVICE_TOKEN,
  ],
})
export class MyahInboxModule {}
