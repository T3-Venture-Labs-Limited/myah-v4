import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type gmail_v1, google } from 'googleapis';
import { isDefined } from 'twenty-shared/utils';
import { WebhookSubscriptionChannelType } from 'twenty-shared/types';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  WebhookSubscriptionDriverException,
  WebhookSubscriptionDriverExceptionCode,
} from 'src/modules/connected-account/webhook-subscription-manager/drivers/exceptions/webhook-subscription-driver.exception';
import {
  type WebhookSubscriptionContext,
  type WebhookSubscriptionDriver,
  type WebhookSubscriptionResult,
} from 'src/modules/connected-account/webhook-subscription-manager/types/webhook-subscription-driver.type';
import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';

@Injectable()
export class GoogleWebhookSubscriptionDriver implements WebhookSubscriptionDriver {
  constructor(
    private readonly googleOAuth2ClientProvider: GoogleOAuth2ClientProvider,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async createSubscription(
    connectedAccountId: string,
    channelType: WebhookSubscriptionChannelType,
    _clientState: string,
  ): Promise<WebhookSubscriptionResult> {
    this.assertMessagingChannel(channelType);

    return this.watchGmailMailbox(connectedAccountId);
  }

  async renewSubscription(
    context: WebhookSubscriptionContext,
  ): Promise<WebhookSubscriptionResult> {
    this.assertMessagingChannel(context.channelType);

    return this.createSubscription(
      context.connectedAccountId,
      context.channelType,
      context.clientState,
    );
  }

  async deleteSubscription(context: WebhookSubscriptionContext): Promise<void> {
    this.assertMessagingChannel(context.channelType);

    return this.stopGmailMailboxWatch(context.connectedAccountId);
  }

  private async watchGmailMailbox(
    connectedAccountId: string,
  ): Promise<WebhookSubscriptionResult> {
    const pubSubTopicName = this.twentyConfigService.get(
      'MESSAGING_GMAIL_PUBSUB_TOPIC',
    );

    if (!isNonEmptyString(pubSubTopicName)) {
      throw new WebhookSubscriptionDriverException(
        'MESSAGING_GMAIL_PUBSUB_TOPIC is not configured',
        WebhookSubscriptionDriverExceptionCode.PROVIDER_NOT_CONFIGURED,
      );
    }

    const gmailClient = await this.getGmailClient(connectedAccountId);

    const { data } = await gmailClient.users.watch({
      userId: 'me',
      requestBody: {
        topicName: pubSubTopicName,
      },
    });

    if (!isDefined(data.expiration)) {
      throw new WebhookSubscriptionDriverException(
        'Gmail watch response did not include an expiration',
        WebhookSubscriptionDriverExceptionCode.PROVIDER_RESPONSE_INVALID,
      );
    }

    return {
      externalSubscriptionId: null,
      externalResourceId: null,
      expiresAt: new Date(Number(data.expiration)),
    };
  }

  private async stopGmailMailboxWatch(
    connectedAccountId: string,
  ): Promise<void> {
    const gmailClient = await this.getGmailClient(connectedAccountId);

    await gmailClient.users.stop({ userId: 'me' });
  }

  private assertMessagingChannel(
    channelType: WebhookSubscriptionChannelType,
  ): void {
    if (channelType === WebhookSubscriptionChannelType.CALENDAR) {
      throw new WebhookSubscriptionDriverException(
        'Calendar webhook subscriptions are no longer available',
        WebhookSubscriptionDriverExceptionCode.UNSUPPORTED_PROVIDER,
      );
    }
  }

  private async getGmailClient(
    connectedAccountId: string,
  ): Promise<gmail_v1.Gmail> {
    const oAuth2Client =
      await this.googleOAuth2ClientProvider.getClient(connectedAccountId);

    return google.gmail({ version: 'v1', auth: oAuth2Client });
  }
}
