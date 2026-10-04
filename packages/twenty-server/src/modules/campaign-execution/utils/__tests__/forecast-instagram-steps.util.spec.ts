import { forecastInstagramSteps } from 'src/modules/campaign-execution/utils/forecast-instagram-steps.util';

const allDay = {
  timeZone: 'UTC',
  startLocalTime: '00:00',
  endLocalTime: '23:59',
};
const generatedAt = new Date('2026-10-05T10:00:00.000Z');
const step = (
  occurrenceId: string,
  instagramAccountId: string | null = 'account-a',
  window = allDay,
) => ({ occurrenceId, dueAt: generatedAt, instagramAccountId, window });

describe('forecastInstagramSteps', () => {
  it('sends ten per hour, then waits for the hourly limit, sharing the account across Campaigns', () => {
    const estimates = forecastInstagramSteps({
      generatedAt,
      recentColdSendsByAccount: new Map(),
      steps: Array.from({ length: 12 }, (_, index) =>
        step(`o-${String(index).padStart(2, '0')}`),
      ),
    });

    expect(estimates.get('o-00')).toEqual(generatedAt);
    expect(estimates.get('o-09')).toEqual(generatedAt);
    expect(estimates.get('o-10')?.getTime()).toBe(
      generatedAt.getTime() + 60 * 60 * 1000 + 1,
    );
    expect(estimates.get('o-11')?.getTime()).toBe(
      generatedAt.getTime() + 60 * 60 * 1000 + 1,
    );
  });

  it('counts cold messages already sent and respects the daily limit', () => {
    const recent = Array.from(
      { length: 100 },
      (_, index) => new Date(generatedAt.getTime() - 23 * 3600 * 1000 + index),
    );
    const estimates = forecastInstagramSteps({
      generatedAt,
      recentColdSendsByAccount: new Map([['account-a', recent]]),
      steps: [step('o-1')],
    });

    expect(estimates.get('o-1')?.getTime()).toBe(
      generatedAt.getTime() + 3600 * 1000 + 1,
    );
  });

  it('waits for the Campaign window and gives no estimate without an Instagram account', () => {
    const estimates = forecastInstagramSteps({
      generatedAt,
      recentColdSendsByAccount: new Map(),
      steps: [
        step('morning', 'account-a', {
          timeZone: 'UTC',
          startLocalTime: '14:00',
          endLocalTime: '18:00',
        }),
        step('no-account', null),
      ],
    });

    expect(estimates.get('morning')?.toISOString()).toBe(
      '2026-10-05T14:00:00.000Z',
    );
    expect(estimates.get('no-account')).toBeNull();
  });
});
