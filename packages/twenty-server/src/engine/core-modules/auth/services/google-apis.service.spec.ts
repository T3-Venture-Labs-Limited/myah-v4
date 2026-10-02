import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  CalendarChannelVisibility,
  ConnectedAccountProvider,
  MessageChannelSyncStage,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { CreateConnectedAccountService } from 'src/engine/core-modules/auth/services/create-connected-account.service';
import { CreateMessageChannelService } from 'src/engine/core-modules/auth/services/create-message-channel.service';
import { GoogleAPIScopesService } from 'src/engine/core-modules/auth/services/google-apis-scopes';
import { GoogleApisServiceAvailabilityService } from 'src/engine/core-modules/auth/services/google-apis-service-availability.service';
import { GoogleAPIsService } from 'src/engine/core-modules/auth/services/google-apis.service';
import { UpdateConnectedAccountOnReconnectService } from 'src/engine/core-modules/auth/services/update-connected-account-on-reconnect.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { EmailAliasManagerService } from 'src/modules/connected-account/email-alias-manager/services/email-alias-manager.service';
import { AccountsToReconnectService } from 'src/modules/connected-account/services/accounts-to-reconnect.service';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import { SyncMessageFoldersService } from 'src/modules/messaging/message-folder-manager/services/sync-message-folders.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid'),
}));

describe('GoogleAPIsService', () => {
  let service: GoogleAPIsService;
  let messagingChannelSyncStatusService: MessageChannelSyncStatusService;
  let createMessageChannelService: CreateMessageChannelService;

  const mockConnectedAccountRepository = {
    findOne: jest.fn(),
  };

  const mockTransactionManager = {
    getRepository: jest.fn().mockReturnValue({ save: jest.fn() }),
  };

  const mockMessageChannelRepository = {
    find: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
    manager: {
      transaction: jest.fn((callback) => callback(mockTransactionManager)),
    },
  };

  const mockUserWorkspaceRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'user-workspace-id' }),
  };

  const mockWorkspaceMemberRepository = {
    findOneOrFail: jest.fn(),
    findOne: jest.fn().mockResolvedValue({
      id: 'workspace-member-id',
      userId: 'user-id',
    }),
  };

  const mockTwentyConfigService = {
    get: jest.fn(),
  };

  const mockMessageQueueService = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAPIsService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getRepository: jest
              .fn()
              .mockImplementation((_workspaceId, entity) => {
                if (entity === 'workspaceMember')
                  return mockWorkspaceMemberRepository;

                return {};
              }),
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((fn: () => any, _authContext?: any) => fn()),
          },
        },
        {
          provide: getRepositoryToken(ObjectMetadataEntity),
          useValue: {
            findOneOrFail: jest.fn(),
          },
        },
        {
          provide: TwentyConfigService,
          useValue: mockTwentyConfigService,
        },
        {
          provide: GoogleAPIScopesService,
          useValue: {
            getScopesFromGoogleAccessTokenAndCheckIfExpectedScopesArePresent:
              jest.fn().mockResolvedValue({
                scopes: [],
                isValid: true,
              }),
          },
        },
        {
          provide: GoogleApisServiceAvailabilityService,
          useValue: {
            checkServicesAvailability: jest.fn().mockResolvedValue({
              isMessagingAvailable: true,
            }),
          },
        },
        {
          provide: MessageChannelSyncStatusService,
          useValue: {
            resetAndMarkAsMessagesListFetchPending: jest.fn(),
          },
        },
        {
          provide: CreateConnectedAccountService,
          useValue: {
            createConnectedAccount: jest.fn(),
          },
        },
        {
          provide: CreateMessageChannelService,
          useValue: {
            createMessageChannel: jest.fn(),
          },
        },
        {
          provide: UpdateConnectedAccountOnReconnectService,
          useValue: {
            updateConnectedAccountOnReconnect: jest.fn(),
          },
        },
        {
          provide: AccountsToReconnectService,
          useValue: {
            removeAccountToReconnect: jest.fn(),
          },
        },
        {
          provide: getQueueToken(MessageQueue.messagingQueue),
          useValue: mockMessageQueueService,
        },
        {
          provide: FeatureFlagService,
          useValue: {
            isFeatureEnabled: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: SyncMessageFoldersService,
          useValue: {
            syncMessageFolders: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: EmailAliasManagerService,
          useValue: {
            refreshHandleAliases: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: mockConnectedAccountRepository,
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: mockUserWorkspaceRepository,
        },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: mockMessageChannelRepository,
        },
      ],
    }).compile();

    service = module.get<GoogleAPIsService>(GoogleAPIsService);
    messagingChannelSyncStatusService =
      module.get<MessageChannelSyncStatusService>(
        MessageChannelSyncStatusService,
      );
    createMessageChannelService = module.get<CreateMessageChannelService>(
      CreateMessageChannelService,
    );
  });

  describe('refreshGoogleRefreshToken', () => {
    it('should reset failed message channels on reconnect', async () => {
      mockTwentyConfigService.get.mockImplementation((key) => {
        if (key === 'MESSAGING_PROVIDER_GMAIL_ENABLED') return true;

        return false;
      });

      const existingConnectedAccount = {
        id: 'existing-account-id',
        handle: 'test@example.com',
        userWorkspaceId: 'user-workspace-id',
        provider: ConnectedAccountProvider.GOOGLE,
      } as ConnectedAccountEntity;

      mockConnectedAccountRepository.findOne.mockResolvedValue(
        existingConnectedAccount,
      );

      mockWorkspaceMemberRepository.findOne.mockResolvedValue({
        id: 'workspace-member-id',
        userId: 'user-id',
      });

      const failedMessageChannel = {
        id: 'message-channel-id',
        connectedAccountId: 'existing-account-id',
        syncStage: MessageChannelSyncStage.FAILED,
      };

      mockMessageChannelRepository.find.mockResolvedValue([
        failedMessageChannel,
      ]);

      await service.refreshGoogleRefreshToken({
        handle: 'test@example.com',
        userId: 'user-id',
        workspaceMemberId: 'workspace-member-id',
        workspaceId: 'workspace-id',
        accessToken: 'new-access-token' as PlaintextString,
        refreshToken: 'new-refresh-token' as PlaintextString,
        calendarVisibility: CalendarChannelVisibility.SHARE_EVERYTHING,
        messageVisibility: MessageChannelVisibility.SHARE_EVERYTHING,
      });

      expect(
        messagingChannelSyncStatusService.resetAndMarkAsMessagesListFetchPending,
      ).toHaveBeenCalledWith([failedMessageChannel.id], 'workspace-id');

      expect(
        createMessageChannelService.createMessageChannel,
      ).not.toHaveBeenCalled();
    });
  });
});
