import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const creatorId = '00000000-0000-4000-8000-000000000002';
const channelId = '00000000-0000-4000-8000-000000000003';
const receiptId = '00000000-0000-4000-8000-000000000004';
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: '00000000-0000-4000-8000-000000000005',
} as UserWorkspaceAuthContext;
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

type ComposeService = {
  verifyCreatorOrigin: (input: {
    creatorId?: string;
    to: string[];
    authContext: UserWorkspaceAuthContext;
  }) => Promise<string | null>;
  recordAcceptedSend: (
    input: Record<string, unknown>,
  ) => Promise<string | null>;
  bindThreadCreator: (
    workspaceId: string,
    threadId: string,
    creatorId: string,
  ) => Promise<void>;
};

const loadService = ():
  | (new (...args: never[]) => ComposeService)
  | undefined => {
  try {
    return require('../myah-compose-email-send.service')
      .MyahComposeEmailSendService;
  } catch {
    return undefined;
  }
};

const buildHarness = () => {
  const Service = loadService();

  expect(Service).toBeDefined();
  const findOne = jest.fn().mockResolvedValue({
    id: creatorId,
    email: 'CREATOR@example.test',
  });
  const query = jest
    .fn()
    .mockImplementation(async (sql: string) =>
      sql.includes('FROM core."messageChannel"')
        ? [{ handle: 'ALIAS@EXAMPLE.TEST', type: 'EMAIL' }]
        : [{ id: receiptId }],
    );
  const transaction = jest.fn(async (callback) =>
    callback({ queryRunner: { query, isTransactionActive: true } }),
  );
  const withPreparedSourceMutationInTransaction = jest.fn(async ({ mutate }) =>
    mutate(),
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getRepository: jest.fn().mockResolvedValue({ findOne }),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ transaction }),
  };

  return {
    service: new Service!(
      orm as never,
      { withPreparedSourceMutationInTransaction } as never,
    ),
    withPreparedSourceMutationInTransaction,
    findOne,
    query,
    transaction,
    orm,
  };
};

const acceptedSend = () => ({
  workspaceId,
  messageChannelId: channelId,
  connectedAccountId: '00000000-0000-4000-8000-000000000006',
  userWorkspaceId: authContext.userWorkspaceId,
  connectedAccountHandle: ' SENDER@EXAMPLE.TEST ',
  providerHeaderMessageId: '<accepted@example.test>',
  providerMessageExternalId: 'provider-1',
  resolvedThreadExternalId: 'thread-1',
  to: [' CREATOR@EXAMPLE.TEST ', 'cc@example.test'],
  creatorId,
  sendStartedAt: new Date('2026-09-29T12:00:00Z'),
  authContext,
});

describe('MyahComposeEmailSendService', () => {
  it('records an accepted send in its own transaction with normalized To and idempotent header key', async () => {
    const { service, query, transaction } = buildHarness();

    expect(await service.recordAcceptedSend(acceptedSend())).toBe(receiptId);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][0]).toContain(
      'ON CONFLICT ("workspaceId", "messageChannelId", "providerHeaderMessageId") DO NOTHING',
    );
    expect(query.mock.calls[1][1]).toEqual(
      expect.arrayContaining([
        'alias@example.test',
        ['creator@example.test', 'cc@example.test'],
      ]),
    );
  });

  it('treats a duplicate provider header as a no-op', async () => {
    const { service, query } = buildHarness();

    query
      .mockImplementationOnce(async () => [
        { handle: 'alias@example.test', type: 'EMAIL' },
      ])
      .mockResolvedValueOnce([]);

    expect(await service.recordAcceptedSend(acceptedSend())).toBeNull();
  });

  it('keeps a readable, undeleted Creator whose email is in To', async () => {
    const { service, orm, findOne } = buildHarness();

    expect(
      await service.verifyCreatorOrigin({
        creatorId,
        to: ['creator@example.test'],
        authContext,
      }),
    ).toBe(creatorId);
    expect(orm.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'creator',
      rolePermissionConfig,
    );
    expect(findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: creatorId,
        deletedAt: expect.anything(),
      }),
      select: { id: true, email: true },
    });
  });

  it.each([
    ['a To mismatch', { email: 'someone@example.test' }],
    ['a missing Creator', null],
    [
      'a deleted Creator',
      { email: 'creator@example.test', deletedAt: new Date() },
    ],
  ])('silently drops %s', async (_reason, creator) => {
    const { service, findOne } = buildHarness();

    findOne.mockResolvedValueOnce(creator);

    expect(
      await service.verifyCreatorOrigin({
        creatorId,
        to: ['creator@example.test'],
        authContext,
      }),
    ).toBeNull();
  });

  it('silently drops a Creator when the caller lacks permission to read it', async () => {
    const { service, orm } = buildHarness();

    orm.getRepository.mockRejectedValueOnce(new Error('field not readable'));

    expect(
      await service.verifyCreatorOrigin({
        creatorId,
        to: ['creator@example.test'],
        authContext,
      }),
    ).toBeNull();
  });

  it('uses the prepared source and Creator locks for send-time binding without overwriting a human link', async () => {
    const { service, query, withPreparedSourceMutationInTransaction } =
      buildHarness();
    query.mockImplementation(async (sql: string) =>
      sql.includes('to_regclass') ? [{ ready: true }] : [],
    );

    await service.bindThreadCreator(workspaceId, 'thread-id', creatorId);

    expect(withPreparedSourceMutationInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        sourceRecordIds: ['thread-id'],
        nextCreatorIds: [creatorId],
      }),
    );
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      '"creatorId" IS NULL',
    );
  });

  it('does not read a Creator when no origin was supplied', async () => {
    const { service, orm } = buildHarness();

    expect(
      await service.verifyCreatorOrigin({
        to: ['creator@example.test'],
        authContext,
      }),
    ).toBeNull();
    expect(orm.getRepository).not.toHaveBeenCalled();
  });
});
