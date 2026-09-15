import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  encodeMyahInboxContactCursor,
  decodeMyahInboxContactCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

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
const instagramAId = '00000000-0000-4000-8000-000000000008';
const instagramBId = '00000000-0000-4000-8000-000000000009';
const workspace = { id: workspaceId } as WorkspaceEntity;
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  workspaceMemberId,
  user: { id: 'user-id' },
  workspaceMember: { id: workspaceMemberId },
} as unknown as UserWorkspaceAuthContext;

const rawRows = [
  {
    identityKind: 'creator',
    identityRecordId: creatorId,
    orderingKey: `creator:${creatorId}`,
    lastActivityAt: '2026-09-05T12:00:00.000Z',
    activityCursorTimestamp: '2026-09-05T12:00:00.000000Z',
    latestChannel: 'INSTAGRAM',
    displayName: 'Creator One',
    creatorId,
    creatorName: 'Creator One',
    creatorInstagramUsername: 'creator.one',
    preview: 'Latest Instagram reply',
    sender: '@creator.one',
    emailThreadIds: [emailThreadAId, emailThreadBId],
    latestEmailThreadId: emailThreadBId,
    emailNeedsAttention: false,
    instagramNeedsAttention: true,
    instagramConversations: [
      {
        id: instagramAId,
        providerConversationId: 'provider-chat-a',
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
        recipientUsername: 'creator.one',
        recipientDisplayName: 'Creator One',
        lastActivityAt: '2026-09-05T12:00:00.000Z',
        latestDirection: 'INBOUND',
      },
      {
        id: instagramBId,
        providerConversationId: 'provider-chat-b',
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
        recipientUsername: 'creator.one',
        recipientDisplayName: 'Creator One',
        lastActivityAt: '2026-09-05T11:00:00.000Z',
        latestDirection: 'OUTBOUND',
      },
    ],
  },
  {
    identityKind: 'email-thread',
    identityRecordId: emailThreadAId,
    orderingKey: `email-thread:${emailThreadAId}`,
    lastActivityAt: '2026-09-05T10:00:00.000Z',
    activityCursorTimestamp: '2026-09-05T10:00:00.000000Z',
    latestChannel: 'EMAIL',
    displayName: 'unmatched@example.com',
    creatorId: null,
    creatorName: null,
    creatorInstagramUsername: null,
    preview: 'Unmatched email',
    sender: 'unmatched@example.com',
    emailThreadIds: [emailThreadAId],
    latestEmailThreadId: emailThreadAId,
    emailNeedsAttention: true,
    instagramNeedsAttention: false,
    instagramConversations: [],
  },
  {
    identityKind: 'instagram-conversation',
    identityRecordId: instagramAId,
    orderingKey: `instagram-conversation:${instagramAId}`,
    lastActivityAt: '2026-09-05T09:00:00.000Z',
    activityCursorTimestamp: '2026-09-05T09:00:00.000000Z',
    latestChannel: 'INSTAGRAM',
    displayName: '@unmatched.creator',
    creatorId: null,
    creatorName: null,
    creatorInstagramUsername: null,
    preview: 'Unmatched Instagram',
    sender: '@unmatched.creator',
    emailThreadIds: [],
    latestEmailThreadId: null,
    emailNeedsAttention: false,
    instagramNeedsAttention: true,
    instagramConversations: [
      {
        id: instagramAId,
        providerConversationId: 'provider-unmatched',
        provider: 'COMPOSIO_HISTORY',
        lifecycle: 'HISTORICAL',
        recipientUsername: 'unmatched.creator',
        recipientDisplayName: null,
        lastActivityAt: '2026-09-05T09:00:00.000Z',
        latestDirection: 'INBOUND',
      },
    ],
  },
];

type ContactQueryService = {
  listContacts: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  getContact: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

type ContactQueryServiceConstructor = new (
  ...args: never[]
) => ContactQueryService;

const loadService = (): ContactQueryServiceConstructor | undefined => {
  try {
    return require('../myah-inbox-contact-query.service')
      .MyahInboxContactQueryService as ContactQueryServiceConstructor;
  } catch {
    return undefined;
  }
};

const buildHarness = (rows: unknown[] = rawRows) => {
  const query = jest.fn().mockResolvedValue(rows);
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

    return builder;
  };
  const repositoryByObjectName = new Map<string, Record<string, jest.Mock>>();
  const getRepository = (objectName: string) => {
    if (!repositoryByObjectName.has(objectName)) {
      repositoryByObjectName.set(objectName, {
        findOne: jest.fn().mockResolvedValue({ id: workspaceMemberId }),
        createQueryBuilder: jest.fn(() => createQueryBuilder(objectName)),
      });
    }

    return repositoryByObjectName.get(objectName)!;
  };
  const currentMemberRepository = getRepository('workspaceMember');
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
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
    currentMemberRepository,
    globalWorkspaceOrmManager,
    query,
    service: new Service!(
      globalWorkspaceOrmManager as never,
      visibilityPolicy as never,
    ),
    visibilityPolicy,
  };
};

const request = (overrides: Record<string, unknown> = {}) => ({
  first: 10,
  authContext: userAuthContext,
  user: userAuthContext.user,
  workspace,
  workspaceMemberId,
  ...overrides,
});

describe('MyahInboxContactQueryService', () => {
  it('emits exact SQL cursor text separately from the Date display timestamp', async () => {
    const exactTimestamp = '2026-09-05T12:30:00.000900Z';
    const harness = buildHarness([
      {
        ...rawRows[0],
        lastActivityAt: new Date(exactTimestamp),
        activityCursorTimestamp: exactTimestamp,
      },
    ]);
    const result = await harness.service.listContacts(request());
    const edges = result.edges as Array<{
      cursor: string;
      node: { lastActivityAt: string };
    }>;
    expect(edges[0].node.lastActivityAt).toBe('2026-09-05T12:30:00.000Z');
    expect(
      decodeMyahInboxContactCursor(edges[0].cursor, workspaceId).activityAt,
    ).toBe(exactTimestamp);
    expect(harness.query.mock.calls[0][0]).toContain(`to_char(`);
    expect(harness.query.mock.calls[0][0]).toContain(
      `contact."lastActivityAt" AT TIME ZONE 'UTC'`,
    );
    expect(harness.query.mock.calls[0][0]).toContain(
      `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`,
    );
    expect(harness.query.mock.calls[0][0]).toContain(
      `AS "activityCursorTimestamp"`,
    );
  });

  it('traverses same-millisecond rows and exact timestamp ID ties once with a mocked keyset boundary', async () => {
    const rows = ['000100', '000900', '000900']
      .map((fraction, index) => ({
        ...rawRows[0],
        identityRecordId: `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
        orderingKey: `creator:00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
        lastActivityAt: new Date('2026-09-05T12:30:00.000Z'),
        activityCursorTimestamp: `2026-09-05T12:30:00.${fraction}Z`,
      }))
      .sort(
        (left, right) =>
          -(
            left.activityCursorTimestamp.localeCompare(
              right.activityCursorTimestamp,
            ) || left.orderingKey.localeCompare(right.orderingKey)
          ),
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
              row.activityCursorTimestamp < exactBoundary! ||
              (row.activityCursorTimestamp === exactBoundary &&
                row.orderingKey < boundaryKey!),
          )
          .slice(0, Number(parameters[parameters.length - 1]));
      },
    );
    const seen: string[] = [];
    let after: string | undefined;
    let hasNextPage = true;
    for (let page = 0; page < rows.length + 1 && hasNextPage; page++) {
      const result = await harness.service.listContacts(
        request({ first: 1, after }),
      );
      const edges = result.edges as Array<{ cursor: string }>;
      const pageInfo = result.pageInfo as {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      expect(edges).toHaveLength(1);
      seen.push(
        decodeMyahInboxContactCursor(edges[0].cursor, workspaceId).orderingKey,
      );
      after = pageInfo.endCursor!;
      hasNextPage = pageInfo.hasNextPage;
    }
    expect(hasNextPage).toBe(false);
    expect(seen).toEqual(rows.map((row) => row.orderingKey));
    expect(new Set(seen).size).toBe(rows.length);
    expect(
      harness.query.mock.calls.slice(1).map(([, parameters]) => parameters),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          rows[0].activityCursorTimestamp,
          rows[0].orderingKey,
        ]),
      ]),
    );
  });

  it('groups all linked Email threads and Instagram conversations once under the readable Creator', async () => {
    const harness = buildHarness(rawRows.slice(0, 1));

    const result = await harness.service.listContacts(request());

    expect(result).toMatchObject({
      edges: [
        {
          node: {
            instagramUsername: 'creator.one',
            identityKind: 'CREATOR',
            displayName: 'Creator One',
            creator: { id: creatorId, name: 'Creator One' },
            latestChannel: 'INSTAGRAM',
            preview: 'Latest Instagram reply',
            needsAttention: true,
            email: {
              isAvailable: true,
              threadCount: 2,
              threadIds: [emailThreadAId, emailThreadBId],
              latestThreadId: emailThreadBId,
            },
            instagram: {
              isAvailable: true,
              state: 'AMBIGUOUS',
              needsAttention: true,
              conversations: expect.arrayContaining([
                expect.objectContaining({
                  id: instagramAId,
                  provider: 'UNIPILE',
                  lifecycle: 'ACTIVE',
                }),
                expect.objectContaining({ id: instagramBId }),
              ]),
            },
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    });
    const creatorContact = (result.edges as Array<{ node: { id: string } }>)[0]
      .node;
    expect(creatorContact.id).not.toContain(creatorId);
  });

  it('keeps unmatched Email and Instagram as separate exact-source contacts', async () => {
    const result = await buildHarness(rawRows.slice(1)).service.listContacts(
      request(),
    );
    const nodes = (
      result.edges as Array<{ node: Record<string, unknown> }>
    ).map(({ node }) => node);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identityKind: 'EMAIL_THREAD' }),
        expect.objectContaining({ identityKind: 'INSTAGRAM_CONVERSATION' }),
      ]),
    );
  });

  it('returns an exact selected Contact or fails closed when it is not readable', async () => {
    const contactId = encodeMyahInboxContactId({
      workspaceId,
      identity: { kind: 'creator', recordId: creatorId },
    });
    const present = buildHarness(rawRows.slice(0, 1));

    await expect(
      present.service.getContact(request({ contactId })),
    ).resolves.toMatchObject({
      identityKind: 'CREATOR',
      creator: { id: creatorId },
    });
    expect(present.query.mock.calls[0][1]).toContain(creatorId);

    const absent = buildHarness([]);

    await expect(
      absent.service.getContact(request({ contactId })),
    ).rejects.toThrow('Inbox contact is not readable');
  });

  it('builds one server-side visibility-filtered union/group/keyset query before applying the limit', async () => {
    const harness = buildHarness([]);
    const after = encodeMyahInboxContactCursor({
      workspaceId,
      activityAt: '2026-09-05T10:00:00.000Z',
      orderingKey: `creator:${creatorId}`,
    });

    await harness.service.listContacts(
      request({
        first: 2,
        after,
        owner: 'ME',
        states: ['NEEDS_REPLY'],
        search: 'creator',
      }),
    );

    const [sql, parameters] = harness.query.mock.calls[0];
    expect(sql).toContain('visible_email_messages AS');
    expect(sql).toContain('email_visibility(message.id)');
    expect(sql).toMatch(/message\.visibility <> \$\d+/);
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('all_source_rows');
    expect(sql).toContain('eligible_contacts');
    expect(sql).toContain('DISTINCT ON');
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain(
      "CASE WHEN creator.id IS NULL THEN 'email-thread' ELSE 'creator' END",
    );
    expect(sql).toContain(
      'COALESCE(message."providerCreatedAt", message."createdAt")',
    );
    expect(sql).toContain('LEFT JOIN latest_instagram_by_conversation');
    expect(sql).toContain(
      'COALESCE(latest."activityAt", conversation."updatedAt", conversation."createdAt")',
    );
    expect(sql).toContain('BOOL_OR(source."instagramDirection" = \'INBOUND\')');
    expect(sql).toContain('source."snoozedUntil" <= CURRENT_TIMESTAMP');
    expect(sql).toContain('contact."lastActivityAt" <');
    expect(sql).toContain('contact."orderingKey" <');
    expect(sql).toMatch(/LIMIT \$\d+$/);
    expect(parameters).toEqual(
      expect.arrayContaining([
        workspaceId,
        userWorkspaceId,
        workspaceMemberId,
        '2026-09-05T10:00:00.000Z',
        `creator:${creatorId}`,
      ]),
    );
  });

  it('rejects malformed and cross-workspace contact IDs/cursors before opening workspace data', async () => {
    const harness = buildHarness([]);
    const foreignCursor = encodeMyahInboxContactCursor({
      workspaceId: otherWorkspaceId,
      activityAt: '2026-09-05T10:00:00.000Z',
      orderingKey: `creator:${creatorId}`,
    });

    await expect(
      harness.service.listContacts(request({ after: foreignCursor })),
    ).rejects.toThrow('Invalid Myah inbox contact cursor');
    await expect(
      harness.service.listContacts(request({ contactId: 'invalid' })),
    ).rejects.toThrow('Invalid Myah inbox contact ID');
    expect(
      harness.globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });
});
