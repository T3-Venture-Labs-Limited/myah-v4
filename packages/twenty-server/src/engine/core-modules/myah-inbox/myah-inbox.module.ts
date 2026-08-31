import { forwardRef, Module } from '@nestjs/common';

import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { BillingModule } from 'src/engine/core-modules/billing/billing.module';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxReplySendResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-reply-send.resolver';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyBriefingService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { AiAgentExecutionModule } from 'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module';
import { AiBillingModule } from 'src/engine/metadata-modules/ai/ai-billing/ai-billing.module';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';

@Module({
  imports: [
    ActionApprovalModule,
    AiBillingModule,
    AiModelsModule,
    BillingModule,
    PermissionsModule,
    forwardRef(() => AiAgentExecutionModule),
    MessagingQueryHookModule,
    MessagingSendManagerModule,
    forwardRef(() => ToolProviderModule),
  ],
  providers: [
    MyahInboxMutationService,
    MyahInboxQueryService,
    MyahInboxReplyBriefingService,
    MyahInboxReplyProposalService,
    MyahInboxReplySendService,
    MyahInboxToolWorkspaceService,
    BrandBrainPreflightService,
    {
      provide: MYAH_INBOX_TOOL_SERVICE_TOKEN,
      useExisting: MyahInboxToolWorkspaceService,
    },
    MyahInboxResolver,
    MyahInboxReplySendResolver,
  ],
  exports: [
    MyahInboxMutationService,
    MyahInboxQueryService,
    MYAH_INBOX_TOOL_SERVICE_TOKEN,
  ],
})
export class MyahInboxModule {}
