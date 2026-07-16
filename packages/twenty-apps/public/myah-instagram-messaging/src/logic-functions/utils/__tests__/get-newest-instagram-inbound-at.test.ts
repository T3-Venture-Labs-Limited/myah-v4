import { describe, expect, it } from 'vitest';

import { getNewestInstagramInboundAt } from '../get-newest-instagram-inbound-at';

describe('getNewestInstagramInboundAt', () => {
  it('returns the newest valid inbound timestamp regardless of message order', () => {
    const inboundAt = getNewestInstagramInboundAt({
      recipientIgsid: 'creator_igsid',
      messages: [
        {
          from: { id: 'creator_igsid' },
          created_time: '2026-07-15T10:00:00.000Z',
        },
        {
          from: { id: 'myah_ig_user_id' },
          created_time: '2026-07-15T11:00:00.000Z',
        },
        {
          from: { id: 'creator_igsid' },
          created_time: '2026-07-15T12:00:00.000Z',
        },
      ],
    });

    expect(inboundAt).toBe('2026-07-15T12:00:00.000Z');
  });

  it('rejects ambiguous and malformed message data', () => {
    const inboundAt = getNewestInstagramInboundAt({
      recipientIgsid: 'creator_igsid',
      messages: [
        { created_time: '2026-07-15T12:00:00.000Z' },
        {
          from: { id: 'other_igsid' },
          created_time: '2026-07-15T12:00:00.000Z',
        },
        { from: { id: 'creator_igsid' }, created_time: 'not-a-date' },
        null,
      ],
    });

    expect(inboundAt).toBeUndefined();
  });

  it('rejects a matching inbound timestamp later than the refresh time', () => {
    const inboundAt = getNewestInstagramInboundAt({
      recipientIgsid: 'creator_igsid',
      messages: [
        {
          from: { id: 'creator_igsid' },
          created_time: '2026-07-16T12:01:00.000Z',
        },
      ],
      now: new Date('2026-07-16T12:00:00.000Z'),
    });

    expect(inboundAt).toBeUndefined();
  });
});
