import { getInstagramReplyWindowCountdown } from '@/object-record/record-field/ui/utils/getInstagramReplyWindowCountdown';

describe('getInstagramReplyWindowCountdown', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  it('formats remaining time in hours and minutes', () => {
    expect(
      getInstagramReplyWindowCountdown({
        deadline: '2026-07-16T11:17:00.000Z',
        now,
      }),
    ).toEqual({ label: '23h 17m left', status: 'normal' });
  });

  it('marks deadlines within an hour as warning', () => {
    expect(
      getInstagramReplyWindowCountdown({
        deadline: '2026-07-15T12:45:00.000Z',
        now,
      }),
    ).toEqual({ label: '45m left', status: 'warning' });
  });

  it('marks deadlines within fifteen minutes as urgent', () => {
    expect(
      getInstagramReplyWindowCountdown({
        deadline: '2026-07-15T12:15:00.000Z',
        now,
      }),
    ).toEqual({ label: '15m left', status: 'urgent' });
  });

  it('marks expired deadlines as closed', () => {
    expect(
      getInstagramReplyWindowCountdown({
        deadline: '2026-07-15T11:59:00.000Z',
        now,
      }),
    ).toEqual({ label: 'Window closed', status: 'closed' });
  });

  it('keeps a conversation without a reply deadline pending', () => {
    expect(getInstagramReplyWindowCountdown({ deadline: null, now })).toEqual({
      label: 'Awaiting reply',
      status: 'pending',
    });
  });
});
