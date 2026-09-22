import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { OnCustomBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-custom-batch-event.decorator';
import { MESSAGE_CHANNEL_DELETED_EVENT } from 'src/engine/metadata-modules/message-channel/constants/message-channel-deleted.constant';
import { type MessageChannelDeletedEvent } from 'src/engine/metadata-modules/message-channel/types/message-channel-deleted.type';
import { CustomWorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/custom-workspace-batch-event.type';
import { MessagingWebhookSubscriptionService } from 'src/modules/connected-account/webhook-subscription-manager/services/messaging-webhook-subscription.service';

@Injectable()
export class WebhookSubscriptionChannelDeletedListener {
  constructor(
    private readonly messagingWebhookSubscriptionService: MessagingWebhookSubscriptionService,
  ) {}

  @OnCustomBatchEvent(MESSAGE_CHANNEL_DELETED_EVENT)
  async handleMessageChannelDeleted(
    batchEvent: CustomWorkspaceEventBatch<MessageChannelDeletedEvent>,
  ): Promise<void> {
    const { workspaceId } = batchEvent;

    if (!isDefined(workspaceId)) {
      return;
    }

    for (const event of batchEvent.events) {
      await this.messagingWebhookSubscriptionService.deleteSubscription(
        event.messageChannelId,
        workspaceId,
      );
    }
  }
}
