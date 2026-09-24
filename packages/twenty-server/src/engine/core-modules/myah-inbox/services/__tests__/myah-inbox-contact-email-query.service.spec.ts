import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  encodeMyahInboxContactEmailCursor,
  decodeMyahInboxContactEmailCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import {
  decodeMyahInboxEmailCardCursor,
  encodeMyahInboxEmailCardCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-email-card-cursor.util';

const rolePermissionConfig = { unionOf: ['role-id'] };

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

const workspaceId = '00000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000002';
const workspaceMemberId = '00000000-0000-4000-8000-000000000003';
const userWorkspaceId = '00000000-0000-4000-8000-000000000004';
const creatorId = '00000000-0000-4000-8000-000000000005';
const emailThreadAId = '00000000-0000-4000-8000-000000000006';
const emailThreadBId = '00000000-0000-4000-8000-000000000007';
const instagramConversationId = '00000000-0000-4000-8000-000000000008';
const messageAId = '00000000-0000-4000-8000-000000000009';
const messageBId = '00000000-0000-4000-8000-000000000010';
const workspace = { id: workspaceId } as WorkspaceEntity;
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  workspaceMemberId,
  user: { id: 'user-id' },
  workspaceMember: { id: workspaceMemberId },
} as unknown as UserWorkspaceAuthContext;

const creatorContactId = encodeMyahInboxContactId({
  workspaceId,
  identity: { kind: 'creator', recordId: creatorId },
});
const emailContactId = encodeMyahInboxContactId({
  workspaceId,
  identity: { kind: 'email-thread', recordId: emailThreadAId },
});
const instagramContactId = encodeMyahInboxContactId({
  workspaceId,
  identity: {
    kind: 'instagram-conversation',
    recordId: instagramConversationId,
  },
});

const rawRows = [
  {
    id: messageAId,
    messageThreadId: emailThreadAId,
    receivedAt: '2026-09-05T10:00:00.000Z',
    receivedAtCursorTimestamp: '2026-09-05T10:00:00.000000Z',
    subject: 'First subject',
    text: 'First body',
    visibility: 'FULL',
    direction: 'INCOMING',
    participants: [
      { role: 'FROM', handle: 'creator@example.com', displayName: 'Creator' },
    ],
  },
  {
    id: messageBId,
    messageThreadId: emailThreadBId,
    receivedAt: '2026-09-05T11:00:00.000Z',
    receivedAtCursorTimestamp: '2026-09-05T11:00:00.000000Z',
    subject: 'Visible subject',
    text: 'secret body',
    visibility: 'SUBJECT',
    direction: 'OUTGOING',
    participants: [
      { role: 'TO', handle: 'creator@example.com', displayName: null },
    ],
  },
];

type EmailQueryService = {
  listCards: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  listCardMessages: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  locateMessage: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  readCard: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  listMessages: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

type EmailQueryServiceConstructor = new (...args: never[]) => EmailQueryService;

const loadService = (): EmailQueryServiceConstructor | undefined => {
  try {
    return require('../myah-inbox-contact-email-query.service')
      .MyahInboxContactEmailQueryService as EmailQueryServiceConstructor;
  } catch {
    return undefined;
  }
};

const buildHarness = (rows: unknown[] = rawRows) => {
  const query = jest.fn().mockResolvedValue(rows);
  const builderByObjectName = new Map<string, Record<string, jest.Mock>>();
  const createQueryBuilder = (objectName: string) => {
    const builder = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      setParameters: jest.fn(),
      validatePermissionsBeforeSerialization: jest.fn(),
      getQueryAndParameters: jest
        .fn()
        .mockReturnValue([
          objectName === 'message'
            ? 'SELECT email_visibility(message.id) AS visibility FROM readable_message'
            : `SELECT * FROM readable_${objectName}`,
          [],
        ]),
    };

    builder.select.mockReturnValue(builder);
    builder.addSelect.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.setParameters.mockReturnValue(builder);
    builderByObjectName.set(objectName, builder);

    return builder;
  };
  const repositoryByObjectName = new Map<string, Record<string, jest.Mock>>();
  const getRepository = (objectName: string) => {
    if (!repositoryByObjectName.has(objectName)) {
      repositoryByObjectName.set(objectName, {
        findOne: jest.fn().mockResolvedValue({ id: creatorId }),
        createQueryBuilder: jest.fn(() => createQueryBuilder(objectName)),
      });
    }

    return repositoryByObjectName.get(objectName)!;
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
      query: (sql: string, ...args: unknown[]) =>
        sql.startsWith('SELECT to_regclass')
          ? [{ exists: false }]
          : query(sql, ...args),
    }),
    getRepository: jest.fn(async (_workspaceId, objectName) =>
      getRepository(objectName),
    ),
  };
  const visibilityPolicy = {
    buildSqlVisibilityProjection: jest.fn().mockReturnValue({
      expression: 'email_visibility(message.id)',
      parameters: { visibilityWorkspaceId: workspaceId },
    }),
  };
  const Service = loadService();

  expect(Service).toBeDefined();

  return {
    builderByObjectName,
    globalWorkspaceOrmManager,
    query,
    repositoryByObjectName,
    service: new Service!(
      globalWorkspaceOrmManager as never,
      visibilityPolicy as never,
    ),
  };
};

const request = (overrides: Record<string, unknown> = {}) => ({
  contactId: creatorContactId,
  first: 10,
  authContext: userAuthContext,
  user: userAuthContext.user,
  workspace,
  workspaceMemberId,
  ...overrides,
});

describe('MyahInboxContactEmailQueryService', () => {
  it('fails closed on malformed serialized participants', async () => {
    const harness = buildHarness([{ ...rawRows[0], participants: '{' }]);
    await expect(harness.service.listMessages(request())).rejects.toThrow(
      'Inbox participant projection failed closed',
    );
  });

  it('emits exact SQL cursor text separately from the Date display timestamp', async () => {
    const exactTimestamp = '2026-09-05T12:30:00.000900Z';
    const harness = buildHarness([
      {
        ...rawRows[0],
        receivedAt: new Date(exactTimestamp),
        receivedAtCursorTimestamp: exactTimestamp,
      },
    ]);
    const result = await harness.service.listMessages(request());
    const edges = result.edges as Array<{
      cursor: string;
      node: { receivedAt: string };
    }>;
    expect(edges[0].node.receivedAt).toBe('2026-09-05T12:30:00.000Z');
    expect(
      decodeMyahInboxContactEmailCursor(edges[0].cursor, workspaceId)
        .receivedAt,
    ).toBe(exactTimestamp);
    expect(harness.query.mock.calls[0][0]).toContain(`to_char(`);
    expect(harness.query.mock.calls[0][0]).toContain(
      `message."receivedAt" AT TIME ZONE 'UTC'`,
    );
    expect(harness.query.mock.calls[0][0]).toContain(
      `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`,
    );
    expect(harness.query.mock.calls[0][0]).toContain(
      `AS "receivedAtCursorTimestamp"`,
    );
  });

  it('traverses same-millisecond rows and exact timestamp ID ties once with a mocked keyset boundary', async () => {
    const rows = ['000100', '000900', '000900']
      .map((fraction, index) => ({
        ...rawRows[0],
        id: `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
        receivedAt: new Date('2026-09-05T12:30:00.000Z'),
        receivedAtCursorTimestamp: `2026-09-05T12:30:00.${fraction}Z`,
      }))
      .sort(
        (left, right) =>
          left.receivedAtCursorTimestamp.localeCompare(
            right.receivedAtCursorTimestamp,
          ) || left.id.localeCompare(right.id),
      );
    const harness = buildHarness([]);
    // This models keyset comparison on exact SQL text; it does not execute PostgreSQL.
    harness.query.mockImplementation(
      async (_sql: string, parameters: unknown[]) => {
        const boundary = parameters.find(
          (value): value is string =>
            typeof value === 'string' && value.startsWith('2026-09-05T'),
        );
        const boundaryKey = boundary
          ? (parameters[parameters.indexOf(boundary) + 1] as string)
          : undefined;
        const exactBoundary = boundary?.replace(
          /\.(\d+)Z$/,
          (_, fraction: string) => `.${fraction.padEnd(6, '0')}Z`,
        );
        return rows
          .filter(
            (row) =>
              !boundary ||
              row.receivedAtCursorTimestamp > exactBoundary! ||
              (row.receivedAtCursorTimestamp === exactBoundary &&
                row.id > boundaryKey!),
          )
          .slice(0, Number(parameters[parameters.length - 1]));
      },
    );
    const seen: string[] = [];
    let after: string | undefined;
    let hasNextPage = true;
    for (let page = 0; page < rows.length + 1 && hasNextPage; page++) {
      const result = await harness.service.listMessages(
        request({ first: 1, after }),
      );
      const edges = result.edges as Array<{ cursor: string }>;
      const pageInfo = result.pageInfo as {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      expect(edges).toHaveLength(1);
      seen.push(
        decodeMyahInboxContactEmailCursor(edges[0].cursor, workspaceId)
          .messageId,
      );
      after = pageInfo.endCursor!;
      hasNextPage = pageInfo.hasNextPage;
    }
    expect(hasNextPage).toBe(false);
    expect(seen).toEqual(rows.map((row) => row.id));
    expect(new Set(seen).size).toBe(rows.length);
    expect(
      harness.query.mock.calls.slice(1).map(([, parameters]) => parameters),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([rows[0].receivedAtCursorTimestamp, rows[0].id]),
      ]),
    );
  });

  it('binds a card frontier to the thread and stable accepted attempt key', async () => {
    const anchorKey = `attempt:${messageAId}`;
    const harness = buildHarness([
      {
        authorized: true,
        orderingUnavailable: false,
        rootChanged: false,
        cursorValid: true,
        fingerprint: 'a'.repeat(32),
        snapshotAt: '2026-09-08T00:00:00.123456Z',
        latestThreadId: emailThreadAId,
        cards: [
          {
            threadId: emailThreadAId,
            anchorKey,
            rootMessageId: messageAId,
            startTimestamp: '2026-09-01T00:00:00.123456Z',
            subject: null,
            campaignLabel: null,
            historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
          },
        ],
        hasOlderCards: true,
      },
    ]);
    const page = await harness.service.listCards(request());
    expect(
      decodeMyahInboxEmailCardCursor(
        page.olderCursor as string,
        {
          workspaceId,
          userWorkspaceId,
          contactId: creatorContactId,
        },
        'cards',
      ),
    ).toMatchObject({ id: anchorKey, threadId: emailThreadAId });
  });

  it('maps a single authorized card envelope without changing legacy message paging', async () => {
    const card = {
      threadId: emailThreadAId,
      rootMessageId: messageAId,
      startTimestamp: '2026-09-01T00:00:00.123456Z',
      subject: 'subject',
      campaignLabel: null,
      historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
    };
    const harness = buildHarness([
      {
        authorized: true,
        orderingUnavailable: false,
        rootChanged: false,
        cursorValid: true,
        fingerprint: 'a'.repeat(32),
        snapshotAt: '2026-09-08T00:00:00.123456Z',
        latestThreadId: emailThreadAId,
        cards: [card],
        hasOlderCards: false,
      },
    ]);
    await expect(
      (async () => harness.service.listCards(request()))(),
    ).resolves.toMatchObject({
      cards: [card],
      latestThreadId: emailThreadAId,
      olderCursor: null,
      snapshot: expect.any(String),
    });
    expect(harness.query).toHaveBeenCalledTimes(1);
  });
  it('reads exact authorized cards and returns null for a missing message location', async () => {
    const harness = buildHarness([
      {
        authorized: true,
        orderingUnavailable: false,
        rootChanged: false,
        cursorValid: true,
        fingerprint: 'a'.repeat(32),
        snapshotAt: '2026-09-08T00:00:00.123456Z',
        latestThreadId: null,
        cards: [],
        card: null,
        page: null,
        hasOlderCards: false,
      },
    ]);
    const head = await harness.service.listCards(request());
    await expect(
      (async () =>
        harness.service.readCard(request({ threadId: emailThreadAId })))(),
    ).resolves.toMatchObject({ card: null, snapshot: expect.any(String) });
    await expect(
      (async () =>
        harness.service.locateMessage(
          request({ messageId: messageAId, snapshot: head.snapshot }),
        ))(),
    ).resolves.toBeNull();
    await expect(
      (async () =>
        harness.service.listCardMessages(
          request({ threadId: emailThreadAId, snapshot: head.snapshot }),
        ))(),
    ).rejects.toThrow('Inbox card is not readable');
    await expect(
      harness.service.readCard(
        request({
          threadId: emailThreadAId,
          anchorKey: `attempt:${messageAId}`,
        }),
      ),
    ).rejects.toThrow('Inbox card is not readable');
    await expect(
      harness.service.readCard(
        request({
          threadId: emailThreadAId,
          anchorKey: `thread:${emailThreadBId}`,
        }),
      ),
    ).rejects.toThrow('Invalid Inbox card key');
    const snapshot = decodeMyahInboxEmailCardCursor(
      head.snapshot as string,
      {
        workspaceId,
        userWorkspaceId,
        contactId: creatorContactId,
      },
      'snapshot',
    );
    const wrongGroupCursor = encodeMyahInboxEmailCardCursor({
      ...snapshot,
      kind: 'older',
      threadId: emailThreadAId,
      anchorKey: `attempt:${messageAId}`,
      timestamp: '2026-09-01T00:00:00.123456Z',
      id: messageAId,
    });
    const statements = harness.query.mock.calls.length;
    await expect(
      harness.service.listCardMessages(
        request({
          threadId: emailThreadAId,
          anchorKey: `attempt:${messageBId}`,
          snapshot: head.snapshot,
          cursor: wrongGroupCursor,
        }),
      ),
    ).rejects.toThrow('Invalid Inbox history cursor');
    expect(harness.query).toHaveBeenCalledTimes(statements);
  });

  it('rejects a supplied valid group key when the authorized SQL envelope resolves a different group', async () => {
    const wrongKey = `attempt:${messageAId}`;
    const actualKey = `attempt:${messageBId}`;
    const card = {
      threadId: emailThreadAId,
      anchorKey: actualKey,
      rootMessageId: messageBId,
      startTimestamp: '2026-09-01T00:00:00.123456Z',
      subject: null,
      campaignLabel: null,
      historyBasis: 'PENDING',
    };
    const harness = buildHarness([
      {
        authorized: true,
        orderingUnavailable: false,
        rootChanged: false,
        cursorValid: true,
        fingerprint: 'a'.repeat(32),
        snapshotAt: '2026-09-08T00:00:00.123456Z',
        cards: [card],
        card,
        page: { threadId: emailThreadAId, anchorKey: actualKey },
      },
    ]);
    await expect(
      harness.service.readCard(
        request({
          threadId: emailThreadAId,
          anchorKey: wrongKey,
        }),
      ),
    ).rejects.toThrow('Inbox card is not readable');
    const oldClient = await harness.service.readCard(
      request({ threadId: emailThreadAId }),
    );
    expect(oldClient).toMatchObject({ card: { anchorKey: actualKey } });
    await expect(
      harness.service.listCardMessages(
        request({
          threadId: emailThreadAId,
          anchorKey: wrongKey,
          snapshot: oldClient.snapshot,
        }),
      ),
    ).rejects.toThrow('Inbox card is not readable');
  });

  it.each([
    [{ authorized: false }, 'Inbox member or contact is not readable'],
    [{ orderingUnavailable: true }, 'Inbox history ordering is unavailable'],
    [{ rootChanged: true }, 'Inbox history changed; reload history'],
    [{ cursorValid: false }, 'Invalid Inbox history cursor'],
    [
      { snapshotAt: '2026-09-08T00:00:00.123Z' },
      'Inbox timestamp projection is unavailable',
    ],
  ])(
    'rejects an invalid envelope before returning IDs',
    async (failure, message) => {
      const harness = buildHarness([
        {
          authorized: true,
          orderingUnavailable: false,
          rootChanged: false,
          cursorValid: true,
          cards: [],
          snapshotAt: '2026-09-08T00:00:00.123456Z',
          fingerprint: 'a'.repeat(32),
          ...failure,
        },
      ]);
      await expect(harness.service.listCards(request())).rejects.toThrow(
        message,
      );
    },
  );

  it('returns one chronological connection across every readable native thread linked to a Creator', async () => {
    const harness = buildHarness();

    const result = await harness.service.listMessages(request());
    const edges = result.edges as Array<{
      node: { messageThreadId: string; text: string | null };
    }>;

    expect(edges.map(({ node }) => node.messageThreadId)).toEqual([
      emailThreadAId,
      emailThreadBId,
    ]);
    expect(edges[1].node.text).toBe(
      FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    );
    const [sql] = harness.query.mock.calls[0];
    expect(sql).toContain('thread."creatorId" =');
    expect(sql).toContain('message."messageThreadId"');
    expect(sql).toContain('ORDER BY message."receivedAt" ASC, message.id ASC');
  });

  it('limits an unmatched Email contact to its exact readable native thread', async () => {
    const harness = buildHarness(rawRows.slice(0, 1));

    await harness.service.listMessages(request({ contactId: emailContactId }));

    const [sql, parameters] = harness.query.mock.calls[0];
    expect(sql).toContain('thread.id =');
    expect(parameters).toContain(emailThreadAId);
  });

  it('returns no Email items for a readable unmatched Instagram contact', async () => {
    const harness = buildHarness([]);

    const result = await harness.service.listMessages(
      request({ contactId: instagramContactId }),
    );

    expect(result).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(harness.query).not.toHaveBeenCalled();
    expect(
      harness.repositoryByObjectName.get('myahSocialConversation')?.findOne,
    ).toHaveBeenCalledWith({
      where: { id: instagramConversationId, deletedAt: expect.anything() },
      select: { id: true },
    });
  });

  it('applies permission-aware CTEs, visibility before output, and ascending keyset pagination', async () => {
    const harness = buildHarness([]);
    const after = encodeMyahInboxContactEmailCursor({
      workspaceId,
      receivedAt: '2026-09-05T10:00:00.000Z',
      messageId: messageAId,
    });

    await harness.service.listMessages(request({ first: 2, after }));

    for (const builder of harness.builderByObjectName.values()) {
      expect(
        builder.validatePermissionsBeforeSerialization,
      ).toHaveBeenCalledTimes(1);
    }
    const [sql, parameters] = harness.query.mock.calls[0];
    expect(sql).toContain('email_visibility(message.id)');
    expect(sql).toMatch(/message\.visibility <> \$\d+/);
    expect(sql).toContain('message."receivedAt" >');
    expect(sql).toContain('message.id >');
    expect(sql).toMatch(/LIMIT \$\d+$/);
    expect(parameters).toEqual(
      expect.arrayContaining([
        workspaceId,
        userWorkspaceId,
        creatorId,
        '2026-09-05T10:00:00.000Z',
        messageAId,
      ]),
    );
  });

  it('rejects malformed and cross-workspace IDs/cursors before opening workspace data', async () => {
    const harness = buildHarness([]);
    const foreignContactId = encodeMyahInboxContactId({
      workspaceId: otherWorkspaceId,
      identity: { kind: 'creator', recordId: creatorId },
    });

    await expect(
      harness.service.listMessages(request({ contactId: foreignContactId })),
    ).rejects.toThrow('Invalid Myah inbox contact ID');
    await expect(
      harness.service.listMessages(request({ after: 'invalid' })),
    ).rejects.toThrow('Invalid Myah inbox contact email cursor');
    expect(
      harness.globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });
});
