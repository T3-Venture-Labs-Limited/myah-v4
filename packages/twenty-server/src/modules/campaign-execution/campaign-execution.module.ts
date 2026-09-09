import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { MailboxCapacityDayEntity } from 'src/modules/campaign-execution/entities/mailbox-capacity-day.entity';
import { MailboxDispatchClockEntity } from 'src/modules/campaign-execution/entities/mailbox-dispatch-clock.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MailboxDispatchClockEntity,
      MailboxCapacityDayEntity,
    ]),
  ],
  providers: [MailboxCapacityService],
  exports: [TypeOrmModule, MailboxCapacityService],
})
export class CampaignExecutionModule {}
