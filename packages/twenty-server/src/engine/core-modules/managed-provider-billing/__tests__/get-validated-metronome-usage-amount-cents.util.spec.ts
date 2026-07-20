import {
  getValidatedMetronomeUsageAmountCents,
  isApprovedFreeManagedOpenRouterOperation,
} from '../utils/get-validated-metronome-usage-amount-cents.util';

const identity = {
  providerKey: 'openrouter',
  providerConfigurationKey: 'openrouter/google/gemma-4-31b-it:free',
  metronomeEventType: 'managed_openrouter_generation',
};
const validate = (
  total: number,
  previewOverrides: Record<string, unknown> = {},
  options: { allowZeroAmount?: boolean } = {},
) =>
  getValidatedMetronomeUsageAmountCents({
    contractId: 'contract-id',
    customerId: 'customer-id',
    expectedProductIds: ['product-id'],
    preview: {
      invoices: [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            { name: 'usage', productId: 'product-id', total, type: 'usage' },
          ],
          total,
        },
      ],
      ...previewOverrides,
    } as never,
    ...options,
  });
describe('getValidatedMetronomeUsageAmountCents', () => {
  it('accepts zero only for the exact approved free operation identity', () => {
    expect(isApprovedFreeManagedOpenRouterOperation(identity)).toBe(true);
    expect(validate(0, {}, { allowZeroAmount: true })).toBe(BigInt(0));
  });

  it.each([
    { providerKey: 'other-provider' },
    { providerConfigurationKey: 'openrouter/google/gemma-4-31b-it:free:other' },
    { metronomeEventType: 'other-event' },
  ])('does not approve a mismatched free identity: %o', (mismatch) => {
    expect(
      isApprovedFreeManagedOpenRouterOperation({ ...identity, ...mismatch }),
    ).toBe(false);
  });

  it('rejects paid zero amounts by default', () => {
    expect(() => validate(0)).toThrow('Metronome usage preview is ambiguous');
  });

  it('rejects empty, ambiguous, and mismatched previews even for free usage', () => {
    expect(() =>
      getValidatedMetronomeUsageAmountCents({
        contractId: 'contract-id',
        customerId: 'customer-id',
        expectedProductIds: ['product-id'],
        preview: {
          invoices: [
            {
              contractId: 'contract-id',
              customerId: 'customer-id',
              id: 'invoice-id',
              lineItems: [],
              total: 0,
            },
          ],
        },
        allowZeroAmount: true,
      }),
    ).toThrow('Metronome usage preview is ambiguous');

    expect(() => validate(0, { invoices: [] })).toThrow(
      'Metronome usage preview is ambiguous',
    );
    expect(() =>
      getValidatedMetronomeUsageAmountCents({
        contractId: 'contract-id',
        customerId: 'other-customer-id',
        expectedProductIds: ['product-id'],
        preview: {
          invoices: [
            {
              contractId: 'contract-id',
              customerId: 'customer-id',
              id: 'invoice-id',
              lineItems: [
                {
                  name: 'usage',
                  productId: 'product-id',
                  total: 0,
                  type: 'usage',
                },
              ],
              total: 0,
            },
          ],
        },
        allowZeroAmount: true,
      }),
    ).toThrow('Metronome usage preview does not match the workspace');
  });
});
