import { MyahCheckoutService } from 'src/engine/core-modules/myah-subscription/myah-checkout.service';
import { MyahWorkspaceAccess } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';

const workspace = { id: 'workspace', subdomain: 'brand' } as never;

describe('Myah Checkout', () => {
  let service: MyahCheckoutService;
  let paid: boolean;
  let state: MyahWorkspaceAccess;
  let coupon: Record<string, unknown>;
  const stripe = {
    prices: { retrieve: jest.fn() },
    coupons: { retrieve: jest.fn() },
    promotionCodes: { list: jest.fn() },
    checkout: {
      sessions: {
        list: jest.fn(),
        expire: jest.fn(),
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    subscriptions: { retrieve: jest.fn() },
    invoices: { listLineItems: jest.fn() },
    billingPortal: { sessions: { create: jest.fn() } },
  };
  const access = {
    getAccess: jest.fn(async () => state),
    getSubscription: jest.fn(async () => ({ hadPaidSubscription: paid })),
    saveSubscription: jest.fn(),
  };
  const customers = {
    ensureWorkspaceCustomer: jest.fn(async () => 'cus_workspace'),
    persistedCustomerId: jest.fn(async () => 'cus_workspace'),
    findPersistedCustomerId: jest.fn(
      async (): Promise<string | null> => 'cus_workspace',
    ),
  };
  const syncCustomer = jest.fn(async () => 'workspace');

  beforeEach(() => {
    jest.clearAllMocks();
    paid = false;
    access.getSubscription.mockImplementation(async () => ({
      hadPaidSubscription: paid,
    }));
    state = MyahWorkspaceAccess.NEEDS_SUBSCRIPTION;
    coupon = {
      id: 'coupon_early',
      valid: true,
      amount_off: 23000,
      currency: 'usd',
      duration: 'forever',
      max_redemptions: 100,
      times_redeemed: 0,
    };
    stripe.prices.retrieve.mockResolvedValue({
      id: 'price_myah',
      active: true,
      unit_amount: 32900,
      currency: 'usd',
      livemode: false,
      recurring: { interval: 'month', interval_count: 1 },
      product: 'prod_myah',
    });
    stripe.coupons.retrieve.mockImplementation(async () => coupon);
    stripe.promotionCodes.list.mockResolvedValue({ data: [] });
    stripe.checkout.sessions.list.mockImplementation(() =>
      (async function* () {})(),
    );
    stripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    });
    service = new MyahCheckoutService(
      { stripe: () => stripe, syncCustomer } as never,
      access as never,
      customers as never,
      {
        get: (key: string) =>
          key === 'MYAH_STRIPE_PRICE_ID' ? 'price_myah' : 'coupon_early',
      } as never,
      {
        getWorkspaceUrls: () => ({
          subdomainUrl: 'https://brand.example.com/',
        }),
      } as never,
    );
  });

  it('shows and charges the early-access price, including after abandoned Checkout', async () => {
    expect(await service.resolveCheckoutDiscount('workspace')).toMatchObject({
      amountCents: 9900,
      earlyAccess: true,
    });
    await service.createCheckout(workspace);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_workspace',
        mode: 'subscription',
        discounts: [{ coupon: 'coupon_early' }],
        success_url:
          'https://brand.example.com/plan-required/payment-success?session_id={CHECKOUT_SESSION_ID}',
      }),
    );
    expect(await service.resolveCheckoutDiscount('workspace')).toMatchObject({
      amountCents: 9900,
    });
  });

  it('shows full price when the coupon is used up', async () => {
    coupon.times_redeemed = 100;
    expect(await service.resolveCheckoutDiscount('workspace')).toMatchObject({
      amountCents: 32900,
      earlyAccess: false,
      discount: undefined,
    });
  });

  it('requires reviewing the new price if the last early-access place was taken after the quote', async () => {
    const quote = await service.resolveCheckoutDiscount('workspace');
    coupon.times_redeemed = 100;
    await expect(
      service.createCheckout(workspace, undefined, quote.amountCents),
    ).rejects.toMatchObject({
      message: 'The price has changed. Please review the updated price.',
      extensions: expect.objectContaining({ subCode: 'MYAH_PRICE_CHANGED' }),
    });
    expect(customers.ensureWorkspaceCustomer).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    await service.createCheckout(workspace, undefined, 32900);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ discounts: expect.anything() }),
    );
  });

  it('re-reads Stripe before Checkout so a paid workspace with a late webhook is not charged twice', async () => {
    // Stripe already has the paid subscription; the sync updates local access.
    syncCustomer.mockImplementationOnce(async () => {
      state = MyahWorkspaceAccess.ACTIVE;
      return 'workspace';
    });
    await expect(service.createCheckout(workspace)).rejects.toThrow(
      'This workspace already has access.',
    );
    expect(syncCustomer).toHaveBeenCalledWith('cus_workspace');
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('re-reads Stripe before quoting so a returning customer with a late webhook pays the regular price', async () => {
    syncCustomer.mockImplementationOnce(async () => {
      paid = true;
      return 'workspace';
    });
    expect(await service.quoteCheckout('workspace')).toMatchObject({
      amountCents: 32900,
      earlyAccess: false,
    });
  });

  it('does not call Stripe sync for a workspace that never had a Stripe customer', async () => {
    customers.findPersistedCustomerId.mockResolvedValueOnce(null);
    expect(await service.quoteCheckout('workspace')).toMatchObject({
      amountCents: 9900,
    });
    expect(syncCustomer).not.toHaveBeenCalled();
    expect(customers.ensureWorkspaceCustomer).not.toHaveBeenCalled();
  });

  it('never gives early-access price to a previously paid workspace', async () => {
    paid = true;
    expect(await service.resolveCheckoutDiscount('workspace')).toMatchObject({
      amountCents: 32900,
      earlyAccess: false,
    });
    expect(stripe.coupons.retrieve).not.toHaveBeenCalled();
  });

  it('rejects invalid codes before creating Checkout', async () => {
    await expect(service.createCheckout(workspace, 'invalid')).rejects.toThrow(
      'This code is not valid.',
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('uses the valid tester promotion instead of the early-access discount', async () => {
    coupon = {
      id: 'tester',
      valid: true,
      percent_off: 100,
      duration: 'forever',
    };
    stripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_test',
          customer: null,
          promotion: { coupon: 'tester' },
          livemode: false,
          expires_at: null,
          max_redemptions: null,
          restrictions: { minimum_amount: null, first_time_transaction: false },
        },
      ],
    });
    expect(
      await service.resolveCheckoutDiscount('workspace', 'tester'),
    ).toMatchObject({
      amountCents: 0,
      discount: { promotion_code: 'promo_test' },
    });
    // A free plan does not ask for a card; a paid plan always does.
    await service.createCheckout(workspace, 'tester', 0);
    expect(stripe.checkout.sessions.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: 'promo_test' }],
        payment_method_collection: 'if_required',
      }),
    );
    await service.createCheckout(workspace);
    expect(
      stripe.checkout.sessions.create.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty('payment_method_collection');
  });

  it.each([
    MyahWorkspaceAccess.ACTIVE,
    MyahWorkspaceAccess.COMPLIMENTARY,
    MyahWorkspaceAccess.PAYMENT_RETRYING,
  ])('refuses Checkout for %s', async (accessState) => {
    state = accessState;
    await expect(service.createCheckout(workspace)).rejects.toThrow(
      'already has access',
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('expires only prior Myah subscription sessions on the installation customer', async () => {
    stripe.checkout.sessions.list.mockImplementation(() =>
      (async function* () {
        yield { id: 'old_myah', metadata: { myah_subscription: 'true' } };
        yield { id: 'other_product', metadata: {} };
      })(),
    );
    await service.createCheckout(workspace);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('old_myah');
  });

  it('rejects cross-workspace Checkout return', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      metadata: { workspace_id: 'other', myah_subscription: 'true' },
      mode: 'subscription',
      customer: 'cus_other',
    });
    await expect(service.syncCheckout('workspace', 'cs_other')).rejects.toThrow(
      'does not belong',
    );
    expect(syncCustomer).not.toHaveBeenCalled();
  });

  it('syncs a proved Checkout before returning access', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      metadata: { workspace_id: 'workspace', myah_subscription: 'true' },
      mode: 'subscription',
      customer: 'cus_workspace',
    });
    await service.syncCheckout('workspace', 'cs_workspace');
    expect(syncCustomer).toHaveBeenCalledWith('cus_workspace');
    expect(access.getAccess).toHaveBeenCalledWith('workspace');
  });

  describe('Billing details', () => {
    const planLine = {
      currency: 'usd',
      subtotal: 32900,
      discount_amounts: [{ amount: 23000 }],
      parent: {
        subscription_item_details: {
          subscription_item: 'si_myah',
          proration: false,
        },
      },
      pricing: { price_details: { price: 'price_myah' } },
    };
    const subscription = () => ({
      id: 'sub_workspace',
      customer: 'cus_workspace',
      metadata: { workspace_id: 'workspace' },
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: 'si_myah',
            price: { id: 'price_myah' },
            current_period_end: 1800000000,
          },
        ],
      },
      latest_invoice: {
        id: 'in_current',
        amount_paid: 0,
        lines: { data: [planLine], has_more: false },
      },
    });
    beforeEach(() => {
      state = MyahWorkspaceAccess.ACTIVE;
      access.getSubscription.mockResolvedValue(
        Object.assign(
          { hadPaidSubscription: true },
          { stripeSubscriptionId: 'sub_workspace' },
        ),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(subscription());
    });

    it.each([
      [23000, 9900],
      [0, 32900],
      [32900, 0],
      [16450, 16450],
    ])(
      'uses the actual billed plan discount %s, not a new Checkout quote',
      async (discount, expected) => {
        const current = subscription();
        current.latest_invoice.lines.data = [
          { ...planLine, discount_amounts: [{ amount: discount }] },
        ];
        stripe.subscriptions.retrieve.mockResolvedValue(current);
        expect(await service.getBillingDetails('workspace')).toEqual({
          amountCents: expected,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date(1800000000000),
        });
        expect(customers.ensureWorkspaceCustomer).not.toHaveBeenCalled();
        expect(stripe.prices.retrieve).not.toHaveBeenCalled();
      },
    );

    it('shows the end date when cancelling and the price even if a renewal remains unpaid', async () => {
      state = MyahWorkspaceAccess.PAYMENT_RETRYING;
      stripe.subscriptions.retrieve.mockResolvedValue({
        ...subscription(),
        cancel_at_period_end: true,
      });
      expect(await service.getBillingDetails('workspace')).toMatchObject({
        amountCents: 9900,
        cancelAtPeriodEnd: true,
      });
    });

    it('does not contact Stripe for complimentary access', async () => {
      state = MyahWorkspaceAccess.COMPLIMENTARY;
      expect(await service.getBillingDetails('workspace')).toEqual({
        amountCents: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      });
      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(customers.persistedCustomerId).not.toHaveBeenCalled();
    });

    it.each([
      { customer: 'cus_other' },
      { metadata: { workspace_id: 'other' } },
    ])(
      'refuses a subscription belonging to another workspace: %p',
      async (overrides) => {
        stripe.subscriptions.retrieve.mockResolvedValue({
          ...subscription(),
          ...overrides,
        });
        await expect(service.getBillingDetails('workspace')).rejects.toThrow(
          'ownership mismatch',
        );
      },
    );

    it('finds the plan line across pages without including unrelated charges or prorations', async () => {
      const current = subscription();
      current.latest_invoice.lines = { data: [], has_more: true };
      stripe.subscriptions.retrieve.mockResolvedValue(current);
      stripe.invoices.listLineItems.mockImplementation(() =>
        (async function* () {
          yield {
            ...planLine,
            parent: {
              subscription_item_details: {
                subscription_item: 'si_other',
                proration: false,
              },
            },
          };
          yield {
            ...planLine,
            parent: {
              subscription_item_details: {
                subscription_item: 'si_myah',
                proration: true,
              },
            },
          };
          yield planLine;
        })(),
      );
      expect(await service.getBillingDetails('workspace')).toMatchObject({
        amountCents: 9900,
      });
    });

    it('fails instead of inventing a price when billing detail is missing', async () => {
      stripe.subscriptions.retrieve.mockResolvedValue({
        ...subscription(),
        latest_invoice: null,
      });
      await expect(service.getBillingDetails('workspace')).rejects.toThrow(
        'unavailable',
      );
    });
  });
});
