import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutreachEmailDraftService } from 'src/engine/core-modules/outreach-email/services/outreach-email-draft.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';

@Module({
  imports: [
    MessagingSendManagerModule,
    TypeOrmModule.forFeature([ConnectedAccountEntity, MessageChannelEntity]),
  ],
  providers: [OutreachEmailDraftService],
  exports: [OutreachEmailDraftService],
})
export class OutreachEmailModule {}
