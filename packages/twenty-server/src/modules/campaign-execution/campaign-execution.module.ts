import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CampaignActivationEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-activation.entity';
import { CampaignEnrollmentEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-enrollment.entity';
import { CampaignExecutionEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-execution.entity';
import { CampaignForecastEntryEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-forecast-entry.entity';
import { CampaignForecastGenerationEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-forecast-generation.entity';
import { CampaignForecastHeadEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-forecast-head.entity';
import { CampaignOccurrenceEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-occurrence.entity';
import { CampaignOutboundRenderEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-outbound-render.entity';
import { MailboxCapacityDayEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-capacity-day.entity';
import { MailboxDispatchClockEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-dispatch-clock.entity';
import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import {
  CAMPAIGN_EXECUTION_HISTORY_PORT,
  CAMPAIGN_EXECUTION_IDENTITY_PORT,
  CAMPAIGN_EXECUTION_PERSISTENCE_PORT,
  CAMPAIGN_INITIAL_DUE_TIME_PORT,
  OUTBOUND_EMAIL_DISPATCH_TRANSACTION_PORT,
  SUSPEND_AWARE_MONOTONIC_CLOCK_PORT,
} from 'src/modules/campaign-execution/constants/campaign-execution-di-tokens';
import { CampaignExecutionPersistenceAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-persistence.adapter';
import {
  CampaignExecutionIdentityAdapter,
  CampaignInitialDueTimeAdapter,
} from 'src/modules/campaign-execution/adapters/campaign-execution-runtime.adapter';
import { CampaignProgressionHistoryReaderAdapter } from 'src/modules/campaign-execution/adapters/campaign-progression-history-reader.adapter';
import {
  createProductionSuspendAwareClock,
  OutboundEmailDispatchTransactionAdapter,
} from 'src/modules/campaign-execution/adapters/outbound-email-dispatch-runtime.adapter';
import { CampaignForecastCandidateReaderService } from 'src/modules/campaign-execution/services/campaign-forecast-candidate-reader.service';
import { CampaignForecastInputInvalidationService } from 'src/modules/campaign-execution/services/campaign-forecast-input-invalidation.service';
import { CampaignMessageForecastService } from 'src/modules/campaign-execution/services/campaign-message-forecast.service';
import { CampaignMessageOverviewRowService } from 'src/modules/campaign-execution/services/campaign-message-overview-row.service';
import { CampaignForecastProjectionService } from 'src/modules/campaign-execution/services/campaign-forecast-projection.service';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MailboxDispatchClockEntity,
      MailboxCapacityDayEntity,
      OutboundEmailAttemptEntity,
      CampaignExecutionEntity,
      CampaignForecastHeadEntity,
      CampaignForecastGenerationEntity,
      CampaignForecastEntryEntity,
      CampaignActivationEntity,
      CampaignEnrollmentEntity,
      CampaignOccurrenceEntity,
      CampaignOutboundRenderEntity,
    ]),
  ],
  providers: [
    provideWorkspaceScopedRepository(CampaignEnrollmentEntity),
    provideWorkspaceScopedRepository(CampaignOccurrenceEntity),
    provideWorkspaceScopedRepository(OutboundEmailAttemptEntity),
    MailboxCapacityService,
    OutboundEmailAttemptService,
    CampaignForecastCandidateReaderService,
    CampaignForecastInputInvalidationService,
    CampaignMessageForecastService,
    CampaignMessageOverviewRowService,
    CampaignForecastProjectionService,
    CampaignTimelineEventWriterService,
    CampaignExecutionPersistenceAdapter,
    CampaignProgressionHistoryReaderAdapter,
    CampaignInitialDueTimeAdapter,
    CampaignExecutionIdentityAdapter,
    OutboundEmailDispatchTransactionAdapter,
    {
      provide: OUTBOUND_EMAIL_DISPATCH_TRANSACTION_PORT,
      useExisting: OutboundEmailDispatchTransactionAdapter,
    },
    {
      provide: SUSPEND_AWARE_MONOTONIC_CLOCK_PORT,
      useFactory: createProductionSuspendAwareClock,
    },
    {
      provide: CAMPAIGN_EXECUTION_PERSISTENCE_PORT,
      useExisting: CampaignExecutionPersistenceAdapter,
    },
    {
      provide: CAMPAIGN_EXECUTION_HISTORY_PORT,
      useExisting: CampaignProgressionHistoryReaderAdapter,
    },
    {
      provide: CAMPAIGN_INITIAL_DUE_TIME_PORT,
      useExisting: CampaignInitialDueTimeAdapter,
    },
    {
      provide: CAMPAIGN_EXECUTION_IDENTITY_PORT,
      useExisting: CampaignExecutionIdentityAdapter,
    },
  ],
  exports: [
    TypeOrmModule,
    getWorkspaceScopedRepositoryToken(CampaignEnrollmentEntity),
    getWorkspaceScopedRepositoryToken(CampaignOccurrenceEntity),
    getWorkspaceScopedRepositoryToken(OutboundEmailAttemptEntity),
    MailboxCapacityService,
    OutboundEmailAttemptService,
    CampaignForecastCandidateReaderService,
    CampaignForecastInputInvalidationService,
    CampaignMessageForecastService,
    CampaignMessageOverviewRowService,
    CampaignForecastProjectionService,
    CampaignTimelineEventWriterService,
    CAMPAIGN_EXECUTION_PERSISTENCE_PORT,
    CAMPAIGN_EXECUTION_HISTORY_PORT,
    CAMPAIGN_INITIAL_DUE_TIME_PORT,
    CAMPAIGN_EXECUTION_IDENTITY_PORT,
    OUTBOUND_EMAIL_DISPATCH_TRANSACTION_PORT,
    SUSPEND_AWARE_MONOTONIC_CLOCK_PORT,
  ],
})
export class CampaignExecutionModule {}
