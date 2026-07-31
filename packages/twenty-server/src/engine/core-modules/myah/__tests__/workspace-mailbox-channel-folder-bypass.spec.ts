import { type Repository } from 'typeorm';
import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
} from 'twenty-shared/types';

import { type EmailingDomainService } from 'src/engine/core-modules/emailing-domain/services/emailing-domain.service';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { type UpdateMessageChannelInput } from 'src/engine/metadata-modules/message-channel/dtos/update-message-channel.input';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessageChannelMetadataService } from 'src/engine/metadata-modules/message-channel/message-channel-metadata.service';
import {
  MessageChannelException,
  MessageChannelExceptionCode,
} from 'src/engine/metadata-modules/message-channel/message-channel.exception';
import { MessageChannelResolver } from 'src/engine/metadata-modules/message-channel/resolvers/message-channel.resolver';
import { type UpdateMessageFolderInput } from 'src/engine/metadata-modules/message-folder/dtos/update-message-folder.input';
import { type MessageFolderEntity } from 'src/engine/metadata-modules/message-folder/entities/message-folder.entity';
import { MessageFolderMetadataService } from 'src/engine/metadata-modules/message-folder/message-folder-metadata.service';
import {
  MessageFolderException,
  MessageFolderExceptionCode,
} from 'src/engine/metadata-modules/message-folder/message-folder.exception';
import { MessageFolderResolver } from 'src/engine/metadata-modules/message-folder/resolvers/message-folder.resolver';
import { type WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { type MessagingProcessGroupEmailActionsService } from 'src/modules/messaging/message-import-manager/services/messaging-process-group-email-actions.service';

const workspace = { id: 'workspace-id' } as WorkspaceEntity;
const myahAccount = {
  id: 'account-id',
  name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
  provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
  visibility: 'workspace',
  workspaceId: workspace.id,
} as ConnectedAccountEntity;
const personalAccount = {
  ...myahAccount,
  id: 'personal-account-id',
  name: 'Personal account',
  visibility: 'user',
} as ConnectedAccountEntity;
const myahChannel = {
  connectedAccountId: myahAccount.id,
  excludeGroupEmails: false,
  id: 'message-channel-id',
  pendingGroupEmailsAction: MessageChannelPendingGroupEmailsAction.NONE,
  syncStage: MessageChannelSyncStage.PENDING_CONFIGURATION,
  workspaceId: workspace.id,
} as MessageChannelEntity;
const myahFolder = {
  id: 'message-folder-id',
  isSynced: true,
  messageChannelId: myahChannel.id,
  workspaceId: workspace.id,
} as MessageFolderEntity;

describe('workspace mailbox channel and folder mutation boundaries', () => {
  it('rejects the protected channel in the generic resolver', async () => {
    const messageChannelMetadataService = {
      update: jest.fn(),
      verifyOwnership: jest.fn(async ({ allowWorkspaceMailbox }) => {
        if (allowWorkspaceMailbox === false) {
          throw new MessageChannelException(
            'Message channel not found',
            MessageChannelExceptionCode.MESSAGE_CHANNEL_NOT_FOUND,
          );
        }

        return myahChannel;
      }),
    };
    const resolver = new MessageChannelResolver(
      messageChannelMetadataService as unknown as MessageChannelMetadataService,
      {} as ConnectedAccountMetadataService,
      {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<MessageFolderEntity>,
      {
        markMessageChannelAsPendingGroupEmailsAction: jest.fn(),
      } as unknown as MessagingProcessGroupEmailActionsService,
    );

    await expect(
      resolver.updateMessageChannel(
        {
          id: myahChannel.id,
          update: { isSyncEnabled: false },
        } as UpdateMessageChannelInput,
        workspace,
        'user-workspace-id',
      ),
    ).rejects.toMatchObject({
      code: MessageChannelExceptionCode.MESSAGE_CHANNEL_NOT_FOUND,
    });

    expect(messageChannelMetadataService.update).not.toHaveBeenCalled();
  });

  it('rejects the protected channel at the metadata update boundary', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(myahChannel),
      findOneOrFail: jest.fn().mockResolvedValue(myahChannel),
      update: jest.fn(),
    };
    const service = new MessageChannelMetadataService(
      repository as unknown as Repository<MessageChannelEntity>,
      {
        findById: jest.fn().mockResolvedValue(myahAccount),
      } as unknown as ConnectedAccountMetadataService,
      {} as TwentyConfigService,
      {} as EmailingDomainService,
      {} as WorkspaceEventEmitter,
    );

    await expect(
      service.update({
        data: { isSyncEnabled: false },
        id: myahChannel.id,
        workspaceId: workspace.id,
      }),
    ).rejects.toMatchObject({
      code: MessageChannelExceptionCode.MESSAGE_CHANNEL_NOT_FOUND,
    });

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('preserves generic updates for personal channels', async () => {
    const personalChannel = {
      ...myahChannel,
      connectedAccountId: personalAccount.id,
      id: 'personal-message-channel-id',
    } as MessageChannelEntity;
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue(personalChannel),
      update: jest.fn(),
    };
    const service = new MessageChannelMetadataService(
      repository as unknown as Repository<MessageChannelEntity>,
      {
        findById: jest.fn().mockResolvedValue(personalAccount),
      } as unknown as ConnectedAccountMetadataService,
      {} as TwentyConfigService,
      {} as EmailingDomainService,
      {} as WorkspaceEventEmitter,
    );

    await expect(
      service.update({
        data: { isSyncEnabled: false },
        id: personalChannel.id,
        workspaceId: workspace.id,
      }),
    ).resolves.toBe(personalChannel);

    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('rejects singular and bulk folder updates in the generic resolver', async () => {
    const messageFolderMetadataService = {
      setSyncStatus: jest.fn(),
      update: jest.fn(),
      verifyOwnership: jest.fn(async ({ allowWorkspaceMailbox }) => {
        if (allowWorkspaceMailbox === false) {
          throw new MessageFolderException(
            'Message folder not found',
            MessageFolderExceptionCode.MESSAGE_FOLDER_NOT_FOUND,
          );
        }

        return myahFolder;
      }),
    };
    const resolver = new MessageFolderResolver(
      messageFolderMetadataService as unknown as MessageFolderMetadataService,
    );

    await expect(
      resolver.updateMessageFolder(
        {
          id: myahFolder.id,
          update: { isSynced: false },
        } as UpdateMessageFolderInput,
        workspace,
        'user-workspace-id',
      ),
    ).rejects.toMatchObject({
      code: MessageFolderExceptionCode.MESSAGE_FOLDER_NOT_FOUND,
    });
    await expect(
      resolver.updateMessageFolders(
        {
          ids: [myahFolder.id],
          update: { isSynced: false },
        },
        workspace,
        'user-workspace-id',
      ),
    ).rejects.toMatchObject({
      code: MessageFolderExceptionCode.MESSAGE_FOLDER_NOT_FOUND,
    });

    expect(messageFolderMetadataService.update).not.toHaveBeenCalled();
    expect(messageFolderMetadataService.setSyncStatus).not.toHaveBeenCalled();
  });

  it('rejects singular and bulk folder writes at the metadata boundary', async () => {
    const manager = { find: jest.fn(), update: jest.fn() };
    const repository = {
      find: jest.fn().mockResolvedValue([myahFolder]),
      findOne: jest.fn().mockResolvedValue(myahFolder),
      findOneOrFail: jest.fn().mockResolvedValue(myahFolder),
      manager: {
        transaction: jest.fn(async (operation) => operation(manager)),
      },
      update: jest.fn(),
    };
    const service = new MessageFolderMetadataService(
      repository as unknown as Repository<MessageFolderEntity>,
      {} as MessageChannelMetadataService,
      {} as ConnectedAccountMetadataService,
    );

    await expect(
      service.update({
        data: { isSynced: false },
        id: myahFolder.id,
        workspaceId: workspace.id,
      }),
    ).rejects.toMatchObject({
      code: MessageFolderExceptionCode.MESSAGE_FOLDER_NOT_FOUND,
    });
    await expect(
      service.setSyncStatus({
        data: { isSynced: false },
        ids: [myahFolder.id],
        workspaceId: workspace.id,
      }),
    ).rejects.toMatchObject({
      code: MessageFolderExceptionCode.MESSAGE_FOLDER_NOT_FOUND,
    });

    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('preserves owner-only reads for workspace-visible folders', async () => {
    const messageChannelMetadataService = {
      findById: jest.fn().mockResolvedValue(myahChannel),
      verifyOwnership: jest.fn().mockResolvedValue(myahChannel),
    };
    const service = new MessageFolderMetadataService(
      {
        findOne: jest.fn().mockResolvedValue(myahFolder),
      } as unknown as Repository<MessageFolderEntity>,
      messageChannelMetadataService as unknown as MessageChannelMetadataService,
      {
        getUserConnectedAccountIds: jest.fn().mockResolvedValue([]),
      } as unknown as ConnectedAccountMetadataService,
    );

    await expect(
      service.verifyOwnership({
        id: myahFolder.id,
        userWorkspaceId: 'non-owner-user-workspace-id',
        workspaceId: workspace.id,
      }),
    ).rejects.toMatchObject({
      code: MessageFolderExceptionCode.MESSAGE_FOLDER_OWNERSHIP_VIOLATION,
    });

    expect(
      messageChannelMetadataService.verifyOwnership,
    ).not.toHaveBeenCalled();
  });

  it('preserves reads for folders owned by the personal account', async () => {
    const personalChannel = {
      ...myahChannel,
      connectedAccountId: personalAccount.id,
      id: 'personal-message-channel-id',
    } as MessageChannelEntity;
    const personalFolder = {
      ...myahFolder,
      id: 'personal-message-folder-id',
      messageChannelId: personalChannel.id,
    } as MessageFolderEntity;
    const service = new MessageFolderMetadataService(
      {
        findOne: jest.fn().mockResolvedValue(personalFolder),
      } as unknown as Repository<MessageFolderEntity>,
      {
        findById: jest.fn().mockResolvedValue(personalChannel),
      } as unknown as MessageChannelMetadataService,
      {
        getUserConnectedAccountIds: jest
          .fn()
          .mockResolvedValue([personalAccount.id]),
      } as unknown as ConnectedAccountMetadataService,
    );

    await expect(
      service.verifyOwnership({
        id: personalFolder.id,
        userWorkspaceId: 'user-workspace-id',
        workspaceId: workspace.id,
      }),
    ).resolves.toBe(personalFolder);
  });

  it('preserves generic updates for personal folders', async () => {
    const personalFolder = {
      ...myahFolder,
      id: 'personal-message-folder-id',
    } as MessageFolderEntity;
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue(personalFolder),
      manager: { transaction: jest.fn() },
      update: jest.fn(),
    };
    const service = new MessageFolderMetadataService(
      repository as unknown as Repository<MessageFolderEntity>,
      {} as MessageChannelMetadataService,
      {} as ConnectedAccountMetadataService,
    );

    await expect(
      service.update({
        data: { isSynced: false },
        id: personalFolder.id,
        workspaceId: workspace.id,
      }),
    ).resolves.toBe(personalFolder);

    expect(repository.update).toHaveBeenCalledTimes(1);
  });
});
