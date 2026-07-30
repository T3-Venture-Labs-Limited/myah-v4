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
    ).toBe(64);
  });

  it.each([
    ['deepseek base input', 0.098, 14],
    ['deepseek base output', 0.196, 28],
    ['deepseek cache read', 0.0196, 3],
    ['grok base input', 2, 286],
    ['grok base output', 6, 858],
    ['grok cache read', 0.3, 43],
    ['grok long input', 4, 572],
    ['grok long output', 12, 1715],
    ['grok long cache read', 0.6, 86],
    ['luna base input', 1, 143],
    ['luna base output', 6, 858],
    ['luna cache read', 0.1, 15],
    ['luna cache write', 1.25, 179],
    ['luna long input', 2, 286],
    ['luna long output', 9, 1286],
    ['luna long cache read', 0.2, 29],
    ['luna long cache write', 2.5, 358],
    ['gemma reference input', 0.22, 32],
    ['gemma reference output', 0.55, 79],
    ['gemma reference cache read', 0.12, 18],
    ['gemma reference cache write', 0.22, 32],
  ])('applies gross margin once to %s', (_name, rate, expected) => {
    expect(
      getManagedOpenRouterChargeCentUnits({
        cashPaidMicrousd: '100000000',
        ratedUnits: [{ rate, units: 1_000_000 }],
        usableCreditsReceivedMicrousd: '100000000',
      }),
    ).toBe(expected);
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
