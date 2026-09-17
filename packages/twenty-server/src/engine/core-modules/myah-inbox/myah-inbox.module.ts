import { forwardRef, Module } from '@nestjs/common';

import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { BillingModule } from 'src/engine/core-modules/billing/billing.module';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-reply-execution-service.token';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';
import { MyahInboxReplyContextModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-reply-context.module';
import { MyahInboxContactResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-contact.resolver';
import { MyahInboxInstagramMessageResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-instagram-message.resolver';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxReplySendResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-reply-send.resolver';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MyahInboxContactLinkService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-link.service';
import { MyahInboxContactQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-query.service';
import { MyahInboxInstagramMessageQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-instagram-message-query.service';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxReplyBriefingService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import {
  MYAH_INBOX_REPLY_CONTEXT_DRAFT_READER,
  type MyahInboxReplyContextDraftReader,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { MyahInboxReplyContextDraftService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import { MyahInboxReplyApprovedExecutionService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-approved-execution.service';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { AiAgentExecutionModule } from 'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module';
import { AiBillingModule } from 'src/engine/metadata-modules/ai/ai-billing/ai-billing.module';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';

@Module({
  imports: [
    ActionApprovalModule,
    MyahInboxReplyContextModule,
    AiBillingModule,
    AiModelsModule,
    BillingModule,
    PermissionsModule,
    GlobalWorkspaceDataSourceModule,
    forwardRef(() => AiAgentExecutionModule),
    MessagingQueryHookModule,
    MessagingSendManagerModule,
    forwardRef(() => ToolProviderModule),
  ],
  providers: [
    MyahInboxContactEmailQueryService,
    MyahInboxContactLinkService,
    MyahInboxContactQueryService,
    MyahInboxInstagramMessageQueryService,
    MyahInboxMutationService,
    MyahInboxReplyBriefingService,
    MyahInboxReplyProposalService,
    MyahInboxReplySendService,
    MyahInboxReplyApprovedExecutionService,
    {
      provide: MYAH_INBOX_REPLY_CONTEXT_DRAFT_READER,
      useFactory: (
        drafts: MyahInboxReplyContextDraftService,
        approvals: ActionApprovalService,
      ) => ({
        read: async ({
          request,
          resolvedContext,
        }: Parameters<MyahInboxReplyContextDraftReader['read']>[0]) => {
          const snapshot = await drafts.read({
            workspaceId: request.workspace.id,
            contactAnchorKind: resolvedContext.target.contactAnchor.kind,
            contactAnchorId: resolvedContext.target.contactAnchor.id,
            channel: resolvedContext.target.channel,
            deliveryTargetId: resolvedContext.target.deliveryTargetId,
            context: resolvedContext.selected,
          });
          const targetState = await approvals.getInboxReplyTargetExecutionState(
            {
              workspaceId: request.workspace.id,
              deliveryTargetId: resolvedContext.target.deliveryTargetId,
              channel: resolvedContext.target.channel,
            },
          );
          return {
            draftId: snapshot.draftId,
            revision: snapshot.revision,
            body: snapshot.body,
            targetState,
            contextAcknowledged:
              snapshot.body === null ||
              (resolvedContext.contextFingerprint !== null &&
                (snapshot.reviewedContextFingerprint ??
                  snapshot.proposalContextFingerprint) ===
                  resolvedContext.contextFingerprint),
          };
        },
      }),
      inject: [MyahInboxReplyContextDraftService, ActionApprovalService],
    },
    MyahInboxToolWorkspaceService,
    BrandBrainPreflightService,
    {
      provide: MYAH_INBOX_TOOL_SERVICE_TOKEN,
      useExisting: MyahInboxToolWorkspaceService,
    },
    MyahInboxContactResolver,
    MyahInboxInstagramMessageResolver,
    {
      provide: MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN,
      useExisting: MyahInboxReplyApprovedExecutionService,
    },
    MyahInboxResolver,
    MyahInboxReplySendResolver,
  ],
  exports: [
    MyahInboxReplyContextModule,
    MyahInboxContactEmailQueryService,
    MyahInboxContactLinkService,
    MyahInboxContactQueryService,
    MyahInboxMutationService,
    MYAH_INBOX_TOOL_SERVICE_TOKEN,
    MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN,
  ],
})
export class MyahInboxModule {}
