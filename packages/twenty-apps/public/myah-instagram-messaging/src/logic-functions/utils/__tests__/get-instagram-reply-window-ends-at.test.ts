import { describe, expect, it } from 'vitest';

import { getInstagramReplyWindowEndsAt } from '../get-instagram-reply-window-ends-at';

describe('getInstagramReplyWindowEndsAt', () => {
  it('adds exactly 24 hours to a valid inbound timestamp', () => {
    expect(
      getInstagramReplyWindowEndsAt('2026-07-15T12:00:00.000Z'),
    ).toBe('2026-07-16T12:00:00.000Z');
  });

  it('rejects an invalid inbound timestamp', () => {
    expect(() => getInstagramReplyWindowEndsAt('not-a-date')).toThrow(
      'Invalid inbound timestamp.',
    );
  });
});
