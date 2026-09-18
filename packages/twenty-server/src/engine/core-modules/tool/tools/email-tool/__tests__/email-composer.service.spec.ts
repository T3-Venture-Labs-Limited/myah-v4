import { ConnectedAccountProvider } from 'twenty-shared/types';
import { DataSource, type QueryRunner } from 'typeorm';

import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000000';
const CONNECTED_ACCOUNT_ID = '20202020-1111-4111-8111-111111111111';
const MESSAGE_CHANNEL_ID = '20202020-2222-4222-8222-222222222222';

const buildAccount = (id: string) => ({
  id,
  handle: 'tim@apple.dev',
  provider: ConnectedAccountProvider.GOOGLE,
  scopes: ['email'],
  connectionParameters: null,
  messageChannels: [{ id: MESSAGE_CHANNEL_ID, handle: 'tim@apple.dev' }],
});

const buildTransactionalAccountRow = () => ({
  id: CONNECTED_ACCOUNT_ID,
  workspaceId: WORKSPACE_ID,
  handle: 'tim@apple.dev',
  provider: ConnectedAccountProvider.GOOGLE,
  scopes: ['email'],
  hasImapConfiguration: false,
  hasSmtpConfiguration: false,
  messageChannels: [{ id: MESSAGE_CHANNEL_ID, handle: 'tim@apple.dev' }],
});

const buildWorkspaceTransactionManager = (query: jest.Mock) => {
  const dataSource = new DataSource({
    type: 'postgres',
    entities: [],
  }) as GlobalWorkspaceDataSource;
  const queryRunnerShape = {
    connection: dataSource,
    isTransactionActive: true,
    isReleased: false,
    query,
    manager: undefined as unknown as WorkspaceEntityManager,
  };
  const queryRunner = queryRunnerShape as unknown as QueryRunner;
  const transactionManager = new WorkspaceEntityManager(
    dataSource,
    queryRunner,
  );

  queryRunnerShape.manager = transactionManager;

  return { dataSource, transactionManager };
};

const baseParams = {
  recipients: { to: 'test@example.com' },
  subject: 'Subject',
  body: '<p>body</p>',
  files: [],
};

const context = { workspaceId: WORKSPACE_ID };

describe('EmailComposerService connected account resolution', () => {
  let service: EmailComposerService;
  let connectedAccountRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let globalWorkspaceOrmManager: {
    executeInWorkspaceContext: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    connectedAccountRepository = { findOne: jest.fn(), find: jest.fn() };
    globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback) => callback()),
      getRepository: jest.fn(),
    };

    service = new EmailComposerService(
      globalWorkspaceOrmManager as never,
      connectedAccountRepository as never,
      { find: jest.fn() } as never,
      {} as never,
    );
  });

  it('uses the connected account matching the provided id', async () => {
    connectedAccountRepository.findOne.mockResolvedValue(
      buildAccount(CONNECTED_ACCOUNT_ID),
    );

    const result = await service.composeEmail(
      { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.connectedAccount.id).toBe(
      CONNECTED_ACCOUNT_ID,
    );
    expect(connectedAccountRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTED_ACCOUNT_ID, workspaceId: WORKSPACE_ID },
      }),
    );
  });

  it('uses the active workspace runner when core entity metadata is unavailable', async () => {
    const account = buildAccount(CONNECTED_ACCOUNT_ID);
    connectedAccountRepository.findOne.mockResolvedValue(account);
    const ambient = await service.composeEmail(
      { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
      context,
    );
    connectedAccountRepository.findOne.mockClear();
    globalWorkspaceOrmManager.executeInWorkspaceContext.mockClear();
    const query = jest.fn().mockResolvedValue([buildTransactionalAccountRow()]);
    const { dataSource, transactionManager } =
      buildWorkspaceTransactionManager(query);

    expect(dataSource.hasMetadata(ConnectedAccountEntity)).toBe(false);

    const transactional = await service.composeEmail(
      { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
      context,
      transactionManager,
    );

    expect(transactional).toMatchObject({
      success: true,
      data: {
        connectedAccount: {
          id: CONNECTED_ACCOUNT_ID,
          workspaceId: WORKSPACE_ID,
          handle: 'tim@apple.dev',
          provider: ConnectedAccountProvider.GOOGLE,
        },
        messageChannelId: MESSAGE_CHANNEL_ID,
      },
    });
    expect(transactional.success && ambient.success).toBe(true);
    if (transactional.success && ambient.success) {
      expect({
        sanitizedSubject: transactional.data.sanitizedSubject,
        sanitizedHtmlBody: transactional.data.sanitizedHtmlBody,
        plainTextBody: transactional.data.plainTextBody,
      }).toEqual({
        sanitizedSubject: ambient.data.sanitizedSubject,
        sanitizedHtmlBody: ambient.data.sanitizedHtmlBody,
        plainTextBody: ambient.data.plainTextBody,
      });
    }
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM core."connectedAccount"'),
      [CONNECTED_ACCOUNT_ID, WORKSPACE_ID],
    );
    expect(query.mock.calls[0][0]).toContain(
      `ca."connectionParameters" ? 'IMAP'`,
    );
    expect(query.mock.calls[0][0]).not.toContain(
      'ca."connectionParameters" AS',
    );
    expect(connectedAccountRepository.findOne).not.toHaveBeenCalled();
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('uses the same runner to resolve a missing transactional account id', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: CONNECTED_ACCOUNT_ID }])
      .mockResolvedValueOnce([buildTransactionalAccountRow()]);
    const { transactionManager } = buildWorkspaceTransactionManager(query);

    await expect(
      service.composeEmail(baseParams, context, transactionManager),
    ).resolves.toMatchObject({
      success: true,
      data: { connectedAccount: { id: CONNECTED_ACCOUNT_ID } },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('"archivedAt" IS NULL'),
      [WORKSPACE_ID],
    ]);
  });

  it('supports a transaction-scoped SMTP-only account without returning connection parameters', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        ...buildTransactionalAccountRow(),
        provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
        hasSmtpConfiguration: true,
        messageChannels: [],
      },
    ]);
    const { transactionManager } = buildWorkspaceTransactionManager(query);

    await expect(
      service.composeEmail(
        { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
        context,
        transactionManager,
      ),
    ).resolves.toMatchObject({
      success: true,
      data: {
        connectedAccount: { connectionParameters: null },
        messageChannelId: undefined,
        shouldPersistMessage: false,
      },
    });
  });

  it.each([
    ['missing account', []],
    [
      'duplicate projection',
      [buildTransactionalAccountRow(), buildTransactionalAccountRow()],
    ],
    [
      'workspace mismatch',
      [
        {
          ...buildTransactionalAccountRow(),
          workspaceId: CONNECTED_ACCOUNT_ID,
        },
      ],
    ],
  ])('fails closed for a %s transactional row set', async (_name, rows) => {
    const query = jest.fn().mockResolvedValue(rows);
    const { transactionManager } = buildWorkspaceTransactionManager(query);

    await expect(
      service.composeEmail(
        { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
        context,
        transactionManager,
      ),
    ).rejects.toThrow('No connected account found for id');
  });

  it('requires SMTP when a transactional IMAP/SMTP account has no IMAP configuration', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        ...buildTransactionalAccountRow(),
        provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
        messageChannels: [],
      },
    ]);
    const { transactionManager } = buildWorkspaceTransactionManager(query);

    await expect(
      service.composeEmail(
        { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
        context,
        transactionManager,
      ),
    ).rejects.toThrow('SMTP is not configured');
  });

  it('rejects transactional attachments before ambient metadata or byte loading', async () => {
    const query = jest.fn().mockResolvedValue([buildTransactionalAccountRow()]);
    const { transactionManager } = buildWorkspaceTransactionManager(query);

    await expect(
      service.composeEmail(
        {
          ...baseParams,
          connectedAccountId: CONNECTED_ACCOUNT_ID,
          files: [{ id: 'file', name: 'file.txt' }],
        } as never,
        context,
        transactionManager,
      ),
    ).rejects.toThrow('attachments are unavailable');
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('throws when the id is not a valid UUID', async () => {
    await expect(
      service.composeEmail(
        { ...baseParams, connectedAccountId: 'not-a-uuid' },
        context,
      ),
    ).rejects.toThrow('Connected account id is not a valid UUID');
  });

  it('throws when no connected account matches the provided id', async () => {
    connectedAccountRepository.findOne.mockResolvedValue(null);

    await expect(
      service.composeEmail(
        { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
        context,
      ),
    ).rejects.toThrow(`No connected account found for id`);
  });
});
