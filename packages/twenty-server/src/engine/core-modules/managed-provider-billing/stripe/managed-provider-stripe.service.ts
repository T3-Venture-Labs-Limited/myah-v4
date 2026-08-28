import { Injectable, Inject, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import { IsNull } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export type MetronomeBaseUrlEnvironment = 'PRODUCTION' | 'SANDBOX';

@Injectable()
export class ManagedProviderStripeService {
  private stripeClient?: Stripe;

  constructor(
    @Optional()
    @Inject('MANAGED_PROVIDER_STRIPE_CLIENT')
    private readonly injectedStripeClient: Stripe | undefined,
    @InjectWorkspaceScopedRepository(MyahWorkspaceInstallationEntity)
    private readonly installationRepository: WorkspaceScopedRepository<MyahWorkspaceInstallationEntity>,
    private readonly twentyConfigService?: TwentyConfigService,
  ) {}

  async prepareWorkspacePaymentMethod({
    metronomeBaseUrlEnvironment,
    workspaceId,
  }: {
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    workspaceId: string;
  }) {
    const customerId = await this.ensureWorkspaceCustomer(
      workspaceId,
      metronomeBaseUrlEnvironment,
    );
    const intent = await this.stripe().setupIntents.create({
      customer: customerId,
      usage: 'off_session',
    });
    if (intent.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)) {
      throw new Error('Stripe SetupIntent mode is invalid');
    }
    if (!intent.client_secret)
      throw new Error('Stripe SetupIntent did not return a client secret');
    return {
      clientSecret: intent.client_secret,
      publishableKey: this.publishableKey(),
      setupIntentId: intent.id,
      ready: false,
      stripeCustomerId: customerId,
    };
  }

  async completeWorkspacePaymentMethodSetup({
    metronomeBaseUrlEnvironment,
    setupIntentId,
    workspaceId,
  }: {
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    setupIntentId: string;
    workspaceId: string;
  }) {
    const customerId = await this.persistedCustomerId(workspaceId);
    const intent = await this.stripe().setupIntents.retrieve(setupIntentId);
    const paymentMethodId =
      typeof intent.payment_method === 'string'
        ? intent.payment_method
        : intent.payment_method?.id;
    if (
      intent.customer !== customerId ||
      intent.status !== 'succeeded' ||
      !paymentMethodId ||
      intent.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe SetupIntent proof is invalid');
    }
    const customer = await this.stripe().customers.retrieve(customerId);
    if (
      customer.deleted ||
      customer.id !== customerId ||
      customer.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe Customer proof is invalid');
    }
    await this.stripe().customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return { stripeCustomerId: customerId, paymentMethodId };
  }

  async assertWorkspacePaymentMethodReady({
    metronomeBaseUrlEnvironment,
    workspaceId,
  }: {
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    workspaceId: string;
  }) {
    const customerId = await this.persistedCustomerId(workspaceId);
    const customer = await this.stripe().customers.retrieve(customerId);
    if (
      customer.deleted ||
      customer.id !== customerId ||
      customer.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe Customer proof is invalid');
    }
    const paymentMethod = customer.invoice_settings?.default_payment_method;
    const paymentMethodId =
      typeof paymentMethod === 'string' ? paymentMethod : paymentMethod?.id;
    if (!paymentMethodId)
      throw new Error('Workspace Stripe payment method is not ready');
    return { stripeCustomerId: customerId, paymentMethodId, ready: true };
  }

  async assertPaidExternalInvoice({
    metronomeBaseUrlEnvironment,
    workspaceId,
    stripeInvoiceId,
    metronomeInvoiceId,
    expectedPaymentIntentId,
    expectedAmountCents,
    currency,
  }: {
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    workspaceId: string;
    stripeInvoiceId: string;
    metronomeInvoiceId: string;
    expectedPaymentIntentId: string;
    expectedAmountCents: number;
    currency: string;
  }) {
    const customerId = await this.persistedCustomerId(workspaceId);
    const stripe = this.stripe();
    const invoice = await stripe.invoices.retrieve(stripeInvoiceId);

    if (
      invoice.customer !== customerId ||
      invoice.status !== 'paid' ||
      invoice.amount_paid !== expectedAmountCents ||
      expectedAmountCents <= 0 ||
      invoice.currency.toLowerCase() !== currency.toLowerCase() ||
      invoice.metadata?.metronome_id !== metronomeInvoiceId ||
      invoice.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe invoice proof is invalid');
    }

    const paymentIntentId = expectedPaymentIntentId.trim();

    if (paymentIntentId === '') {
      throw new Error('Stripe external invoice proof is invalid');
    }

    const invoicePayments = await stripe.invoicePayments.list({
      invoice: stripeInvoiceId,
      limit: 2,
      payment: {
        payment_intent: paymentIntentId,
        type: 'payment_intent',
      },
      status: 'paid',
    });
    const invoicePayment = invoicePayments.data[0];
    const invoicePaymentInvoiceId =
      typeof invoicePayment?.invoice === 'string'
        ? invoicePayment.invoice
        : invoicePayment?.invoice.id;
    const invoicePaymentIntent = invoicePayment?.payment.payment_intent;
    const invoicePaymentIntentId =
      typeof invoicePaymentIntent === 'string'
        ? invoicePaymentIntent
        : invoicePaymentIntent?.id;

    if (
      invoicePayments.has_more ||
      invoicePayments.data.length !== 1 ||
      invoicePayment === undefined ||
      invoicePayment.status !== 'paid' ||
      invoicePayment.amount_paid !== expectedAmountCents ||
      invoicePayment.amount_requested !== expectedAmountCents ||
      invoicePayment.currency.toLowerCase() !== currency.toLowerCase() ||
      invoicePaymentInvoiceId !== stripeInvoiceId ||
      invoicePayment.payment.type !== 'payment_intent' ||
      invoicePaymentIntentId !== paymentIntentId ||
      invoicePayment.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe external invoice proof is invalid');
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentIntentCustomerId =
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

    if (
      paymentIntent.id !== paymentIntentId ||
      paymentIntent.status !== 'succeeded' ||
      paymentIntent.amount_received !== expectedAmountCents ||
      paymentIntent.currency.toLowerCase() !== currency.toLowerCase() ||
      paymentIntentCustomerId !== customerId ||
      paymentIntent.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe external invoice proof is invalid');
    }

    return {
      invoiceId: invoice.id,
      paymentIntentId,
      status: invoice.status,
      customerId,
      metronomeInvoiceId,
    };
  }

  private expectedLivemode(
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment,
  ): boolean {
    return metronomeBaseUrlEnvironment === 'PRODUCTION';
  }

  private async ensureWorkspaceCustomer(
    workspaceId: string,
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment,
  ): Promise<string> {
    const installation = await this.installationRepository.findOneBy(
      workspaceId,
      {},
    );
    if (!installation) throw new Error('Workspace installation was not found');
    if (installation.stripeCustomerId) {
      const customer = await this.stripe().customers.retrieve(
        installation.stripeCustomerId,
      );
      if (
        customer.deleted ||
        customer.id !== installation.stripeCustomerId ||
        customer.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
      ) {
        throw new Error('Stripe Customer proof is invalid');
      }
      return installation.stripeCustomerId;
    }
    const customer = await this.stripe().customers.create(
      {
        metadata: { workspace_id: workspaceId },
      },
      { idempotencyKey: `managed-provider-customer:${workspaceId}` },
    );
    if (
      customer.livemode !== this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe Customer proof is invalid');
    }
    const result = await this.installationRepository.update(
      workspaceId,
      { stripeCustomerId: IsNull() },
      { stripeCustomerId: customer.id },
    );
    if (result.affected === 1) return customer.id;
    const concurrent = await this.installationRepository.findOneBy(
      workspaceId,
      {},
    );
    if (!concurrent?.stripeCustomerId)
      throw new Error('Stripe Customer could not be stored');
    const persistedCustomer = await this.stripe().customers.retrieve(
      concurrent.stripeCustomerId,
    );
    if (
      persistedCustomer.deleted ||
      persistedCustomer.id !== concurrent.stripeCustomerId ||
      persistedCustomer.livemode !==
        this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe Customer proof is invalid');
    }
    return concurrent.stripeCustomerId;
  }

  private async persistedCustomerId(workspaceId: string): Promise<string> {
    const installation = await this.installationRepository.findOneBy(
      workspaceId,
      {},
    );
    if (!installation?.stripeCustomerId)
      throw new Error('Workspace Stripe Customer is not configured');
    return installation.stripeCustomerId;
  }

  private stripe(): Stripe {
    if (!this.stripeClient) {
      if (this.injectedStripeClient) {
        this.stripeClient = this.injectedStripeClient;
      } else {
        const key = this.twentyConfigService?.get('BILLING_STRIPE_API_KEY');
        if (!key) throw new Error('Stripe is not configured');
        this.stripeClient = new Stripe(key, {});
      }
    }
    return this.stripeClient;
  }

  private publishableKey(): string {
    const key = this.twentyConfigService?.get('BILLING_STRIPE_PUBLISHABLE_KEY');
    return key ?? '';
  }
}
