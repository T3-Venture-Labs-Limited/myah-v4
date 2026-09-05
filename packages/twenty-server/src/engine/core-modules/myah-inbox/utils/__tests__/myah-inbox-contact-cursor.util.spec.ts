export {};

type ContactCursor = {
  activityAt: string;
  orderingKey: string;
};
type EmailCursor = {
  receivedAt: string;
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
