import { UpdateConnectedAccountOnReconnectService } from 'src/engine/core-modules/auth/services/update-connected-account-on-reconnect.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

it('updates recovery state and invalidates with the supplied transaction manager', async () => {
  const calls: string[] = [];
  const repository = {
    update: jest.fn(async () => calls.push('update')),
  };
  const transactionManager = {
    getRepository: jest.fn((entity) => {
      expect(entity).toBe(ConnectedAccountEntity);
      return repository;
    }),
    queryRunner: {
      isReleased: false,
      isTransactionActive: true,
      query: jest.fn(async (sql: string) =>
        calls.push(
          sql.includes('campaignForecastHead') ? 'invalidate' : 'other',
        ),
      ),
    },
  };
  const service = new UpdateConnectedAccountOnReconnectService(
    { executeInWorkspaceContext: jest.fn((operation) => operation()) } as never,
    {
      encryptTokenPair: jest.fn(() => ({
        encryptedAccessToken: 'a',
        encryptedRefreshToken: 'r',
      })),
    } as never,
  );

  await service.updateConnectedAccountOnReconnect({
    accessToken: 'access' as never,
    connectedAccountId: '22222222-2222-4222-8222-222222222222',
    refreshToken: 'refresh' as never,
    scopes: ['Mail.Send'],
    transactionManager: transactionManager as never,
    workspaceId: '11111111-1111-4111-8111-111111111111',
  });

  expect(repository.update).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: '11111111-1111-4111-8111-111111111111',
    }),
    expect.objectContaining({ authFailedAt: null }),
  );
  expect(calls).toEqual(['update', 'invalidate']);
});
