import { Scope } from '@nestjs/common';

import { IsNull } from 'typeorm';

import {
  PROCESSOR_METADATA,
  PROCESS_METADATA,
  MessageQueue,
} from 'src/engine/core-modules/message-queue/message-queue.constants';

type ReconciliationJob = {
  handle(): Promise<void>;
};

type ReconciliationJobModule = {
  UnipileInstagramWebhookReconciliationJob: new (
    dataSource: { getRepository: jest.Mock; transaction: jest.Mock },
    webhookQueue: { enqueue: jest.Mock },
    syncQueue: { enqueue: jest.Mock },
    availabilityService: { assertEnabled: jest.Mock },
  ) => ReconciliationJob;
};

type ReconciliationEvent = {
  attemptCount: number;
  id: string;
  nextAttemptAt: Date | null;
  status: string;
  updatedAt: Date;
};

type ReconciliationHarness = {
  availabilityService: { assertEnabled: jest.Mock };
  bindingRepository: { find: jest.Mock; update: jest.Mock };
  dataSource: { getRepository: jest.Mock; transaction: jest.Mock };
  eventRepository: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  manager: { getRepository: jest.Mock; query: jest.Mock };
  syncQueue: { enqueue: jest.Mock };
  webhookQueue: { enqueue: jest.Mock };
};

const loadReconciliationJobModule = (): ReconciliationJobModule | undefined => {
  try {
    return require('src/modules/myah-unipile/jobs/unipile-instagram-webhook-reconciliation.job') as ReconciliationJobModule;
  } catch {
    return undefined;
  }
};

const createHarness = (): ReconciliationHarness => {
  const events: ReconciliationEvent[] = [
    {
      attemptCount: 0,
      id: 'received-event-id',
      nextAttemptAt: null,
      status: 'RECEIVED',
      updatedAt: new Date('2026-09-04T11:58:00.000Z'),
    },
    {
      attemptCount: 1,
      id: 'enqueued-event-id',
      nextAttemptAt: new Date('2026-09-04T11:59:00.000Z'),
      status: 'ENQUEUED',
      updatedAt: new Date('2026-09-04T11:59:00.000Z'),
    },
    {
      attemptCount: 2,
      id: 'stale-processing-event-id',
      nextAttemptAt: null,
      status: 'PROCESSING',
      updatedAt: new Date('2026-09-04T11:58:59.000Z'),
    },
  ];
  const eventRepository = {
    find: jest.fn(
      async (options?: {
        where?: { status?: string } | Array<{ status?: string }>;
      }) => {
        const conditions = Array.isArray(options?.where)
          ? options.where
          : options?.where
            ? [options.where]
            : [];
        const statuses = conditions
          .map((where) => where.status)
          .filter((status): status is string => typeof status === 'string');

        return statuses.length === 0
          ? events
          : events.filter((event) => statuses.includes(event.status));
      },
    ),
    findOne: jest.fn(
      async (options: { where: { id: string } }) =>
        events.find((event) => event.id === options.where.id) ?? null,
    ),
    save: jest.fn(async (event: ReconciliationEvent) => {
      const index = events.findIndex((candidate) => candidate.id === event.id);

      if (index >= 0) {
        events[index] = { ...events[index], ...event };
      }

      return event;
    }),
  };
  const bindingRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'active-binding-id',
        status: 'ACTIVE',
        deactivatedAt: null,
        lastSyncScheduledAt: null,
      },
      {
        id: 'next-active-binding-id',
        status: 'ACTIVE',
        deactivatedAt: null,
        lastSyncScheduledAt: new Date('2026-09-04T11:00:00.000Z'),
      },
    ]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const manager = {
    getRepository: jest.fn((entity: { name: string }) =>
      entity.name === 'UnipileInstagramWebhookEventEntity'
        ? eventRepository
        : bindingRepository,
    ),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    getRepository: jest.fn((entity: { name: string }) =>
      entity.name === 'UnipileInstagramWebhookEventEntity'
        ? eventRepository
        : bindingRepository,
    ),
    transaction: jest.fn(
      async (
        callback: (transactionManager: typeof manager) => Promise<unknown>,
      ) => callback(manager),
    ),
  };

  return {
    availabilityService: { assertEnabled: jest.fn() },
    bindingRepository,
    dataSource,
    eventRepository,
    manager,
    syncQueue: { enqueue: jest.fn().mockResolvedValue(undefined) },
    webhookQueue: { enqueue: jest.fn().mockResolvedValue(undefined) },
  };
};

describe('UnipileInstagramWebhookReconciliationJob', () => {
  const createJob = (harness: ReconciliationHarness) => {
    const jobModule = loadReconciliationJobModule();

    expect(jobModule).toBeDefined();

    if (!jobModule) {
      throw new Error(
        'Unipile Instagram webhook reconciliation is not implemented',
      );
    }

    return new jobModule.UnipileInstagramWebhookReconciliationJob(
      harness.dataSource,
      harness.webhookQueue,
      harness.syncQueue,
      harness.availabilityService,
    );
  };

  it('stops before reading events or bindings and before queueing when disabled', async () => {
    const harness = createHarness();
    const job = createJob(harness);
    const disabledError = new Error('Unipile Instagram is disabled');

    harness.availabilityService.assertEnabled.mockImplementation(() => {
      throw disabledError;
    });

    await expect(job.handle()).rejects.toThrow(disabledError);

    expect(harness.availabilityService.assertEnabled).toHaveBeenCalledTimes(1);
    expect(harness.dataSource.getRepository).not.toHaveBeenCalled();
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.eventRepository.find).not.toHaveBeenCalled();
    expect(harness.bindingRepository.find).not.toHaveBeenCalled();
    expect(harness.webhookQueue.enqueue).not.toHaveBeenCalled();
    expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
  });

  it('atomically reclaims stale processing events before publishing due work in bounded due order', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T12:00:00.000Z'));

    try {
      const harness = createHarness();
      const job = createJob(harness);

      await expect(job.handle()).resolves.toBeUndefined();

      const eventSelection = harness.eventRepository.find.mock.calls
        .map(
          ([options]) =>
            options as {
              order?: Record<string, string>;
              take?: number;
              where?: Array<{ status: string; nextAttemptAt?: unknown }>;
            },
        )
        .find((options) => options.order?.nextAttemptAt === 'ASC');

      expect(eventSelection).toEqual(
        expect.objectContaining({
          order: { nextAttemptAt: 'ASC', updatedAt: 'ASC' },
          take: 50,
          where: expect.arrayContaining([
            expect.objectContaining({
              nextAttemptAt: expect.anything(),
              status: 'RECEIVED',
            }),
            expect.objectContaining({
              nextAttemptAt: expect.anything(),
              status: 'ENQUEUED',
            }),
          ]),
        }),
      );
      expect(harness.dataSource.transaction).toHaveBeenCalled();
      expect(harness.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        ['stale-processing-event-id'],
      );
      expect(harness.eventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'stale-processing-event-id',
          nextAttemptAt: null,
          status: 'ENQUEUED',
        }),
      );
      const staleReclaimIndex =
        harness.eventRepository.save.mock.calls.findIndex(
          ([event]) => event.id === 'stale-processing-event-id',
        );
      const stalePublishIndex =
        harness.webhookQueue.enqueue.mock.calls.findIndex(
          ([eventId]) => eventId === 'stale-processing-event-id',
        );

      expect(staleReclaimIndex).toBeGreaterThanOrEqual(0);
      expect(stalePublishIndex).toBeGreaterThanOrEqual(0);
      expect(
        harness.eventRepository.save.mock.invocationCallOrder[
          staleReclaimIndex
        ],
      ).toBeLessThan(
        harness.webhookQueue.enqueue.mock.invocationCallOrder[
          stalePublishIndex
        ],
      );
      expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith(
        'received-event-id',
      );
      expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith(
        'enqueued-event-id',
      );
      expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith(
        'stale-processing-event-id',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('schedules unscheduled active bindings first, then oldest scheduled bindings, before enqueuing each sync', async () => {
    const harness = createHarness();
    const job = createJob(harness);
    const unscheduledBinding = {
      id: 'unscheduled-binding-id',
      status: 'ACTIVE',
      deactivatedAt: null,
      lastSyncScheduledAt: null,
    };
    const oldestScheduledBinding = {
      id: 'oldest-scheduled-binding-id',
      status: 'ACTIVE',
      deactivatedAt: null,
      lastSyncScheduledAt: new Date('2026-09-04T09:00:00.000Z'),
    };
    const newerScheduledBinding = {
      id: 'newer-scheduled-binding-id',
      status: 'ACTIVE',
      deactivatedAt: null,
      lastSyncScheduledAt: new Date('2026-09-04T10:00:00.000Z'),
    };

    harness.bindingRepository.find
      .mockResolvedValueOnce([unscheduledBinding])
      .mockResolvedValueOnce([oldestScheduledBinding, newerScheduledBinding]);

    await expect(job.handle()).resolves.toBeUndefined();

    const [unscheduledSelection, scheduledSelection] =
      harness.bindingRepository.find.mock.calls.map(
        ([options]) =>
          options as {
            order: Record<string, string>;
            take: number;
            where: Record<string, unknown>;
          },
      );

    expect(unscheduledSelection).toEqual(
      expect.objectContaining({
        take: 50,
        where: expect.objectContaining({
          status: 'ACTIVE',
          lastSyncScheduledAt: expect.anything(),
        }),
      }),
    );
    expect(scheduledSelection).toEqual(
      expect.objectContaining({
        order: { lastSyncScheduledAt: 'ASC' },
        take: 49,
        where: expect.objectContaining({
          status: 'ACTIVE',
          lastSyncScheduledAt: expect.anything(),
        }),
      }),
    );
    expect(harness.syncQueue.enqueue).toHaveBeenNthCalledWith(
      1,
      unscheduledBinding.id,
    );
    expect(harness.syncQueue.enqueue).toHaveBeenNthCalledWith(
      2,
      oldestScheduledBinding.id,
    );
    expect(harness.syncQueue.enqueue).toHaveBeenNthCalledWith(
      3,
      newerScheduledBinding.id,
    );
    expect(harness.bindingRepository.update).toHaveBeenCalledTimes(3);
    for (const [index, binding] of [
      unscheduledBinding,
      oldestScheduledBinding,
      newerScheduledBinding,
    ].entries()) {
      expect(harness.bindingRepository.update).toHaveBeenNthCalledWith(
        index + 1,
        {
          deactivatedAt: IsNull(),
          id: binding.id,
          status: 'ACTIVE',
        },
        { lastSyncScheduledAt: expect.any(Date) },
      );
      expect(
        harness.bindingRepository.update.mock.invocationCallOrder[index],
      ).toBeLessThan(harness.syncQueue.enqueue.mock.invocationCallOrder[index]);
    }
  });

  it('skips enqueueing a binding concurrently deactivated after selection', async () => {
    const harness = createHarness();
    const job = createJob(harness);
    const concurrentlyDeactivatedBinding = {
      id: 'concurrently-deactivated-binding-id',
      status: 'ACTIVE',
      deactivatedAt: null,
      lastSyncScheduledAt: null,
    };

    harness.bindingRepository.find
      .mockResolvedValueOnce([concurrentlyDeactivatedBinding])
      .mockResolvedValueOnce([]);
    harness.bindingRepository.update.mockResolvedValueOnce({ affected: 0 });

    await expect(job.handle()).resolves.toBeUndefined();

    expect(harness.bindingRepository.update).toHaveBeenCalledWith(
      {
        deactivatedAt: IsNull(),
        id: concurrentlyDeactivatedBinding.id,
        status: 'ACTIVE',
      },
      { lastSyncScheduledAt: expect.any(Date) },
    );
    expect(harness.syncQueue.enqueue).not.toHaveBeenCalled();
  });

  it('continues independent recovery when an event or synchronization queue operation fails', async () => {
    const harness = createHarness();
    const job = createJob(harness);

    harness.webhookQueue.enqueue
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce(undefined);
    harness.syncQueue.enqueue
      .mockRejectedValueOnce(new Error('sync queue unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(job.handle()).resolves.toBeUndefined();

    expect(harness.webhookQueue.enqueue).toHaveBeenCalledWith(
      'stale-processing-event-id',
    );
    expect(harness.syncQueue.enqueue).toHaveBeenCalledWith(
      'next-active-binding-id',
    );
  });

  it('is a request-scoped cron queue processor matching cron registration', () => {
    const jobModule = loadReconciliationJobModule();

    expect(jobModule).toBeDefined();

    if (!jobModule) {
      return;
    }

    const Job = jobModule.UnipileInstagramWebhookReconciliationJob;

    expect(Reflect.getMetadata(PROCESSOR_METADATA, Job)).toEqual({
      queueName: MessageQueue.cronQueue,
      scope: Scope.REQUEST,
    });
    expect(Reflect.getMetadata(PROCESS_METADATA, Job.prototype.handle)).toEqual(
      {
        jobName: Job.name,
      },
    );
  });
});
