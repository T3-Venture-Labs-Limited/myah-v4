import { ManagedProviderStripeService } from '../stripe/managed-provider-stripe.service';

describe('ManagedProviderStripeService', () => {
  const workspaceId = 'workspace-a';
  const otherWorkspaceId = 'workspace-b';
  const stripeCustomerId = 'cus_workspace_a';
  const setupIntentId = 'seti_workspace_a';
  const paymentMethodId = 'pm_workspace_a';
  const stripePaymentIntentId = 'pi_metronome';

  const createService = (
    installation: Record<string, unknown> | null = null,
    stripeMode: 'PRODUCTION' | 'SANDBOX' = 'SANDBOX',
    managedEmailExecutionMode: 'PRODUCTION' | 'SANDBOX' = stripeMode,
  ) => {
    const livemode = stripeMode === 'PRODUCTION';
    const stripe = {
      customers: {
        create: jest.fn().mockResolvedValue({ id: stripeCustomerId, livemode }),
        retrieve: jest.fn().mockResolvedValue({
          id: stripeCustomerId,
          invoice_settings: {},
          livemode,
        }),
        update: jest.fn().mockResolvedValue({ id: stripeCustomerId }),
      },
      setupIntents: {
        create: jest.fn().mockResolvedValue({
          id: setupIntentId,
          client_secret: 'seti_secret',
          status: 'requires_payment_method',
          customer: stripeCustomerId,
          livemode,
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: setupIntentId,
          customer: stripeCustomerId,
          status: 'succeeded',
          payment_method: paymentMethodId,
          livemode,
        }),
      },
      invoicePayments: {
        list: jest.fn().mockResolvedValue({
          data: [
            {
              amount_paid: 3000,
              amount_requested: 3000,
              currency: 'usd',
              invoice: 'in_metronome',
              payment: {
                payment_intent: stripePaymentIntentId,
                type: 'payment_intent',
              },
              status: 'paid',
              livemode,
            },
          ],
          has_more: false,
        }),
      },
      invoices: {
        retrieve: jest.fn().mockResolvedValue({
          amount_paid: 3000,
          currency: 'usd',
          customer: stripeCustomerId,
          hosted_invoice_url: 'https://invoice.example/in_metronome',
          id: 'in_metronome',
          livemode,
          metadata: { metronome_id: 'metronome-invoice-id' },
          status: 'paid',
          status_transitions: { paid_at: 1_787_997_600 },
          subtotal: 2500,
          total: 3000,
          total_taxes: [{ amount: 500 }],
        }),
      },
      paymentIntents: {
        retrieve: jest.fn().mockResolvedValue({
          amount: 3000,
          amount_received: 3000,
          canceled_at: null,
          cancellation_reason: null,
          client_secret: null,
          currency: 'usd',
          customer: stripeCustomerId,
          id: stripePaymentIntentId,
          latest_charge: {
            amount: 3000,
            amount_captured: 3000,
            amount_refunded: 0,
            disputed: false,
            failure_balance_transaction: null,
            id: 'ch_metronome',
            livemode,
            outcome: { network_status: 'approved_by_network' },
            paid: true,
            payment_intent: stripePaymentIntentId,
            refunded: false,
            status: 'succeeded',
          },
          livemode,
          status: 'succeeded',
        }),
      },
    };
    const installationRepository = {
      findOneBy: jest.fn().mockResolvedValue(installation),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'MANAGED_EMAIL_EXECUTION_MODE')
          return managedEmailExecutionMode;
        if (key === 'BILLING_STRIPE_PUBLISHABLE_KEY') return 'pk_test_managed';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };

    return {
      service: new ManagedProviderStripeService(
        stripe as never,
        installationRepository as never,
        twentyConfigService as never,
      ),
      stripe,
      installationRepository,
      twentyConfigService,
    };
  };

  it('creates one exact workspace Customer and returns a SetupIntent client secret', async () => {
    const { service, stripe, installationRepository } = createService({
      workspaceId,
      stripeCustomerId: null,
    });

    await expect(
      service.prepareWorkspacePaymentMethod({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId }),
    ).resolves.toEqual({
      clientSecret: 'seti_secret',
      publishableKey: expect.any(String),
      setupIntentId,
      ready: false,
      stripeCustomerId,
    });
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: stripeCustomerId,
        usage: 'off_session',
      }),
    );
    expect(installationRepository.findOneBy).toHaveBeenCalledWith(
      workspaceId,
      {},
    );
    expect(installationRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { stripeCustomerId: expect.anything() },
      { stripeCustomerId },
    );
  });

  it('accepts live Stripe resources in production mode', async () => {
    const { service } = createService(
      {
        workspaceId,
        stripeCustomerId,
      },
      'PRODUCTION',
    );

    await expect(
      service.prepareWorkspacePaymentMethod({
        metronomeBaseUrlEnvironment: 'PRODUCTION',
        workspaceId,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        setupIntentId,
        stripeCustomerId,
      }),
    );
  });
  it.each([
    ['PRODUCTION', true, 'SANDBOX'],
    ['SANDBOX', false, 'PRODUCTION'],
  ] as const)(
    'uses %s Metronome environment instead of managed email execution mode',
    async (metronomeBaseUrlEnvironment, livemode, managedEmailExecutionMode) => {
      const { service, stripe, twentyConfigService } = createService(
        {
          workspaceId,
          stripeCustomerId,
        },
        metronomeBaseUrlEnvironment,
        managedEmailExecutionMode,
      );
      stripe.setupIntents.create.mockResolvedValue({
        client_secret: 'seti_environment_secret',
        customer: stripeCustomerId,
        id: setupIntentId,
        livemode,
        status: 'requires_payment_method',
      });

      await expect(
        service.prepareWorkspacePaymentMethod({
          metronomeBaseUrlEnvironment,
          workspaceId,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          setupIntentId,
          stripeCustomerId,
        }),
      );
      expect(twentyConfigService.get).not.toHaveBeenCalledWith(
        'MANAGED_EMAIL_EXECUTION_MODE',
      );
    },
  );

  it('rejects a live SetupIntent before exposing it in sandbox mode', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.setupIntents.create.mockResolvedValue({
      client_secret: 'seti_live_secret',
      customer: stripeCustomerId,
      id: setupIntentId,
      livemode: true,
      status: 'requires_payment_method',
    });

    await expect(
      service.prepareWorkspacePaymentMethod({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId }),
    ).rejects.toThrow('Stripe SetupIntent mode is invalid');
  });

  it('rejects a live Customer before creating a sandbox SetupIntent', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.customers.retrieve.mockResolvedValue({
      id: stripeCustomerId,
      invoice_settings: {},
      livemode: true,
    });

    await expect(
      service.prepareWorkspacePaymentMethod({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId }),
    ).rejects.toThrow('Stripe Customer proof is invalid');
    expect(stripe.setupIntents.create).not.toHaveBeenCalled();
  });

  it('uses the persisted winner when concurrent requests race to claim a Stripe Customer', async () => {
    const { service, stripe, installationRepository } = createService({
      workspaceId,
      stripeCustomerId: null,
    });

    installationRepository.findOneBy
      .mockResolvedValueOnce({ workspaceId, stripeCustomerId: null })
      .mockResolvedValueOnce({
        workspaceId,
        stripeCustomerId: 'cus_winner',
      });
    installationRepository.update.mockResolvedValue({ affected: 0 });
    stripe.customers.retrieve.mockResolvedValue({
      id: 'cus_winner',
      invoice_settings: {},
      livemode: false,
    });

    await expect(
      service.prepareWorkspacePaymentMethod({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId }),
    ).resolves.toEqual(
      expect.objectContaining({ stripeCustomerId: 'cus_winner' }),
    );
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { metadata: { workspace_id: workspaceId } },
      { idempotencyKey: `managed-provider-customer:${workspaceId}` },
    );
    expect(installationRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { stripeCustomerId: expect.anything() },
      { stripeCustomerId },
    );
    expect(stripe.customers.retrieve).toHaveBeenCalledWith('cus_winner');
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_winner' }),
    );
  });

  it('recovers the persisted Customer instead of creating a second one', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });

    await service.prepareWorkspacePaymentMethod({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId });

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: stripeCustomerId }),
    );
  });

  it.each([
    ['wrong Customer', { customer: 'cus_other_workspace' }],
    ['non-succeeded status', { status: 'processing' }],
    ['missing PaymentMethod', { payment_method: null }],
    ['live mode', { livemode: true }],
  ])('rejects SetupIntent completion with %s', async (_, overrides) => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.setupIntents.retrieve.mockResolvedValue({
      id: setupIntentId,
      customer: stripeCustomerId,
      status: 'succeeded',
      payment_method: paymentMethodId,
      livemode: false,
      ...overrides,
    });

    await expect(
      service.completeWorkspacePaymentMethodSetup({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId, setupIntentId }),
    ).rejects.toThrow();
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });

  it('rejects a live Customer before completing sandbox payment setup', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.customers.retrieve.mockResolvedValue({
      id: stripeCustomerId,
      invoice_settings: {},
      livemode: true,
    });

    await expect(
      service.completeWorkspacePaymentMethodSetup({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId, setupIntentId }),
    ).rejects.toThrow('Stripe Customer proof is invalid');
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });

  it('rejects a SetupIntent replayed from another workspace', async () => {
    const { service, stripe } = createService({
      workspaceId: otherWorkspaceId,
      stripeCustomerId: 'cus_other_workspace',
    });
    stripe.setupIntents.retrieve.mockResolvedValue({
      id: setupIntentId,
      customer: stripeCustomerId,
      status: 'succeeded',
      payment_method: paymentMethodId,
      livemode: false,
    });

    await expect(
      service.completeWorkspacePaymentMethodSetup({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId, setupIntentId }),
    ).rejects.toThrow();
  });

  it('sets the succeeded SetupIntent PaymentMethod as the Customer default invoice method', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });

    await expect(
      service.completeWorkspacePaymentMethodSetup({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId, setupIntentId }),
    ).resolves.toEqual({ stripeCustomerId, paymentMethodId });
    expect(stripe.customers.update).toHaveBeenCalledWith(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  });

  it('rejects a live Customer as sandbox payment-method proof', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.customers.retrieve.mockResolvedValue({
      id: stripeCustomerId,
      invoice_settings: { default_payment_method: paymentMethodId },
      livemode: true,
    });

    await expect(
      service.assertWorkspacePaymentMethodReady({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId }),
    ).rejects.toThrow('Stripe Customer proof is invalid');
  });

  it('requires exact Customer, paid status, positive amount, currency, and Metronome metadata', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_metronome',
      customer: stripeCustomerId,
      status: 'paid',
      amount_paid: 3000,
      currency: 'usd',
      metadata: { metronome_id: 'metronome-invoice-id' },
      livemode: false,
    });

    await expect(
      service.assertPaidExternalInvoice({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId,
      stripeInvoiceId: 'in_metronome',
      metronomeInvoiceId: 'metronome-invoice-id',
      expectedAmountCents: 3000,
      expectedPaymentIntentId: stripePaymentIntentId,
      currency: 'usd', }),
    ).resolves.toEqual({
      customerId: stripeCustomerId,
      invoiceId: 'in_metronome',
      metronomeInvoiceId: 'metronome-invoice-id',
      paymentIntentId: stripePaymentIntentId,
      status: 'paid',
    });
    expect(stripe.invoicePayments.list).toHaveBeenCalledWith({
      invoice: 'in_metronome',
      limit: 2,
      payment: {
        payment_intent: stripePaymentIntentId,
        type: 'payment_intent',
      },
      status: 'paid',
    });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      stripePaymentIntentId,
    );
  });

  it('rejects a Metronome payment identity that Stripe does not correlate to the invoice', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });

    stripe.invoices.retrieve.mockResolvedValue({
      amount_paid: 3000,
      currency: 'usd',
      customer: stripeCustomerId,
      id: 'in_metronome',
      metadata: { metronome_id: 'metronome-invoice-id' },
      status: 'paid',
      livemode: false,
    });
    stripe.invoicePayments.list.mockResolvedValue({
      data: [
        {
          amount_paid: 3000,
          amount_requested: 3000,
          currency: 'usd',
          invoice: 'in_metronome',
          payment: {
            payment_intent: 'pi_other',
            type: 'payment_intent',
          },
          status: 'paid',
          livemode: false,
        },
      ],
      has_more: false,
    });

    await expect(
      service.assertPaidExternalInvoice({ metronomeBaseUrlEnvironment: 'SANDBOX', currency: 'usd',
      expectedAmountCents: 3000,
      expectedPaymentIntentId: stripePaymentIntentId,
      metronomeInvoiceId: 'metronome-invoice-id',
      stripeInvoiceId: 'in_metronome',
      workspaceId, }),
    ).rejects.toThrow('Stripe external invoice proof is invalid');
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it.each([
    ['finalized', { status: 'open' }],
    ['unpaid', { status: 'unpaid' }],
    ['zero-paid', { amount_paid: 0 }],
    ['wrong Customer', { customer: 'cus_other_workspace' }],
    ['missing metadata', { metadata: {} }],
    ['wrong metadata', { metadata: { metronome_id: 'other-invoice' } }],
    ['live mode', { livemode: true }],
  ])('rejects an external invoice with %s proof', async (_, overrides) => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_metronome',
      customer: stripeCustomerId,
      status: 'paid',
      amount_paid: 3000,
      currency: 'usd',
      metadata: { metronome_id: 'metronome-invoice-id' },
      livemode: false,
      ...overrides,
    });

    await expect(
      service.assertPaidExternalInvoice({ metronomeBaseUrlEnvironment: 'SANDBOX', workspaceId,
      stripeInvoiceId: 'in_metronome',
      metronomeInvoiceId: 'metronome-invoice-id',
      expectedAmountCents: 3000,
      expectedPaymentIntentId: stripePaymentIntentId,
      currency: 'usd', }),
    ).rejects.toThrow();
    expect(stripe.invoicePayments.list).not.toHaveBeenCalled();
  });

  it('rejects a live InvoicePayment in sandbox mode', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue({
      amount_paid: 3000,
      currency: 'usd',
      customer: stripeCustomerId,
      id: 'in_metronome',
      livemode: false,
      metadata: { metronome_id: 'metronome-invoice-id' },
      status: 'paid',
    });
    stripe.invoicePayments.list.mockResolvedValue({
      data: [
        {
          amount_paid: 3000,
          amount_requested: 3000,
          currency: 'usd',
          invoice: 'in_metronome',
          livemode: true,
          payment: {
            payment_intent: stripePaymentIntentId,
            type: 'payment_intent',
          },
          status: 'paid',
        },
      ],
      has_more: false,
    });

    await expect(
      service.assertPaidExternalInvoice({ metronomeBaseUrlEnvironment: 'SANDBOX', currency: 'usd',
      expectedAmountCents: 3000,
      expectedPaymentIntentId: stripePaymentIntentId,
      metronomeInvoiceId: 'metronome-invoice-id',
      stripeInvoiceId: 'in_metronome',
      workspaceId, }),
    ).rejects.toThrow('Stripe external invoice proof is invalid');
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it('rejects a live PaymentIntent in sandbox mode', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue({
      amount_paid: 3000,
      currency: 'usd',
      customer: stripeCustomerId,
      id: 'in_metronome',
      livemode: false,
      metadata: { metronome_id: 'metronome-invoice-id' },
      status: 'paid',
    });
    stripe.paymentIntents.retrieve.mockResolvedValue({
      amount_received: 3000,
      currency: 'usd',
      customer: stripeCustomerId,
      id: stripePaymentIntentId,
      livemode: true,
      status: 'succeeded',
    });

    await expect(
      service.assertPaidExternalInvoice({ metronomeBaseUrlEnvironment: 'SANDBOX', currency: 'usd',
      expectedAmountCents: 3000,
      expectedPaymentIntentId: stripePaymentIntentId,
      metronomeInvoiceId: 'metronome-invoice-id',
      stripeInvoiceId: 'in_metronome',
      workspaceId, }),
    ).rejects.toThrow('Stripe external invoice proof is invalid');
  });
  const paymentGatedInput = {
    expectedPaymentIntentId: stripePaymentIntentId,
    expectedPrincipalCents: 2500,
    expectedTaxCents: 500,
    expectedTotalCents: 3000,
    metronomeBaseUrlEnvironment: 'SANDBOX' as const,
    metronomeInvoiceId: 'metronome-invoice-id',
    stripeInvoiceId: 'in_metronome',
    workspaceId,
  };

  const pendingInvoice = (
    status: 'draft' | 'open' | 'uncollectible' | 'void' = 'open',
  ) => ({
    amount_paid: 0,
    currency: 'usd',
    customer: stripeCustomerId,
    hosted_invoice_url: 'https://invoice.example/in_metronome',
    id: 'in_metronome',
    livemode: false,
    metadata: { metronome_id: 'metronome-invoice-id' },
    status,
    status_transitions: { paid_at: null },
    subtotal: 2500,
    total: 3000,
    total_taxes: [{ amount: 500 }],
  });

  const pendingPaymentIntent = (
    status:
      | 'canceled'
      | 'processing'
      | 'requires_action'
      | 'requires_payment_method',
  ) => ({
    amount: 3000,
    amount_received: 0,
    canceled_at: status === 'canceled' ? 1_787_997_600 : null,
    cancellation_reason: status === 'canceled' ? 'failed_invoice' : null,
    client_secret:
      status === 'requires_action' ? 'pi_action_required_secret' : null,
    currency: 'usd',
    customer: stripeCustomerId,
    id: stripePaymentIntentId,
    latest_charge: null,
    livemode: false,
    status,
  });

  const openInvoicePayment = () => ({
    data: [
      {
        amount_paid: null,
        amount_requested: 3000,
        currency: 'usd',
        invoice: 'in_metronome',
        livemode: false,
        payment: {
          payment_intent: stripePaymentIntentId,
          type: 'payment_intent',
        },
        status: 'open',
      },
    ],
    has_more: false,
  });

  it('returns exact paid principal, tax, total, paid-at, and no-reversal proof', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).resolves.toEqual({
      invoiceUrl: 'https://invoice.example/in_metronome',
      paidAt: new Date(1_787_997_600_000).toISOString(),
      paymentIntentId: stripePaymentIntentId,
      principalCents: 2500,
      status: 'PAID',
      stripeInvoiceId: 'in_metronome',
      taxCents: 500,
      totalCents: 3000,
    });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      stripePaymentIntentId,
      { expand: ['latest_charge'] },
    );
    expect(stripe.invoicePayments.list).toHaveBeenCalledWith({
      invoice: 'in_metronome',
      limit: 2,
      status: 'paid',
    });
  });

  it('accepts a paid tax-free invoice whose Stripe total_taxes is null', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue({
      amount_paid: 2500,
      currency: 'usd',
      customer: stripeCustomerId,
      hosted_invoice_url: 'https://invoice.example/in_metronome',
      id: 'in_metronome',
      livemode: false,
      metadata: { metronome_id: 'metronome-invoice-id' },
      status: 'paid',
      status_transitions: { paid_at: 1_787_997_600 },
      subtotal: 2500,
      total: 2500,
      total_taxes: null,
    });
    stripe.invoicePayments.list.mockResolvedValue({
      data: [
        {
          amount_paid: 2500,
          amount_requested: 2500,
          currency: 'usd',
          invoice: 'in_metronome',
          livemode: false,
          payment: {
            payment_intent: stripePaymentIntentId,
            type: 'payment_intent',
          },
          status: 'paid',
        },
      ],
      has_more: false,
    });
    stripe.paymentIntents.retrieve.mockResolvedValue({
      amount: 2500,
      amount_received: 2500,
      canceled_at: null,
      cancellation_reason: null,
      client_secret: null,
      currency: 'usd',
      customer: stripeCustomerId,
      id: stripePaymentIntentId,
      latest_charge: {
        amount: 2500,
        amount_captured: 2500,
        amount_refunded: 0,
        disputed: false,
        failure_balance_transaction: null,
        id: 'ch_metronome',
        livemode: false,
        outcome: { network_status: 'approved_by_network' },
        paid: true,
        payment_intent: stripePaymentIntentId,
        refunded: false,
        status: 'succeeded',
      },
      livemode: false,
      status: 'succeeded',
    });

    await expect(
      service.readPaymentGatedInvoicePayment({
        ...paymentGatedInput,
        expectedTaxCents: 0,
        expectedTotalCents: 2500,
      }),
    ).resolves.toEqual({
      invoiceUrl: 'https://invoice.example/in_metronome',
      paidAt: new Date(1_787_997_600_000).toISOString(),
      paymentIntentId: stripePaymentIntentId,
      principalCents: 2500,
      status: 'PAID',
      stripeInvoiceId: 'in_metronome',
      taxCents: 0,
      totalCents: 2500,
    });
  });

  it('accepts a successful Charge whose network status is null', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.paymentIntents.retrieve.mockResolvedValue({
      amount: 3000,
      amount_received: 3000,
      canceled_at: null,
      cancellation_reason: null,
      client_secret: null,
      currency: 'usd',
      customer: stripeCustomerId,
      id: stripePaymentIntentId,
      latest_charge: {
        amount: 3000,
        amount_captured: 3000,
        amount_refunded: 0,
        disputed: false,
        failure_balance_transaction: null,
        id: 'ch_metronome',
        livemode: false,
        outcome: { network_status: null },
        paid: true,
        payment_intent: stripePaymentIntentId,
        refunded: false,
        status: 'succeeded',
      },
      livemode: false,
      status: 'succeeded',
    });

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).resolves.toMatchObject({ status: 'PAID' });
  });

  it('rejects a second paid InvoicePayment even when one matches the expected PaymentIntent', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoicePayments.list.mockResolvedValue({
      data: [
        {
          amount_paid: 3000,
          amount_requested: 3000,
          currency: 'usd',
          invoice: 'in_metronome',
          livemode: false,
          payment: {
            payment_intent: stripePaymentIntentId,
            type: 'payment_intent',
          },
          status: 'paid',
        },
        {
          amount_paid: 3000,
          amount_requested: 3000,
          currency: 'usd',
          invoice: 'in_metronome',
          livemode: false,
          payment: {
            payment_intent: 'pi_duplicate',
            type: 'payment_intent',
          },
          status: 'paid',
        },
      ],
      has_more: false,
    });

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).rejects.toThrow('Stripe payment-gated invoice proof is invalid');
  });

  it('returns the exact client secret only while the intended payment requires action', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue(pendingInvoice());
    stripe.paymentIntents.retrieve.mockResolvedValue(
      pendingPaymentIntent('requires_action'),
    );
    stripe.invoicePayments.list.mockResolvedValue(openInvoicePayment());

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).resolves.toEqual({
      clientSecret: 'pi_action_required_secret',
      invoiceUrl: 'https://invoice.example/in_metronome',
      paymentIntentId: stripePaymentIntentId,
      principalCents: 2500,
      status: 'ACTION_REQUIRED',
      stripeInvoiceId: 'in_metronome',
      taxCents: 500,
      totalCents: 3000,
    });
    expect(stripe.invoicePayments.list).toHaveBeenCalledWith({
      invoice: 'in_metronome',
      limit: 2,
      payment: {
        payment_intent: stripePaymentIntentId,
        type: 'payment_intent',
      },
    });
  });

  it('rejects an action-required PaymentIntent that is not associated with the invoice', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue(pendingInvoice());
    stripe.paymentIntents.retrieve.mockResolvedValue(
      pendingPaymentIntent('requires_action'),
    );
    stripe.invoicePayments.list.mockResolvedValue({
      data: [
        {
          amount_paid: null,
          amount_requested: 3000,
          currency: 'usd',
          invoice: 'in_metronome',
          livemode: false,
          payment: {
            payment_intent: 'pi_other',
            type: 'payment_intent',
          },
          status: 'open',
        },
      ],
      has_more: false,
    });

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).rejects.toThrow('Stripe payment-gated invoice proof is invalid');
  });

  it('returns pending without leaking a PaymentIntent client secret', async () => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    stripe.invoices.retrieve.mockResolvedValue(pendingInvoice());
    stripe.paymentIntents.retrieve.mockResolvedValue({
      ...pendingPaymentIntent('processing'),
      client_secret: 'must-not-leak',
    });
    stripe.invoicePayments.list.mockResolvedValue(openInvoicePayment());

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).resolves.toEqual({
      invoiceUrl: 'https://invoice.example/in_metronome',
      paymentIntentId: stripePaymentIntentId,
      principalCents: 2500,
      status: 'PENDING',
      stripeInvoiceId: 'in_metronome',
      taxCents: 500,
      totalCents: 3000,
    });
    expect(stripe.invoicePayments.list).toHaveBeenCalledWith({
      invoice: 'in_metronome',
      limit: 2,
      payment: {
        payment_intent: stripePaymentIntentId,
        type: 'payment_intent',
      },
    });
  });

  it.each(['invoice status lags', 'PaymentIntent status lags'] as const)(
    'keeps %s as pending during asynchronous settlement',
    async (laggingResource) => {
      const { service, stripe } = createService({
        workspaceId,
        stripeCustomerId,
      });

      if (laggingResource === 'invoice status lags') {
        stripe.invoices.retrieve.mockResolvedValue(pendingInvoice());
      } else {
        stripe.paymentIntents.retrieve.mockResolvedValue(
          pendingPaymentIntent('processing'),
        );
      }

      await expect(
        service.readPaymentGatedInvoicePayment(paymentGatedInput),
      ).resolves.toEqual({
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: stripePaymentIntentId,
        principalCents: 2500,
        status: 'PENDING',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3000,
      });
    },
  );

  it.each([
    ['void invoice', 'void', 'processing', 'INVOICE_VOID'],
    [
      'partially paid uncollectible invoice',
      'uncollectible',
      'processing',
      'INVOICE_UNCOLLECTIBLE',
    ],
    [
      'canceled PaymentIntent',
      'open',
      'canceled',
      'PAYMENT_INTENT_CANCELED',
    ],
    [
      'payment method failure',
      'open',
      'requires_payment_method',
      'PAYMENT_METHOD_REQUIRED',
    ],
  ] as const)(
    'returns bounded definitive failure for %s',
    async (scenario, invoiceStatus, paymentIntentStatus, reason) => {
      const { service, stripe } = createService({
        workspaceId,
        stripeCustomerId,
      });
      const invoice = pendingInvoice(invoiceStatus);

      if (scenario === 'partially paid uncollectible invoice') {
        invoice.amount_paid = 500;
      }

      stripe.invoices.retrieve.mockResolvedValue(invoice);
      stripe.paymentIntents.retrieve.mockResolvedValue(
        pendingPaymentIntent(paymentIntentStatus),
      );
      stripe.invoicePayments.list.mockResolvedValue(openInvoicePayment());

      await expect(
        service.readPaymentGatedInvoicePayment(paymentGatedInput),
      ).resolves.toEqual({
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: stripePaymentIntentId,
        principalCents: 2500,
        reason,
        status: 'FAILED_DEFINITIVE',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3000,
      });
      expect(stripe.invoicePayments.list).toHaveBeenCalledWith({
        invoice: 'in_metronome',
        limit: 2,
        payment: {
          payment_intent: stripePaymentIntentId,
          type: 'payment_intent',
        },
      });
    },
  );

  it.each([
    ['wrong subtotal', 'subtotal'],
    ['wrong tax', 'tax'],
    ['wrong total', 'total'],
    ['partial refund', 'refund'],
    ['dispute', 'dispute'],
    ['reversal', 'reversal'],
  ])('rejects paid proof with %s', async (_, mutation) => {
    const { service, stripe } = createService({
      workspaceId,
      stripeCustomerId,
    });
    const invoice = {
      amount_paid: 3000,
      currency: 'usd',
      customer: stripeCustomerId,
      hosted_invoice_url: 'https://invoice.example/in_metronome',
      id: 'in_metronome',
      livemode: false,
      metadata: { metronome_id: 'metronome-invoice-id' },
      status: 'paid',
      status_transitions: { paid_at: 1_787_997_600 },
      subtotal: 2500,
      total: 3000,
      total_taxes: [{ amount: 500 }],
    };
    const paymentIntent = {
      amount: 3000,
      amount_received: 3000,
      canceled_at: null,
      cancellation_reason: null,
      client_secret: null,
      currency: 'usd',
      customer: stripeCustomerId,
      id: stripePaymentIntentId,
      latest_charge: {
        amount: 3000,
        amount_captured: 3000,
        amount_refunded: 0,
        disputed: false,
        failure_balance_transaction: null,
        id: 'ch_metronome',
        livemode: false,
        outcome: { network_status: 'approved_by_network' },
        paid: true,
        payment_intent: stripePaymentIntentId,
        refunded: false,
        status: 'succeeded',
      },
      livemode: false,
      status: 'succeeded',
    };

    if (mutation === 'subtotal') invoice.subtotal = 2499;
    if (mutation === 'tax') invoice.total_taxes = [{ amount: 499 }];
    if (mutation === 'total') invoice.total = 2999;
    if (mutation === 'refund')
      paymentIntent.latest_charge.amount_refunded = 1;
    if (mutation === 'dispute') paymentIntent.latest_charge.disputed = true;
    if (mutation === 'reversal')
      paymentIntent.latest_charge.failure_balance_transaction = 'txn_reversal';

    stripe.invoices.retrieve.mockResolvedValue(invoice);
    stripe.paymentIntents.retrieve.mockResolvedValue(paymentIntent);

    await expect(
      service.readPaymentGatedInvoicePayment(paymentGatedInput),
    ).rejects.toThrow('Stripe payment-gated invoice proof is invalid');
  });
});
