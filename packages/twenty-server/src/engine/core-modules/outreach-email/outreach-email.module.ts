import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ManagedEmailModule } from 'src/engine/core-modules/managed-email/managed-email.module';
import { OutreachEmailDraftService } from 'src/engine/core-modules/outreach-email/services/outreach-email-draft.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';

@Module({
  imports: [
    ManagedEmailModule,
    MessagingSendManagerModule,
    MyahCampaignLifecycleModule,
    TypeOrmModule.forFeature([ConnectedAccountEntity, MessageChannelEntity]),
  ],
  providers: [OutreachEmailDraftService],
  exports: [OutreachEmailDraftService],
})
export class OutreachEmailModule {}
