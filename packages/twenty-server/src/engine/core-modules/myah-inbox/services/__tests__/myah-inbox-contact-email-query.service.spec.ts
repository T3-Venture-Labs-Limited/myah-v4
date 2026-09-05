import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { encodeMyahInboxContactEmailCursor } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';
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

const buildHarness = (rows = rawRows) => {
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
