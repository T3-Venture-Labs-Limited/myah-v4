import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailboxCapacityDayEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-capacity-day.entity';
import { MailboxDispatchClockEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-dispatch-clock.entity';
import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MailboxDispatchClockEntity,
      MailboxCapacityDayEntity,
      OutboundEmailAttemptEntity,
    ]),
  ],
  providers: [MailboxCapacityService, OutboundEmailAttemptService],
  exports: [TypeOrmModule, MailboxCapacityService, OutboundEmailAttemptService],
})
export class CampaignExecutionModule {}
