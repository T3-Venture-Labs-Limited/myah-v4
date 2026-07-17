import { Logger } from '@nestjs/common';

import { type Repository } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { ManagedProviderBillingRecoveryService } from '../services/managed-provider-billing-recovery.service';
import { MetronomeClientService } from '../services/metronome-client.service';

describe('ManagedProviderBillingRecoveryService', () => {
  const acceptedOperation = {
    actualUsageProperties: { quantity: 3 },
    expectedBillableMetricIds: ['metric-id'],
    id: 'operation-id',
    metronomeEventType: 'managed-provider-operation',
    deliveryEventAt: new Date('2026-07-16T00:00:00.000Z'),
    settleAfter: new Date('2026-07-16T00:00:00.000Z'),
    settlementAttemptCount: 0,
    state: ManagedProviderOperationState.USAGE_ACCEPTED,
    workspaceId: 'workspace-id',
  } as unknown as ManagedProviderOperationEntity;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T00:02:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const createService = () => {
    const save = jest.fn((_, value) => value);
    const findOne = jest.fn().mockImplementation((entity) =>
      entity === MyahWorkspaceInstallationEntity
        ? {
            metronomeCustomerId: 'customer-id',
            workspaceId: 'workspace-id',
          }
        : { ...acceptedOperation },
    );
    const countBy = jest.fn().mockResolvedValue(0);
    const operationRepository = {
      countBy,
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([acceptedOperation]),
      manager: {
        transaction: jest.fn((callback) => callback({ findOne, save })),
      },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'countBy' | 'find' | 'manager'
    >;
    const installationRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        metronomeCustomerId: 'customer-id',
        workspaceId: 'workspace-id',
      }),
    } as unknown as Pick<
      Repository<MyahWorkspaceInstallationEntity>,
      'findOneBy'
    >;
    const metronomeClientService = {
      getPrepaidBalance: jest.fn().mockResolvedValue({ balance: 10 }),
      searchUsageEvents: jest.fn().mockResolvedValue([
        {
          customerId: 'customer-id',
          matchedCustomerId: 'customer-id',
          eventType: 'managed-provider-operation',
          isDuplicate: false,
          matchedBillableMetricIds: ['metric-id'],
          timestamp: '2026-07-16T00:00:00.000Z',
          processedAt: '2026-07-16T00:01:00.000Z',
          properties: { quantity: '3' },
          transactionId: 'managed-provider-usage:operation-id',
        },
      ]),
    } as Pick<
      MetronomeClientService,
      'getPrepaidBalance' | 'searchUsageEvents'
    >;
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
    } as Pick<MessageQueueService, 'add'>;
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(true),
    } as Pick<TwentyConfigService, 'get'>;

    return {
      countBy,
      installationRepository,
      metronomeClientService,
      messageQueueService,
      findOne,
      operationRepository,
      save,
      twentyConfigService,
      service: new ManagedProviderBillingRecoveryService(
        operationRepository as Repository<ManagedProviderOperationEntity>,
        installationRepository as Repository<MyahWorkspaceInstallationEntity>,
        metronomeClientService as MetronomeClientService,
        messageQueueService as MessageQueueService,
        twentyConfigService as TwentyConfigService,
      ),
    };
  };

  it('pages through every due pending operation in bounded batches', async () => {
    const { messageQueueService, operationRepository, service } =
      createService();
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({
      id: `operation-${index.toString().padStart(3, '0')}`,
      state: ManagedProviderOperationState.USAGE_PENDING,
    }));
    const finalOperation = {
      id: 'operation-100',
      state: ManagedProviderOperationState.USAGE_PENDING,
    };

    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([finalOperation])
      .mockResolvedValueOnce([]);

    await service.recover();

    expect(messageQueueService.add).toHaveBeenCalledTimes(101);
    expect(messageQueueService.add).toHaveBeenCalledWith(
      expect.any(String),
      { operationId: finalOperation.id },
      expect.objectContaining({
        id: `managed-provider-usage:${finalOperation.id}`,
      }),
    );
  });

  it('pages through every due accepted operation after a rate limit', async () => {
    const { metronomeClientService, operationRepository, save, service } =
      createService();
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({
      ...acceptedOperation,
      id: `operation-${index.toString().padStart(3, '0')}`,
    }));
    const finalOperation = {
      ...acceptedOperation,
      id: 'operation-100',
    };

    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([finalOperation]);
    (metronomeClientService.searchUsageEvents as jest.Mock).mockRejectedValue(
      new MetronomeClientException(MetronomeClientExceptionCode.RATE_LIMITED),
    );

    await service.recover();

    expect(metronomeClientService.searchUsageEvents).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(101);
  });

  it('settles only a matched accepted event after a fresh balance read', async () => {
    const {
      findOne,
      metronomeClientService,
      operationRepository,
      save,
      service,
    } = createService();

    await service.recover();
    expect(operationRepository.find).toHaveBeenNthCalledWith(1, {
      order: { id: 'ASC' },
      take: 100,
      where: expect.arrayContaining([
        expect.objectContaining({
          state: ManagedProviderOperationState.USAGE_PENDING,
        }),
      ]),
    });
    expect(operationRepository.find).toHaveBeenNthCalledWith(2, {
      order: { id: 'ASC' },
      take: 100,
      where: {
        settleAfter: expect.anything(),
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      },
    });

    expect(metronomeClientService.searchUsageEvents).toHaveBeenCalledWith([
      'managed-provider-usage:operation-id',
    ]);
    expect(metronomeClientService.getPrepaidBalance).toHaveBeenCalledWith(
      'customer-id',
    );
    expect(operationRepository.manager.transaction).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(ManagedProviderOperationEntity, {
      lock: { mode: 'pessimistic_write' },
      where: { id: 'operation-id', workspaceId: 'workspace-id' },
    });
    expect(findOne).toHaveBeenCalledWith(MyahWorkspaceInstallationEntity, {
      lock: { mode: 'pessimistic_write' },
      where: { workspaceId: 'workspace-id' },
    });
    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        settledAt: expect.any(Date),
        state: ManagedProviderOperationState.USAGE_SETTLED,
      }),
    );
  });

  it('settles an accepted operation at most once across concurrent recovery runs', async () => {
    const { findOne, operationRepository, save, service } = createService();
    const lockedOperation = { ...acceptedOperation };
    (findOne as jest.Mock).mockImplementation(async (entity) =>
      entity === MyahWorkspaceInstallationEntity
        ? {
            metronomeCustomerId: 'customer-id',
            workspaceId: 'workspace-id',
          }
        : lockedOperation,
    );
    (save as jest.Mock).mockImplementation(async (_, operation) => {
      Object.assign(lockedOperation, operation);

      return lockedOperation;
    });
    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedOperation])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedOperation]);

    await Promise.all([service.recover(), service.recover()]);

    expect(save).toHaveBeenCalledTimes(1);
    expect(lockedOperation).toMatchObject({
      state: ManagedProviderOperationState.USAGE_SETTLED,
    });
  });

  it('retries a missing accepted event without releasing its reservation', async () => {
    const { findOne, metronomeClientService, save, service } = createService();
    (metronomeClientService.searchUsageEvents as jest.Mock).mockResolvedValue(
      [],
    );

    await service.recover();

    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(ManagedProviderOperationEntity, {
      lock: { mode: 'pessimistic_write' },
      where: { id: 'operation-id', workspaceId: 'workspace-id' },
    });
    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        settlementAttemptCount: 1,
        settleAfter: new Date('2026-07-16T00:03:00.000Z'),
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      }),
    );
  });

  it('requires reconciliation for contradictory accepted evidence', async () => {
    const { findOne, metronomeClientService, save, service } = createService();
    (metronomeClientService.searchUsageEvents as jest.Mock).mockResolvedValue([
      {
        customerId: 'customer-id',
        matchedCustomerId: 'customer-id',
        eventType: 'managed-provider-operation',
        isDuplicate: false,
        matchedBillableMetricIds: ['unexpected-metric-id'],
        timestamp: '2026-07-16T00:00:00.000Z',
        processedAt: '2026-07-16T00:01:00.000Z',
        properties: { quantity: '3' },
        transactionId: 'managed-provider-usage:operation-id',
      },
    ]);

    await service.recover();

    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(ManagedProviderOperationEntity, {
      lock: { mode: 'pessimistic_write' },
      where: { id: 'operation-id', workspaceId: 'workspace-id' },
    });
    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('requires reconciliation when accepted usage remains undiscoverable for 34 days', async () => {
    const { metronomeClientService, operationRepository, save, service } =
      createService();
    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...acceptedOperation,
          deliveryEventAt: new Date('2026-06-11T00:02:00.000Z'),
        },
      ]);
    (metronomeClientService.searchUsageEvents as jest.Mock).mockResolvedValue(
      [],
    );

    await service.recover();

    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('settles when one canonical event and an exact duplicate audit row agree', async () => {
    const { metronomeClientService, save, service } = createService();
    (metronomeClientService.searchUsageEvents as jest.Mock).mockResolvedValue([
      {
        customerId: 'customer-id',
        matchedCustomerId: 'customer-id',
        eventType: 'managed-provider-operation',
        isDuplicate: false,
        matchedBillableMetricIds: ['metric-id'],
        timestamp: '2026-07-16T00:00:00.000Z',
        processedAt: '2026-07-16T00:01:00.000Z',
        properties: { quantity: '3' },
        transactionId: 'managed-provider-usage:operation-id',
      },
      {
        customerId: 'customer-id',
        matchedCustomerId: 'customer-id',
        eventType: 'managed-provider-operation',
        isDuplicate: true,
        matchedBillableMetricIds: ['metric-id'],
        timestamp: '2026-07-16T00:00:00.000Z',
        processedAt: '2026-07-16T00:01:00.000Z',
        properties: { quantity: '3' },
        transactionId: 'managed-provider-usage:operation-id',
      },
    ]);

    await service.recover();

    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.USAGE_SETTLED,
      }),
    );
  });

  it('backs off when matching usage has not been processed', async () => {
    const { metronomeClientService, save, service } = createService();
    (metronomeClientService.searchUsageEvents as jest.Mock).mockResolvedValue([
      {
        customerId: 'customer-id',
        matchedCustomerId: 'customer-id',
        eventType: 'managed-provider-operation',
        isDuplicate: false,
        matchedBillableMetricIds: ['metric-id'],
        timestamp: '2026-07-16T00:00:00.000Z',
        processedAt: null,
        properties: { quantity: '3' },
        transactionId: 'managed-provider-usage:operation-id',
      },
    ]);

    await service.recover();

    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        settlementAttemptCount: 1,
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      }),
    );
  });

  it('settles when an accepted event matches a nonempty subset of expected metrics', async () => {
    const {
      findOne,
      metronomeClientService,
      operationRepository,
      save,
      service,
    } = createService();
    const operation = {
      ...acceptedOperation,
      expectedBillableMetricIds: ['metric-id', 'second-metric-id'],
    };

    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([operation]);
    (findOne as jest.Mock).mockImplementation(async (entity) =>
      entity === MyahWorkspaceInstallationEntity
        ? {
            metronomeCustomerId: 'customer-id',
            workspaceId: 'workspace-id',
          }
        : operation,
    );

    await service.recover();

    expect(metronomeClientService.getPrepaidBalance).toHaveBeenCalledWith(
      'customer-id',
    );
    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.USAGE_SETTLED,
      }),
    );
  });

  it('requires reconciliation when accepted evidence has an unexpected metric', async () => {
    const { metronomeClientService, save, service } = createService();
    (metronomeClientService.searchUsageEvents as jest.Mock).mockResolvedValue([
      {
        customerId: 'customer-id',
        matchedCustomerId: 'customer-id',
        eventType: 'managed-provider-operation',
        isDuplicate: false,
        matchedBillableMetricIds: ['metric-id', 'unexpected-metric-id'],
        timestamp: '2026-07-16T00:00:00.000Z',
        processedAt: '2026-07-16T00:01:00.000Z',
        properties: { quantity: '3' },
        transactionId: 'managed-provider-usage:operation-id',
      },
    ]);

    await service.recover();

    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('requires reconciliation when the persisted first delivery is outside 34 days', async () => {
    const { metronomeClientService, operationRepository, save, service } =
      createService();
    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...acceptedOperation,
          deliveryEventAt: new Date('2026-06-11T00:02:00.000Z'),
          metronomeAcceptedAt: new Date('2026-07-16T00:01:00.000Z'),
        },
      ]);

    await service.recover();

    expect(metronomeClientService.searchUsageEvents).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('backs off after a rate-limited event search without releasing its reservation', async () => {
    const { findOne, metronomeClientService, save, service } = createService();
    (metronomeClientService.searchUsageEvents as jest.Mock).mockRejectedValue(
      new MetronomeClientException(MetronomeClientExceptionCode.RATE_LIMITED),
    );

    await service.recover();

    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(ManagedProviderOperationEntity, {
      lock: { mode: 'pessimistic_write' },
      where: { id: 'operation-id', workspaceId: 'workspace-id' },
    });
    expect(save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        settlementAttemptCount: 1,
        settleAfter: new Date('2026-07-16T00:17:00.000Z'),
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      }),
    );
  });

  it('reports local pending and stale counts while Metronome is disabled', async () => {
    const {
      countBy,
      messageQueueService,
      metronomeClientService,
      operationRepository,
      service,
      twentyConfigService,
    } = createService();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    (twentyConfigService.get as jest.Mock).mockReturnValue(false);
    countBy.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    await service.recover();

    expect(countBy).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(
      'Managed-provider billing recovery has 2 pending and 3 stale operations',
    );
    expect(operationRepository.find).not.toHaveBeenCalled();
    expect(messageQueueService.add).not.toHaveBeenCalled();
    expect(metronomeClientService.searchUsageEvents).not.toHaveBeenCalled();
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(operationRepository.manager.transaction).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports stale rows without queueing or changing their state', async () => {
    const { countBy, messageQueueService, operationRepository, service } =
      createService();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    (operationRepository.find as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    countBy.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await service.recover();

    expect(warn).toHaveBeenCalledWith(
      'Managed-provider billing recovery has 0 pending and 1 stale operations',
    );
    expect(messageQueueService.add).not.toHaveBeenCalled();
    expect(operationRepository.manager.transaction).not.toHaveBeenCalled();
  });
});
