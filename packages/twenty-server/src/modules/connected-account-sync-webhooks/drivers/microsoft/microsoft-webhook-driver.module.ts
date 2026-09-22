import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WebhookSyncTriggerService } from 'src/modules/connected-account/webhook-subscription-manager/services/webhook-sync-trigger.service';
import { WebhookSubscriptionModule } from 'src/modules/connected-account/webhook-subscription-manager/webhook-subscription.module';
import { MicrosoftMessagingNotificationHandler } from 'src/modules/connected-account-sync-webhooks/drivers/microsoft/microsoft-messaging-notification.handler';

@Module({
  imports: [
    TwentyConfigModule,
    WebhookSubscriptionModule,
    TypeOrmModule.forFeature([MessageChannelEntity]),
  ],
  providers: [MicrosoftMessagingNotificationHandler, WebhookSyncTriggerService],
  exports: [MicrosoftMessagingNotificationHandler],
})
export class MicrosoftWebhookDriverModule {}
