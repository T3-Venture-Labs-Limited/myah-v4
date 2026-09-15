import { Module } from '@nestjs/common';

import { CampaignSequenceAuthorizationService } from 'src/engine/core-modules/campaign-sequence-authority/services/campaign-sequence-authorization.service';
import { CampaignSequenceAuthorityModule } from 'src/engine/core-modules/campaign-sequence-authority/campaign-sequence-authority.module';
import { WorkspaceCampaignCapacityTimeZoneModule } from 'src/engine/core-modules/myah/workspace-campaign-capacity-time-zone.module';
import { WorkspaceCampaignCapacityTimeZoneService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone.service';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessagingImportManagerModule } from 'src/modules/messaging/message-import-manager/messaging-import-manager.module';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { CampaignExecutionModule } from 'src/modules/campaign-execution/campaign-execution.module';
import { EmailingModule } from 'src/modules/emailing/emailing.module';
import {
  CampaignLifecycleActorPermissionResolverAdapter,
  CampaignLifecycleWriteAuthorizationAdapter,
} from 'src/modules/campaign-execution/adapters/campaign-lifecycle-authorization.adapter';
import { CampaignNewActivationReviewAdapter } from 'src/modules/campaign-execution/adapters/campaign-new-activation-review.adapter';
import {
  CAMPAIGN_CAPACITY_TIME_ZONE_READER_PORT,
  CAMPAIGN_EXECUTION_PLAN_READER_PORT,
  CAMPAIGN_LIFECYCLE_ACTOR_PERMISSION_RESOLVER_PORT,
  CAMPAIGN_LIFECYCLE_WRITE_AUTHORIZATION_PORT,
  CAMPAIGN_NEW_ACTIVATION_REVIEW_PORT,
  CAMPAIGN_SEQUENCE_AUTHORITY_PORT,
  CAMPAIGN_PROGRESSION_PORT,
  CAMPAIGN_OCCURRENCE_CLAIM_PORT,
  CAMPAIGN_FINAL_SUBMISSION_AUTHORITY_PORT,
  CAMPAIGN_SENT_PROJECTION_PORT,
  CAMPAIGN_REPLY_EVIDENCE_PORT,
  OUTBOUND_EMAIL_DISPATCH_TRANSACTION_PORT,
  SUSPEND_AWARE_MONOTONIC_CLOCK_PORT,
} from 'src/modules/campaign-execution/constants/campaign-execution-di-tokens';
import { CampaignExecutionResolver } from 'src/modules/campaign-execution/resolvers/campaign-execution.resolver';
import { CampaignExecutionApplicationService } from 'src/modules/campaign-execution/services/campaign-execution-application.service';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';
import { CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { CampaignOutreachWorkflowModule } from 'src/modules/myah-outreach/campaign-outreach-workflow.module';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { CampaignSequenceFixedMaterialService } from 'src/modules/myah-outreach/services/campaign-sequence-fixed-material.service';
import { CampaignSignatureMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-signature-material.adapter';
import { CampaignCreatorMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-creator-material.adapter';
import { CampaignSenderMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-sender-material.adapter';
import { CampaignThreadMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-thread-material.adapter';
import { CampaignMessageMaterializerService } from 'src/modules/myah-outreach/services/campaign-message-materializer.service';
import { CampaignMessageRenderService } from 'src/modules/myah-outreach/services/campaign-message-render.service';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignFinalSubmissionAuthorityAdapter } from 'src/modules/campaign-execution/adapters/campaign-final-submission-authority.adapter';
import { CampaignSentProjectionService } from 'src/modules/campaign-execution/services/campaign-sent-projection.service';
import { CampaignMicrosoftHeaderReconciliationService } from 'src/modules/campaign-execution/services/campaign-microsoft-header-reconciliation.service';
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';
import { OutboundEmailDispatchService } from 'src/modules/campaign-execution/services/outbound-email-dispatch.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { CampaignEmailRuntimeCronJob } from 'src/modules/campaign-execution/services/campaign-email-runtime.cron.job';
import { CampaignEmailRuntimeCronCommand } from 'src/modules/campaign-execution/services/campaign-email-runtime.cron.command';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

/**
 * W15 composition root. Deliberately not imported by a runtime parent until
 * the separately reviewed W16 caller/API activation.
 */
@Module({
  imports: [
    CampaignExecutionModule,
    CampaignSequenceAuthorityModule,
    EmailingModule,
    CampaignOutreachWorkflowModule,
    MyahCampaignLifecycleModule,
    WorkspaceCampaignCapacityTimeZoneModule,
    MessagingSendManagerModule,
    MessagingImportManagerModule,
  ],
  providers: [
    CampaignLifecycleActorPermissionResolverAdapter,
    CampaignLifecycleWriteAuthorizationAdapter,
    CampaignNewActivationReviewAdapter,
    CampaignOutreachAudienceReviewService,
    CampaignSignatureMaterialAdapter,
    CampaignCreatorMaterialAdapter,
    CampaignSenderMaterialAdapter,
    CampaignThreadMaterialAdapter,
    {
      provide: EmailComposerService,
      useFactory: (orm: GlobalWorkspaceOrmManager) => {
        const ambientAccessForbidden = new Proxy(
          {},
          {
            get: () => {
              throw new Error('Campaign composer ambient access is forbidden');
            },
          },
        );
        return new EmailComposerService(
          orm,
          ambientAccessForbidden as never,
          ambientAccessForbidden as never,
          ambientAccessForbidden as never,
        );
      },
      inject: [GlobalWorkspaceOrmManager],
    },
    {
      provide: CampaignMessageMaterializerService,
      useFactory: (
        sequence: CampaignSequenceService,
        creator: CampaignCreatorMaterialAdapter,
        signature: CampaignSignatureMaterialAdapter,
        sender: CampaignSenderMaterialAdapter,
        thread: CampaignThreadMaterialAdapter,
      ) =>
        new CampaignMessageMaterializerService(
          sequence,
          creator,
          signature,
          sender,
          { load: async () => ({ kind: 'FORBIDDEN' as const }) },
          thread,
        ),
      inject: [
        CampaignSequenceService,
        CampaignCreatorMaterialAdapter,
        CampaignSignatureMaterialAdapter,
        CampaignSenderMaterialAdapter,
        CampaignThreadMaterialAdapter,
      ],
    },
    {
      provide: CampaignMessageRenderService,
      useFactory: (
        materializer: CampaignMessageMaterializerService,
        composer: EmailComposerService,
      ) => new CampaignMessageRenderService(materializer, composer),
      inject: [CampaignMessageMaterializerService, EmailComposerService],
    },
    {
      provide: CampaignSequenceFixedMaterialService,
      useFactory: (
        sequence: CampaignSequenceService,
        signature: CampaignSignatureMaterialAdapter,
      ) => new CampaignSequenceFixedMaterialService(sequence, signature),
      inject: [CampaignSequenceService, CampaignSignatureMaterialAdapter],
    },
    {
      provide: CAMPAIGN_LIFECYCLE_ACTOR_PERMISSION_RESOLVER_PORT,
      useExisting: CampaignLifecycleActorPermissionResolverAdapter,
    },
    {
      provide: CAMPAIGN_LIFECYCLE_WRITE_AUTHORIZATION_PORT,
      useExisting: CampaignLifecycleWriteAuthorizationAdapter,
    },
    {
      provide: CAMPAIGN_SEQUENCE_AUTHORITY_PORT,
      useExisting: CampaignSequenceAuthorizationService,
    },
    {
      provide: CAMPAIGN_EXECUTION_PLAN_READER_PORT,
      useExisting: CampaignSequenceService,
    },
    {
      provide: CAMPAIGN_CAPACITY_TIME_ZONE_READER_PORT,
      useExisting: WorkspaceCampaignCapacityTimeZoneService,
    },
    {
      provide: CAMPAIGN_NEW_ACTIVATION_REVIEW_PORT,
      useExisting: CampaignNewActivationReviewAdapter,
    },
    CampaignProgressionService,
    CampaignFinalSubmissionAuthorityAdapter,
    {
      provide: OutboundEmailDispatchService,
      useFactory: (
        transaction: never,
        authority: CampaignFinalSubmissionAuthorityAdapter,
        clock: never,
        attempts: OutboundEmailAttemptService,
        outbound: MessagingMessageOutboundService,
      ) =>
        new OutboundEmailDispatchService(
          transaction,
          authority,
          clock,
          attempts,
          outbound,
        ),
      inject: [
        OUTBOUND_EMAIL_DISPATCH_TRANSACTION_PORT,
        CampaignFinalSubmissionAuthorityAdapter,
        SUSPEND_AWARE_MONOTONIC_CLOCK_PORT,
        OutboundEmailAttemptService,
        MessagingMessageOutboundService,
      ],
    },
    CampaignEmailRuntimeService,
    CampaignReplyService,
    {
      provide: CAMPAIGN_REPLY_EVIDENCE_PORT,
      useExisting: CampaignReplyService,
    },
    CampaignEmailRuntimeCronJob,
    CampaignEmailRuntimeCronCommand,
    CampaignSentProjectionService,
    CampaignMicrosoftHeaderReconciliationService,
    {
      provide: CAMPAIGN_PROGRESSION_PORT,
      useExisting: CampaignProgressionService,
    },
    {
      provide: CAMPAIGN_OCCURRENCE_CLAIM_PORT,
      useExisting: CampaignProgressionService,
    },
    {
      provide: CAMPAIGN_FINAL_SUBMISSION_AUTHORITY_PORT,
      useExisting: CampaignFinalSubmissionAuthorityAdapter,
    },
    {
      provide: CAMPAIGN_SENT_PROJECTION_PORT,
      useExisting: CampaignSentProjectionService,
    },
    CampaignLifecycleTransactionService,
    CampaignExecutionService,
    CampaignExecutionApplicationService,
    CampaignExecutionResolver,
  ],
  exports: [
    CampaignLifecycleTransactionService,
    CampaignExecutionService,
    CAMPAIGN_PROGRESSION_PORT,
    CAMPAIGN_OCCURRENCE_CLAIM_PORT,
    CAMPAIGN_FINAL_SUBMISSION_AUTHORITY_PORT,
    CAMPAIGN_SENT_PROJECTION_PORT,
    CampaignMicrosoftHeaderReconciliationService,
    CampaignEmailRuntimeCronCommand,
    CampaignReplyService,
    CAMPAIGN_REPLY_EVIDENCE_PORT,
  ],
})
export class CampaignExecutionOrchestrationModule {}
