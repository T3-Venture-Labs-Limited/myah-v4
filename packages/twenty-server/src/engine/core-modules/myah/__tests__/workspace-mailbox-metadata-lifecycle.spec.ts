import { EntityNotFoundError, type Repository } from 'typeorm';

import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { type AppOAuthRevokeService } from 'src/engine/core-modules/application/connection-provider/refresh/services/app-oauth-revoke.service';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountExceptionCode } from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { type WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';

describe('workspace mailbox metadata lifecycle', () => {
  const myahAccount = {
    connectionParameters: { encrypted: true },
    id: 'myah-account-id',
    name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
    userWorkspaceId: 'removed-user-workspace-id',
    visibility: 'workspace',
    workspaceId: 'workspace-id',
  } as unknown as ConnectedAccountEntity;
  const personalAccount = {
    id: 'personal-account-id',
    name: 'Personal account',
    userWorkspaceId: 'removed-user-workspace-id',
    visibility: 'user',
    workspaceId: 'workspace-id',
  } as ConnectedAccountEntity;
  const entityManager = { update: jest.fn() };
  const repository = {
    delete: jest.fn(),
    find: jest.fn(),
    findOneOrFail: jest.fn(),
    manager: {
      transaction: jest.fn(
        async (operation: (manager: typeof entityManager) => unknown) =>
          operation(entityManager),
      ),
    },
  };
  const messageChannelRepository = { find: jest.fn().mockResolvedValue([]) };
  const calendarChannelRepository = { find: jest.fn().mockResolvedValue([]) };
  const appOAuthRevokeService = { revokeIfApp: jest.fn() };
  const workspaceEventEmitter = { emitCustomBatchEvent: jest.fn() };
  const service = new ConnectedAccountMetadataService(
    repository as unknown as Repository<ConnectedAccountEntity>,
    calendarChannelRepository as unknown as Repository<CalendarChannelEntity>,
    messageChannelRepository as unknown as Repository<MessageChannelEntity>,
    appOAuthRevokeService as unknown as AppOAuthRevokeService,
    workspaceEventEmitter as unknown as WorkspaceEventEmitter,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    calendarChannelRepository.find.mockResolvedValue([]);
    messageChannelRepository.find.mockResolvedValue([]);
  });

  it('denies generic deletion but allows dedicated guarded revocation', async () => {
    repository.findOneOrFail.mockResolvedValue(myahAccount);

    await expect(
      service.delete({
        id: myahAccount.id,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toThrow('Connected account not found');
    expect(repository.delete).not.toHaveBeenCalled();

    await expect(
      service.delete({
        allowWorkspaceMailbox: true,
        id: myahAccount.id,
        workspaceId: 'workspace-id',
      }),
    ).resolves.toBe(myahAccount);
    expect(repository.delete).toHaveBeenCalledWith({
      id: myahAccount.id,
      workspaceId: 'workspace-id',
    });
  });

  it('normalizes disappearance before guarded deletion', async () => {
    repository.findOneOrFail.mockRejectedValue(
      new EntityNotFoundError(ConnectedAccountEntity, {
        id: myahAccount.id,
        workspaceId: 'workspace-id',
      }),
    );

    await expect(
      service.delete({
        allowWorkspaceMailbox: true,
        id: myahAccount.id,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toMatchObject({
      code: ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
    });
  });

  it('normalizes disappearance during guarded deletion', async () => {
    repository.findOneOrFail.mockResolvedValue(myahAccount);
    repository.delete.mockResolvedValue({ affected: 0, raw: [] });

    await expect(
      service.delete({
        allowWorkspaceMailbox: true,
        id: myahAccount.id,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toMatchObject({
      code: ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
    });
  });

  it('transfers only the technical owner for the shared mailbox', async () => {
    repository.find.mockResolvedValue([myahAccount, personalAccount]);

    await service.transferOwnership({
      fromUserWorkspaceId: 'removed-user-workspace-id',
      toUserWorkspaceId: 'custodian-user-workspace-id',
      workspaceId: 'workspace-id',
    });

    expect(entityManager.update).toHaveBeenCalledWith(
      ConnectedAccountEntity,
      expect.objectContaining({ workspaceId: 'workspace-id' }),
      { userWorkspaceId: 'custodian-user-workspace-id' },
    );
    expect(entityManager.update).toHaveBeenCalledWith(
      ConnectedAccountEntity,
      expect.objectContaining({ workspaceId: 'workspace-id' }),
      expect.objectContaining({
        accessToken: null,
        archivedAt: expect.any(Date),
        connectionParameters: null,
        refreshToken: null,
        userWorkspaceId: 'custodian-user-workspace-id',
      }),
    );
    expect(entityManager.update).toHaveBeenCalledWith(
      MessageChannelEntity,
      expect.objectContaining({ workspaceId: 'workspace-id' }),
      { isSyncEnabled: false },
    );
    expect(entityManager.update).toHaveBeenCalledWith(
      CalendarChannelEntity,
      expect.objectContaining({ workspaceId: 'workspace-id' }),
      { isSyncEnabled: false },
    );
    expect(appOAuthRevokeService.revokeIfApp).toHaveBeenCalledTimes(1);
    expect(appOAuthRevokeService.revokeIfApp).toHaveBeenCalledWith(
      personalAccount,
    );
  });
});
