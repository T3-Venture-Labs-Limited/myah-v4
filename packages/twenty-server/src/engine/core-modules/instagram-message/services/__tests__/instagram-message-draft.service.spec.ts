type DraftService = {
  saveDraft: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
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

const buildHarness = (queryImplementation?: (sql: string) => unknown[]) => {
  const query = jest.fn(async (sql: string) =>
    queryImplementation ? queryImplementation(sql) : [],
  );
  const manager = { query };
  const dataSource = {
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
  it('creates a server-owned FIRST_MESSAGE draft bound to a current Creator recipient without provider I/O', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('FROM "workspace_') && sql.includes('"_creator"')) {
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
    expect(sql).toContain('"_creator"');
    expect(sql).toContain('"_myahInstagramReplyDraft"');
    expect(sql).toContain("'FIRST_MESSAGE'");
    expect(sql).toContain('"recipientUsername"');
    expect(sql).not.toContain('api/v1');
  });

  it('returns the current revision and body without overwriting a stale save', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('FROM "workspace_') && sql.includes('"_creator"')) {
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
    expect(
      harness.query.mock.calls.filter(([sql]) => sql.includes('UPDATE')),
    ).toHaveLength(1);
  });

  it('requires one exact active Unipile conversation for REPLY drafts', async () => {
    const harness = buildHarness((sql) => {
      if (sql.includes('"_myahSocialConversation"')) {
        return [
          {
            id: conversationId,
            creatorId,
            provider: 'UNIPILE',
            lifecycle: 'ACTIVE',
            recipientUsername: 'creator.name',
            recipientIgsid: 'creator-provider-id',
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

    const missingConversation = buildHarness(() => []);
    await expect(
      missingConversation.service.saveDraft({
        ...firstMessageInput,
        kind: 'REPLY',
        conversationRecordId: conversationId,
      }),
    ).rejects.toThrow('Active Unipile conversation is unavailable');
  });
});
