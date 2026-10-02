import { Test, type TestingModule } from '@nestjs/testing';

import { google } from 'googleapis';
import {
  ConnectedAccountProvider,
  MessageFolderImportPolicy,
  MessageFolderPendingSyncAction,
} from 'twenty-shared/types';

import { type MessageFolder } from 'src/modules/messaging/message-folder-manager/interfaces/message-folder-driver.interface';

import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GmailGetHistoryService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-history.service';
import { GmailGetMessageListService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-message-list.service';
import { GmailMessageListFetchErrorHandler } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-message-list-fetch-error-handler.service';
import { computeGmailExcludeSearchFilter } from 'src/modules/messaging/message-import-manager/drivers/gmail/utils/compute-gmail-exclude-search-filter.util';

const createMockFolder = (
  overrides: Partial<MessageFolder> &
    Pick<MessageFolder, 'name' | 'externalId' | 'isSynced'>,
): MessageFolder => ({
  id: `folder-${overrides.externalId}`,
  syncCursor: null,
  isSentFolder: false,
  parentFolderId: null,
  pendingSyncAction: MessageFolderPendingSyncAction.NONE,
  ...overrides,
});

describe('GmailGetMessageListService', () => {
  let service: GmailGetMessageListService;
  let googleOAuth2ClientProvider: GoogleOAuth2ClientProvider;

  const mockConnectedAccount: Pick<
    ConnectedAccountEntity,
    'provider' | 'id' | 'handle'
  > = {
    id: 'connected-account-id',
    provider: ConnectedAccountProvider.GOOGLE,
    handle: 'test@gmail.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailGetMessageListService,
        {
          provide: GoogleOAuth2ClientProvider,
          useValue: {
            getClient: jest.fn(),
          },
        },
        {
          provide: GmailGetHistoryService,
          useValue: {
            getHistory: jest.fn(),
            getMessageIdsFromHistory: jest.fn(),
          },
        },
        {
          provide: GmailMessageListFetchErrorHandler,
          useValue: {
            handleError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GmailGetMessageListService>(
      GmailGetMessageListService,
    );
    googleOAuth2ClientProvider = module.get<GoogleOAuth2ClientProvider>(
      GoogleOAuth2ClientProvider,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getMessageList', () => {
    it('should return 0 messageExternalIds when gmail returns 0 messages', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest.fn().mockResolvedValue({
              data: {
                messages: [],
                nextPageToken: undefined,
              },
            }),
          },
        },
      };

      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);

      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      const result = await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'my-id',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [
          createMockFolder({
            name: 'INBOX',
            externalId: 'INBOX',
            isSynced: true,
          }),
        ],
      });

      expect(result[0].messageExternalIds).toHaveLength(0);
      expect(mockGmailClient.users.messages.list).toHaveBeenCalledTimes(1);
    });

    it('should return 5 messageExternalIds when gmail returns 5 messages', async () => {
      const mockMessages = [
        {
          id: `message-1`,
        },
        {
          id: `message-2`,
        },
        {
          id: `message-3`,
        },
        {
          id: `message-4`,
        },
        {
          id: `message-5`,
        },
      ];

      const mockGmailClient = {
        users: {
          messages: {
            list: jest.fn().mockResolvedValue({
              data: {
                messages: mockMessages,
                nextPageToken: undefined,
              },
            }),
            get: jest.fn().mockResolvedValue({
              data: {
                historyId: 'history-id-123',
              },
            }),
          },
        },
      };

      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);

      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      const result = await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'my-id',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [
          createMockFolder({
            name: 'INBOX',
            externalId: 'INBOX',
            isSynced: true,
          }),
        ],
      });

      expect(result[0].messageExternalIds).toHaveLength(5);
    });

    it('should return 3 messageExternalIds when gmail provides a nextpagetoken with 2 messages, then 1', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest
              .fn()
              .mockResolvedValueOnce({
                data: {
                  messages: [
                    {
                      id: `message-1`,
                    },
                    {
                      id: `message-2`,
                    },
                  ],
                  nextPageToken: 'next-page-token',
                },
              })
              .mockResolvedValueOnce({
                data: {
                  messages: [
                    {
                      id: `message-3`,
                    },
                  ],
                  nextPageToken: undefined,
                },
              }),
            get: jest.fn().mockResolvedValue({
              data: {
                historyId: 'history-id-123',
              },
            }),
          },
        },
      };

      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);

      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      const result = await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'my-id',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [
          createMockFolder({
            name: 'INBOX',
            externalId: 'INBOX',
            isSynced: true,
          }),
        ],
      });

      expect(result[0].messageExternalIds).toHaveLength(3);
      expect(mockGmailClient.users.messages.list).toHaveBeenCalledTimes(2);
    });
    it('continues an empty page when Gmail provides a nextPageToken', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest
              .fn()
              .mockResolvedValueOnce({
                data: { messages: [], nextPageToken: 'next-page-token' },
              })
              .mockResolvedValueOnce({
                data: { messages: [{ id: 'message-after-empty-page' }] },
              }),
            get: jest.fn().mockResolvedValue({
              data: { historyId: 'history-id-123' },
            }),
          },
        },
      };
      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      const result = await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'my-id',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [
          createMockFolder({
            name: 'INBOX',
            externalId: 'INBOX',
            isSynced: true,
          }),
        ],
      });

      expect(result[0].messageExternalIds).toEqual([
        'message-after-empty-page',
      ]);
      expect(mockGmailClient.users.messages.list).toHaveBeenCalledTimes(2);
    });

    it('uses a mailbox cursor before pagination so modification of A after new B cannot hide B', async () => {
      const order: string[] = [];
      const client = {
        users: {
          getProfile: jest.fn(async () => {
            order.push('profile');
            return { data: { historyId: 'before-B' } };
          }),
          messages: {
            list: jest.fn(async () => {
              order.push('list-A');
              return { data: { messages: [{ id: 'A' }] } };
            }),
            get: jest.fn(async () => {
              order.push('get-A-after-B');
              return { data: { historyId: 'after-B' } };
            }),
          },
        },
      };
      jest.spyOn(google, 'gmail').mockReturnValue(client as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});
      const historyService = (
        service as unknown as { gmailGetHistoryService: GmailGetHistoryService }
      ).gmailGetHistoryService;
      jest
        .spyOn(historyService, 'getHistory')
        .mockImplementation(async (_client, start) => {
          order.push(`history:${start}`);
          return {
            history:
              start === 'before-B'
                ? [{ messagesAdded: [{ message: { id: 'B' } }] }]
                : [],
            historyId: 'final',
          };
        });
      jest
        .spyOn(historyService, 'getMessageIdsFromHistory')
        .mockResolvedValue({ messagesAdded: ['B'], messagesDeleted: [] });
      const [result] = await service.getMessageLists({
        messageChannel: {
          syncCursor: 'old-cursor',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [],
        forceInitialFrontier: true,
      });
      expect(order[0]).toBe('profile');
      expect(order.indexOf('profile')).toBeLessThan(order.indexOf('list-A'));
      expect(order).toContain('history:before-B');
      expect(result).toMatchObject({
        messageExternalIds: ['A', 'B'],
        initialFrontierVerified: true,
        nextSyncCursor: 'final',
      });
    });

    it('qualifies nonempty enumeration only after validating the message-derived history cursor and including additions during scan', async () => {
      const client = {
        users: {
          getProfile: jest
            .fn()
            .mockResolvedValue({ data: { historyId: 'history-start' } }),
          messages: {
            list: jest
              .fn()
              .mockResolvedValue({ data: { messages: [{ id: 'initial' }] } }),
            get: jest
              .fn()
              .mockResolvedValue({ data: { historyId: 'history-start' } }),
          },
        },
      };
      jest.spyOn(google, 'gmail').mockReturnValue(client as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});
      const historyService = (
        service as unknown as { gmailGetHistoryService: GmailGetHistoryService }
      ).gmailGetHistoryService;
      jest.spyOn(historyService, 'getHistory').mockResolvedValue({
        history: [{ messagesAdded: [{ message: { id: 'during-scan' } }] }],
        historyId: 'history-final',
      });
      jest.spyOn(historyService, 'getMessageIdsFromHistory').mockResolvedValue({
        messagesAdded: ['during-scan'],
        messagesDeleted: [],
      });
      const args = {
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [],
        forceInitialFrontier: true,
      };
      const [list] = await service.getMessageLists(args);
      expect(historyService.getHistory).toHaveBeenCalledWith(
        client,
        'history-start',
      );
      expect(list).toMatchObject({
        messageExternalIds: ['initial', 'during-scan'],
        nextSyncCursor: 'history-final',
        initialFrontierVerified: true,
      });
      jest
        .spyOn(historyService, 'getHistory')
        .mockRejectedValue(new Error('expired history'));
      const [unverified] = await service.getMessageLists(args);
      expect(unverified.messageExternalIds).toEqual(['initial']);
      expect(unverified.initialFrontierVerified).toBeUndefined();
    });

    it('rejects an identity-less listed item instead of certifying a partial baseline', async () => {
      jest.spyOn(google, 'gmail').mockReturnValue({
        users: {
          messages: {
            list: jest
              .fn()
              .mockResolvedValue({ data: { messages: [{ id: null }] } }),
          },
        },
      } as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});
      await expect(
        service.getMessageLists({
          messageChannel: {
            syncCursor: '',
            id: 'channel-1',
            messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
          },
          connectedAccount: mockConnectedAccount,
          messageFolders: [],
        }),
      ).rejects.toThrow('has no provider ID');
    });

    it('rejects a repeated nextPageToken rather than certifying a truncated scan', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest
              .fn()
              .mockResolvedValueOnce({
                data: {
                  messages: [{ id: 'message-1' }],
                  nextPageToken: 'stuck',
                },
              })
              .mockResolvedValueOnce({
                data: {
                  messages: [{ id: 'message-2' }],
                  nextPageToken: 'stuck',
                },
              })
              .mockRejectedValue(
                new Error('bounded test: unexpected third page'),
              ),
          },
        },
      };
      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      await expect(
        service.getMessageLists({
          messageChannel: {
            syncCursor: '',
            id: 'my-id',
            messageFolderImportPolicy:
              MessageFolderImportPolicy.SELECTED_FOLDERS,
          },
          connectedAccount: mockConnectedAccount,
          messageFolders: [
            createMockFolder({
              name: 'INBOX',
              externalId: 'INBOX',
              isSynced: true,
            }),
          ],
        }),
      ).rejects.toThrow('Repeated Gmail message-list page token');
      expect(mockGmailClient.users.messages.list).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no folders have isSynced=true with SELECTED_FOLDERS policy', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest.fn(),
          },
        },
      };

      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);

      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      const result = await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'my-id',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [
          createMockFolder({
            name: 'Personal',
            externalId: 'Label_personal',
            isSynced: false,
          }),
          createMockFolder({
            name: 'Work',
            externalId: 'Label_work',
            isSynced: false,
          }),
        ],
      });

      expect(result).toEqual([]);
      expect(mockGmailClient.users.messages.list).not.toHaveBeenCalled();
    });
  });

  it('distinguishes Gmail messageAdded from old message labelAdded on an incremental cursor', async () => {
    const history = [
      { messagesAdded: [{ message: { id: 'new-id' } }] },
      { labelsAdded: [{ message: { id: 'old-id' } }] },
    ];
    const historyService = (
      service as unknown as { gmailGetHistoryService: GmailGetHistoryService }
    ).gmailGetHistoryService;
    jest
      .spyOn(historyService, 'getHistory')
      .mockResolvedValue({ history, historyId: 'history-final' });
    jest.spyOn(historyService, 'getMessageIdsFromHistory').mockResolvedValue({
      messagesAdded: ['new-id', 'old-id'],
      messagesDeleted: [],
    });
    jest.spyOn(google, 'gmail').mockReturnValue({} as never);
    (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

    const result = await service.getMessageLists({
      messageChannel: {
        id: 'channel-1',
        syncCursor: 'history-start',
        messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
      },
      connectedAccount: mockConnectedAccount,
      messageFolders: [],
    });
    expect(result[0].messageExternalIds).toEqual(['new-id', 'old-id']);
    expect(result[0].newMessageExternalIds).toEqual(['new-id']);
  });

  describe('initial sync folder filtering', () => {
    it('should build Gmail query with positive OR filter for synced folders', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest.fn().mockResolvedValue({
              data: { messages: [{ id: 'msg-1' }], nextPageToken: undefined },
            }),
            get: jest.fn().mockResolvedValue({
              data: { historyId: '12345' },
            }),
          },
        },
      };

      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      const messageFolders = [
        createMockFolder({
          name: 'INBOX',
          externalId: 'INBOX',
          isSynced: true,
        }),
        createMockFolder({
          name: 'Work',
          externalId: 'Label_work',
          isSynced: true,
        }),
        createMockFolder({
          name: 'Personal',
          externalId: 'Label_personal',
          isSynced: false,
        }),
        createMockFolder({
          name: 'Newsletters',
          externalId: 'Label_newsletters',
          isSynced: false,
        }),
      ];

      await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders,
      });

      const expectedQuery = computeGmailExcludeSearchFilter(
        messageFolders,
        MessageFolderImportPolicy.SELECTED_FOLDERS,
      );

      expect(mockGmailClient.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expectedQuery,
        }),
      );
    });

    it('should only include default exclusions when ALL_FOLDERS policy is set', async () => {
      const mockGmailClient = {
        users: {
          messages: {
            list: jest.fn().mockResolvedValue({
              data: { messages: [{ id: 'msg-1' }], nextPageToken: undefined },
            }),
            get: jest.fn().mockResolvedValue({
              data: { historyId: '12345' },
            }),
          },
        },
      };

      jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);
      (googleOAuth2ClientProvider.getClient as jest.Mock).mockResolvedValue({});

      await service.getMessageLists({
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        connectedAccount: mockConnectedAccount,
        messageFolders: [
          createMockFolder({
            name: 'INBOX',
            externalId: 'INBOX',
            isSynced: true,
          }),
          createMockFolder({
            name: 'Personal',
            externalId: 'Label_personal',
            isSynced: false,
          }),
        ],
      });

      const callArgs = mockGmailClient.users.messages.list.mock.calls[0][0];

      expect(callArgs.q).toContain('-label:spam');
      expect(callArgs.q).toContain('-category:promotions');
      expect(callArgs.q).not.toContain('label:inbox');
    });
  });
});
