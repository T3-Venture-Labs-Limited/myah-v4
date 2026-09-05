type WebhookEvent = {
  id: string;
  bindingId: string;
  eventFingerprint: string;
  eventType: string;
  unipileChatId: string | null;
  unipileMessageId: string | null;
  attendeeProviderId: string | null;
  accountStatus: string | null;
  deliveryState: string | null;
  deliveryStateUpdatedAt: Date | null;
  status: 'RECEIVED' | 'ENQUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
};

type Binding = {
  deactivatedAt: null;
  id: string;
  status: string;
  unipileAccountId: string;
};

type WebhookIntakeHarness = {
  availabilityService: { assertEnabled: jest.Mock };
  bindingRepository: { findOne: jest.Mock };
  configService: { get: jest.Mock };
  dataSource: { transaction: jest.Mock };
  eventRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  manager: { getRepository: jest.Mock; query: jest.Mock };
  webhookQueue: { enqueue: jest.Mock };
};

type WebhookIntakeService = {
  intake(input: {
    secret: string | undefined;
    body: unknown;
  }): Promise<{ ok: true; duplicate: boolean }>;
};

type WebhookIntakeServiceModule = {
  UnipileInstagramWebhookIntakeService: new (
    configService: { get: jest.Mock },
    dataSource: { transaction: jest.Mock },
    webhookQueue: { enqueue: jest.Mock },
    availabilityService: { assertEnabled: jest.Mock },
  ) => WebhookIntakeService;
};

const loadWebhookIntakeServiceModule = ():
  | WebhookIntakeServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-webhook-intake.service') as WebhookIntakeServiceModule;
  } catch {
    return undefined;
  }
};

const instagramOwnerId = 'instagram-owner-id';
const instagramRemoteId = 'instagram-remote-id';

const activeBinding = {
  deactivatedAt: null,
  id: 'binding-id',
  instagramUserId: instagramOwnerId,
  status: 'ACTIVE',
  unipileAccountId: 'unipile-account-id',
};

const messageReceivedBody = {
  account_id: activeBinding.unipileAccountId,
  account_info: { user_id: instagramOwnerId },
  account_type: 'INSTAGRAM',
  attachments: [{ url: 'https://cdn.unipile.example/attachment.jpg' }],
  attendees: [
    { attendee_provider_id: instagramOwnerId },
    { attendee_provider_id: instagramRemoteId },
  ],
  chat_id: 'unipile-chat-id',
  event: 'message_received',
  message: 'raw inbound message must not persist',
  message_id: 'unipile-message-id',
  sender: {
    attendee_provider_id: 'instagram-sender-id',
    name: 'Remote Instagram User',
    profile_url: 'https://instagram.example/remote-user',
  },
  timestamp: '2026-09-04T12:00:00.000Z',
  webhook_name: 'message_received',
};

const createHarness = (input?: {
  binding?: Binding | null;
  event?: WebhookEvent | null;
}): WebhookIntakeHarness => {
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue(input?.binding ?? activeBinding),
  };
  const eventRepository = {
    create: jest.fn((event: Omit<WebhookEvent, 'id'>) => ({
      id: 'event-id',
      ...event,
    })),
    findOne: jest.fn().mockResolvedValue(input?.event ?? null),
    save: jest.fn().mockImplementation(async (event: WebhookEvent) => event),
  };
  const manager = {
    getRepository: jest.fn((entity: { name: string }) => {
      if (entity.name === 'UnipileInstagramAccountBindingEntity') {
        return bindingRepository;
      }

      return eventRepository;
    }),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(
      async (
        callback: (
          transactionManager: WebhookIntakeHarness['manager'],
        ) => Promise<unknown>,
      ) => await callback(manager),
    ),
  };
  const configService = {
    get: jest.fn().mockReturnValue('shared-webhook-secret'),
  };
  const webhookQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };

  return {
    availabilityService: { assertEnabled: jest.fn() },
    bindingRepository,
    configService,
    dataSource,
    eventRepository,
    manager,
    webhookQueue,
  };
};

describe('UnipileInstagramWebhookIntakeService', () => {
  const createService = (harness: WebhookIntakeHarness) => {
    const serviceModule = loadWebhookIntakeServiceModule();

    expect(serviceModule).toBeDefined();

    if (!serviceModule) {
      throw new Error('Unipile Instagram webhook intake is not implemented');
    }

    return new serviceModule.UnipileInstagramWebhookIntakeService(
      harness.configService,
      harness.dataSource,
      harness.webhookQueue,
      harness.availabilityService,
    );
  };

  it('stops before secret lookup, body access, persistence, or queueing when disabled', async () => {
    const harness = createHarness();
    const service = createService(harness);
    const disabledError = new Error('Unipile Instagram is disabled');

    harness.availabilityService.assertEnabled.mockImplementation(() => {
      throw disabledError;
    });

    await expect(
      service.intake({
        body: Object.defineProperty({}, 'event', {
          get: () => {
            throw new Error('body must not be read');
          },
        }),
        secret: undefined,
      }),
    ).rejects.toThrow(disabledError);

    expect(harness.availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

    expect(harness.configService.get).not.toHaveBeenCalled();
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.bindingRepository.findOne).not.toHaveBeenCalled();
    expect(harness.eventRepository.save).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
  });
  it('rejects a missing or invalid secret before reading payload fields or touching the database', async () => {
    const harness = createHarness();
    const service = createService(harness);
    const unreadableBody = Object.defineProperty({}, 'event', {
      get: () => {
        throw new Error('payload must not be read before secret verification');
      },
    });

    await expect(
      service.intake({ body: unreadableBody, secret: undefined }),
    ).rejects.toThrow();
    await expect(
      service.intake({ body: unreadableBody, secret: 'shared-webhook-secreu' }),
    ).rejects.toThrow();

    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.bindingRepository.findOne).not.toHaveBeenCalled();
    expect(harness.eventRepository.save).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an unbounded workspace identifier before database or queue side effects', async () => {
    const harness = createHarness();
    const service = createService(harness);

    await expect(
      service.intake({
        body: { ...messageReceivedBody, workspace_id: 'attacker-workspace-id' },
        secret: 'shared-webhook-secret',
      }),
    ).rejects.toThrow();

    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-Instagram provider', { account_type: 'WHATSAPP' }],
    ['a malformed account owner', { account_info: { user_id: 42 } }],
    [
      'a malformed attendee collection',
      { attendees: { attendee_provider_id: instagramRemoteId } },
    ],
  ])(
    'rejects %s before database or queue side effects',
    async (_name, overrides) => {
      const harness = createHarness();
      const service = createService(harness);

      await expect(
        service.intake({
          body: { ...messageReceivedBody, ...overrides },
          secret: 'shared-webhook-secret',
        }),
      ).rejects.toThrow();

      expect(harness.dataSource.transaction).not.toHaveBeenCalled();
      expect(harness.bindingRepository.findOne).not.toHaveBeenCalled();
      expect(harness.eventRepository.create).not.toHaveBeenCalled();
      expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'a non-Instagram AccountStatus provider',
      {
        AccountStatus: {
          account_id: activeBinding.unipileAccountId,
          account_type: 'WHATSAPP',
          message: 'OK',
        },
      },
    ],
    [
      'a timestamped AccountStatus',
      {
        AccountStatus: {
          account_id: activeBinding.unipileAccountId,
          account_type: 'INSTAGRAM',
          message: 'OK',
          timestamp: '2026-09-04T12:00:00.000Z',
        },
      },
    ],
    [
      'a flat synthetic account status',
      {
        account_id: activeBinding.unipileAccountId,
        account_type: 'INSTAGRAM',
        event: 'account_status',
        status: 'OK',
      },
    ],
  ])(
    'rejects %s before database or queue side effects',
    async (_name, body) => {
      const harness = createHarness();
      const service = createService(harness);

      await expect(
        service.intake({ body, secret: 'shared-webhook-secret' }),
      ).rejects.toThrow();

      expect(harness.dataSource.transaction).not.toHaveBeenCalled();
      expect(harness.bindingRepository.findOne).not.toHaveBeenCalled();
      expect(harness.eventRepository.create).not.toHaveBeenCalled();
      expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('commits a received claim before publishing its id then marks it enqueued', async () => {
    const harness = createHarness();
    const service = createService(harness);

    await expect(
      service.intake({
        body: messageReceivedBody,
        secret: 'shared-webhook-secret',
      }),
    ).resolves.toEqual({ ok: true, duplicate: false });

    expect(harness.bindingRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deactivatedAt: expect.anything(),
          unipileAccountId: activeBinding.unipileAccountId,
        },
      }),
    );
    const bindingLookup = harness.bindingRepository.findOne.mock
      .calls[0][0] as {
      where: Record<string, unknown>;
    };

    expect(bindingLookup.where).not.toHaveProperty('workspaceId');
    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [expect.any(String)],
    );
    expect(harness.eventRepository.create).toHaveBeenCalledWith({
      accountStatus: null,
      attendeeProviderId: instagramRemoteId,
      bindingId: activeBinding.id,
      deliveryState: null,
      deliveryStateUpdatedAt: null,
      eventFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      eventType: 'MESSAGE_RECEIVED',
      status: 'ENQUEUED',
      unipileChatId: messageReceivedBody.chat_id,
      unipileMessageId: messageReceivedBody.message_id,
    });
    expect(harness.eventRepository.save).toHaveBeenCalledTimes(1);
    expect(harness.eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-id', status: 'ENQUEUED' }),
    );
    expect(
      harness.eventRepository.save.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.webhookQueue.enqueue.mock.invocationCallOrder[0]);

    const persistedEvent = harness.eventRepository.create.mock
      .calls[0][0] as Record<string, unknown>;

    expect(Object.keys(persistedEvent).sort()).toEqual([
      'accountStatus',
      'attendeeProviderId',
      'bindingId',
      'deliveryState',
      'deliveryStateUpdatedAt',
      'eventFingerprint',
      'eventType',
      'status',
      'unipileChatId',
      'unipileMessageId',
    ]);
    expect(JSON.stringify(persistedEvent)).not.toContain(
      'shared-webhook-secret',
    );
    expect(JSON.stringify(persistedEvent)).not.toContain(
      'raw inbound message must not persist',
    );
    expect(JSON.stringify(persistedEvent)).not.toContain(
      'https://cdn.unipile.example/attachment.jpg',
    );
    expect(JSON.stringify(persistedEvent)).not.toContain(
      'Remote Instagram User',
    );
    expect(JSON.stringify(persistedEvent)).not.toContain(
      'https://instagram.example/remote-user',
    );
  });

  it('persists a bounded AccountStatus envelope without message-event fields', async () => {
    const harness = createHarness();
    const service = createService(harness);

    await expect(
      service.intake({
        body: {
          AccountStatus: {
            account_id: activeBinding.unipileAccountId,
            account_type: 'INSTAGRAM',
            message: 'OK',
          },
        },
        secret: 'shared-webhook-secret',
      }),
    ).resolves.toEqual({ ok: true, duplicate: false });

    expect(harness.eventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountStatus: 'OK',
        attendeeProviderId: null,
        eventType: 'ACCOUNT_STATUS',
        unipileChatId: null,
        unipileMessageId: null,
      }),
    );
  });

  it('leaves a newly committed event enqueued when queueing fails', async () => {
    const harness = createHarness();
    const service = createService(harness);
    const queueError = new Error('messaging queue unavailable');

    harness.webhookQueue.enqueue.mockRejectedValue(queueError);

    await expect(
      service.intake({
        body: messageReceivedBody,
        secret: 'shared-webhook-secret',
      }),
    ).rejects.toThrow(queueError);

    expect(harness.eventRepository.save).toHaveBeenCalledTimes(1);
    expect(harness.eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'event-id', status: 'ENQUEUED' }),
    );
  });

  it('re-enqueues an already enqueued duplicate without rewriting state', async () => {
    const existingEvent: WebhookEvent = {
      accountStatus: null,
      attendeeProviderId: instagramRemoteId,
      bindingId: activeBinding.id,
      deliveryState: null,
      deliveryStateUpdatedAt: null,
      eventFingerprint: 'f'.repeat(64),
      eventType: 'MESSAGE_RECEIVED',
      id: 'event-id',
      status: 'ENQUEUED',
      unipileChatId: messageReceivedBody.chat_id,
      unipileMessageId: messageReceivedBody.message_id,
    };
    const harness = createHarness({ event: existingEvent });
    const service = createService(harness);

    await expect(
      service.intake({
        body: messageReceivedBody,
        secret: 'shared-webhook-secret',
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });

    expect(harness.eventRepository.create).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith('event-id');
    expect(harness.eventRepository.save).not.toHaveBeenCalled();
  });
  it('acknowledges an exact durable duplicate after its binding deactivates', async () => {
    const existingEvent: WebhookEvent = {
      accountStatus: null,
      attendeeProviderId: instagramRemoteId,
      bindingId: activeBinding.id,
      deliveryState: null,
      deliveryStateUpdatedAt: null,
      eventFingerprint: 'f'.repeat(64),
      eventType: 'MESSAGE_RECEIVED',
      id: 'event-id',
      status: 'COMPLETED',
      unipileChatId: messageReceivedBody.chat_id,
      unipileMessageId: messageReceivedBody.message_id,
    };
    const harness = createHarness({ event: existingEvent });
    harness.bindingRepository.findOne.mockResolvedValue(null);
    const service = createService(harness);

    await expect(
      service.intake({
        body: messageReceivedBody,
        secret: 'shared-webhook-secret',
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });

    expect(harness.bindingRepository.findOne).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
  });

  it('marks a received duplicate enqueued before re-enqueuing it for recovery', async () => {
    const existingEvent: WebhookEvent = {
      accountStatus: null,
      attendeeProviderId: instagramRemoteId,
      bindingId: activeBinding.id,
      deliveryState: null,
      deliveryStateUpdatedAt: null,
      eventFingerprint: 'f'.repeat(64),
      eventType: 'MESSAGE_RECEIVED',
      id: 'received-event-id',
      status: 'RECEIVED',
      unipileChatId: messageReceivedBody.chat_id,
      unipileMessageId: messageReceivedBody.message_id,
    };
    const harness = createHarness({ event: existingEvent });
    const service = createService(harness);

    await expect(
      service.intake({
        body: messageReceivedBody,
        secret: 'shared-webhook-secret',
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });

    expect(harness.eventRepository.create).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith(
      'received-event-id',
    );
    expect(harness.eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'received-event-id', status: 'ENQUEUED' }),
    );
    expect(
      harness.eventRepository.save.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.webhookQueue.enqueue.mock.invocationCallOrder[0]);
  });

  it.each([
    ['message_received', 'MESSAGE_RECEIVED'],
    ['message_read', 'MESSAGE_READ'],
    ['message_delivered', 'MESSAGE_DELIVERED'],
    ['message_edited', 'MESSAGE_EDITED'],
  ])(
    'accepts supported %s events for reliable intake',
    async (event, eventType) => {
      const harness = createHarness();
      const service = createService(harness);

      await expect(
        service.intake({
          body: { ...messageReceivedBody, event },
          secret: 'shared-webhook-secret',
        }),
      ).resolves.toEqual({ ok: true, duplicate: false });

      expect(harness.eventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType }),
      );
      expect(harness.eventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ENQUEUED' }),
      );
      expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith('event-id');
    },
  );

  it.each(['message_deleted', 'message_reaction'])(
    'rejects unsupported %s events before database or queue side effects',
    async (event) => {
      const harness = createHarness();
      const service = createService(harness);

      await expect(
        service.intake({
          body: { ...messageReceivedBody, event },
          secret: 'shared-webhook-secret',
        }),
      ).rejects.toThrow();

      expect(harness.dataSource.transaction).not.toHaveBeenCalled();
      expect(harness.eventRepository.create).not.toHaveBeenCalled();
      expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('deduplicates AccountStatus within its thirty-second bucket but accepts the next bucket', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T12:00:00.000Z'));

    try {
      const existingEvent: WebhookEvent = {
        accountStatus: 'OK',
        attendeeProviderId: null,
        bindingId: activeBinding.id,
        deliveryState: null,
        deliveryStateUpdatedAt: null,
        eventFingerprint: 'first-bucket-fingerprint',
        eventType: 'ACCOUNT_STATUS',
        id: 'account-status-event-id',
        status: 'COMPLETED',
        unipileChatId: null,
        unipileMessageId: null,
      };
      const harness = createHarness();
      const service = createService(harness);

      harness.eventRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEvent)
        .mockResolvedValueOnce(null);
      const body = {
        AccountStatus: {
          account_id: activeBinding.unipileAccountId,
          account_type: 'INSTAGRAM',
          message: 'OK',
        },
      };

      await expect(
        service.intake({ body, secret: 'shared-webhook-secret' }),
      ).resolves.toEqual({ ok: true, duplicate: false });
      jest.setSystemTime(new Date('2026-09-04T12:00:29.999Z'));
      await expect(
        service.intake({ body, secret: 'shared-webhook-secret' }),
      ).resolves.toEqual({ ok: true, duplicate: true });
      jest.setSystemTime(new Date('2026-09-04T12:00:30.000Z'));
      await expect(
        service.intake({ body, secret: 'shared-webhook-secret' }),
      ).resolves.toEqual({ ok: true, duplicate: false });

      const lookups = harness.eventRepository.findOne.mock.calls.map(
        ([options]: [{ where: { eventFingerprint: string } }]) =>
          options.where.eventFingerprint,
      );

      expect(lookups[0]).toBe(lookups[1]);
      expect(lookups[2]).not.toBe(lookups[0]);
      expect(harness.eventRepository.create).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses sender attendee identity only when no non-owner attendee is present', async () => {
    const harness = createHarness();
    const service = createService(harness);

    await expect(
      service.intake({
        body: {
          ...messageReceivedBody,
          attendees: [{ attendee_provider_id: instagramOwnerId }],
        },
        secret: 'shared-webhook-secret',
      }),
    ).resolves.toEqual({ ok: true, duplicate: false });

    expect(harness.eventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        attendeeProviderId: 'instagram-sender-id',
      }),
    );
  });

  it.each(['PROCESSING', 'COMPLETED', 'FAILED'] as const)(
    'acknowledges a terminal %s duplicate without re-enqueueing it',
    async (status) => {
      const existingEvent: WebhookEvent = {
        accountStatus: null,
        attendeeProviderId: instagramRemoteId,
        bindingId: activeBinding.id,
        deliveryState: null,
        deliveryStateUpdatedAt: null,
        eventFingerprint: 'f'.repeat(64),
        eventType: 'MESSAGE_RECEIVED',
        id: 'terminal-event-id',
        status,
        unipileChatId: messageReceivedBody.chat_id,
        unipileMessageId: messageReceivedBody.message_id,
      };
      const harness = createHarness({ event: existingEvent });
      const service = createService(harness);

      await expect(
        service.intake({
          body: messageReceivedBody,
          secret: 'shared-webhook-secret',
        }),
      ).resolves.toEqual({ ok: true, duplicate: true });

      expect(harness.eventRepository.create).not.toHaveBeenCalled();
      expect(harness.eventRepository.save).not.toHaveBeenCalled();
      expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('does not claim or enqueue a message event for an inactive binding', async () => {
    const harness = createHarness({
      binding: { ...activeBinding, status: 'PENDING' },
    });
    const service = createService(harness);

    await expect(
      service.intake({
        body: messageReceivedBody,
        secret: 'shared-webhook-secret',
      }),
    ).rejects.toThrow();

    expect(harness.eventRepository.create).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
  });
});
