import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { type Stripe } from 'stripe';

import { MyahSubscriptionSyncService } from 'src/engine/core-modules/myah-subscription/myah-subscription-sync.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

@Controller('webhooks/myah-stripe')
// Stripe signs the raw request; this endpoint does not use a workspace session.
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class MyahStripeWebhookController {
  constructor(
    private readonly sync: MyahSubscriptionSyncService,
    private readonly config: TwentyConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const secret = this.config.get('MYAH_STRIPE_WEBHOOK_SECRET');

    if (!secret || !signature || !request.rawBody)
      throw new BadRequestException('Invalid Stripe signature');

    let event: Stripe.Event;
    try {
      event = this.sync
        .stripe()
        .webhooks.constructEvent(request.rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    await this.sync.handleEvent(event);

    return { received: true };
  }
}
