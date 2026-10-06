import { type RawBodyRequest } from '@nestjs/common';
import { type Request } from 'express';
import Stripe from 'stripe';

import { MyahStripeWebhookController } from 'src/engine/core-modules/myah-subscription/myah-stripe-webhook.controller';
import {
  MyahSubscriptionReconciliationCommand,
  MyahSubscriptionReconciliationJob,
} from 'src/engine/core-modules/myah-subscription/myah-subscription-reconciliation.cron';

describe('Myah Stripe webhook and reconciliation', () => {
  const stripe = new Stripe('sk_test_local_fixture');
  const secret = 'whsec_local_fixture';
  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'invoice.paid',
    data: { object: { customer: 'cus_test' } },
  });
  const handleEvent = jest.fn().mockResolvedValue(null);
  const controller = new MyahStripeWebhookController(
    {
      stripe: () => stripe,
      handleEvent,
    } as never,
    { get: () => secret } as never,
  );
  const request = { rawBody: Buffer.from(payload) } as RawBodyRequest<Request>;

  beforeEach(() => {
    handleEvent.mockClear();
  });

  it('verifies a genuine signature before syncing', async () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    expect(await controller.handle(request, signature)).toEqual({
      received: true,
    });
    expect(handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice.paid' }),
    );
  });

  it('refuses forged signatures without syncing', async () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'wrong',
    });
    await expect(controller.handle(request, signature)).rejects.toThrow(
      'Invalid Stripe signature',
    );
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('acknowledges an unknown workspace without creating a subscription', async () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    handleEvent.mockResolvedValueOnce(null);
    expect(await controller.handle(request, signature)).toEqual({
      received: true,
    });
  });

  it('does not acknowledge a failed sync, allowing Stripe to retry', async () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    handleEvent.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(controller.handle(request, signature)).rejects.toThrow(
      'database unavailable',
    );
  });

  it('registers a daily job and runs reconciliation', async () => {
    const addCron = jest.fn();
    await new MyahSubscriptionReconciliationCommand({ addCron } as never).run();
    expect(addCron).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { repeat: { pattern: '0 3 * * *' } },
      }),
    );
    const reconcile = jest.fn();
    await new MyahSubscriptionReconciliationJob({
      reconcile,
    } as never).handle();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});
