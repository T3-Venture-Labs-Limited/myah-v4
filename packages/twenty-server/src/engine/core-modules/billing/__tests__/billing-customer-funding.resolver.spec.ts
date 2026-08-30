import { GUARDS_METADATA } from '@nestjs/common/constants';

import { BillingResolver } from '../billing.resolver';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

const workspace = { id: 'workspace-id' };
const user = { id: 'actor-id' };
const createdAt = new Date('2026-08-29T10:00:00.000Z');
const updatedAt = new Date('2026-08-29T10:40:00.000Z');
const action = {
  actionType: 'PREPAID_COMMIT',
  amountCents: '2500',
  collectedTotalCents: '2750',
  createdAt,
  expiresAt: new Date('2027-08-29T10:40:00.000Z'),
  id: '11111111-1111-4111-8111-111111111111',
  paymentEvidence: { preset: 'AI_25_USD', providerSecret: 'hidden' },
  paymentReceipt: {
    invoiceUrl: 'https://invoice.example/in_1',
    providerError: 'hidden',
  },
  prepaidPrincipalCents: '2500',
  state: 'SUCCEEDED',
  taxCents: '250',
  updatedAt,
};
const billingDetails = {
  city: 'San Francisco',
  country: 'US',
  line1: '123 Market Street',
  line2: null,
  name: 'Myah Test LLC',
  postalCode: '94105',
  state: 'CA',
  taxIdType: 'us_ein' as const,
  taxIdValue: '12-3456789',
};
const billingSummary = {
  address: {
    city: billingDetails.city,
    country: billingDetails.country,
    line1: billingDetails.line1,
    line2: null,
    postalCode: billingDetails.postalCode,
    state: billingDetails.state,
  },
  card: {
    brand: 'visa',
    expiryMonth: 12,
    expiryYear: 2030,
    last4: '4242',
  },
  name: billingDetails.name,
  paymentMethodReady: true,
  taxId: { country: 'US', type: 'us_ein' },
};

const createResolver = () => {
  const statusService = {
    getStatus: jest.fn().mockResolvedValue({
      available: true,
      pendingOperationCount: 1,
      prepaidBalanceCents: '10000',
      reconciliationRequiredOperationCount: 0,
    }),
  };
  const fundingService = {
    acknowledgeCustomerFundingPaymentAction: jest.fn().mockResolvedValue(action),
    completeCustomerFundingPaymentMethod: jest.fn().mockResolvedValue({
      billingSummary,
      clientSecret: null,
      publishableKey: null,
      ready: true,
      setupIntentId: null,
    }),
    createCustomerFunding: jest.fn().mockResolvedValue(action),
    getCustomerFundingAction: jest.fn().mockResolvedValue(action),
    getCustomerFundingBillingSummary: jest.fn().mockResolvedValue(billingSummary),
    getCustomerFundingPaymentAction: jest.fn().mockResolvedValue({
      clientSecret: 'pi_secret',
      paymentIntentId: 'pi_1',
      stripeInvoiceId: 'in_1',
    }),
    isCustomerFundingAvailable: jest.fn().mockReturnValue(true),
    isCustomerFundingPaymentMethodReady: jest.fn().mockResolvedValue(true),
    listCustomerFundingHistory: jest.fn().mockResolvedValue([action]),
    prepareCustomerFundingPaymentMethod: jest.fn().mockResolvedValue({
      billingSummary,
      clientSecret: 'seti_secret',
      publishableKey: 'pk_test',
      ready: false,
      setupIntentId: 'seti_1',
    }),
  };
  const resolver = new BillingResolver(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    statusService as never,
    fundingService as never,
    {} as never,
  );

  return { fundingService, resolver, statusService };
};

describe('BillingResolver customer AI funding', () => {
  it.each([
    'requestManagedProviderCustomerFunding',
    'prepareManagedProviderCustomerFundingPaymentMethod',
    'completeManagedProviderCustomerFundingPaymentMethod',
    'prepareManagedProviderCustomerFundingPaymentAction',
    'acknowledgeManagedProviderCustomerFundingPaymentAction',
  ] as const)('protects %s as a non-impersonated billing-admin action', (method) => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      BillingResolver.prototype[method],
    ) as unknown[];

    expect(guards).toEqual(
      expect.arrayContaining([
        WorkspaceAuthGuard,
        UserAuthGuard,
        NoImpersonationGuard,
      ]),
    );
  });

  it('requests one server-owned preset bound to workspace and actor', async () => {
    const { fundingService, resolver } = createResolver();

    await expect(
      resolver.requestManagedProviderCustomerFunding(workspace as never, user as never, {
        idempotencyKey: 'browser-key',
        preset: 'AI_25_USD',
      }),
    ).resolves.toMatchObject({
      id: action.id,
      presetId: 'AI_25_USD',
      principalCents: '2500',
      state: 'BALANCE_ACTIVE',
    });
    expect(fundingService.createCustomerFunding).toHaveBeenCalledWith({
      actorId: user.id,
      idempotencyKey: 'browser-key',
      preset: 'AI_25_USD',
      workspaceId: workspace.id,
    });
  });

  it('extends billing status with bounded presets, readiness, and safe history', async () => {
    const { resolver } = createResolver();

    await expect(
      resolver.managedProviderBillingStatus(workspace as never),
    ).resolves.toEqual({
      available: true,
      customerFundingAvailable: true,
      customerFundingBillingSummary: billingSummary,
      customerFundingHistory: [
        {
          actionRequired: false,
          collectedTotalCents: '2750',
          createdAt,
          expiresAt: action.expiresAt,
          fundingType: 'PURCHASED',
          id: action.id,
          invoiceUrl: 'https://invoice.example/in_1',
          presetId: 'AI_25_USD',
          principalCents: '2500',
          state: 'BALANCE_ACTIVE',
          taxCents: '250',
          updatedAt,
        },
      ],
      customerFundingPaymentMethodReady: true,
      customerFundingPresets: [
        { id: 'AI_25_USD', principalCents: '2500' },
        { id: 'AI_50_USD', principalCents: '5000' },
        { id: 'AI_100_USD', principalCents: '10000' },
      ],
      pendingOperationCount: 1,
      prepaidBalanceCents: '10000',
      reconciliationRequiredOperationCount: 0,
    });
  });


  it('forwards bounded billing details when completing payment setup', async () => {
    const { fundingService, resolver } = createResolver();

    await resolver.completeManagedProviderCustomerFundingPaymentMethod(
      workspace as never,
      { ...billingDetails, setupIntentId: 'seti_1' },
    );
    expect(
      fundingService.completeCustomerFundingPaymentMethod,
    ).toHaveBeenCalledWith(workspace.id, 'seti_1', billingDetails);
  });
  it('looks up a polled action through the authenticated workspace boundary', async () => {
    const { fundingService, resolver } = createResolver();

    await resolver.managedProviderCustomerFundingAction(workspace as never, {
      actionId: action.id,
    });
    expect(fundingService.getCustomerFundingAction).toHaveBeenCalledWith(
      workspace.id,
      action.id,
    );
  });

  it('has no browser mark-paid mutation', () => {
    expect(
      'markManagedProviderCustomerFundingPaid' in BillingResolver.prototype,
    ).toBe(false);
  });
});
