import { Global, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { CampaignSequenceAuthorityModule } from 'src/engine/core-modules/campaign-sequence-authority/campaign-sequence-authority.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { CampaignSequenceAuthorizationService } from 'src/engine/core-modules/campaign-sequence-authority/services/campaign-sequence-authorization.service';
import { WorkspaceCampaignCapacityTimeZoneModule } from 'src/engine/core-modules/myah/workspace-campaign-capacity-time-zone.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import {
  CampaignExecutionIdentityAdapter,
  CampaignInitialDueTimeAdapter,
} from 'src/modules/campaign-execution/adapters/campaign-execution-runtime.adapter';
import { CampaignProgressionHistoryReaderAdapter } from 'src/modules/campaign-execution/adapters/campaign-progression-history-reader.adapter';
import { CampaignExecutionModule } from 'src/modules/campaign-execution/campaign-execution.module';
import { CampaignExecutionOrchestrationModule } from 'src/modules/campaign-execution/campaign-execution-orchestration.module';
import {
  CAMPAIGN_EXECUTION_HISTORY_PORT,
  CAMPAIGN_EXECUTION_IDENTITY_PORT,
  CAMPAIGN_INITIAL_DUE_TIME_PORT,
  CAMPAIGN_NEW_ACTIVATION_REVIEW_PORT,
  CAMPAIGN_OCCURRENCE_CLAIM_PORT,
  CAMPAIGN_PROGRESSION_PORT,
  CAMPAIGN_FINAL_SUBMISSION_AUTHORITY_PORT,
  CAMPAIGN_SENT_PROJECTION_PORT,
} from 'src/modules/campaign-execution/constants/campaign-execution-di-tokens';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import { EmailingModule } from 'src/modules/emailing/emailing.module';
import { MessageSuppressionService } from 'src/modules/emailing/services/message-suppression.service';
import { CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import { MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';
import { MessagingImportManagerModule } from 'src/modules/messaging/message-import-manager/messaging-import-manager.module';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { CampaignOutreachWorkflowModule } from 'src/modules/myah-outreach/campaign-outreach-workflow.module';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { LegacyCampaignSequenceCleanupWorkspaceService } from 'src/modules/myah-outreach/services/legacy-campaign-sequence-cleanup.workspace-service';
import { WorkflowCommonModule } from 'src/modules/workflow/common/workflow-common.module';
import { WorkflowTriggerModule } from 'src/modules/workflow/workflow-trigger/workflow-trigger.module';

const dataSource = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getRepository: jest.fn(() => ({})),
};

const twentyConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'CACHE_STORAGE_TTL') return 1;
    if (key === 'REDIS_URL') return 'redis://127.0.0.1:6379';
    if (key === 'EVENT_SINKS') return [];

    return undefined;
  }),
};

@Global()
@Module({
  providers: [
    { provide: TwentyConfigService, useValue: twentyConfigService },
    { provide: DataSource, useValue: dataSource },
    { provide: GlobalWorkspaceOrmManager, useValue: {} },
    { provide: PermissionsService, useValue: {} },
    { provide: MessageSuppressionService, useValue: {} },
    { provide: SentMessagePersistenceService, useValue: {} },
    { provide: MessagingMessageService, useValue: {} },
    { provide: MessagingMessageOutboundService, useValue: {} },
    { provide: getQueueToken(MessageQueue.cronQueue), useValue: {} },
  ],
  exports: [
    TwentyConfigService,
    DataSource,
    GlobalWorkspaceOrmManager,
    PermissionsService,
    MessageSuppressionService,
    SentMessagePersistenceService,
    MessagingMessageService,
    MessagingMessageOutboundService,
    getQueueToken(MessageQueue.cronQueue),
  ],
})
class OrchestrationTestInfrastructureModule {}

@Module({})
class EmptyExternalInfrastructureModule {}

describe('CampaignExecutionOrchestrationModule', () => {
  it('owns the concrete execution, authority, audience, outreach, lifecycle, and capacity imports', () => {
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        CampaignExecutionOrchestrationModule,
      ),
    ).toEqual([
      CampaignExecutionModule,
      CampaignSequenceAuthorityModule,
      EmailingModule,
      CampaignOutreachWorkflowModule,
      MyahCampaignLifecycleModule,
      WorkspaceCampaignCapacityTimeZoneModule,
      MessagingSendManagerModule,
      MessagingImportManagerModule,
    ]);
  });

  it('compiles the actual orchestration module and resolves its concrete export graph', async () => {
    const module = await Test.createTestingModule({
      imports: [
        OrchestrationTestInfrastructureModule,
        CampaignExecutionOrchestrationModule,
      ],
    })
      .overrideModule(EmailingModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideModule(TwentyORMModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideModule(WorkflowCommonModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideModule(MessagingSendManagerModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideModule(MessagingImportManagerModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideModule(PermissionsModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideModule(WorkflowTriggerModule)
      .useModule(EmptyExternalInfrastructureModule)
      .overrideProvider(GlobalWorkspaceOrmManager)
      .useValue({})
      .overrideProvider(MessagingMessageOutboundService)
      .useValue({})
      .overrideProvider(CampaignSequenceAuthorizationService)
      .useValue({})
      .overrideProvider(CampaignSequenceService)
      .useValue({})
      .overrideProvider(CampaignSenderReadinessService)
      .useValue({})
      .overrideProvider(LegacyCampaignSequenceCleanupWorkspaceService)
      .useValue({})
      .overrideProvider(CampaignLifecycleService)
      .useValue({})
      .overrideProvider(CampaignAccountService)
      .useValue({})
      .overrideProvider(CampaignOutreachWorkflowLifecycleWorkspaceService)
      .useValue({})
      .overrideProvider(CampaignInfluencerService)
      .useValue({})
      .overrideProvider(MyahCreatorOpsToolWorkspaceService)
      .useValue({})
      .compile();

    expect(module.get(CampaignLifecycleTransactionService)).toBeInstanceOf(
      CampaignLifecycleTransactionService,
    );
    expect(module.get(CampaignExecutionService)).toBeInstanceOf(
      CampaignExecutionService,
    );
    expect(module.get(CAMPAIGN_EXECUTION_HISTORY_PORT)).toBeInstanceOf(
      CampaignProgressionHistoryReaderAdapter,
    );
    expect(module.get(CAMPAIGN_INITIAL_DUE_TIME_PORT)).toBeInstanceOf(
      CampaignInitialDueTimeAdapter,
    );
    expect(module.get(CAMPAIGN_EXECUTION_IDENTITY_PORT)).toBeInstanceOf(
      CampaignExecutionIdentityAdapter,
    );
    expect(module.get(CAMPAIGN_NEW_ACTIVATION_REVIEW_PORT)).toBeDefined();
    expect(module.get(CAMPAIGN_PROGRESSION_PORT)).toBeDefined();
    expect(module.get(CAMPAIGN_OCCURRENCE_CLAIM_PORT)).toBeDefined();
    expect(module.get(CAMPAIGN_FINAL_SUBMISSION_AUTHORITY_PORT)).toBeDefined();
    expect(module.get(CAMPAIGN_SENT_PROJECTION_PORT)).toBeDefined();

    await module.close();
  });
});
