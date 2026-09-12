import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CampaignActivationEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-activation.entity';
import { CampaignEnrollmentEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-enrollment.entity';
import { CampaignExecutionEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-execution.entity';
import { CampaignOccurrenceEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-occurrence.entity';
import { CampaignOutboundRenderEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-outbound-render.entity';
import { MailboxCapacityDayEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-capacity-day.entity';
import { MailboxDispatchClockEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-dispatch-clock.entity';
import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';
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
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MailboxDispatchClockEntity,
      MailboxCapacityDayEntity,
      OutboundEmailAttemptEntity,
      CampaignExecutionEntity,
      CampaignActivationEntity,
      CampaignEnrollmentEntity,
      CampaignOccurrenceEntity,
      CampaignOutboundRenderEntity,
    ]),
  ],
  providers: [
    MailboxCapacityService,
    OutboundEmailAttemptService,
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
    MailboxCapacityService,
    OutboundEmailAttemptService,
    CAMPAIGN_EXECUTION_PERSISTENCE_PORT,
    CAMPAIGN_EXECUTION_HISTORY_PORT,
    CAMPAIGN_INITIAL_DUE_TIME_PORT,
    CAMPAIGN_EXECUTION_IDENTITY_PORT,
    OUTBOUND_EMAIL_DISPATCH_TRANSACTION_PORT,
    SUSPEND_AWARE_MONOTONIC_CLOCK_PORT,
  ],
})
export class CampaignExecutionModule {}
