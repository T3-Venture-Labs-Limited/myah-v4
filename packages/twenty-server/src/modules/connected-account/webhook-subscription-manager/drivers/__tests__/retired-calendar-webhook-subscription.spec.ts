import { WebhookSubscriptionChannelType } from 'twenty-shared/types';

import { GoogleWebhookSubscriptionDriver } from 'src/modules/connected-account/webhook-subscription-manager/drivers/google/google-webhook-subscription.driver';
import { MicrosoftWebhookSubscriptionDriver } from 'src/modules/connected-account/webhook-subscription-manager/drivers/microsoft/microsoft-webhook-subscription.driver';

const calendarContext = {
  channelType: WebhookSubscriptionChannelType.CALENDAR,
  clientState: 'client-state',
  connectedAccountId: 'connected-account-id',
  externalResourceId: 'resource-id',
  externalSubscriptionId: 'subscription-id',
};

describe.each([
  ['Google', GoogleWebhookSubscriptionDriver],
  ['Microsoft', MicrosoftWebhookSubscriptionDriver],
])('%s calendar webhook retirement', (_provider, Driver) => {
  it('rejects create, renew, and delete before provider access', async () => {
    const getClient = jest.fn();
    const driver = new Driver(
      { getClient } as never,
      { get: jest.fn() } as never,
    );

    await expect(
      driver.createSubscription(
        calendarContext.connectedAccountId,
        calendarContext.channelType,
        calendarContext.clientState,
      ),
    ).rejects.toThrow('Calendar webhook subscriptions are no longer available');
    await expect(driver.renewSubscription(calendarContext)).rejects.toThrow(
      'Calendar webhook subscriptions are no longer available',
    );
    await expect(driver.deleteSubscription(calendarContext)).rejects.toThrow(
      'Calendar webhook subscriptions are no longer available',
    );

    expect(getClient).not.toHaveBeenCalled();
  });
});
