import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { MailboxCapacityDayEntity } from 'src/modules/campaign-execution/entities/mailbox-capacity-day.entity';
import { MailboxDispatchClockEntity } from 'src/modules/campaign-execution/entities/mailbox-dispatch-clock.entity';
import { OutboundEmailAttemptEntity } from 'src/modules/campaign-execution/entities/outbound-email-attempt.entity';

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
