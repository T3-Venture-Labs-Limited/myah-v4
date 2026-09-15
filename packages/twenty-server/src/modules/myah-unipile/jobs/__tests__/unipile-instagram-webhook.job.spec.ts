import { Scope } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';

import {
  MessageQueue,
  PROCESSOR_METADATA,
  PROCESS_METADATA,
} from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  UNIPILE_FETCH,
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';

type WebhookEvent = {
  id: string;
  bindingId: string;
  eventType: 'MESSAGE_RECEIVED' | 'MESSAGE_READ' | 'ACCOUNT_STATUS';
  unipileChatId: string | null;
  attemptCount: number;
  unipileMessageId: string | null;
  attendeeProviderId: string | null;
  accountStatus: string | null;
  deliveryState: 'READ' | null;
  deliveryStateUpdatedAt: Date | null;
  status: 'RECEIVED' | 'ENQUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failureCode: string | null;
  failureReason: string | null;
  nextAttemptAt: Date | null;
};

type WebhookJobHarness = {
  accountService: {
    reconcileWebhookAccountStatus: jest.Mock;
    reconcileBoundAccountStatus: jest.Mock;
  };
  availabilityService: { assertEnabled: jest.Mock };
  bindingRepository: { findOne: jest.Mock };
  client: { getAccount: jest.Mock; getChat: jest.Mock; getMessage: jest.Mock };
  dataSource: { transaction: jest.Mock };
  eventRepository: { findOne: jest.Mock; save: jest.Mock };
  manager: { getRepository: jest.Mock; query: jest.Mock };
  projectionService: {
    upsertVerifiedChat: jest.Mock;
    upsertVerifiedMessage: jest.Mock;
  };
  syncQueue: { enqueue: jest.Mock };
};

type WebhookJob = {
  handle(data: { eventId: string }): Promise<void>;
};

type WebhookJobModule = {
  UnipileInstagramWebhookJob: new (
    dataSource: { transaction: jest.Mock },
    client: Pick<
      UnipileV1ClientService,
      'getAccount' | 'getChat' | 'getMessage'
    >,
    projectionService: {
      upsertVerifiedChat: jest.Mock;
      upsertVerifiedMessage: jest.Mock;
    },
    accountService: {
      reconcileWebhookAccountStatus: jest.Mock;
      reconcileBoundAccountStatus: jest.Mock;
    },
    syncQueue: { enqueue: jest.Mock },
    availabilityService: { assertEnabled: jest.Mock },
  ) => WebhookJob;
};

const loadWebhookJobModule = (): WebhookJobModule | undefined => {
  try {
    return require('src/modules/myah-unipile/jobs/unipile-instagram-webhook.job') as WebhookJobModule;
  } catch {
    return undefined;
  }
};

const binding = {
  deactivatedAt: null,
  id: 'binding-id',
  instagramUserId: 'instagram-account-id',
  status: 'ACTIVE',
  unipileAccountId: 'unipile-account-id',
  workspaceId: 'workspace-id',
  workspaceInstagramAccountRecordId: 'workspace-instagram-account-id',
};

const messageEvent: WebhookEvent = {
  accountStatus: null,
  attendeeProviderId: 'instagram-attendee-id',
  bindingId: binding.id,
  deliveryState: null,
  deliveryStateUpdatedAt: null,
  eventType: 'MESSAGE_RECEIVED',
  failureCode: null,
  failureReason: null,
  id: 'event-id',
  attemptCount: 0,
  status: 'ENQUEUED',
  nextAttemptAt: null,
  unipileChatId: 'unipile-chat-id',
  unipileMessageId: 'unipile-message-id',
};

const createHarness = (
  event: WebhookEvent | null = messageEvent,
): WebhookJobHarness => {
  let storedEvent = event ? { ...event } : null;
  const eventRepository = {
    findOne: jest.fn(async () => (storedEvent ? { ...storedEvent } : null)),
    save: jest.fn(async (value: WebhookEvent) => {
      storedEvent = { ...value };

      return { ...storedEvent };
    }),
  };
  const bindingRepository = { findOne: jest.fn().mockResolvedValue(binding) };
  const manager = {
    getRepository: jest.fn((entity: { name: string }) =>
      entity.name === 'UnipileInstagramWebhookEventEntity'
        ? eventRepository
        : bindingRepository,
    ),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(
      async (
        callback: (
          transactionManager: WebhookJobHarness['manager'],
        ) => Promise<unknown>,
      ) => await callback(manager),
    ),
  };
  const availabilityService = { assertEnabled: jest.fn() };
  const client = {
    getAccount: jest.fn().mockResolvedValue({
      accountId: binding.unipileAccountId,
      instagramUserId: binding.instagramUserId,
      sourceStatus: 'OK',
      username: 'instagram-user',
    }),
    getChat: jest.fn().mockResolvedValue({
      accountId: binding.unipileAccountId,
      accountType: 'INSTAGRAM',
      attendeeProviderId: messageEvent.attendeeProviderId,
      chatId: messageEvent.unipileChatId,
      name: 'Instagram attendee',
      timestamp: '2026-09-04T12:00:00.000Z',
      type: 'ONE_TO_ONE',
    }),
    getMessage: jest.fn().mockResolvedValue({
      accountId: binding.unipileAccountId,
      attachmentCount: 0,
      chatId: messageEvent.unipileChatId,
      hasAttachments: false,
      messageId: messageEvent.unipileMessageId,
      senderId: messageEvent.attendeeProviderId,
      text: 'Provider reread message',
      timestamp: '2026-09-04T12:00:00.000Z',
    }),
  };
  const projectionService = {
    upsertVerifiedChat: jest
      .fn()
      .mockResolvedValue({ conversationRecordId: 'conversation-record-id' }),
    upsertVerifiedMessage: jest.fn().mockResolvedValue({
      messageRecordId: 'message-record-id',
    }),
  };
  const accountService = {
    reconcileWebhookAccountStatus: jest.fn().mockResolvedValue('ACTIVE'),
    reconcileBoundAccountStatus: jest.fn().mockResolvedValue('ACTIVE'),
  };
  const syncQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };

  return {
    accountService,
    availabilityService,
    bindingRepository,
    client,
    dataSource,
    eventRepository,
    manager,
    projectionService,
    syncQueue,
  };
};

describe('UnipileInstagramWebhookJob', () => {
  const createJob = (
    harness: WebhookJobHarness,
    realClient?: UnipileV1ClientService,
  ) => {
    const jobModule = loadWebhookJobModule();

    expect(jobModule).toBeDefined();

    if (!jobModule) {
      throw new Error('Unipile Instagram webhook job is not implemented');
    }

    return new jobModule.UnipileInstagramWebhookJob(
      harness.dataSource,
      realClient ?? harness.client,
      harness.projectionService,
      harness.accountService,
      harness.syncQueue,
      harness.availabilityService,
    );
  };

  describe('connected timestamp ingestion', () => {
    const cases = [
      {
        read: 'getChat',
        code: 'UNIPILE_CHAT_UNAVAILABLE',
        reason: 'Unable to retrieve the requested Instagram chat',
        calls: 2,
      },
      {
        read: 'getMessage',
        code: 'UNIPILE_MESSAGE_UNAVAILABLE',
        reason: 'Unable to retrieve the requested Instagram message',
        calls: 3,
      },
    ] as const;
    const createConnectedHarness = async (
      badRead: string | null,
      timestamp: string | null = null,
      chatStatus = 200,
    ) => {
      const harness = createHarness();
      const apiBaseUrl = 'https://timestamp.invalid/api/v1/';
      const routes = [
        `accounts/${binding.unipileAccountId}`,
        `chats/${messageEvent.unipileChatId}`,
        `messages/${messageEvent.unipileMessageId}`,
      ];
      const bodies = [
        {
          id: binding.unipileAccountId,
          type: 'INSTAGRAM',
          connection_params: {
            im: { id: binding.instagramUserId, username: 'synthetic-user' },
          },
          sources: [{ status: 'OK' }],
        },
        {
          object: 'Chat',
          id: messageEvent.unipileChatId,
          account_id: binding.unipileAccountId,
          account_type: 'INSTAGRAM',
          type: 0,
          attendee_provider_id: messageEvent.attendeeProviderId,
          name: 'body-sentinel',
          timestamp:
            badRead === 'getChat' ? 'not-a-date-timestamp-sentinel' : timestamp,
        },
        {
          object: 'Message',
          id: messageEvent.unipileMessageId,
          account_id: binding.unipileAccountId,
          chat_id: messageEvent.unipileChatId,
          sender_id: messageEvent.attendeeProviderId,
          text: 'body-sentinel',
          attachments: [],
          timestamp:
            badRead === 'getMessage'
              ? 'not-a-date-timestamp-sentinel'
              : timestamp,
        },
      ];
      const fetch = jest.fn(async (url: string, init: RequestInit) => {
        expect(harness.eventRepository.save).toHaveBeenCalledTimes(1);
        expect(harness.eventRepository.save.mock.calls[0][0]).toMatchObject({
          status: 'PROCESSING',
          attemptCount: 1,
          nextAttemptAt: null,
        });
        expect(init.method).toBe('GET');
        const index = routes.findIndex(
          (route) => url === `${apiBaseUrl}${route}`,
        );
        expect(index).toBeGreaterThanOrEqual(0);
        if (index < 0) throw new Error('Unexpected synthetic route');
        return new Response(JSON.stringify(bodies[index]), {
          status: index === 1 ? chatStatus : 200,
        });
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
      return {
        harness,
        fetch,
        module,
        job: createJob(harness, module.get(UnipileV1ClientService)),
        urls: routes.map((route) => `${apiBaseUrl}${route}`),
      };
    };

    it.each(cases)(
      'claims PROCESSING then fails the event on actual $read HTTP200 rejection; FAILED replay does no reads or saves',
      async ({ read, code, reason, calls }) => {
        const { harness, fetch, module, job, urls } =
          await createConnectedHarness(read);
        try {
          const result = job.handle({ eventId: messageEvent.id });
          await expect(result).rejects.toBeInstanceOf(UnipileReadError);
          await expect(result).rejects.toMatchObject({
            status: 200,
            retryable: false,
            code,
            message: reason,
          });
          expect(fetch.mock.calls.map(([url]) => url)).toEqual(
            urls.slice(0, calls),
          );
          expect(harness.eventRepository.save).toHaveBeenCalledTimes(2);
          expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
            expect.objectContaining({
              status: 'FAILED',
              attemptCount: 1,
              nextAttemptAt: null,
              failureCode: code,
              failureReason: reason,
            }),
          );
          expect(
            JSON.stringify(harness.eventRepository.save.mock.calls),
          ).not.toMatch(
            /timestamp-sentinel|body-sentinel|synthetic-timestamp-api-key-secret|Zod|issues/,
          );
          expect(
            harness.eventRepository.save.mock.invocationCallOrder[0],
          ).toBeLessThan(fetch.mock.invocationCallOrder[0]);
          expect(
            harness.projectionService.upsertVerifiedChat,
          ).not.toHaveBeenCalled();
          expect(
            harness.projectionService.upsertVerifiedMessage,
          ).not.toHaveBeenCalled();
          expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
          await expect(
            job.handle({ eventId: messageEvent.id }),
          ).resolves.toBeUndefined();
          expect(fetch).toHaveBeenCalledTimes(calls);
          expect(harness.eventRepository.save).toHaveBeenCalledTimes(2);
          expect(
            harness.projectionService.upsertVerifiedChat,
          ).not.toHaveBeenCalled();
          expect(
            harness.projectionService.upsertVerifiedMessage,
          ).not.toHaveBeenCalled();
          expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
        } finally {
          await module.close();
        }
      },
    );

    it('retains retryable real-adapter failures as RECEIVED with backoff, not FAILED', async () => {
      const { harness, fetch, module, job, urls } =
        await createConnectedHarness(null, null, 503);
      const startedAt = Date.now();
      try {
        await expect(
          job.handle({ eventId: messageEvent.id }),
        ).rejects.toMatchObject({
          status: 503,
          retryable: true,
          code: 'UNIPILE_CHAT_UNAVAILABLE',
        });
        expect(fetch.mock.calls.map(([url]) => url)).toEqual(urls.slice(0, 2));
        expect(harness.eventRepository.save).toHaveBeenCalledTimes(2);
        const retry = harness.eventRepository.save.mock
          .calls[1][0] as WebhookEvent;
        expect(retry).toMatchObject({
          status: 'RECEIVED',
          attemptCount: 1,
          nextAttemptAt: expect.any(Date),
          failureCode: 'UNIPILE_WEBHOOK_REREAD_FAILED',
          failureReason: 'Unable to reread Unipile Instagram webhook event',
        });
        expect(retry.nextAttemptAt?.getTime()).toBeGreaterThan(startedAt);
        expect(
          harness.projectionService.upsertVerifiedChat,
        ).not.toHaveBeenCalled();
        expect(
          harness.projectionService.upsertVerifiedMessage,
        ).not.toHaveBeenCalled();
        expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    });

    it.each([null, '2024-02-29T12:00:00.123456-00:00'])(
      'projects accepted real-adapter timestamps %p unchanged after the valid account read',
      async (timestamp) => {
        const { harness, fetch, module, job, urls } =
          await createConnectedHarness(null, timestamp);
        try {
          await expect(
            job.handle({ eventId: messageEvent.id }),
          ).resolves.toBeUndefined();
          expect(fetch.mock.calls.map(([url]) => url)).toEqual(urls);
          expect(
            harness.projectionService.upsertVerifiedChat,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              chat: expect.objectContaining({ timestamp }),
            }),
          );
          expect(
            harness.projectionService.upsertVerifiedMessage,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              message: expect.objectContaining({ timestamp }),
            }),
          );
          expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
            expect.objectContaining({
              status: 'COMPLETED',
              failureCode: null,
              failureReason: null,
              nextAttemptAt: null,
            }),
          );
          expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
        } finally {
          await module.close();
        }
      },
    );
  });

  it('checks availability before claiming or reading webhook state', async () => {
    const harness = createHarness();
    const job = createJob(harness);
    const availabilityError = new Error('Unipile is unavailable');

    harness.availabilityService.assertEnabled.mockImplementation(() => {
      throw availabilityError;
    });

    await expect(job.handle({ eventId: messageEvent.id })).rejects.toThrow(
      availabilityError,
    );
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.eventRepository.findOne).not.toHaveBeenCalled();
    expect(harness.client.getChat).not.toHaveBeenCalled();
    expect(harness.client.getAccount).not.toHaveBeenCalled();
  });

  it('does not reread a completed, failed, or already processing event', async () => {
    for (const status of ['COMPLETED', 'FAILED', 'PROCESSING'] as const) {
      const harness = createHarness({ ...messageEvent, status });
      const job = createJob(harness);

      await expect(
        job.handle({ eventId: messageEvent.id }),
      ).resolves.toBeUndefined();
      expect(harness.client.getAccount).not.toHaveBeenCalled();
      expect(harness.client.getChat).not.toHaveBeenCalled();
      expect(harness.client.getMessage).not.toHaveBeenCalled();
      expect(
        harness.projectionService.upsertVerifiedChat,
      ).not.toHaveBeenCalled();
      expect(harness.eventRepository.save).not.toHaveBeenCalled();
    }
  });

  it('claims the event before provider I/O, rereads exact identities, and projects verified data', async () => {
    const scheduledEvent = {
      ...messageEvent,
      nextAttemptAt: new Date('2026-09-04T12:01:00.000Z'),
    };
    const harness = createHarness(scheduledEvent);
    const job = createJob(harness);

    await expect(
      job.handle({ eventId: messageEvent.id }),
    ).resolves.toBeUndefined();

    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [messageEvent.id],
    );
    expect(harness.eventRepository.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        attemptCount: 1,
        id: messageEvent.id,
        nextAttemptAt: null,
        status: 'PROCESSING',
      }),
    );
    expect(harness.client.getAccount).toHaveBeenCalledWith(
      binding.unipileAccountId,
    );
    expect(harness.client.getAccount.mock.invocationCallOrder[0]).toBeLessThan(
      harness.client.getChat.mock.invocationCallOrder[0],
    );
    expect(harness.client.getChat).toHaveBeenCalledWith({
      accountId: binding.unipileAccountId,
      chatId: messageEvent.unipileChatId,
      expectedAttendeeId: messageEvent.attendeeProviderId,
    });
    expect(harness.client.getMessage).toHaveBeenCalledWith({
      accountId: binding.unipileAccountId,
      chatId: messageEvent.unipileChatId,
      messageId: messageEvent.unipileMessageId,
    });
    expect(harness.projectionService.upsertVerifiedChat).toHaveBeenCalledWith({
      binding,
      chat: expect.objectContaining({
        accountId: binding.unipileAccountId,
        attendeeProviderId: messageEvent.attendeeProviderId,
        chatId: messageEvent.unipileChatId,
      }),
      workspace: { id: binding.workspaceId },
    });
    expect(
      harness.projectionService.upsertVerifiedMessage,
    ).toHaveBeenCalledWith({
      binding,
      chat: expect.any(Object),
      conversationRecordId: 'conversation-record-id',
      message: expect.objectContaining({
        accountId: binding.unipileAccountId,
        chatId: messageEvent.unipileChatId,
        messageId: messageEvent.unipileMessageId,
      }),
      workspace: { id: binding.workspaceId },
    });
    expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failureCode: null,
        failureReason: null,
        id: messageEvent.id,
        status: 'COMPLETED',
      }),
    );
  });

  it('maps a reread read receipt to its verified message delivery state and time', async () => {
    const readAt = new Date('2026-09-04T13:00:00.000Z');
    const readEvent: WebhookEvent = {
      ...messageEvent,
      deliveryState: 'READ',
      deliveryStateUpdatedAt: readAt,
      eventType: 'MESSAGE_READ',
    };
    const harness = createHarness(readEvent);
    const job = createJob(harness);

    await expect(
      job.handle({ eventId: readEvent.id }),
    ).resolves.toBeUndefined();

    expect(
      harness.projectionService.upsertVerifiedMessage,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryState: 'READ',
        deliveryStateUpdatedAt: readAt.toISOString(),
      }),
    );
  });

  it('marks a structurally invalid claimed event failed without projecting it', async () => {
    const invalidEvent: WebhookEvent = {
      ...messageEvent,
      attendeeProviderId: null,
      unipileMessageId: null,
    };
    const harness = createHarness(invalidEvent);
    const job = createJob(harness);

    await expect(
      job.handle({ eventId: invalidEvent.id }),
    ).resolves.toBeUndefined();

    expect(harness.client.getChat).not.toHaveBeenCalled();
    expect(harness.projectionService.upsertVerifiedChat).not.toHaveBeenCalled();
    expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failureCode: expect.any(String),
        failureReason: expect.any(String),
        id: invalidEvent.id,
        status: 'FAILED',
      }),
    );
  });

  it('returns a generic reread failure to due reconciliation with an incremented attempt and retry time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T12:00:00.000Z'));

    try {
      const harness = createHarness();
      const job = createJob(harness);

      harness.client.getChat.mockRejectedValue(
        new Error('Unable to retrieve the requested Instagram chat'),
      );

      await job.handle({ eventId: messageEvent.id }).catch(() => undefined);

      const savedEvents = harness.eventRepository.save.mock.calls;
      const retry = savedEvents[savedEvents.length - 1][0];

      expect(retry).toEqual(
        expect.objectContaining({
          attemptCount: 1,
          failureCode: expect.any(String),
          failureReason: expect.any(String),
          id: messageEvent.id,
          nextAttemptAt: expect.any(Date),
          status: 'RECEIVED',
        }),
      );
      expect(retry.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(
        harness.projectionService.upsertVerifiedChat,
      ).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('backs off later generic reread failures further without exceeding the retry cap', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T12:00:00.000Z'));

    try {
      const firstHarness = createHarness({
        ...messageEvent,
        id: 'first-event-id',
      });
      const laterHarness = createHarness({
        ...messageEvent,
        attemptCount: 3,
        id: 'later-event-id',
      });
      const firstJob = createJob(firstHarness);
      const laterJob = createJob(laterHarness);

      firstHarness.client.getChat.mockRejectedValue(
        new Error('temporary outage'),
      );
      laterHarness.client.getChat.mockRejectedValue(
        new Error('temporary outage'),
      );

      await firstJob
        .handle({ eventId: 'first-event-id' })
        .catch(() => undefined);
      await laterJob
        .handle({ eventId: 'later-event-id' })
        .catch(() => undefined);

      const firstSavedEvents = firstHarness.eventRepository.save.mock.calls;
      const laterSavedEvents = laterHarness.eventRepository.save.mock.calls;
      const firstRetry = firstSavedEvents[firstSavedEvents.length - 1][0];
      const laterRetry = laterSavedEvents[laterSavedEvents.length - 1][0];
      const firstDelay = firstRetry.nextAttemptAt.getTime() - Date.now();
      const laterDelay = laterRetry.nextAttemptAt.getTime() - Date.now();

      expect(firstDelay).toBeGreaterThan(0);
      expect(laterDelay).toBeGreaterThan(firstDelay);
      expect(laterDelay).toBeLessThanOrEqual(60 * 60 * 1000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks a nonretryable provider reread error failed without scheduling it again', async () => {
    const harness = createHarness();
    const job = createJob(harness);

    harness.client.getChat.mockRejectedValue(
      new UnipileReadError(
        404,
        'UNIPILE_INSTAGRAM_CHAT_NOT_FOUND',
        'The Instagram chat no longer exists',
        false,
      ),
    );

    await job.handle({ eventId: messageEvent.id }).catch(() => undefined);

    expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failureCode: expect.any(String),
        failureReason: expect.any(String),
        id: messageEvent.id,
        nextAttemptAt: null,
        status: 'FAILED',
      }),
    );
  });

  it.each([
    ['provider account id differs', { accountId: 'other-account-id' }],
    [
      'provider Instagram user differs',
      { instagramUserId: 'other-instagram-id' },
    ],
    ['provider source is not ready', { sourceStatus: 'CONNECTING' }],
  ])(
    'marks a message event failed without projection when the %s',
    async (_reason, account) => {
      const harness = createHarness();
      const job = createJob(harness);

      harness.client.getAccount.mockResolvedValue({
        accountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
        sourceStatus: 'OK',
        username: 'instagram-user',
        ...account,
      });

      await job.handle({ eventId: messageEvent.id }).catch(() => undefined);

      expect(harness.client.getChat).not.toHaveBeenCalled();
      expect(harness.client.getMessage).not.toHaveBeenCalled();
      expect(
        harness.projectionService.upsertVerifiedChat,
      ).not.toHaveBeenCalled();
      expect(
        harness.projectionService.upsertVerifiedMessage,
      ).not.toHaveBeenCalled();
      expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: messageEvent.id,
          nextAttemptAt: null,
          status: 'FAILED',
        }),
      );
    },
  );

  it('reconciles a nonterminal account event and enqueues sync only when it remains active', async () => {
    const accountEvent: WebhookEvent = {
      ...messageEvent,
      accountStatus: 'RECONNECTED',
      attendeeProviderId: null,
      eventType: 'ACCOUNT_STATUS',
      unipileChatId: null,
      unipileMessageId: null,
    };
    const harness = createHarness(accountEvent);
    const job = createJob(harness);

    await expect(
      job.handle({ eventId: accountEvent.id }),
    ).resolves.toBeUndefined();

    expect(
      harness.accountService.reconcileWebhookAccountStatus,
    ).toHaveBeenCalledWith({
      bindingId: binding.id,
      status: 'RECONNECTED',
    });
    expect(harness.syncQueue.enqueue).toHaveBeenCalledWith(binding.id);
    expect(harness.client.getChat).not.toHaveBeenCalled();
  });

  it('does not enqueue sync when bound account reconciliation returns an inactive status', async () => {
    const accountEvent: WebhookEvent = {
      ...messageEvent,
      accountStatus: 'ERROR',
      attendeeProviderId: null,
      eventType: 'ACCOUNT_STATUS',
      unipileChatId: null,
      unipileMessageId: null,
    };
    const harness = createHarness(accountEvent);
    const job = createJob(harness);

    harness.accountService.reconcileWebhookAccountStatus.mockResolvedValue(
      'INACTIVE',
    );

    await expect(
      job.handle({ eventId: accountEvent.id }),
    ).resolves.toBeUndefined();

    expect(
      harness.accountService.reconcileWebhookAccountStatus,
    ).toHaveBeenCalledWith({
      bindingId: binding.id,
      status: 'ERROR',
    });
    expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
  });

  it('completes a DELETED account event without rereading the provider or enqueuing sync', async () => {
    const accountEvent: WebhookEvent = {
      ...messageEvent,
      accountStatus: 'DELETED',
      attendeeProviderId: null,
      eventType: 'ACCOUNT_STATUS',
      unipileChatId: null,
      unipileMessageId: null,
    };
    const harness = createHarness(accountEvent);
    const job = createJob(harness);

    harness.accountService.reconcileWebhookAccountStatus.mockResolvedValue(
      'INACTIVE',
    );

    await expect(
      job.handle({ eventId: accountEvent.id }),
    ).resolves.toBeUndefined();

    expect(
      harness.accountService.reconcileWebhookAccountStatus,
    ).toHaveBeenCalledWith({
      bindingId: binding.id,
      status: 'DELETED',
    });
    expect(harness.client.getAccount).not.toHaveBeenCalled();
    expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
    expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: accountEvent.id,
        status: 'COMPLETED',
      }),
    );
  });

  it('is a request-scoped messaging queue processor with the exact event-only process name', () => {
    const jobModule = loadWebhookJobModule();

    expect(jobModule).toBeDefined();

    if (!jobModule) {
      return;
    }

    const Job = jobModule.UnipileInstagramWebhookJob;

    expect(Reflect.getMetadata(PROCESSOR_METADATA, Job)).toEqual({
      queueName: MessageQueue.messagingQueue,
      scope: Scope.REQUEST,
    });
    expect(Reflect.getMetadata(PROCESS_METADATA, Job.prototype.handle)).toEqual(
      {
        jobName: Job.name,
      },
    );
  });
});
