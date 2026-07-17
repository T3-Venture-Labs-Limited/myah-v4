import { type Repository } from 'typeorm';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { MetronomeClientService } from '../services/metronome-client.service';
import { ManagedProviderUsageDeliveryService } from '../services/managed-provider-usage-delivery.service';
import { MetronomeWorkspaceCustomerService } from '../services/metronome-workspace-customer.service';

describe('ManagedProviderUsageDeliveryService', () => {
  it('persists one event timestamp and reuses it after an ingest retry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    const operation = {
      actualUsageProperties: { quantity: 3 },
      expectedProductIds: ['product-id'],
      id: 'operation-id',
      metronomeEventType: 'managed-provider-operation',
      deliveryAttemptCount: 0,
      deliveryEventAt: null,
      metronomeAcceptedAt: null,
      reservedAmountCents: '7',
      settleAfter: null,
      state: ManagedProviderOperationState.USAGE_PENDING,
      workspaceId: 'workspace-id',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(operation),
      save: jest.fn().mockImplementation(async (_, value) => {
        Object.assign(operation, value);

        return operation;
      }),
    };
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue(operation),
      manager: { transaction: jest.fn((callback) => callback(manager)) },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'findOneBy' | 'manager'
    >;
    const metronomeClientService = {
      ingestUsage: jest
        .fn()
        .mockRejectedValueOnce(new Error('lost ingest response'))
        .mockResolvedValue(undefined),
      previewUsage: jest.fn().mockResolvedValue({
        invoices: [
          {
            contractId: 'contract-id',
            customerId: 'customer-id',
            id: 'invoice-id',
            lineItems: [
              {
                name: 'Actual usage',
                productId: 'product-id',
                total: 5,
                type: 'usage',
              },
            ],
            total: 0,
          },
        ],
      }),
    } as Pick<MetronomeClientService, 'ingestUsage' | 'previewUsage'>;
    const workspaceCustomerService = {
      ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
    } as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const configService = {
      get: jest.fn(() => 30_000),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new ManagedProviderUsageDeliveryService(
      operationRepository as Repository<ManagedProviderOperationEntity>,
      metronomeClientService as MetronomeClientService,
      workspaceCustomerService as MetronomeWorkspaceCustomerService,
      configService as TwentyConfigService,
    );

    await expect(service.deliverUsage('operation-id')).rejects.toThrow(
      'lost ingest response',
    );
    expect(operation.deliveryEventAt).toEqual(
      new Date('2026-07-16T00:00:00.000Z'),
    );
    jest.setSystemTime(new Date('2026-07-16T00:01:00.000Z'));
    await service.deliverUsage('operation-id');

    const firstTimestamp = (metronomeClientService.ingestUsage as jest.Mock)
      .mock.calls[0][0].timestamp;
    const secondTimestamp = (metronomeClientService.ingestUsage as jest.Mock)
      .mock.calls[1][0].timestamp;

    expect(firstTimestamp).toBe('2026-07-16T00:00:00.000Z');
    expect(secondTimestamp).toBe(firstTimestamp);
    expect(operation.deliveryEventAt).toEqual(
      new Date('2026-07-16T00:00:00.000Z'),
    );
    expect(metronomeClientService.previewUsage).toHaveBeenCalledTimes(1);
    expect(metronomeClientService.previewUsage).toHaveBeenCalledWith({
      customerId: 'customer-id',
      eventType: 'managed-provider-operation',
      properties: { quantity: 3 },
      timestamp: firstTimestamp,
    });
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        metronomeAcceptedAt: operation.metronomeAcceptedAt,
        deliveryAttemptCount: 2,
        lastDeliveryErrorCode: null,
        quotedActualAmountCents: '5',
        reservedAmountCents: '7',
        settleAfter: operation.settleAfter,
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      }),
    );
    jest.useRealTimers();
  });

  it('does nothing for an operation that is no longer pending delivery', async () => {
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      }),
      manager: { transaction: jest.fn() },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'findOneBy' | 'manager'
    >;
    const metronomeClientService = {
      ingestUsage: jest.fn(),
      previewUsage: jest.fn(),
    } as unknown as Pick<
      MetronomeClientService,
      'ingestUsage' | 'previewUsage'
    >;
    const workspaceCustomerService = {
      ensureWorkspaceContract: jest.fn(),
      ensureWorkspaceCustomer: jest.fn(),
    } as unknown as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const configService = { get: jest.fn() } as unknown as Pick<
      TwentyConfigService,
      'get'
    >;
    const service = new ManagedProviderUsageDeliveryService(
      operationRepository as Repository<ManagedProviderOperationEntity>,
      metronomeClientService as MetronomeClientService,
      workspaceCustomerService as MetronomeWorkspaceCustomerService,
      configService as TwentyConfigService,
    );

    await service.deliverUsage('operation-id');

    expect(metronomeClientService.previewUsage).not.toHaveBeenCalled();
    expect(metronomeClientService.ingestUsage).not.toHaveBeenCalled();
    expect(operationRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('requires reconciliation rather than ingesting when actual usage exceeds its reservation', async () => {
    const operation = {
      actualUsageProperties: { quantity: 3 },
      expectedProductIds: ['product-id'],
      id: 'operation-id',
      metronomeEventType: 'managed-provider-operation',
      reservedAmountCents: '5',
      state: ManagedProviderOperationState.USAGE_PENDING,
      workspaceId: 'workspace-id',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(operation),
      save: jest.fn().mockResolvedValue(operation),
    };
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue(operation),
      manager: { transaction: jest.fn((callback) => callback(manager)) },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'findOneBy' | 'manager'
    >;
    const metronomeClientService = {
      ingestUsage: jest.fn(),
      previewUsage: jest.fn().mockResolvedValue({
        invoices: [
          {
            contractId: 'contract-id',
            customerId: 'customer-id',
            id: 'invoice-id',
            lineItems: [
              {
                name: 'Actual usage',
                productId: 'product-id',
                total: 7,
                type: 'usage',
              },
            ],
            total: 0,
          },
        ],
      }),
    } as Pick<MetronomeClientService, 'ingestUsage' | 'previewUsage'>;
    const workspaceCustomerService = {
      ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
    } as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const configService = { get: jest.fn() } as unknown as Pick<
      TwentyConfigService,
      'get'
    >;
    const service = new ManagedProviderUsageDeliveryService(
      operationRepository as Repository<ManagedProviderOperationEntity>,
      metronomeClientService as MetronomeClientService,
      workspaceCustomerService as MetronomeWorkspaceCustomerService,
      configService as TwentyConfigService,
    );

    await service.deliverUsage('operation-id');

    expect(metronomeClientService.ingestUsage).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        quotedActualAmountCents: '7',
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('requires reconciliation without remote work when first delivery is older than 34 days', async () => {
    const operation = {
      id: 'operation-id',
      completedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1_000),
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.USAGE_PENDING,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(operation),
      save: jest.fn().mockResolvedValue(operation),
    };
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue(operation),
      manager: { transaction: jest.fn((callback) => callback(manager)) },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'findOneBy' | 'manager'
    >;
    const metronomeClientService = {
      ingestUsage: jest.fn(),
      previewUsage: jest.fn(),
    } as unknown as Pick<
      MetronomeClientService,
      'ingestUsage' | 'previewUsage'
    >;
    const workspaceCustomerService = {
      ensureWorkspaceContract: jest.fn(),
      ensureWorkspaceCustomer: jest.fn(),
    } as unknown as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const configService = { get: jest.fn() } as unknown as Pick<
      TwentyConfigService,
      'get'
    >;
    const service = new ManagedProviderUsageDeliveryService(
      operationRepository as Repository<ManagedProviderOperationEntity>,
      metronomeClientService as MetronomeClientService,
      workspaceCustomerService as MetronomeWorkspaceCustomerService,
      configService as TwentyConfigService,
    );

    await service.deliverUsage('operation-id');

    expect(metronomeClientService.previewUsage).not.toHaveBeenCalled();
    expect(metronomeClientService.ingestUsage).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        reservedAmountCents: '7',
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('records a safe retry marker and rethrows when Metronome ingestion fails', async () => {
    const operation = {
      actualUsageProperties: { quantity: 3 },
      deliveryAttemptCount: 1,
      expectedProductIds: ['product-id'],
      id: 'operation-id',
      metronomeEventType: 'managed-provider-operation',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.USAGE_PENDING,
      workspaceId: 'workspace-id',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(operation),
      save: jest.fn().mockResolvedValue(operation),
    };
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue(operation),
      manager: { transaction: jest.fn((callback) => callback(manager)) },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'findOneBy' | 'manager'
    >;
    const ingestError = new Error('provider timeout with sensitive details');
    const metronomeClientService = {
      ingestUsage: jest.fn().mockRejectedValue(ingestError),
      previewUsage: jest.fn().mockResolvedValue({
        invoices: [
          {
            contractId: 'contract-id',
            customerId: 'customer-id',
            id: 'invoice-id',
            lineItems: [
              {
                name: 'Actual usage',
                productId: 'product-id',
                total: 5,
                type: 'usage',
              },
            ],
            total: 0,
          },
        ],
      }),
    } as Pick<MetronomeClientService, 'ingestUsage' | 'previewUsage'>;
    const workspaceCustomerService = {
      ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
    } as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const configService = { get: jest.fn() } as unknown as Pick<
      TwentyConfigService,
      'get'
    >;
    const service = new ManagedProviderUsageDeliveryService(
      operationRepository as Repository<ManagedProviderOperationEntity>,
      metronomeClientService as MetronomeClientService,
      workspaceCustomerService as MetronomeWorkspaceCustomerService,
      configService as TwentyConfigService,
    );

    await expect(service.deliverUsage('operation-id')).rejects.toBe(
      ingestError,
    );

    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        deliveryAttemptCount: 2,
        lastDeliveryErrorCode: 'METRONOME_REQUEST_FAILED',
        nextDeliveryAttemptAt: expect.any(Date),
        reservedAmountCents: '7',
        state: ManagedProviderOperationState.USAGE_PENDING,
      }),
    );
  });

  it('requires reconciliation immediately when the actual usage quote is ambiguous', async () => {
    const operation = {
      actualUsageProperties: { quantity: 3 },
      deliveryAttemptCount: 0,
      expectedProductIds: ['product-id'],
      id: 'operation-id',
      metronomeEventType: 'managed-provider-operation',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.USAGE_PENDING,
      workspaceId: 'workspace-id',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(operation),
      save: jest.fn().mockImplementation(async (_, value) => {
        Object.assign(operation, value);
        return operation;
      }),
    };
    const operationRepository = {
      findOneBy: jest.fn().mockResolvedValue(operation),
      manager: { transaction: jest.fn((callback) => callback(manager)) },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'findOneBy' | 'manager'
    >;
    const metronomeClientService = {
      ingestUsage: jest.fn(),
      previewUsage: jest.fn().mockResolvedValue({ invoices: [] }),
    } as Pick<MetronomeClientService, 'ingestUsage' | 'previewUsage'>;
    const workspaceCustomerService = {
      ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
    } as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const configService = { get: jest.fn() } as unknown as Pick<
      TwentyConfigService,
      'get'
    >;
    const service = new ManagedProviderUsageDeliveryService(
      operationRepository as Repository<ManagedProviderOperationEntity>,
      metronomeClientService as MetronomeClientService,
      workspaceCustomerService as MetronomeWorkspaceCustomerService,
      configService as TwentyConfigService,
    );

    await service.deliverUsage('operation-id');

    expect(metronomeClientService.ingestUsage).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      }),
    );
  });
});
