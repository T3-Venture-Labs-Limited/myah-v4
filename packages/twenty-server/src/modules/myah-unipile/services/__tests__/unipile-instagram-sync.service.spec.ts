import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramChatCheckpointEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-chat-checkpoint.entity';
import { UnipileInstagramSyncRunEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import {
  UNIPILE_FETCH,
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';

type SyncService = {
  synchronizeBinding: (bindingId: string) => Promise<unknown>;
};

type SyncServiceModule = {
  UnipileInstagramSyncService: new (...dependencies: unknown[]) => SyncService;
};

type Chat = {
  chatId: string;
  accountId: string;
  accountType: 'INSTAGRAM';
  type: 'ONE_TO_ONE';
  attendeeProviderId: string;
  name: string | null;
  timestamp: string | null;
};

type Message = {
  messageId: string;
  accountId: string;
  chatId: string;
  senderId: string;
  isSender?: 0 | 1;
  text: string | null;
  timestamp: string | null;
  seen: boolean;
  delivered: boolean;
  hidden: boolean;
  deleted: boolean;
  isEvent: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
};

type Run = {
  id: string;
  bindingId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  triageMode?: 'LIVE' | 'BACKFILL';
  overlapAfter: Date | null;
  chatCursor: string | null;
  currentChatId: string | null;
  currentChatAttendeeId: string | null;
  messageCursor: string | null;
  completedChatHighWaterAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Checkpoint = {
  id: string;
  bindingId: string;
  unipileChatId: string;
  completedMessageHighWaterAt: Date | null;
};

type QueryRunner = {
  connect: jest.Mock;
  query: jest.Mock;
  release: jest.Mock;
  manager: { getRepository: jest.Mock };
};

const bindingId = 'b217ae4d-a64e-4562-bb3e-6e887daa3174';
const workspaceId = 'c08f8254-4826-4ce1-9a8f-9b234b04bffc';
const workspace = { id: workspaceId };
const binding = {
  id: bindingId,
  workspaceId,
  workspaceInstagramAccountRecordId: '4511d788-e75c-487c-b9d5-6da7d2a9e6cc',
  unipileAccountId: 'unipile-account-1',
  instagramUserId: '17841400000000001',
  status: 'ACTIVE',
  deactivatedAt: null,
};

const chat = (
  chatId: string,
  timestamp = '2026-09-04T12:00:00.000Z',
): Chat => ({
  chatId,
  accountId: binding.unipileAccountId,
  accountType: 'INSTAGRAM',
  type: 'ONE_TO_ONE',
  attendeeProviderId: `attendee-${chatId}`,
  name: `Chat ${chatId}`,
  timestamp,
});

const message = (
  messageId: string,
  chatId: string,
  timestamp = '2026-09-04T12:00:00.000Z',
  properties: Partial<
    Pick<
      Message,
      | 'senderId'
      | 'isSender'
      | 'seen'
      | 'delivered'
      | 'hidden'
      | 'deleted'
      | 'isEvent'
    >
  > = {},
): Message => ({
  messageId,
  accountId: binding.unipileAccountId,
  chatId,
  senderId: 'external-sender',
  text: messageId,
  timestamp,
  seen: false,
  delivered: false,
  hidden: false,
  deleted: false,
  isEvent: false,
  hasAttachments: false,
  attachmentCount: 0,
  ...properties,
});

const loadSyncServiceModule = (): SyncServiceModule | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-sync.service') as SyncServiceModule;
  } catch {
    return undefined;
  }
};

const requireSyncServiceModule = (): SyncServiceModule => {
  const serviceModule = loadSyncServiceModule();

  expect(serviceModule).toBeDefined();

  if (!serviceModule) {
    throw new Error('Unipile Instagram synchronization service is unavailable');
  }

  return serviceModule;
};

const createHarness = (input: {
  realClient?: UnipileV1ClientService;
  runningRun?: Run | null;
  failedRun?: Run | null;
  completedRuns?: Run[];
  checkpoints?: Checkpoint[];
  lockAcquired?: boolean;
  activeBinding?: typeof binding | null;
  listChats?: jest.Mock;
  listMessages?: jest.Mock;
  getChat?: jest.Mock;
  getMessage?: jest.Mock;
  upsertChat?: jest.Mock;
  upsertMessage?: jest.Mock;
  markCompletedMessageSync?: jest.Mock;
  markCompletedChatSync?: jest.Mock;
  availabilityError?: Error;
  reconciledStatus?: 'ACTIVE' | 'INACTIVE';
}) => {
  const state = {
    runs: [
      ...(input.runningRun ? [input.runningRun] : []),
      ...(input.failedRun ? [input.failedRun] : []),
      ...(input.completedRuns ?? []),
    ] as Run[],
    checkpoints: new Map(
      (input.checkpoints ?? []).map((checkpoint) => [
        checkpoint.unipileChatId,
        checkpoint,
      ]),
    ),
    savedRuns: [] as Run[],
    savedCheckpoints: [] as Checkpoint[],
  };
  const bindingRepository = {
    findOne: jest.fn(async () =>
      input.activeBinding === undefined ? binding : input.activeBinding,
    ),
  };
  const workspaceRepository = {
    findOne: jest.fn(async () => workspace),
  };
  const runRepository = {
    findOne: jest.fn(
      async (options: {
        where?: { status?: Run['status']; triageMode?: Run['triageMode'] };
      }) => {
        const status = options.where?.status;
        const triageMode = options.where?.triageMode;

        return (
          state.runs
            .filter(
              (run) =>
                run.bindingId === bindingId &&
                run.status === status &&
                (triageMode === undefined || run.triageMode === triageMode),
            )
            .sort(
              (left, right) =>
                left.createdAt.getTime() - right.createdAt.getTime(),
            )[0] ?? null
        );
      },
    ),
    create: jest.fn((value: Partial<Run>) => ({
      id: `run-${state.runs.length + 1}`,
      bindingId,
      status: 'RUNNING' as const,
      triageMode: 'BACKFILL' as const,
      overlapAfter: null,
      chatCursor: null,
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: null,
      completedAt: null,
      failureCode: null,
      failureReason: null,
      createdAt: new Date('2026-09-04T13:00:00.000Z'),
      updatedAt: new Date('2026-09-04T13:00:00.000Z'),
      ...value,
    })),
    save: jest.fn(async (run: Run) => {
      if (!state.runs.includes(run)) {
        state.runs.push(run);
      }
      state.savedRuns.push({ ...run });

      return run;
    }),
  };
  const checkpointRepository = {
    findOne: jest.fn(
      async (options: { where?: { unipileChatId?: string } }) =>
        state.checkpoints.get(options.where?.unipileChatId ?? '') ?? null,
    ),
    create: jest.fn((value: Partial<Checkpoint>) => ({
      id: `checkpoint-${state.checkpoints.size + 1}`,
      bindingId,
      unipileChatId: '',
      completedMessageHighWaterAt: null,
      ...value,
    })),
    save: jest.fn(async (checkpoint: Checkpoint) => {
      state.checkpoints.set(checkpoint.unipileChatId, checkpoint);
      state.savedCheckpoints.push({ ...checkpoint });

      return checkpoint;
    }),
  };
  const repositories: Record<string, unknown> = {
    WorkspaceEntity: workspaceRepository,
    UnipileInstagramAccountBindingEntity: bindingRepository,
    UnipileInstagramSyncRunEntity: runRepository,
    UnipileInstagramChatCheckpointEntity: checkpointRepository,
  };
  const manager = {
    getRepository: jest.fn((entity: { name: string }) => {
      const repository = repositories[entity.name];

      if (!repository) {
        throw new Error(`Unexpected repository: ${entity.name}`);
      }

      return repository;
    }),
  };
  const lockAcquired = input.lockAcquired ?? true;
  const query = jest.fn(async (statement: string, [key]: [string]) => {
    if (statement.includes('pg_try_advisory_lock')) {
      expect(key).toBe(`unipile-instagram-sync:${bindingId}`);

      return [{ pg_try_advisory_lock: lockAcquired }];
    }

    if (statement.includes('pg_advisory_unlock')) {
      expect(key).toBe(`unipile-instagram-sync:${bindingId}`);

      return [{ pg_advisory_unlock: true }];
    }

    throw new Error(`Unexpected query: ${statement}`);
  });
  const queryRunner: QueryRunner = {
    connect: jest.fn(async () => undefined),
    query,
    release: jest.fn(async () => undefined),
    manager,
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const client = {
    listChats: input.listChats ?? jest.fn(),
    listMessages: input.listMessages ?? jest.fn(),
    getChat:
      input.getChat ??
      jest.fn(async (request: { chatId: string }) => chat(request.chatId)),
    getMessage:
      input.getMessage ??
      jest.fn(async (request: { messageId: string; chatId: string }) =>
        message(request.messageId, request.chatId),
      ),
  };
  const projection = {
    upsertVerifiedChat:
      input.upsertChat ??
      jest.fn(async (request: { chat: Chat }) => ({
        conversationRecordId: `conversation-${request.chat.chatId}`,
      })),
    upsertVerifiedMessage: input.upsertMessage ?? jest.fn(async () => ({})),
    markCompletedMessageSync:
      input.markCompletedMessageSync ?? jest.fn(async () => undefined),
    markCompletedChatSync:
      input.markCompletedChatSync ?? jest.fn(async () => undefined),
  };
  const availability = {
    assertEnabled: input.availabilityError
      ? jest.fn(() => {
          throw input.availabilityError;
        })
      : jest.fn(),
  };
  const accountService = {
    reconcileBoundAccountStatus: jest
      .fn()
      .mockResolvedValue(input.reconciledStatus ?? 'ACTIVE'),
  };

  return {
    state,
    bindingRepository,
    workspaceRepository,
    runRepository,
    checkpointRepository,
    queryRunner,
    dataSource,
    client,
    projection,
    availability,
    accountService,
    async createService(): Promise<SyncService> {
      const { UnipileInstagramSyncService } = requireSyncServiceModule();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UnipileInstagramSyncService,
          { provide: getDataSourceToken(), useValue: dataSource },
          {
            provide: getRepositoryToken(WorkspaceEntity),
            useValue: workspaceRepository,
          },
          {
            provide: getRepositoryToken(UnipileInstagramAccountBindingEntity),
            useValue: bindingRepository,
          },
          {
            provide: getRepositoryToken(UnipileInstagramSyncRunEntity),
            useValue: runRepository,
          },
          {
            provide: getRepositoryToken(UnipileInstagramChatCheckpointEntity),
            useValue: checkpointRepository,
          },
          {
            provide: UnipileV1ClientService,
            useValue: input.realClient ?? client,
          },
          {
            provide: UnipileInstagramAccountService,
            useValue: accountService,
          },
          {
            provide: UnipileInstagramProjectionService,
            useValue: projection,
          },
          {
            provide: UnipileInstagramAvailabilityService,
            useValue: availability,
          },
        ],
      }).compile();

      return module.get(UnipileInstagramSyncService);
    },
  };
};

describe('UnipileInstagramSyncService', () => {
  it('synchronizes nested chat and message pages, then commits only completed high-water marks', async () => {
    const chatOne = chat('chat-1', '2026-09-04T12:00:00.000Z');
    const chatTwo = chat('chat-2', '2026-09-04T12:30:00.000Z');
    const harness = createHarness({
      listChats: jest
        .fn()
        .mockResolvedValueOnce({ chats: [chatOne], nextCursor: 'chat-page-2' })
        .mockResolvedValueOnce({ chats: [chatTwo], nextCursor: null }),
      listMessages: jest
        .fn()
        .mockResolvedValueOnce({
          messages: [message('message-1', chatOne.chatId)],
          nextCursor: 'message-page-2',
        })
        .mockResolvedValueOnce({
          messages: [
            message('message-2', chatOne.chatId, '2026-09-04T12:05:00.000Z'),
          ],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [message('message-3', chatTwo.chatId)],
          nextCursor: null,
        }),
      getChat: jest.fn(async (request: { chatId: string }) =>
        request.chatId === chatTwo.chatId ? chatTwo : chatOne,
      ),
      getMessage: jest.fn(
        async (request: { messageId: string; chatId: string }) =>
          message(
            request.messageId,
            request.chatId,
            request.messageId === 'message-2'
              ? '2026-09-04T12:05:00.000Z'
              : '2026-09-04T12:00:00.000Z',
          ),
      ),
    });
    const service = await harness.createService();

    await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
      'COMPLETED',
    );

    expect(harness.client.listChats).toHaveBeenNthCalledWith(1, {
      accountId: binding.unipileAccountId,
      cursor: null,
      after: null,
      limit: 250,
    });
    expect(harness.client.listChats).toHaveBeenNthCalledWith(2, {
      accountId: binding.unipileAccountId,
      cursor: 'chat-page-2',
      after: null,
      limit: 250,
    });
    expect(harness.client.listMessages).toHaveBeenNthCalledWith(1, {
      accountId: binding.unipileAccountId,
      chatId: chatOne.chatId,
      cursor: null,
      after: null,
      limit: 250,
    });
    expect(harness.client.listMessages).toHaveBeenNthCalledWith(2, {
      accountId: binding.unipileAccountId,
      chatId: chatOne.chatId,
      cursor: 'message-page-2',
      after: null,
      limit: 250,
    });
    expect(harness.client.getChat).toHaveBeenNthCalledWith(1, {
      accountId: binding.unipileAccountId,
      chatId: chatOne.chatId,
      expectedAttendeeId: chatOne.attendeeProviderId,
    });
    expect(harness.client.getMessage).toHaveBeenNthCalledWith(1, {
      accountId: binding.unipileAccountId,
      chatId: chatOne.chatId,
      messageId: 'message-1',
    });
    expect(harness.client.getMessage).toHaveBeenNthCalledWith(3, {
      accountId: binding.unipileAccountId,
      chatId: chatTwo.chatId,
      messageId: 'message-3',
    });
    expect(harness.projection.upsertVerifiedChat).toHaveBeenCalledTimes(2);
    expect(harness.projection.upsertVerifiedMessage).toHaveBeenCalledTimes(3);
    expect(harness.state.checkpoints.get(chatOne.chatId)).toMatchObject({
      completedMessageHighWaterAt: new Date('2026-09-04T12:05:00.000Z'),
    });
    expect(harness.state.checkpoints.get(chatTwo.chatId)).toMatchObject({
      completedMessageHighWaterAt: new Date('2026-09-04T12:00:00.000Z'),
    });
    expect(harness.queryRunner.manager.getRepository).toHaveBeenCalledWith(
      UnipileInstagramAccountBindingEntity,
    );
    expect(harness.queryRunner.manager.getRepository).toHaveBeenCalledWith(
      WorkspaceEntity,
    );
    expect(harness.queryRunner.manager.getRepository).toHaveBeenCalledWith(
      UnipileInstagramSyncRunEntity,
    );
    expect(harness.queryRunner.manager.getRepository).toHaveBeenCalledWith(
      UnipileInstagramChatCheckpointEntity,
    );
    expect(harness.projection.markCompletedMessageSync).toHaveBeenCalledTimes(
      2,
    );
    expect(harness.projection.markCompletedMessageSync).toHaveBeenNthCalledWith(
      1,
      {
        binding,
        workspace,
        conversationRecordId: `conversation-${chatOne.chatId}`,
        completedMessageSyncAt: '2026-09-04T12:05:00.000Z',
      },
    );
    expect(harness.projection.markCompletedMessageSync).toHaveBeenNthCalledWith(
      2,
      {
        binding,
        workspace,
        conversationRecordId: `conversation-${chatTwo.chatId}`,
        completedMessageSyncAt: '2026-09-04T12:00:00.000Z',
      },
    );
    expect(harness.projection.markCompletedChatSync).toHaveBeenCalledTimes(1);
    expect(harness.projection.markCompletedChatSync).toHaveBeenCalledWith({
      binding,
      workspace,
      workspaceInstagramAccountRecordId:
        binding.workspaceInstagramAccountRecordId,
      completedChatSyncAt: '2026-09-04T12:30:00.000Z',
    });
    expect(harness.client.listChats.mock.invocationCallOrder[1]).toBeLessThan(
      harness.projection.markCompletedChatSync.mock.invocationCallOrder[0],
    );
    expect(
      harness.projection.markCompletedChatSync.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.runRepository.save.mock.invocationCallOrder[
        harness.runRepository.save.mock.invocationCallOrder.length - 1
      ],
    );
    expect(harness.state.runs).toHaveLength(1);
    expect(harness.state.runs[0]).toMatchObject({
      status: 'COMPLETED',
      chatCursor: null,
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: new Date('2026-09-04T12:30:00.000Z'),
      failureCode: null,
      failureReason: null,
    });
    expect(harness.state.runs[0].completedAt).toEqual(expect.any(Date));
    expect(harness.state.runs[0].triageMode).toBe('BACKFILL');
    expect(harness.queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtext($1))',
      [`unipile-instagram-sync:${bindingId}`],
    );
    expect(harness.queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('creates incremental runs LIVE and retains the persisted mode on resume', async () => {
    const completedRun: Run = {
      id: 'completed-run',
      bindingId,
      status: 'COMPLETED',
      triageMode: 'BACKFILL',
      overlapAfter: null,
      chatCursor: null,
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: null,
      completedAt: new Date('2026-09-04T12:00:00.000Z'),
      failureCode: null,
      failureReason: null,
      createdAt: new Date('2026-09-04T11:00:00.000Z'),
      updatedAt: new Date('2026-09-04T12:00:00.000Z'),
    };
    const liveRunningRun: Run = {
      ...completedRun,
      id: 'running-run',
      status: 'RUNNING',
      triageMode: 'LIVE',
      completedAt: null,
    };
    const incrementalHarness = createHarness({
      completedRuns: [completedRun],
      listChats: jest.fn().mockResolvedValue({ chats: [], nextCursor: null }),
    });
    const incrementalService = await incrementalHarness.createService();

    await expect(
      incrementalService.synchronizeBinding(bindingId),
    ).resolves.toBe('COMPLETED');
    expect(incrementalHarness.state.runs[1].triageMode).toBe('LIVE');

    const resumeHarness = createHarness({
      runningRun: liveRunningRun,
      listChats: jest.fn().mockResolvedValue({ chats: [], nextCursor: null }),
    });
    const resumeService = await resumeHarness.createService();

    await expect(resumeService.synchronizeBinding(bindingId)).resolves.toBe(
      'COMPLETED',
    );
    expect(resumeHarness.state.runs[0].triageMode).toBe('LIVE');
  });

  it('resumes a failed incremental run in its persisted LIVE mode', async () => {
    const failedIncrementalRun: Run = {
      id: 'failed-incremental-run',
      bindingId,
      status: 'FAILED',
      triageMode: 'LIVE',
      overlapAfter: new Date('2026-09-04T11:00:00.000Z'),
      chatCursor: 'next-chat-page',
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: null,
      completedAt: new Date('2026-09-04T12:00:00.000Z'),
      failureCode: 'UNIPILE_BAD_RESPONSE',
      failureReason: 'Previous synchronization failed',
      createdAt: new Date('2026-09-04T11:00:00.000Z'),
      updatedAt: new Date('2026-09-04T12:00:00.000Z'),
    };
    const harness = createHarness({
      failedRun: failedIncrementalRun,
      listChats: jest.fn().mockResolvedValue({ chats: [], nextCursor: null }),
    });
    const service = await harness.createService();

    await expect(service.synchronizeBinding(bindingId)).resolves.toBe(
      'COMPLETED',
    );

    expect(harness.state.runs).toHaveLength(1);
    expect(harness.state.runs[0]).toMatchObject({
      id: failedIncrementalRun.id,
      triageMode: 'LIVE',
    });
    expect(harness.state.savedRuns[0]).toMatchObject({
      id: failedIncrementalRun.id,
      status: 'RUNNING',
      completedAt: null,
      failureCode: null,
      failureReason: null,
      chatCursor: 'next-chat-page',
    });
  });

  it('resumes the saved chat, then replays its chat page idempotently before advancing remaining chat pages', async () => {
    const onlyChat = chat('chat-1');
    const nextChat = chat('chat-2', '2026-09-04T12:30:00.000Z');
    const crash = new Error('projection interrupted');
    const upsertMessage = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(crash)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const harness = createHarness({
      listChats: jest
        .fn()
        .mockResolvedValueOnce({
          chats: [onlyChat],
          nextCursor: 'chat-page-2',
        })
        .mockResolvedValueOnce({
          chats: [onlyChat],
          nextCursor: 'chat-page-2',
        })
        .mockResolvedValueOnce({ chats: [nextChat], nextCursor: null }),
      getChat: jest.fn(async (request: { chatId: string }) =>
        request.chatId === nextChat.chatId ? nextChat : onlyChat,
      ),
      listMessages: jest
        .fn()
        .mockResolvedValueOnce({
          messages: [message('message-1', onlyChat.chatId)],
          nextCursor: 'resume-here',
        })
        .mockResolvedValueOnce({
          messages: [message('message-2', onlyChat.chatId)],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [message('message-2', onlyChat.chatId)],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [message('message-2', onlyChat.chatId)],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [message('message-3', nextChat.chatId)],
          nextCursor: null,
        }),
      upsertMessage,
    });
    const service = await harness.createService();

    await expect(service.synchronizeBinding(bindingId)).rejects.toBe(crash);

    expect(harness.state.runs[0]).toMatchObject({
      status: 'RUNNING',
      chatCursor: null,
      currentChatId: onlyChat.chatId,
      currentChatAttendeeId: onlyChat.attendeeProviderId,
      messageCursor: 'resume-here',
      completedChatHighWaterAt: null,
      completedAt: null,
    });
    expect(harness.state.savedRuns).toContainEqual(
      expect.objectContaining({
        status: 'RUNNING',
        currentChatId: onlyChat.chatId,
        currentChatAttendeeId: onlyChat.attendeeProviderId,
        messageCursor: null,
      }),
    );
    expect(harness.projection.markCompletedChatSync).not.toHaveBeenCalled();
    await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
      'COMPLETED',
    );

    expect(harness.client.getChat).toHaveBeenNthCalledWith(2, {
      accountId: binding.unipileAccountId,
      chatId: onlyChat.chatId,
      expectedAttendeeId: onlyChat.attendeeProviderId,
    });
    expect(harness.client.listChats).toHaveBeenNthCalledWith(2, {
      accountId: binding.unipileAccountId,
      cursor: null,
      after: null,
      limit: 250,
    });
    expect(
      harness.projection.markCompletedMessageSync.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.client.listChats.mock.invocationCallOrder[1]);
    expect(harness.client.listChats).toHaveBeenNthCalledWith(3, {
      accountId: binding.unipileAccountId,
      cursor: 'chat-page-2',
      after: null,
      limit: 250,
    });
    expect(harness.client.listMessages).toHaveBeenNthCalledWith(2, {
      accountId: binding.unipileAccountId,
      chatId: onlyChat.chatId,
      cursor: 'resume-here',
      after: null,
      limit: 250,
    });
    expect(harness.client.listChats).toHaveBeenCalledTimes(3);
    expect(upsertMessage).toHaveBeenCalledTimes(5);
    expect(harness.projection.markCompletedMessageSync).toHaveBeenCalledTimes(
      3,
    );
    expect(harness.projection.markCompletedChatSync).toHaveBeenCalledTimes(1);
    expect(harness.state.runs[0]).toMatchObject({
      status: 'COMPLETED',
      chatCursor: null,
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: new Date('2026-09-04T12:30:00.000Z'),
    });
  });

  it('starts a later sweep sixty minutes before the prior completed high-water mark and keeps same-timestamp chats', async () => {
    const highWater = new Date('2026-09-04T12:00:00.000Z');
    const completedRun: Run = {
      id: 'completed-run',
      bindingId,
      status: 'COMPLETED',
      overlapAfter: null,
      chatCursor: null,
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: highWater,
      completedAt: highWater,
      failureCode: null,
      failureReason: null,
      createdAt: new Date('2026-09-04T11:00:00.000Z'),
      updatedAt: highWater,
    };
    const overlappingChat = chat('same-timestamp', highWater.toISOString());
    const harness = createHarness({
      completedRuns: [completedRun],
      listChats: jest
        .fn()
        .mockResolvedValue({ chats: [overlappingChat], nextCursor: null }),
      listMessages: jest
        .fn()
        .mockResolvedValue({ messages: [], nextCursor: null }),
    });
    const service = await harness.createService();

    await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
      'COMPLETED',
    );

    expect(harness.client.listChats).toHaveBeenCalledWith({
      accountId: binding.unipileAccountId,
      cursor: null,
      after: '2026-09-04T11:00:00.000Z',
      limit: 250,
    });
    expect(harness.projection.upsertVerifiedChat).toHaveBeenCalledWith(
      expect.objectContaining({ chat: overlappingChat }),
    );
    expect(harness.projection.markCompletedChatSync).toHaveBeenCalledTimes(1);
    expect(harness.state.runs).toHaveLength(2);
    expect(harness.state.runs[1]).toMatchObject({
      overlapAfter: new Date('2026-09-04T11:00:00.000Z'),
      completedChatHighWaterAt: highWater,
      status: 'COMPLETED',
    });
  });

  it('re-reads and idempotently projects a message at the exact sixty-minute overlap boundary', async () => {
    const highWater = new Date('2026-09-04T12:00:00.000Z');
    const overlappingChat = chat('chat-1', highWater.toISOString());
    const overlappingMessage = message(
      'same-timestamp-message',
      overlappingChat.chatId,
      highWater.toISOString(),
    );
    const completedRun: Run = {
      id: 'completed-run',
      bindingId,
      status: 'COMPLETED',
      overlapAfter: null,
      chatCursor: null,
      currentChatId: null,
      currentChatAttendeeId: null,
      messageCursor: null,
      completedChatHighWaterAt: highWater,
      completedAt: highWater,
      failureCode: null,
      failureReason: null,
      createdAt: new Date('2026-09-04T11:00:00.000Z'),
      updatedAt: highWater,
    };
    const harness = createHarness({
      completedRuns: [completedRun],
      checkpoints: [
        {
          id: 'checkpoint-chat-1',
          bindingId,
          unipileChatId: overlappingChat.chatId,
          completedMessageHighWaterAt: highWater,
        },
      ],
      listChats: jest
        .fn()
        .mockResolvedValue({ chats: [overlappingChat], nextCursor: null }),
      listMessages: jest.fn().mockResolvedValue({
        messages: [overlappingMessage],
        nextCursor: null,
      }),
    });
    const service = await harness.createService();

    await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
      'COMPLETED',
    );

    expect(harness.client.listMessages).toHaveBeenCalledWith({
      accountId: binding.unipileAccountId,
      chatId: overlappingChat.chatId,
      cursor: null,
      after: '2026-09-04T11:00:00.000Z',
      limit: 250,
    });
    expect(harness.projection.upsertVerifiedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRecordId: `conversation-${overlappingChat.chatId}`,
        message: overlappingMessage,
      }),
    );
  });

  it('reconciles the bound provider account before chat reads and blocks an inactive binding from importing stale data', async () => {
    const activeHarness = createHarness({
      listChats: jest.fn().mockResolvedValue({ chats: [], nextCursor: null }),
    });
    const activeService = await activeHarness.createService();

    await expect(activeService.synchronizeBinding(bindingId)).resolves.toBe(
      'COMPLETED',
    );
    expect(
      activeHarness.accountService.reconcileBoundAccountStatus,
    ).toHaveBeenCalledWith(bindingId);
    expect(
      activeHarness.accountService.reconcileBoundAccountStatus.mock
        .invocationCallOrder[0],
    ).toBeLessThan(activeHarness.client.listChats.mock.invocationCallOrder[0]);

    const inactiveHarness = createHarness({
      listChats: jest.fn().mockResolvedValue({
        chats: [chat('stale-chat')],
        nextCursor: null,
      }),
      reconciledStatus: 'INACTIVE',
    });
    const inactiveService = await inactiveHarness.createService();

    await inactiveService.synchronizeBinding(bindingId).catch(() => undefined);

    expect(
      inactiveHarness.accountService.reconcileBoundAccountStatus,
    ).toHaveBeenCalledWith(bindingId);
    expect(inactiveHarness.client.listChats).not.toHaveBeenCalled();
    expect(inactiveHarness.client.listMessages).not.toHaveBeenCalled();
    expect(
      inactiveHarness.projection.upsertVerifiedChat,
    ).not.toHaveBeenCalled();
    expect(
      inactiveHarness.projection.upsertVerifiedMessage,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'chat cursor',
      listChats: jest
        .fn()
        .mockResolvedValueOnce({ chats: [], nextCursor: 'chat-loop' })
        .mockResolvedValueOnce({ chats: [], nextCursor: 'chat-loop' }),
      listMessages: jest.fn(),
    },
    {
      name: 'message cursor',
      listChats: jest
        .fn()
        .mockResolvedValue({ chats: [chat('chat-1')], nextCursor: null }),
      listMessages: jest
        .fn()
        .mockResolvedValueOnce({ messages: [], nextCursor: 'message-loop' })
        .mockResolvedValueOnce({ messages: [], nextCursor: 'message-loop' }),
    },
  ])(
    'marks a repeated $name as a failed run without committing high-water state',
    async ({ listChats, listMessages }) => {
      const harness = createHarness({ listChats, listMessages });
      const service = await harness.createService();

      await service.synchronizeBinding(bindingId).catch(() => undefined);

      expect(harness.state.runs).toHaveLength(1);
      expect(harness.state.runs[0]).toMatchObject({
        status: 'FAILED',
        completedChatHighWaterAt: null,
      });
      expect(harness.state.runs[0].failureCode).toMatch(/CURSOR/);
      expect(harness.state.runs[0].failureReason).toEqual(expect.any(String));
      expect(harness.state.runs[0].completedAt).toEqual(expect.any(Date));
    },
  );

  it('does not project an inactive binding or a re-read chat that no longer belongs to the binding', async () => {
    const inactiveHarness = createHarness({ activeBinding: null });
    const inactiveService = await inactiveHarness.createService();

    await inactiveService.synchronizeBinding(bindingId).catch(() => undefined);
    expect(inactiveHarness.client.listChats).not.toHaveBeenCalled();
    expect(inactiveHarness.dataSource.createQueryRunner).toHaveBeenCalledTimes(
      1,
    );

    const listedChat = chat('chat-1');
    const mismatchHarness = createHarness({
      listChats: jest
        .fn()
        .mockResolvedValue({ chats: [listedChat], nextCursor: null }),
      getChat: jest.fn().mockResolvedValue({
        ...listedChat,
        accountId: 'different-unipile-account',
      }),
      listMessages: jest.fn(),
    });
    const mismatchService = await mismatchHarness.createService();

    await mismatchService.synchronizeBinding(bindingId).catch(() => undefined);

    expect(
      mismatchHarness.projection.upsertVerifiedChat,
    ).not.toHaveBeenCalled();
    expect(mismatchHarness.state.runs[0]).toMatchObject({
      status: 'FAILED',
      completedChatHighWaterAt: null,
    });
    expect(mismatchHarness.state.runs[0].failureCode).toMatch(
      /BINDING|IDENTITY|CHAT/,
    );
  });

  it.each([
    ['deleted', { deleted: true }],
    ['hidden', { hidden: true }],
    ['event', { isEvent: true }],
  ])(
    'does not project a %s message, so a sync can never restore it',
    async (_name, properties) => {
      const listedChat = chat('chat-1');
      const ignoredMessage = message(
        'ignored-message',
        listedChat.chatId,
        '2026-09-04T12:00:00.000Z',
        properties,
      );
      const harness = createHarness({
        listChats: jest
          .fn()
          .mockResolvedValue({ chats: [listedChat], nextCursor: null }),
        listMessages: jest
          .fn()
          .mockResolvedValue({ messages: [ignoredMessage], nextCursor: null }),
        getMessage: jest.fn().mockResolvedValue(ignoredMessage),
      });
      const service = await harness.createService();

      await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
        'COMPLETED',
      );

      expect(harness.client.getMessage).not.toHaveBeenCalled();
      expect(harness.projection.upsertVerifiedMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['deleted', { deleted: true }],
    ['hidden', { hidden: true }],
    ['event', { isEvent: true }],
  ])(
    'trusts the re-read %s flag over an unflagged list item and never projects it',
    async (_name, properties) => {
      const listedChat = chat('chat-1');
      const listedMessage = message('message-1', listedChat.chatId);
      const detailedMessage = message(
        listedMessage.messageId,
        listedChat.chatId,
        listedMessage.timestamp ?? undefined,
        properties,
      );
      const harness = createHarness({
        listChats: jest
          .fn()
          .mockResolvedValue({ chats: [listedChat], nextCursor: null }),
        listMessages: jest
          .fn()
          .mockResolvedValue({ messages: [listedMessage], nextCursor: null }),
        getMessage: jest.fn().mockResolvedValue(detailedMessage),
      });
      const service = await harness.createService();

      await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
        'COMPLETED',
      );

      expect(harness.client.getMessage).toHaveBeenCalledWith({
        accountId: binding.unipileAccountId,
        chatId: listedChat.chatId,
        messageId: listedMessage.messageId,
      });
      expect(harness.projection.upsertVerifiedMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'outbound seen',
      { senderId: binding.instagramUserId, seen: true },
      'READ',
      '2026-09-04T12:00:00.000Z',
    ],
    [
      'outbound delivered',
      { senderId: binding.instagramUserId, delivered: true },
      'DELIVERED',
      '2026-09-04T12:00:00.000Z',
    ],
    ['outbound sent', { senderId: binding.instagramUserId }, 'SENT', undefined],
    [
      'outbound provider self-sender',
      { senderId: 'provider-specific-self-sender', isSender: 1 as const },
      'SENT',
      undefined,
    ],
    ['inbound', { senderId: 'attendee-chat-1' }, 'RECEIVED', undefined],
  ])(
    'projects %s messages with the authoritative delivery state',
    async (_name, properties, deliveryState, deliveryStateUpdatedAt) => {
      const listedChat = chat('chat-1');
      const providerMessage = message(
        'message-1',
        listedChat.chatId,
        '2026-09-04T12:00:00.000Z',
        properties,
      );
      const listedMessage = message(
        providerMessage.messageId,
        listedChat.chatId,
        providerMessage.timestamp ?? undefined,
        { senderId: binding.instagramUserId, delivered: true },
      );
      const harness = createHarness({
        listChats: jest
          .fn()
          .mockResolvedValue({ chats: [listedChat], nextCursor: null }),
        listMessages: jest
          .fn()
          .mockResolvedValue({ messages: [listedMessage], nextCursor: null }),
        getMessage: jest.fn().mockResolvedValue(providerMessage),
      });
      const service = await harness.createService();

      await expect(service.synchronizeBinding(bindingId)).resolves.toEqual(
        'COMPLETED',
      );

      const [projectionInput] =
        harness.projection.upsertVerifiedMessage.mock.calls[0];

      expect(projectionInput).toEqual(
        expect.objectContaining({
          message: providerMessage,
          deliveryState,
        }),
      );
      if (deliveryStateUpdatedAt) {
        expect(projectionInput).toEqual(
          expect.objectContaining({ deliveryStateUpdatedAt }),
        );
      } else {
        expect(projectionInput).not.toHaveProperty('deliveryStateUpdatedAt');
      }
    },
  );

  it('asserts availability before state, skips an occupied lock, and releases an acquired lock after a failure', async () => {
    const unavailable = new Error('Unipile Instagram is disabled');
    const unavailableHarness = createHarness({
      availabilityError: unavailable,
    });
    const unavailableService = await unavailableHarness.createService();

    await expect(unavailableService.synchronizeBinding(bindingId)).rejects.toBe(
      unavailable,
    );
    expect(
      unavailableHarness.dataSource.createQueryRunner,
    ).not.toHaveBeenCalled();
    expect(unavailableHarness.bindingRepository.findOne).not.toHaveBeenCalled();

    const occupiedHarness = createHarness({ lockAcquired: false });
    const occupiedService = await occupiedHarness.createService();

    await expect(
      occupiedService.synchronizeBinding(bindingId),
    ).resolves.toEqual('ALREADY_RUNNING');
    expect(occupiedHarness.bindingRepository.findOne).not.toHaveBeenCalled();
    expect(occupiedHarness.queryRunner.release).toHaveBeenCalledTimes(1);
    expect(occupiedHarness.queryRunner.query).toHaveBeenCalledTimes(1);

    const retryableReadFailure = new UnipileReadError(
      503,
      'UNIPILE_CHAT_LIST_UNAVAILABLE',
      'temporary Unipile failure',
      true,
    );
    const failureHarness = createHarness({
      listChats: jest.fn().mockRejectedValue(retryableReadFailure),
    });
    const failureService = await failureHarness.createService();

    await expect(failureService.synchronizeBinding(bindingId)).rejects.toBe(
      retryableReadFailure,
    );
    expect(failureHarness.queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtext($1))',
      [`unipile-instagram-sync:${bindingId}`],
    );
    expect(failureHarness.queryRunner.release).toHaveBeenCalledTimes(1);
    expect(failureHarness.state.runs[0]).toMatchObject({
      status: 'RUNNING',
      completedChatHighWaterAt: null,
      completedAt: null,
    });
  });
});

describe('UnipileInstagramSyncService connected timestamp ingestion', () => {
  const apiBaseUrl = 'https://timestamp.invalid/api/v1/';
  const rawChat = {
    object: 'Chat',
    id: 'chat-1',
    account_id: binding.unipileAccountId,
    account_type: 'INSTAGRAM',
    type: 0,
    attendee_provider_id: 'attendee-chat-1',
    name: 'body-sentinel',
    timestamp: '2024-02-29T12:00:00.123456Z',
  };
  const rawMessage = {
    object: 'Message',
    id: 'message-1',
    account_id: binding.unipileAccountId,
    chat_id: 'chat-1',
    sender_id: 'attendee-chat-1',
    is_sender: 0,
    text: 'body-sentinel',
    attachments: [],
    timestamp: '2024-02-29T12:00:00.123456Z',
  };
  const reads = [
    {
      method: 'listChats',
      code: 'UNIPILE_CHAT_LIST_UNAVAILABLE',
      reason: 'Unable to retrieve the requested Instagram chats',
    },
    {
      method: 'getChat',
      code: 'UNIPILE_CHAT_UNAVAILABLE',
      reason: 'Unable to retrieve the requested Instagram chat',
    },
    {
      method: 'listMessages',
      code: 'UNIPILE_MESSAGE_LIST_UNAVAILABLE',
      reason: 'Unable to retrieve the requested Instagram messages',
    },
    {
      method: 'getMessage',
      code: 'UNIPILE_MESSAGE_UNAVAILABLE',
      reason: 'Unable to retrieve the requested Instagram message',
    },
  ] as const;

  it.each(reads)(
    'marks each ACTIVE sweep FAILED at actual $method HTTP200 rejection, not a lifetime retry bound',
    async (read) => {
      const malformed = 'not-a-date-timestamp-sentinel';
      const bodies = [
        {
          object: 'ChatList',
          items: [
            {
              ...rawChat,
              timestamp:
                read.method === 'listChats' ? malformed : rawChat.timestamp,
            },
          ],
          cursor: null,
        },
        {
          ...rawChat,
          timestamp: read.method === 'getChat' ? malformed : rawChat.timestamp,
        },
        {
          object: 'MessageList',
          items: [
            {
              ...rawMessage,
              timestamp:
                read.method === 'listMessages'
                  ? malformed
                  : rawMessage.timestamp,
            },
          ],
          cursor: null,
        },
        {
          ...rawMessage,
          timestamp:
            read.method === 'getMessage' ? malformed : rawMessage.timestamp,
        },
      ];
      const routes = [
        `chats?account_id=${binding.unipileAccountId}&account_type=INSTAGRAM&limit=250`,
        'chats/chat-1',
        'chats/chat-1/messages?after=2024-02-28T11%3A00%3A00.000Z&limit=250',
        'messages/message-1',
      ];
      const fetch = jest.fn(async (url: string, init: RequestInit) => {
        expect(init.method).toBe('GET');
        const index = routes.findIndex(
          (route) => url === `${apiBaseUrl}${route}`,
        );
        expect(index).toBeGreaterThanOrEqual(0);
        if (index < 0) throw new Error('Unexpected synthetic route');
        return new Response(JSON.stringify(bodies[index]), { status: 200 });
      });
      const module = await Test.createTestingModule({
        providers: [
          UnipileV1ClientService,
          { provide: UNIPILE_FETCH, useValue: fetch },
          {
            provide: UnipileInstagramAvailabilityService,
            useValue: { assertEnabled: jest.fn(), config: { apiBaseUrl } },
          },
          {
            provide: TwentyConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                expect(key).toBe('UNIPILE_API_KEY');
                return 'synthetic-timestamp-api-key-secret';
              }),
            },
          },
        ],
      }).compile();
      try {
        const checkpoint: Checkpoint = {
          id: 'existing-checkpoint',
          bindingId,
          unipileChatId: 'chat-1',
          completedMessageHighWaterAt: new Date('2024-02-28T12:00:00.000Z'),
        };
        const checkpointBefore = { ...checkpoint };
        const harness = createHarness({
          realClient: module.get(UnipileV1ClientService),
          checkpoints: [checkpoint],
          // Account-status reconciliation is deliberately outside this transport slice.
          reconciledStatus: 'ACTIVE',
        });
        const service = await harness.createService();
        const rejectedIndex = reads.indexOf(read);
        const expectedRoutes = routes
          .slice(0, rejectedIndex + 1)
          .map((route) => `${apiBaseUrl}${route}`);
        for (let sweep = 1; sweep <= 2; sweep++) {
          const result = service.synchronizeBinding(bindingId);
          await expect(result).rejects.toBeInstanceOf(UnipileReadError);
          await expect(result).rejects.toMatchObject({
            status: 200,
            retryable: false,
            code: read.code,
            message: read.reason,
          });
          expect(harness.state.runs).toHaveLength(sweep);
          expect(harness.state.runs[sweep - 1]).toMatchObject({
            status: 'FAILED',
            failureCode: read.code,
            failureReason: read.reason,
            completedAt: expect.any(Date),
            completedChatHighWaterAt: null,
            chatCursor: null,
            messageCursor: null,
            currentChatId: rejectedIndex >= 2 ? 'chat-1' : null,
            currentChatAttendeeId:
              rejectedIndex >= 2 ? 'attendee-chat-1' : null,
          });
          expect(
            harness.state.savedRuns[harness.state.savedRuns.length - 1],
          ).toEqual(harness.state.runs[sweep - 1]);
          expect(JSON.stringify(harness.state.runs)).not.toMatch(
            /timestamp-sentinel|body-sentinel|synthetic-timestamp-api-key-secret|Zod|issues/,
          );
          expect(harness.state.checkpoints.get('chat-1')).toEqual(
            checkpointBefore,
          );
          expect(harness.checkpointRepository.save).not.toHaveBeenCalled();
          expect(harness.projection.upsertVerifiedChat).toHaveBeenCalledTimes(
            rejectedIndex >= 2 ? sweep : 0,
          );
          if (rejectedIndex >= 2)
            expect(
              harness.projection.upsertVerifiedChat,
            ).toHaveBeenLastCalledWith(
              expect.objectContaining({
                chat: expect.objectContaining({ timestamp: rawChat.timestamp }),
              }),
            );
          expect(
            harness.projection.upsertVerifiedMessage,
          ).not.toHaveBeenCalled();
          expect(
            harness.projection.markCompletedMessageSync,
          ).not.toHaveBeenCalled();
          expect(
            harness.projection.markCompletedChatSync,
          ).not.toHaveBeenCalled();
          expect(
            harness.accountService.reconcileBoundAccountStatus,
          ).toHaveBeenCalledTimes(sweep);
          expect(fetch.mock.calls.map(([url]) => url)).toEqual(
            Array.from({ length: sweep }, () => expectedRoutes).flat(),
          );
          expect(harness.queryRunner.query).toHaveBeenLastCalledWith(
            'SELECT pg_advisory_unlock(hashtext($1))',
            [`unipile-instagram-sync:${bindingId}`],
          );
          expect(harness.queryRunner.release).toHaveBeenCalledTimes(sweep);
        }
      } finally {
        await module.close();
      }
    },
  );
});
