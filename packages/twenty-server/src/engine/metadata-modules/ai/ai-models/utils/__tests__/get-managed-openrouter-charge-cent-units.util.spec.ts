import { getManagedOpenRouterChargeCentUnits } from '../get-managed-openrouter-charge-cent-units.util';

describe('getManagedOpenRouterChargeCentUnits', () => {
  it('applies the exact measured cash-to-credit ratio and rounds up once', () => {
    expect(
      getManagedOpenRouterChargeCentUnits({
        cashPaidMicrousd: '105500000',
        ratedUnits: [
          { rate: 0.14, units: 1_000_000 },
          { rate: 0.28, units: 1_000_000 },
        ],
        usableCreditsReceivedMicrousd: '100000000',
      }),
    ).toBe(45);
  });

  it('does not under-reserve fractional cent usage', () => {
    expect(
      getManagedOpenRouterChargeCentUnits({
        cashPaidMicrousd: '105500000',
        ratedUnits: [{ rate: 0.14, units: 1 }],
        usableCreditsReceivedMicrousd: '100000000',
      }),
    ).toBe(1);
  });

  it('rejects invalid or margin-reducing acquisition evidence', () => {
    expect(() =>
      getManagedOpenRouterChargeCentUnits({
        cashPaidMicrousd: '999',
        ratedUnits: [{ rate: 0.14, units: 1 }],
        usableCreditsReceivedMicrousd: '1000',
      }),
    ).toThrow('Invalid managed OpenRouter tariff evidence');
  });
});
