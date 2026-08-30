import { createHash } from 'node:crypto';

import { Injectable, Inject, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import { z } from 'zod';
import { IsNull } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export type MetronomeBaseUrlEnvironment = 'PRODUCTION' | 'SANDBOX';

export type WorkspaceBillingDetailsInput = Readonly<{
  city: string;
  country: string;
  line1: string;
  line2?: string | null;
  name: string;
  postalCode: string;
  state?: string | null;
  taxIdType?: Stripe.TaxIdCreateParams.Type | null;
  taxIdValue?: string | null;
}>;

export type WorkspaceBillingDetailsSummary = Readonly<{
  address: Readonly<{
    city: string | null;
    country: string | null;
    line1: string | null;
    line2: string | null;
    postalCode: string | null;
    state: string | null;
  }>;
  card: Readonly<{
    brand: string;
    expiryMonth: number;
    expiryYear: number;
    last4: string;
  }> | null;
  name: string | null;
  paymentMethodReady: boolean;
  taxId: Readonly<{ country: string | null; type: string }> | null;
}>;

export type ReadPaymentGatedInvoicePaymentInput = Readonly<{
  expectedPaymentIntentId: string;
  expectedPrincipalCents: number;
  expectedTaxCents: number;
  expectedTotalCents: number;
  metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
  metronomeInvoiceId: string;
  stripeInvoiceId: string;
  workspaceId: string;
}>;

export type RefundPaymentGatedInvoiceInput =
  ReadPaymentGatedInvoicePaymentInput &
    Readonly<{ fundingActionId: string; idempotencyKey: string }>;

type PaymentGatedInvoicePaymentBase = Readonly<{
  invoiceUrl: string | null;
  paymentIntentId: string;
  principalCents: number;
  stripeInvoiceId: string;
  taxCents: number;
  totalCents: number;
}>;

export type PaymentGatedInvoicePayment =
  PaymentGatedInvoicePaymentBase &
    (
      | Readonly<{ status: 'PENDING' }>
      | Readonly<{ clientSecret: string; status: 'ACTION_REQUIRED' }>
      | Readonly<{ paidAt: string; status: 'PAID' }>
      | Readonly<{
          reason:
            | 'INVOICE_UNCOLLECTIBLE'
            | 'INVOICE_VOID'
            | 'PAYMENT_INTENT_CANCELED'
            | 'PAYMENT_METHOD_REQUIRED';
          status: 'FAILED_DEFINITIVE';
        }>
    );

const safeStripeCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const stripePaymentGatedInvoiceSchema = z.object({
  amount_paid: safeStripeCentsSchema,
  currency: z.string(),
  customer: z.string(),
  hosted_invoice_url: z.string().nullish(),
  id: z.string(),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.string()).nullable(),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']),
  status_transitions: z.object({
    paid_at: safeStripeCentsSchema.nullable(),
  }),
  subtotal: safeStripeCentsSchema,
  total: safeStripeCentsSchema,
  total_taxes: z
    .array(
      z.object({
        amount: safeStripeCentsSchema,
      }),
    )
    .nullable(),
});
const stripePaymentGatedChargeSchema = z.object({
  amount: safeStripeCentsSchema,
  amount_captured: safeStripeCentsSchema,
  amount_refunded: safeStripeCentsSchema,
  disputed: z.boolean(),
  failure_balance_transaction: z.string().nullable(),
  id: z.string(),
  livemode: z.boolean(),
  outcome: z
    .object({
      network_status: z.string().nullable(),
    })
    .nullish(),
  paid: z.boolean(),
  payment_intent: z.string(),
  refunded: z.boolean(),
  status: z.enum(['failed', 'pending', 'succeeded']),
});
const stripePaymentGatedIntentSchema = z.object({
  amount: safeStripeCentsSchema,
  amount_received: safeStripeCentsSchema,
  canceled_at: safeStripeCentsSchema.nullable(),
  cancellation_reason: z.string().nullish(),
  client_secret: z.string().nullish(),
  currency: z.string(),
  customer: z.string(),
  id: z.string(),
  latest_charge: z
    .union([z.string(), stripePaymentGatedChargeSchema])
    .nullable(),
  livemode: z.boolean(),
  status: z.enum([
    'canceled',
    'processing',
    'requires_action',
    'requires_capture',
    'requires_confirmation',
    'requires_payment_method',
    'succeeded',
  ]),
});
const stripeInvoicePaymentSchema = z.object({
  amount_paid: safeStripeCentsSchema.nullable(),
  amount_requested: safeStripeCentsSchema,
  currency: z.string(),
  invoice: z.string(),
  livemode: z.boolean(),
  payment: z.object({
    payment_intent: z.string(),
    type: z.literal('payment_intent'),
  }),
  status: z.enum(['canceled', 'open', 'paid']),
});
const stripeInvoicePaymentsSchema = z.object({
  data: z.array(stripeInvoicePaymentSchema),
  has_more: z.boolean(),
});

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

  async readPaymentGatedInvoicePayment(
    input: ReadPaymentGatedInvoicePaymentInput,
  ): Promise<PaymentGatedInvoicePayment> {
    if (
      !Number.isSafeInteger(input.expectedPrincipalCents) ||
      input.expectedPrincipalCents <= 0 ||
      !Number.isSafeInteger(input.expectedTaxCents) ||
      input.expectedTaxCents < 0 ||
      !Number.isSafeInteger(input.expectedTotalCents) ||
      input.expectedTotalCents !==
        input.expectedPrincipalCents + input.expectedTaxCents ||
      [
        input.expectedPaymentIntentId,
        input.metronomeInvoiceId,
        input.stripeInvoiceId,
        input.workspaceId,
      ].some((value) => value.trim() === '')
    ) {
      throw new Error('Stripe payment-gated invoice proof is invalid');
    }

    const customerId = await this.persistedCustomerId(input.workspaceId);
    const stripe = this.stripe();
    const [rawInvoice, rawPaymentIntent] = await Promise.all([
      stripe.invoices.retrieve(input.stripeInvoiceId),
      stripe.paymentIntents.retrieve(input.expectedPaymentIntentId, {
        expand: ['latest_charge'],
      }),
    ]);
    const parsedInvoice = stripePaymentGatedInvoiceSchema.safeParse(rawInvoice);
    const parsedPaymentIntent =
      stripePaymentGatedIntentSchema.safeParse(rawPaymentIntent);

    if (!parsedInvoice.success || !parsedPaymentIntent.success) {
      throw new Error('Stripe payment-gated invoice proof is invalid');
    }

    const invoice = parsedInvoice.data;
    const paymentIntent = parsedPaymentIntent.data;
    let taxCents = 0;

    for (const tax of invoice.total_taxes ?? []) {
      taxCents += tax.amount;
      if (!Number.isSafeInteger(taxCents)) {
        throw new Error('Stripe payment-gated invoice proof is invalid');
      }
    }

    const expectedLivemode = this.expectedLivemode(
      input.metronomeBaseUrlEnvironment,
    );

    if (
      invoice.id !== input.stripeInvoiceId ||
      invoice.customer !== customerId ||
      invoice.currency.toLowerCase() !== 'usd' ||
      invoice.metadata?.metronome_id !== input.metronomeInvoiceId ||
      invoice.livemode !== expectedLivemode ||
      invoice.subtotal !== input.expectedPrincipalCents ||
      taxCents !== input.expectedTaxCents ||
      invoice.total !== input.expectedTotalCents ||
      paymentIntent.id !== input.expectedPaymentIntentId ||
      paymentIntent.customer !== customerId ||
      paymentIntent.currency.toLowerCase() !== 'usd' ||
      paymentIntent.amount !== input.expectedTotalCents ||
      paymentIntent.amount_received > input.expectedTotalCents ||
      invoice.amount_paid > input.expectedTotalCents ||
      paymentIntent.livemode !== expectedLivemode
    ) {
      throw new Error('Stripe payment-gated invoice proof is invalid');
    }

    const invoiceUrl = invoice.hosted_invoice_url?.trim() || null;
    const base: PaymentGatedInvoicePaymentBase = {
      invoiceUrl,
      paymentIntentId: paymentIntent.id,
      principalCents: input.expectedPrincipalCents,
      stripeInvoiceId: invoice.id,
      taxCents: input.expectedTaxCents,
      totalCents: input.expectedTotalCents,
    };

    const rawAssociationPayments = await stripe.invoicePayments.list({
      invoice: invoice.id,
      limit: 2,
      payment: {
        payment_intent: paymentIntent.id,
        type: 'payment_intent',
      },
    });
    const parsedAssociationPayments =
      stripeInvoicePaymentsSchema.safeParse(rawAssociationPayments);
    const associationPayment = parsedAssociationPayments.success
      ? parsedAssociationPayments.data.data[0]
      : undefined;

    if (
      !parsedAssociationPayments.success ||
      parsedAssociationPayments.data.has_more ||
      parsedAssociationPayments.data.data.length !== 1 ||
      associationPayment === undefined ||
      associationPayment.amount_requested !== input.expectedTotalCents ||
      associationPayment.currency.toLowerCase() !== 'usd' ||
      associationPayment.invoice !== invoice.id ||
      associationPayment.livemode !== expectedLivemode ||
      associationPayment.payment.payment_intent !== paymentIntent.id
    ) {
      throw new Error('Stripe payment-gated invoice proof is invalid');
    }

    if (invoice.status === 'paid' && paymentIntent.status === 'succeeded') {
      const charge = paymentIntent.latest_charge;
      const paidAt = invoice.status_transitions.paid_at;

      if (
        paymentIntent.status !== 'succeeded' ||
        paymentIntent.amount_received !== input.expectedTotalCents ||
        invoice.amount_paid !== input.expectedTotalCents ||
        paidAt === null ||
        paidAt <= 0 ||
        charge === null ||
        typeof charge === 'string' ||
        charge.amount !== input.expectedTotalCents ||
        charge.amount_captured !== input.expectedTotalCents ||
        charge.amount_refunded !== 0 ||
        charge.disputed ||
        charge.failure_balance_transaction !== null ||
        charge.livemode !== expectedLivemode ||
        !charge.paid ||
        charge.payment_intent !== paymentIntent.id ||
        charge.refunded ||
        charge.status !== 'succeeded' ||
        charge.outcome?.network_status === 'reversed_after_approval'
      ) {
        throw new Error('Stripe payment-gated invoice proof is invalid');
      }

      const rawInvoicePayments = await stripe.invoicePayments.list({
        invoice: invoice.id,
        limit: 2,
        status: 'paid',
      });
      const parsedInvoicePayments =
        stripeInvoicePaymentsSchema.safeParse(rawInvoicePayments);
      const invoicePayment = parsedInvoicePayments.success
        ? parsedInvoicePayments.data.data[0]
        : undefined;

      if (
        !parsedInvoicePayments.success ||
        parsedInvoicePayments.data.has_more ||
        parsedInvoicePayments.data.data.length !== 1 ||
        invoicePayment === undefined ||
        invoicePayment.amount_paid !== input.expectedTotalCents ||
        invoicePayment.amount_requested !== input.expectedTotalCents ||
        invoicePayment.currency.toLowerCase() !== 'usd' ||
        invoicePayment.invoice !== invoice.id ||
        invoicePayment.livemode !== expectedLivemode ||
        invoicePayment.status !== 'paid' ||
        invoicePayment.payment.payment_intent !== paymentIntent.id
      ) {
        throw new Error('Stripe payment-gated invoice proof is invalid');
      }

      return {
        ...base,
        paidAt: new Date(paidAt * 1000).toISOString(),
        status: 'PAID',
      };
    }


    if (invoice.status === 'uncollectible') {
      return {
        ...base,
        reason: 'INVOICE_UNCOLLECTIBLE',
        status: 'FAILED_DEFINITIVE',
      };
    }

    if (invoice.status === 'void') {
      return {
        ...base,
        reason: 'INVOICE_VOID',
        status: 'FAILED_DEFINITIVE',
      };
    }

    if (paymentIntent.status === 'canceled') {
      return {
        ...base,
        reason: 'PAYMENT_INTENT_CANCELED',
        status: 'FAILED_DEFINITIVE',
      };
    }

    if (paymentIntent.status === 'requires_payment_method') {
      return {
        ...base,
        reason: 'PAYMENT_METHOD_REQUIRED',
        status: 'FAILED_DEFINITIVE',
      };
    }
    if (
      invoice.status === 'paid' ||
      paymentIntent.status === 'succeeded' ||
      invoice.amount_paid > 0 ||
      paymentIntent.amount_received > 0 ||
      associationPayment.status === 'paid'
    ) {
      return { ...base, status: 'PENDING' };
    }

    if (paymentIntent.status === 'requires_action') {
      const clientSecret = paymentIntent.client_secret?.trim();

      if (!clientSecret) {
        throw new Error('Stripe payment-gated invoice proof is invalid');
      }

      return {
        ...base,
        clientSecret,
        status: 'ACTION_REQUIRED',
      };
    }

    if (paymentIntent.status === 'succeeded') {
      throw new Error('Stripe payment-gated invoice proof is invalid');
    }

    return { ...base, status: 'PENDING' };
  }


  async refundPaymentGatedInvoice(
    input: RefundPaymentGatedInvoiceInput,
  ): Promise<{
    creditNoteId: string;
    refundId: string;
    refundedTotalCents: number;
    reversedTaxCents: number;
  }> {
    if (
      input.fundingActionId.trim() === '' ||
      input.idempotencyKey.trim() === ''
    ) {
      throw new Error('Stripe refund identity is invalid');
    }

    await this.readPaymentGatedInvoicePayment(input);
    const creditNote = await this.stripe().creditNotes.create(
      {
        amount: input.expectedTotalCents,
        invoice: input.stripeInvoiceId,
        memo: 'Full unused Myah managed AI credit refund',
        metadata: {
          myah_funding_action_id: input.fundingActionId,
          myah_refund_identity: input.idempotencyKey,
        },
        refund_amount: input.expectedTotalCents,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    const creditNoteCustomer =
      typeof creditNote.customer === 'string'
        ? creditNote.customer
        : creditNote.customer.id;
    const creditNoteInvoice =
      typeof creditNote.invoice === 'string'
        ? creditNote.invoice
        : creditNote.invoice.id;
    const refundLink = creditNote.refunds[0];
    const refund =
      typeof refundLink?.refund === 'string' ? null : refundLink?.refund;
    const taxCents = (creditNote.total_taxes ?? []).reduce(
      (sum, tax) => sum + tax.amount,
      0,
    );

    if (
      creditNote.id.trim() === '' ||
      creditNoteCustomer !==
        (await this.persistedCustomerId(input.workspaceId)) ||
      creditNoteInvoice !== input.stripeInvoiceId ||
      creditNote.currency.toLowerCase() !== 'usd' ||
      creditNote.livemode !==
        this.expectedLivemode(input.metronomeBaseUrlEnvironment) ||
      creditNote.type !== 'post_payment' ||
      creditNote.status !== 'issued' ||
      creditNote.amount !== input.expectedTotalCents ||
      creditNote.subtotal !== input.expectedPrincipalCents ||
      creditNote.total !== input.expectedTotalCents ||
      creditNote.post_payment_amount !== input.expectedTotalCents ||
      creditNote.pre_payment_amount !== 0 ||
      (creditNote.out_of_band_amount ?? 0) !== 0 ||
      taxCents !== input.expectedTaxCents ||
      creditNote.refunds.length !== 1 ||
      refundLink.amount_refunded !== input.expectedTotalCents ||
      refundLink.type !== 'refund' ||
      refund === null ||
      refund.id.trim() === '' ||
      refund.amount !== input.expectedTotalCents ||
      refund.currency.toLowerCase() !== 'usd' ||
      refund.payment_intent !== input.expectedPaymentIntentId ||
      refund.status !== 'succeeded'
    ) {
      throw new Error('Stripe full refund proof is invalid');
    }

    return {
      creditNoteId: creditNote.id,
      refundId: refund.id,
      refundedTotalCents: refund.amount,
      reversedTaxCents: taxCents,
    };
  }

  async updateWorkspaceBillingDetails({
    billingDetails,
    metronomeBaseUrlEnvironment,
    workspaceId,
  }: {
    billingDetails: WorkspaceBillingDetailsInput;
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    workspaceId: string;
  }): Promise<WorkspaceBillingDetailsSummary> {
    const normalized = {
      city: billingDetails.city.trim(),
      country: billingDetails.country.trim().toUpperCase(),
      line1: billingDetails.line1.trim(),
      line2: billingDetails.line2?.trim() || null,
      name: billingDetails.name.trim(),
      postalCode: billingDetails.postalCode.trim(),
      state: billingDetails.state?.trim() || null,
      taxIdType: billingDetails.taxIdType ?? null,
      taxIdValue: billingDetails.taxIdValue?.trim() || null,
    };

    if (
      normalized.city === '' ||
      !/^[A-Z]{2}$/.test(normalized.country) ||
      normalized.line1 === '' ||
      normalized.name === '' ||
      normalized.postalCode === '' ||
      (normalized.taxIdType === null) !== (normalized.taxIdValue === null)
    ) {
      throw new Error('Workspace Stripe billing details are invalid');
    }

    const customerId = await this.persistedCustomerId(workspaceId);
    const stripe = this.stripe();
    await stripe.customers.update(customerId, {
      address: {
        city: normalized.city,
        country: normalized.country,
        line1: normalized.line1,
        line2: normalized.line2 ?? '',
        postal_code: normalized.postalCode,
        state: normalized.state ?? '',
      },
      name: normalized.name,
    });

    if (normalized.taxIdType !== null && normalized.taxIdValue !== null) {
      let taxIds = await this.listWorkspaceTaxIds(
        customerId,
        metronomeBaseUrlEnvironment,
      );
      let matches = taxIds.filter(
        (taxId) =>
          taxId.type === normalized.taxIdType &&
          taxId.value === normalized.taxIdValue,
      );

      if (matches.length === 0) {
        const taxId = await stripe.taxIds.create(
          {
            owner: { customer: customerId, type: 'customer' },
            type: normalized.taxIdType,
            value: normalized.taxIdValue,
          },
          {
            idempotencyKey: `customer-tax-id:${createHash('sha256')
              .update(
                `${workspaceId}:${normalized.taxIdType}:${normalized.taxIdValue}`,
              )
              .digest('hex')}`,
          },
        );
        const taxIdCustomer =
          typeof taxId.customer === 'string'
            ? taxId.customer
            : taxId.customer?.id;

        if (
          taxIdCustomer !== customerId ||
          taxId.livemode !==
            this.expectedLivemode(metronomeBaseUrlEnvironment) ||
          taxId.type !== normalized.taxIdType ||
          taxId.value !== normalized.taxIdValue
        ) {
          throw new Error('Workspace Stripe tax ID proof is invalid');
        }

        taxIds = await this.listWorkspaceTaxIds(
          customerId,
          metronomeBaseUrlEnvironment,
        );
        matches = taxIds.filter(
          (candidate) =>
            candidate.type === normalized.taxIdType &&
            candidate.value === normalized.taxIdValue,
        );
      }

      if (matches.length !== 1) {
        throw new Error('Workspace Stripe tax ID proof is invalid');
      }

      await Promise.all(
        taxIds
          .filter((taxId) => taxId.id !== matches[0].id)
          .map((taxId) => stripe.taxIds.del(taxId.id)),
      );
      taxIds = await this.listWorkspaceTaxIds(
        customerId,
        metronomeBaseUrlEnvironment,
      );
      matches = taxIds.filter(
        (candidate) =>
          candidate.type === normalized.taxIdType &&
          candidate.value === normalized.taxIdValue,
      );

      if (taxIds.length !== 1 || matches.length !== 1) {
        throw new Error('Workspace Stripe tax ID proof is invalid');
      }
    }

    const summary = await this.getWorkspaceBillingDetailsSummary({
      metronomeBaseUrlEnvironment,
      workspaceId,
    });

    if (
      summary.name !== normalized.name ||
      summary.address.city !== normalized.city ||
      summary.address.country !== normalized.country ||
      summary.address.line1 !== normalized.line1 ||
      summary.address.line2 !== normalized.line2 ||
      summary.address.postalCode !== normalized.postalCode ||
      summary.address.state !== normalized.state ||
      (normalized.taxIdType !== null &&
        summary.taxId?.type !== normalized.taxIdType)
    ) {
      throw new Error('Workspace Stripe billing details proof is invalid');
    }

    return summary;
  }

  async getWorkspaceBillingDetailsSummary({
    metronomeBaseUrlEnvironment,
    workspaceId,
  }: {
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    workspaceId: string;
  }): Promise<WorkspaceBillingDetailsSummary> {
    const customerId = await this.persistedCustomerId(workspaceId);
    const customer = await this.stripe().customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });

    if (
      customer.deleted ||
      customer.id !== customerId ||
      customer.livemode !==
        this.expectedLivemode(metronomeBaseUrlEnvironment)
    ) {
      throw new Error('Stripe Customer proof is invalid');
    }

    const taxIds = await this.listWorkspaceTaxIds(
      customerId,
      metronomeBaseUrlEnvironment,
    );
    const paymentMethod = customer.invoice_settings?.default_payment_method;
    const expandedPaymentMethod =
      typeof paymentMethod === 'object' && paymentMethod !== null
        ? paymentMethod
        : null;
    const card = expandedPaymentMethod?.card;
    const address = customer.address;
    const trimOrNull = (value: string | null | undefined): string | null =>
      value?.trim() || null;

    return {
      address: {
        city: trimOrNull(address?.city),
        country: trimOrNull(address?.country)?.toUpperCase() ?? null,
        line1: trimOrNull(address?.line1),
        line2: trimOrNull(address?.line2),
        postalCode: trimOrNull(address?.postal_code),
        state: trimOrNull(address?.state),
      },
      card:
        card === undefined
          ? null
          : {
              brand: card.brand,
              expiryMonth: card.exp_month,
              expiryYear: card.exp_year,
              last4: card.last4,
            },
      name: trimOrNull(customer.name),
      paymentMethodReady:
        (typeof paymentMethod === 'string' && paymentMethod.trim() !== '') ||
        (expandedPaymentMethod?.id.trim() ?? '') !== '',
      taxId:
        taxIds.length === 0
          ? null
          : { country: taxIds[0].country, type: taxIds[0].type },
    };
  }

  async assertWorkspaceBillingDetailsReady({
    metronomeBaseUrlEnvironment,
    workspaceId,
  }: {
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment;
    workspaceId: string;
  }): Promise<WorkspaceBillingDetailsSummary> {
    const summary = await this.getWorkspaceBillingDetailsSummary({
      metronomeBaseUrlEnvironment,
      workspaceId,
    });

    if (
      !summary.paymentMethodReady ||
      summary.name === null ||
      summary.address.city === null ||
      summary.address.country === null ||
      summary.address.line1 === null ||
      summary.address.postalCode === null
    ) {
      throw new Error('Workspace Stripe billing details are not ready');
    }

    return summary;
  }

  private async listWorkspaceTaxIds(
    customerId: string,
    metronomeBaseUrlEnvironment: MetronomeBaseUrlEnvironment,
  ): Promise<Stripe.TaxId[]> {
    const response = await this.stripe().taxIds.list({
      limit: 100,
      owner: { customer: customerId, type: 'customer' },
    });

    if (
      response.has_more ||
      response.data.some((taxId) => {
        const taxIdCustomer =
          typeof taxId.customer === 'string'
            ? taxId.customer
            : taxId.customer?.id;

        return (
          taxIdCustomer !== customerId ||
          taxId.livemode !==
            this.expectedLivemode(metronomeBaseUrlEnvironment)
        );
      })
    ) {
      throw new Error('Workspace Stripe tax ID proof is invalid');
    }

    return response.data;
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
