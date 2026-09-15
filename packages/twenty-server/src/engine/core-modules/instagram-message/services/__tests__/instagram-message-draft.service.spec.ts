import { buildInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';

type DraftService = {
  saveDraft: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  getDraftForTarget: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
};

type DraftServiceConstructor = new (...dependencies: never[]) => DraftService;

type DraftServiceModule = {
  InstagramMessageDraftService: DraftServiceConstructor;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const workspaceMemberId = '00000000-0000-4000-8000-000000000002';
const draftId = '00000000-0000-4000-8000-000000000003';
const creatorId = '00000000-0000-4000-8000-000000000004';
const conversationId = '00000000-0000-4000-8000-000000000005';

const loadService = (): DraftServiceConstructor | undefined => {
  try {
    return (require('../instagram-message-draft.service') as DraftServiceModule)
      .InstagramMessageDraftService;
  } catch {
    return undefined;
  }
};

const buildHarness = (
  queryImplementation?: (sql: string, parameters?: unknown[]) => unknown[],
) => {
  const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
    const rows = queryImplementation
      ? queryImplementation(sql, parameters)
      : [];

    return sql.trimStart().startsWith('UPDATE') ? [rows, rows.length] : rows;
  });
  const manager = {
    query: jest.fn(async () => {
      throw new Error('RAW_SQL_NOT_ALLOWED');
    }),
    queryRunner: {},
  };
  const dataSource = {
    query,
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };
  const actionApprovalService = {
    isDraftExecutionLocked: jest.fn().mockResolvedValue(false),
  };
  const draftLockService = {
    withLock: jest.fn(async (_input, operation) => operation()),
  };
  const Service = loadService();

  expect(Service).toBeDefined();

  return {
    query,
    draftLockService,
    actionApprovalService,
    service: new Service!(
      workspaceRepository as never,
      globalWorkspaceOrmManager as never,
      actionApprovalService as never,
      draftLockService as never,
    ),
  };
};

const firstMessageInput = {
  workspaceId,
  workspaceMemberId,
  draftId,
  expectedRevision: 0,
  kind: 'FIRST_MESSAGE',
  body: '  Hello creator  ',
  creatorRecordId: creatorId,
  conversationRecordId: null,
};

describe('InstagramMessageDraftService', () => {
  it.each([
    { kind: 'FIRST_MESSAGE', body: '' },
    { kind: 'FIRST_MESSAGE', body: '  \n  ' },
    { kind: 'REPLY', body: '' },
    { kind: 'REPLY', body: '  \n  ' },
  ])(
    'persists an empty $kind update ($body) under CAS and reloads empty',
    async ({ kind, body }) => {
      const conversationRecordId = kind === 'REPLY' ? conversationId : null;
      const recipientProviderId =
        kind === 'REPLY' ? 'exact-igsid' : 'creator.name';
      let stored = { id: draftId, revision: 4, body: 'Persisted text' };
      const harness = buildHarness((sql, parameters) => {
        if (sql.includes('"_myahSocialConversation"'))
          return [
            {
              id: conversationId,
              creatorId,
              recipientIgsid: recipientProviderId,
            },
          ];
        if (sql.includes('"creator"'))
          return [{ instagramUsername: 'creator.name' }];
        if (sql.trimStart().startsWith('UPDATE')) {
          if (
            parameters?.[0] !== stored.id ||
            parameters?.[1] !== stored.revision
          )
            return [];
          stored = {
            ...stored,
            revision: stored.revision + 1,
            body: parameters?.[2] as string,
          };
          return [stored];
        }
        if (sql.includes('SELECT "id", "revision", "body"')) return [stored];
        return [];
      });
      await expect(
        harness.service.saveDraft({
          ...firstMessageInput,
          expectedRevision: 4,
          kind,
          conversationRecordId,
          body,
        }),
      ).resolves.toEqual({
        status: 'SAVED',
        draftId,
        revision: 5,
        body: '',
      });
      expect(harness.draftLockService.withLock).toHaveBeenCalledWith(
        { workspaceId, draftId },
        expect.any(Function),
      );
      expect(
        harness.actionApprovalService.isDraftExecutionLocked,
      ).toHaveBeenCalledWith({
        workspaceId,
        draftId,
        actionName: 'send_instagram_message',
      });
      expect(harness.query).toHaveBeenCalledWith(
        expect.stringMatching(
          /WHERE "id" = \$1\s+AND "revision" = \$2\s+AND "sentAt" IS NULL\s+AND "deletedAt" IS NULL/,
        ),
        [
          draftId,
          4,
          '',
          creatorId,
          conversationRecordId,
          'creator.name',
          recipientProviderId,
          workspaceMemberId,
        ],
        expect.anything(),
        { shouldBypassPermissionChecks: true },
      );
      expect(
        harness.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO')),
      ).toBe(false);
      await expect(
        harness.service.getDraftForTarget({
          workspaceId,
          kind,
          creatorRecordId: creatorId,
          conversationRecordId,
        }),
      ).resolves.toEqual({
        status: 'SAVED',
        draftId,
        revision: 5,
        body: '',
        executionLocked: false,
      });
      expect(() =>
        buildInstagramMessageActionAuthority({
          workspaceId,
          initiatorUserWorkspaceId: workspaceMemberId,
          threadId: null,
          interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
          interactionContextId: draftId,
          draft: {
            id: draftId,
            revision: stored.revision,
            body: stored.body,
            kind: kind === 'REPLY' ? 'REPLY' : 'START_CHAT',
            creatorRecordId: creatorId,
            conversationRecordId,
            providerConversationId: kind === 'REPLY' ? 'exact-chat' : null,
            recipientUsername: 'creator.name',
            recipientProviderId,
            recipientSourceValues: [],
          },
          account: {
            bindingId: 'binding',
            workspaceInstagramAccountRecordId: 'account',
            unipileAccountId: 'provider-account',
            instagramUserId: 'owner',
          },
          evidenceLinks: [],
        }),
      ).toThrow('Instagram message body is empty');
    },
  );

  it.each(['', '   '])(
    'continues rejecting empty creation %j before writes',
    async (body) => {
      const harness = buildHarness();
      await expect(
        harness.service.saveDraft({ ...firstMessageInput, body }),
      ).rejects.toThrow('Invalid Instagram message draft');
      expect(harness.query).not.toHaveBeenCalled();
    },
  );

  it('returns the current body for a stale clear without overwriting it', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('"creator"'))
        return [{ instagramUsername: 'creator.name' }];
      if (sql.includes('SELECT "id", "revision", "body"'))
        return [{ id: draftId, revision: 5, body: 'Remote text' }];
      return [];
    });
    await expect(
      harness.service.saveDraft({
        ...firstMessageInput,
        expectedRevision: 4,
        body: '',
      }),
    ).resolves.toEqual({
      status: 'CONFLICT',
      draftId,
      revision: 5,
      body: 'Remote text',
    });
  });

  it('rejects a clear under the existing execution lock before any read/write', async () => {
    const harness = buildHarness();
    harness.actionApprovalService.isDraftExecutionLocked.mockResolvedValue(
      true,
    );
    await expect(
      harness.service.saveDraft({
        ...firstMessageInput,
        expectedRevision: 4,
        body: '',
      }),
    ).rejects.toThrow('Instagram message draft is locked for execution');
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('still resolves the current target before permitting a clear', async () => {
    const harness = buildHarness();
    await expect(
      harness.service.saveDraft({
        ...firstMessageInput,
        kind: 'REPLY',
        conversationRecordId: conversationId,
        expectedRevision: 4,
        body: '',
      }),
    ).rejects.toThrow('Active Unipile conversation is unavailable');
    expect(
      harness.query.mock.calls.some(([sql]) => sql.includes('UPDATE')),
    ).toBe(false);
  });

  it('propagates a failed empty update instead of claiming it was saved', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('"creator"'))
        return [{ instagramUsername: 'creator.name' }];
      if (sql.includes('UPDATE')) throw new Error('Persistence failure');
      return [];
    });
    await expect(
      harness.service.saveDraft({
        ...firstMessageInput,
        expectedRevision: 4,
        body: '',
      }),
    ).rejects.toThrow('Persistence failure');
  });

  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid revision %s even for a clear',
    async (expectedRevision) => {
      const harness = buildHarness();
      await expect(
        harness.service.saveDraft({
          ...firstMessageInput,
          expectedRevision,
          body: '',
        }),
      ).rejects.toThrow('Invalid Instagram message draft');
      expect(harness.query).not.toHaveBeenCalled();
    },
  );

  it('creates a server-owned FIRST_MESSAGE draft bound to a current Creator recipient without provider I/O', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('FROM "workspace_') && sql.includes('"creator"')) {
        return [
          {
            instagramUsername: '@Creator.Name',
            instagramUrl: 'https://instagram.com/creator.name/',
            instagramLinkPrimaryLinkUrl: null,
          },
        ];
      }
      if (sql.includes('INSERT INTO')) {
        return [{ id: draftId, revision: 1, body: 'Hello creator' }];
      }

      return [];
    });

    await expect(harness.service.saveDraft(firstMessageInput)).resolves.toEqual(
      {
        status: 'SAVED',
        draftId,
        revision: 1,
        body: 'Hello creator',
      },
    );

    const sql = harness.query.mock.calls
      .map(([statement]) => statement)
      .join('\n');
    expect(sql).toMatch(/FROM "workspace_[^"]+"\."creator"/);
    expect(sql).not.toContain('"_creator"');
  });

  it('returns the current revision and body without overwriting a stale save', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('FROM "workspace_') && sql.includes('"creator"')) {
        return [
          {
            instagramUsername: '@Creator.Name',
            instagramUrl: null,
            instagramLinkPrimaryLinkUrl: null,
          },
        ];
      }
      if (sql.includes('UPDATE')) return [];
      if (sql.includes('SELECT "id", "revision", "body"')) {
        return [{ id: draftId, revision: 4, body: 'Remote edit' }];
      }

      return [];
    });

    await expect(
      harness.service.saveDraft({
        ...firstMessageInput,
        expectedRevision: 3,
        body: 'Stale local edit',
      }),
    ).resolves.toEqual({
      status: 'CONFLICT',
      draftId,
      revision: 4,
      body: 'Remote edit',
    });
  });

  it('uses the linked Creator normalized identity and exact conversation IGSID for a REPLY without a conversation username', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('"_myahSocialConversation"')) {
        return [
          {
            id: conversationId,
            creatorId,
            provider: 'UNIPILE',
            lifecycle: 'ACTIVE',
            recipientUsername: null,
            recipientIgsid: 'creator-provider-id',
          },
        ];
      }
      if (sql.includes('"creator"')) {
        return [
          {
            instagramUsername: '@Creator.Name',
            instagramUrl: null,
            instagramLinkPrimaryLinkUrl: null,
          },
        ];
      }
      if (sql.includes('INSERT INTO')) {
        return [{ id: draftId, revision: 1, body: 'Reply copy' }];
      }

      return [];
    });

    await expect(
      harness.service.saveDraft({
        ...firstMessageInput,
        kind: 'REPLY',
        body: 'Reply copy',
        conversationRecordId: conversationId,
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 1 });
    expect(harness.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO'),
      expect.arrayContaining(['creator.name', 'creator-provider-id']),
      expect.anything(),
      { shouldBypassPermissionChecks: true },
    );
    const sql = harness.query.mock.calls
      .map(([statement]) => statement)
      .join('\n');
    expect(sql).toMatch(/FROM "workspace_[^"]+"\."creator"/);
    expect(sql).not.toContain('"_creator"');

    const missingConversation = buildHarness(() => []);
    await expect(
      missingConversation.service.saveDraft({
        ...firstMessageInput,
        kind: 'REPLY',
        conversationRecordId: conversationId,
      }),
    ).rejects.toThrow('Active Unipile conversation is unavailable');
  });

  it.each([
    [
      'has no linked Creator',
      { creatorId: null, recipientIgsid: 'ig-id' },
      null,
    ],
    ['has no IGSID', { creatorId, recipientIgsid: ' ' }, null],
    [
      'has no current Creator record',
      { creatorId, recipientIgsid: 'ig-id' },
      [],
    ],
    [
      'has an invalid Creator identity',
      { creatorId, recipientIgsid: 'ig-id' },
      [
        {
          instagramUsername: 'not a valid handle!',
          instagramUrl: null,
          instagramLinkPrimaryLinkUrl: null,
        },
      ],
    ],
    [
      'has ambiguous Creator identities',
      { creatorId, recipientIgsid: 'ig-id' },
      [
        {
          instagramUsername: 'creator.one',
          instagramUrl: 'https://instagram.com/creator.two/',
          instagramLinkPrimaryLinkUrl: null,
        },
      ],
    ],
  ])(
    'fails closed when the active reply %s',
    async (_case, target, creator) => {
      const harness = buildHarness((sql) => {
        if (sql.includes('"_myahSocialConversation"')) {
          return [
            {
              id: conversationId,
              provider: 'UNIPILE',
              lifecycle: 'ACTIVE',
              recipientUsername: null,
              ...target,
            },
          ];
        }
        if (sql.includes('"creator"')) return creator ?? [];

        return [];
      });

      await expect(
        harness.service.saveDraft({
          ...firstMessageInput,
          kind: 'REPLY',
          conversationRecordId: conversationId,
        }),
      ).rejects.toThrow();
    },
  );
  it('loads the latest unsent server draft for the exact target after reload', async () => {
    const harness = buildHarness((sql) =>
      sql.includes('"_myahInstagramReplyDraft"')
        ? [{ id: draftId, revision: 3, body: 'Saved across reload' }]
        : [],
    );
    harness.actionApprovalService.isDraftExecutionLocked.mockResolvedValueOnce(
      true,
    );

    await expect(
      harness.service.getDraftForTarget({
        workspaceId,
        kind: 'REPLY',
        creatorRecordId: null,
        conversationRecordId: conversationId,
      }),
    ).resolves.toEqual({
      status: 'SAVED',
      draftId,
      revision: 3,
      body: 'Saved across reload',
      executionLocked: true,
    });
  });
});
