import { ConnectedAccountProvider } from 'twenty-shared/types';

import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000000';
const CONNECTED_ACCOUNT_ID = '20202020-1111-4111-8111-111111111111';

const buildAccount = (id: string) => ({
  id,
  handle: 'tim@apple.dev',
  provider: ConnectedAccountProvider.GOOGLE,
  scopes: ['email'],
  connectionParameters: null,
  messageChannels: [{ id: 'message-channel-1', handle: 'tim@apple.dev' }],
});

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

  it('uses only the supplied active manager and preserves composed bytes', async () => {
    const account = buildAccount(CONNECTED_ACCOUNT_ID);
    connectedAccountRepository.findOne.mockResolvedValue(account);
    const ambient = await service.composeEmail(
      { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
      context,
    );
    connectedAccountRepository.findOne.mockClear();
    globalWorkspaceOrmManager.executeInWorkspaceContext.mockClear();
    const transactionRepository = {
      findOne: jest.fn().mockResolvedValue(account),
    };
    const transactionManager = {
      getRepository: jest.fn(() => transactionRepository),
      queryRunner: {
        isTransactionActive: true,
        isReleased: false,
      },
    } as any;
    transactionManager.queryRunner.manager = transactionManager;

    const transactional = await service.composeEmail(
      { ...baseParams, connectedAccountId: CONNECTED_ACCOUNT_ID },
      context,
      transactionManager,
    );

    expect(transactional).toEqual(ambient);
    expect(transactionRepository.findOne).toHaveBeenCalledTimes(1);
    expect(connectedAccountRepository.findOne).not.toHaveBeenCalled();
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('rejects transactional attachments before ambient metadata or byte loading', async () => {
    const transactionRepository = {
      findOne: jest.fn().mockResolvedValue(buildAccount(CONNECTED_ACCOUNT_ID)),
    };
    const transactionManager = {
      getRepository: jest.fn(() => transactionRepository),
      queryRunner: { isTransactionActive: true, isReleased: false },
    } as any;
    transactionManager.queryRunner.manager = transactionManager;

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
