import { BadRequestException } from '@nestjs/common';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const scope = { workspaceId, userWorkspaceId, contactId: 'scoped-contact' };
const payload = {
  version: 1,
  ...scope,
  kind: 'snapshot',
  snapshotAt: '2026-09-08T00:00:00.123456Z',
  fingerprint: 'a'.repeat(32),
};
const token = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value: string, context = scope, kind = 'snapshot') => {
  const {
    decodeMyahInboxEmailCardCursor,
  } = require('../myah-inbox-email-card-cursor.util');
  return decodeMyahInboxEmailCardCursor(value, context, kind);
};

describe('myah-inbox-email-card-cursor', () => {
  it('round trips exact six-digit server timestamps and rejects scope replay', () => {
    expect(decode(token(payload))).toEqual(payload);
    expect(() =>
      decode(token(payload), { ...scope, workspaceId: userWorkspaceId }),
    ).toThrow(BadRequestException);
    expect(() =>
      decode(token(payload), { ...scope, userWorkspaceId: workspaceId }),
    ).toThrow(BadRequestException);
    expect(() =>
      decode(token(payload), { ...scope, contactId: 'other' }),
    ).toThrow(BadRequestException);
  });
  it.each([
    { ...payload, snapshotAt: '2026-09-08T00:00:00.123Z' },
    { ...payload, snapshotAt: '2026-02-30T00:00:00.123456Z' },
    { ...payload, snapshotAt: '2026-09-08T24:00:00.000000Z' },
    { ...payload, snapshotAt: '0000-09-08T00:00:00.000000Z' },
    { ...payload, version: 2 },
    { ...payload, extra: true },
    { ...payload, fingerprint: 'bad' },
  ])('rejects noncanonical or unexpected token fields', (invalid) => {
    expect(() => decode(token(invalid))).toThrow(BadRequestException);
  });
  it('carries a namespaced accepted-send group through card and message cursors', () => {
    const anchorKey = `attempt:${workspaceId}`;
    expect(
      decode(
        token({
          ...payload,
          kind: 'cards',
          timestamp: payload.snapshotAt,
          id: anchorKey,
          threadId: workspaceId,
        }),
        scope,
        'cards',
      ),
    ).toMatchObject({ id: anchorKey, threadId: workspaceId });
    expect(() =>
      decode(
        token({
          ...payload,
          kind: 'cards',
          timestamp: payload.snapshotAt,
          id: anchorKey,
        }),
        scope,
        'cards',
      ),
    ).toThrow(BadRequestException);
    expect(
      decode(
        token({
          ...payload,
          kind: 'older',
          timestamp: payload.snapshotAt,
          id: workspaceId,
          threadId: workspaceId,
          anchorKey,
        }),
        scope,
        'older',
      ),
    ).toMatchObject({ anchorKey });
    expect(() =>
      decode(
        token({
          ...payload,
          kind: 'cards',
          timestamp: payload.snapshotAt,
          id: `attempt:${scope.contactId}`,
        }),
        scope,
        'cards',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects non-string UUID boundary values even when string coercion would match', () => {
    expect(() =>
      decode(
        token({
          ...payload,
          kind: 'cards',
          timestamp: payload.snapshotAt,
          id: [workspaceId],
        }),
        scope,
        'cards',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      decode(
        token({
          ...payload,
          kind: 'older',
          timestamp: payload.snapshotAt,
          id: workspaceId,
          threadId: [workspaceId],
        }),
        scope,
        'older',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed, overlong, and wrong-kind tokens', () => {
    for (const invalid of [
      '?',
      'x'.repeat(8193),
      token({ ...payload, kind: 'older' }),
    ]) {
      expect(() => decode(invalid)).toThrow(BadRequestException);
    }
  });
});
