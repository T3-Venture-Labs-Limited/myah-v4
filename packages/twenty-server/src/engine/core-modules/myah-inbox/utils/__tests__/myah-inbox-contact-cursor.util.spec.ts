export {};

type ContactCursor = {
  activityAt: string;
  orderingKey: string;
};
type EmailCursor = {
  receivedAt: string;
  messageId: string;
};
type InstagramCursor = {
  effectiveTimestamp: string;
  messageId: string;
};

type CursorModule = {
  encodeMyahInboxContactCursor: (
    input: ContactCursor & {
      workspaceId: string;
    },
  ) => string;
  decodeMyahInboxContactCursor: (
    value: string,
    expectedWorkspaceId: string,
  ) => ContactCursor;
  encodeMyahInboxContactEmailCursor: (
    input: EmailCursor & {
      workspaceId: string;
    },
  ) => string;
  decodeMyahInboxContactEmailCursor: (
    value: string,
    expectedWorkspaceId: string,
  ) => EmailCursor;
  encodeMyahInboxInstagramMessageCursor: (
    input: InstagramCursor & { workspaceId: string; conversationId: string },
  ) => string;
  decodeMyahInboxInstagramMessageCursor: (
    value: string,
    expected: { workspaceId: string; conversationId: string },
  ) => InstagramCursor;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000002';
const orderingKey = 'creator:00000000-0000-4000-8000-000000000003';

const loadModule = (): CursorModule | undefined => {
  try {
    return require('../myah-inbox-contact-cursor.util') as CursorModule;
  } catch {
    return undefined;
  }
};

describe('Myah Inbox Contact cursor', () => {
  it('round-trips a workspace-bound timestamp and ordering key while canonicalizing time', () => {
    const module = loadModule();

    expect(module).toBeDefined();
    const cursor = module!.encodeMyahInboxContactCursor({
      workspaceId,
      activityAt: '2026-09-05T12:30:00Z',
      orderingKey,
    });

    expect(cursor).not.toContain(orderingKey);
    expect(module!.decodeMyahInboxContactCursor(cursor, workspaceId)).toEqual({
      activityAt: '2026-09-05T12:30:00.000Z',
      orderingKey,
    });
  });

  it('rejects a cursor in another workspace', () => {
    const module = loadModule();

    expect(module).toBeDefined();
    const cursor = module!.encodeMyahInboxContactCursor({
      workspaceId,
      activityAt: '2026-09-05T12:30:00.000Z',
      orderingKey,
    });

    expect(() =>
      module!.decodeMyahInboxContactCursor(cursor, otherWorkspaceId),
    ).toThrow('Invalid Myah inbox contact cursor');
  });

  it.each([
    '',
    'not-json',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 2,
        w: workspaceId,
        a: '2026-09-05T12:30:00.000Z',
        o: orderingKey,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 1,
        w: workspaceId,
        a: 'not-a-date',
        o: orderingKey,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 1,
        w: workspaceId,
        a: '2026-09-05T12:30:00.000Z',
        o: 'creator:not-a-uuid',
      }),
    ).toString('base64url'),
  ])('rejects malformed cursor payloads', (cursor) => {
    const module = loadModule();

    expect(module).toBeDefined();
    expect(() =>
      module!.decodeMyahInboxContactCursor(cursor, workspaceId),
    ).toThrow('Invalid Myah inbox contact cursor');
  });
});

describe('Myah Inbox Instagram message cursor', () => {
  const conversationId = '00000000-0000-4000-8000-000000000004';
  const otherConversationId = '00000000-0000-4000-8000-000000000005';
  const messageId = '00000000-0000-4000-8000-000000000006';

  it('round-trips the effective timestamp ID tie-breaker and rejects workspace or conversation mismatches', () => {
    const module = loadModule();

    expect(module).toBeDefined();
    const cursor = module!.encodeMyahInboxInstagramMessageCursor({
      workspaceId,
      conversationId,
      effectiveTimestamp: '2026-09-05T12:30:00.000900Z',
      messageId,
    });

    expect(
      module!.decodeMyahInboxInstagramMessageCursor(cursor, {
        workspaceId,
        conversationId,
      }),
    ).toEqual({
      effectiveTimestamp: '2026-09-05T12:30:00.000900Z',
      messageId,
    });
    expect(() =>
      module!.decodeMyahInboxInstagramMessageCursor(cursor, {
        workspaceId: otherWorkspaceId,
        conversationId,
      }),
    ).toThrow('Invalid Myah inbox Instagram message cursor');
    expect(() =>
      module!.decodeMyahInboxInstagramMessageCursor(cursor, {
        workspaceId,
        conversationId: otherConversationId,
      }),
    ).toThrow('Invalid Myah inbox Instagram message cursor');
  });

  it.each([
    '',
    Buffer.from(
      JSON.stringify({
        v: 1,
        w: workspaceId,
        c: conversationId,
        t: 'not-a-date',
        m: messageId,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 1,
        w: workspaceId,
        c: conversationId,
        t: '2026-09-05T12:30:00.000Z',
        m: 'not-a-uuid',
      }),
    ).toString('base64url'),
  ])('rejects malformed Instagram cursor payloads', (cursor) => {
    const module = loadModule();

    expect(() =>
      module!.decodeMyahInboxInstagramMessageCursor(cursor, {
        workspaceId,
        conversationId,
      }),
    ).toThrow('Invalid Myah inbox Instagram message cursor');
  });
});

describe('Myah Inbox Contact Email cursor', () => {
  const messageId = '00000000-0000-4000-8000-000000000004';

  it('round-trips a separate workspace-bound chronological message cursor', () => {
    const module = loadModule();

    expect(module).toBeDefined();
    const cursor = module!.encodeMyahInboxContactEmailCursor({
      workspaceId,
      receivedAt: '2026-09-05T12:30:00Z',
      messageId,
    });

    expect(
      module!.decodeMyahInboxContactEmailCursor(cursor, workspaceId),
    ).toEqual({
      receivedAt: '2026-09-05T12:30:00.000Z',
      messageId,
    });
  });

  it('rejects malformed, cross-workspace, and Contact-list cursor payloads', () => {
    const module = loadModule();

    expect(module).toBeDefined();
    const cursor = module!.encodeMyahInboxContactEmailCursor({
      workspaceId,
      receivedAt: '2026-09-05T12:30:00Z',
      messageId,
    });
    const contactCursor = module!.encodeMyahInboxContactCursor({
      workspaceId,
      activityAt: '2026-09-05T12:30:00Z',
      orderingKey,
    });

    expect(() =>
      module!.decodeMyahInboxContactEmailCursor(cursor, otherWorkspaceId),
    ).toThrow('Invalid Myah inbox contact email cursor');
    expect(() =>
      module!.decodeMyahInboxContactEmailCursor(contactCursor, workspaceId),
    ).toThrow('Invalid Myah inbox contact email cursor');
    expect(() =>
      module!.decodeMyahInboxContactEmailCursor('invalid', workspaceId),
    ).toThrow('Invalid Myah inbox contact email cursor');
  });
});

describe.each(['contact', 'email'] as const)(
  'Exact %s cursor timestamps',
  (kind) => {
    const messageId = '00000000-0000-4000-8000-000000000004';
    const codec = () => {
      const module = loadModule()!;
      return {
        encode: (timestamp: string) =>
          kind === 'contact'
            ? module.encodeMyahInboxContactCursor({
                workspaceId,
                activityAt: timestamp,
                orderingKey,
              })
            : module.encodeMyahInboxContactEmailCursor({
                workspaceId,
                receivedAt: timestamp,
                messageId,
              }),
        decode: (token: string, workspace = workspaceId) =>
          kind === 'contact'
            ? module.decodeMyahInboxContactCursor(token, workspace).activityAt
            : module.decodeMyahInboxContactEmailCursor(token, workspace)
                .receivedAt,
        payload: (timestamp: string) => ({
          v: 1,
          w: workspaceId,
          a: timestamp,
          ...(kind === 'contact' ? { o: orderingKey } : { m: messageId }),
        }),
      };
    };
    const token = (payload: unknown) =>
      Buffer.from(JSON.stringify(payload)).toString('base64url');

    it.each([
      '2026-09-05T12:30:00.000100Z',
      '2026-09-05T12:30:00.000900Z',
      '2024-02-29T23:59:59.123456Z',
    ])('encodes exact PostgreSQL microseconds: %s', (timestamp) => {
      expect(
        JSON.parse(
          Buffer.from(codec().encode(timestamp), 'base64url').toString(),
        ).a,
      ).toBe(timestamp);
    });

    it.each([
      '2026-09-05T12:30:00.000100Z',
      '2026-09-05T12:30:00.000900Z',
      '2024-02-29T23:59:59.123456Z',
    ])('decodes exact PostgreSQL microseconds: %s', (timestamp) => {
      expect(codec().decode(token(codec().payload(timestamp)))).toBe(timestamp);
    });

    it('accepts old v1 millisecond tokens without inventing the lost microseconds', () => {
      const timestamp = '2026-09-05T12:30:00.123Z';
      expect(codec().decode(token(codec().payload(timestamp)))).toBe(timestamp);
      expect(codec().decode(codec().encode(timestamp))).toBe(timestamp);
    });

    it.each([
      '2026-02-29T12:30:00.000100Z',
      '2026-02-30T12:30:00.000100Z',
      '2026-04-31T12:30:00.000100Z',
      '2026-13-01T12:30:00.000100Z',
      '2026-09-00T12:30:00.000100Z',
      '2026-09-05T24:00:00.000000Z',
      '2026-09-05T12:60:00.000100Z',
      '2026-09-05T12:30:60.000100Z',
      '2026-09-05T12:30:00.0001001Z',
      '2026-09-05T12:30:00.000100+00:00',
      '2026-09-05',
      'not-a-date',
    ])(
      'rejects invalid/non-UTC timestamp on encode and decode: %s',
      (timestamp) => {
        expect(() => codec().encode(timestamp)).toThrow(
          'Invalid Myah inbox contact',
        );
        expect(() => codec().decode(token(codec().payload(timestamp)))).toThrow(
          'Invalid Myah inbox contact',
        );
      },
    );

    it.each([
      { v: 2 },
      { w: otherWorkspaceId },
      { a: null },
      { extra: true },
      { o: 'creator:not-a-uuid', m: 'not-a-uuid' },
    ])(
      'preserves version/workspace/type/shape/identity rejection: %j',
      (change) => {
        expect(() =>
          codec().decode(
            token({
              ...codec().payload('2026-09-05T12:30:00.000100Z'),
              ...change,
            }),
          ),
        ).toThrow('Invalid Myah inbox contact');
      },
    );

    it('rejects an invalid expected workspace and a valid other-workspace token', () => {
      const cursor = codec().encode('2026-09-05T12:30:00.000100Z');
      expect(() => codec().decode(cursor, 'invalid')).toThrow(
        'Invalid Myah inbox contact',
      );
      expect(() => codec().decode(cursor, otherWorkspaceId)).toThrow(
        'Invalid Myah inbox contact',
      );
    });
  },
);
