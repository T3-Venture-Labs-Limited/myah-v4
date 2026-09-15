export {};

type ContactKind = 'creator' | 'email-thread' | 'instagram-conversation';

type ContactIdentity = { kind: ContactKind; recordId: string };

type ContactIdModule = {
  encodeMyahInboxContactId: (input: {
    workspaceId: string;
    identity: ContactIdentity;
  }) => string;
  decodeMyahInboxContactId: (
    value: string,
    expectedWorkspaceId: string,
  ) => ContactIdentity;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000002';
const recordId = '00000000-0000-4000-8000-000000000003';

const loadModule = (): ContactIdModule | undefined => {
  try {
    return require('../myah-inbox-contact-id.util') as ContactIdModule;
  } catch {
    return undefined;
  }
};

describe('Myah Inbox Contact ID', () => {
  it.each(['creator', 'email-thread', 'instagram-conversation'] as const)(
    'round-trips a workspace-bound %s identity without exposing its raw key',
    (kind) => {
      const module = loadModule();

      expect(module).toBeDefined();
      const opaqueId = module!.encodeMyahInboxContactId({
        workspaceId,
        identity: { kind, recordId },
      });

      expect(opaqueId).not.toContain(kind);
      expect(opaqueId).not.toContain(recordId);
      expect(module!.decodeMyahInboxContactId(opaqueId, workspaceId)).toEqual({
        kind,
        recordId,
      });
    },
  );

  it('rejects the same opaque identity in another workspace before record access', () => {
    const module = loadModule();

    expect(module).toBeDefined();
    const opaqueId = module!.encodeMyahInboxContactId({
      workspaceId,
      identity: { kind: 'creator', recordId },
    });

    expect(() =>
      module!.decodeMyahInboxContactId(opaqueId, otherWorkspaceId),
    ).toThrow('Invalid Myah inbox contact ID');
  });

  it.each([
    '',
    'not-base64-json',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 2,
        w: workspaceId,
        k: 'creator',
        r: recordId,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 1,
        w: workspaceId,
        k: 'unknown',
        r: recordId,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 1,
        w: workspaceId,
        k: 'creator',
        r: 'not-a-uuid',
      }),
    ).toString('base64url'),
  ])('rejects malformed or unsupported opaque IDs', (opaqueId) => {
    const module = loadModule();

    expect(module).toBeDefined();
    expect(() =>
      module!.decodeMyahInboxContactId(opaqueId, workspaceId),
    ).toThrow('Invalid Myah inbox contact ID');
  });
});
