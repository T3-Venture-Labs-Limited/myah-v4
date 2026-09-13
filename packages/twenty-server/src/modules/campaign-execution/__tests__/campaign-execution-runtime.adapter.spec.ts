import { CampaignInitialDueTimeAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-runtime.adapter';

describe('CampaignInitialDueTimeAdapter', () => {
  const adapter = new CampaignInitialDueTimeAdapter();
  const window = {
    timeZone: 'America/New_York',
    startLocalTime: '09:00:00',
    endLocalTime: '17:00:00',
  };

  it('adds delay on the instant timeline and keeps instants inside the half-open window', () => {
    expect(
      adapter.adjustInitialDueAt({
        anchorAt: '2026-01-15T15:00:00.000Z',
        delaySeconds: 60,
        window,
      }),
    ).toBe('2026-01-15T15:01:00.000Z');
  });

  it('moves an end-boundary instant to the next local-day start', () => {
    expect(
      adapter.adjustInitialDueAt({
        anchorAt: '2026-01-15T22:00:00.000Z',
        delaySeconds: 0,
        window,
      }),
    ).toBe('2026-01-16T14:00:00.000Z');
  });

  it('uses compatible gap-forward and overlap-earlier disambiguation', () => {
    expect(
      adapter.adjustInitialDueAt({
        anchorAt: '2026-03-08T05:00:00.000Z',
        delaySeconds: 0,
        window: { ...window, startLocalTime: '02:30:00' },
      }),
    ).toBe('2026-03-08T07:30:00.000Z');
    expect(
      adapter.adjustInitialDueAt({
        anchorAt: '2026-11-01T04:00:00.000Z',
        delaySeconds: 0,
        window: { ...window, startLocalTime: '01:30:00' },
      }),
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('advances past a spring-gap day whose compatible start resolves outside the window', () => {
    expect(
      adapter.adjustInitialDueAt({
        anchorAt: '2026-03-08T05:00:00.000Z',
        delaySeconds: 0,
        window: {
          ...window,
          startLocalTime: '02:30:00',
          endLocalTime: '03:00:00',
        },
      }),
    ).toBe('2026-03-09T06:30:00.000Z');
  });

  it('fails closed on invalid delay or window', () => {
    expect(() =>
      adapter.adjustInitialDueAt({
        anchorAt: '2026-01-01T00:00:00.000Z',
        delaySeconds: -1,
        window,
      }),
    ).toThrow('Initial due time delay was invalid');
  });
});
