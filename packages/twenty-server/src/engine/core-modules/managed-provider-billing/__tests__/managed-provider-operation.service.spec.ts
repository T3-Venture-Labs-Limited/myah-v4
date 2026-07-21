import { type Repository } from 'typeorm';

import { MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST } from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { DeliverManagedProviderUsageJob } from '../jobs/deliver-managed-provider-usage.job';
import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { ManagedProviderBillingExceptionCode } from '../managed-provider-billing.exception';
import { MetronomeClientExceptionCode } from '../metronome-client.exception';
import { type CompleteManagedProviderOperationInput } from '../types/complete-managed-provider-operation.input';

import { MetronomeClientService } from '../services/metronome-client.service';
import { MetronomeWorkspaceCustomerService } from '../services/metronome-workspace-customer.service';
import { ManagedProviderOperationService } from '../services/managed-provider-operation.service';
import { ManagedProviderPoolService } from '../services/managed-provider-pool.service';

describe('ManagedProviderOperationService', () => {
  const workspaceId = 'workspace-id';
  const input = {
    actorUserWorkspaceId: 'user-workspace-id',
    expectedProductIds: ['product-id'],
    maximumUsageProperties: { quantity: 7 },
    metronomeEventType: 'managed-provider-operation',
    operationKey: 'reviewed-operation',
    providerConfigurationKey: 'reviewed-configuration',
    providerKey: 'provider',
    requestId: 'request-id',
    workspaceId,
  };

  type TransactionManagerMock = {
    create: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    getRepository: jest.Mock;
    save: jest.Mock;
  };

  const createService = ({
    balance = 10,
    existingOperation = null,
    metronomeEnabled = true,
    managedWorkspace = false,
  }: {
    balance?: number;
    existingOperation?: Partial<ManagedProviderOperationEntity> | null;
    metronomeEnabled?: boolean;
    managedWorkspace?: boolean;
  } = {}) => {
    const manager: TransactionManagerMock = {
      create: jest.fn((_, values) => values),
      findOne: jest.fn().mockResolvedValue({
        metronomeCustomerId: 'customer-id',
        workspaceId,
      }),
      findOneBy: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn(),
      save: jest.fn((_, values) => ({
        ...values,
        id: 'operation-id',
      })),
    };
    const activeReservationQuery = {
      getRawOne: jest.fn().mockResolvedValue({ reservedAmountCents: '0' }),
      select: jest.fn(),
      setParameters: jest.fn(),
      where: jest.fn(),
    };
    activeReservationQuery.select.mockReturnValue(activeReservationQuery);
    activeReservationQuery.where.mockReturnValue(activeReservationQuery);
    activeReservationQuery.setParameters.mockReturnValue(
      activeReservationQuery,
    );
    const transactionOperationRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(activeReservationQuery),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    manager.getRepository.mockReturnValue(transactionOperationRepository);
    const operationRepository = {
      createQueryBuilder: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue(existingOperation),
      manager: {
        transaction: jest.fn(
          (callback: (manager: TransactionManagerMock) => unknown) =>
            callback(manager),
        ),
      },
    } as unknown as Pick<
      Repository<ManagedProviderOperationEntity>,
      'createQueryBuilder' | 'findOneBy' | 'manager'
    >;
    const metronomeClientService = {
      getBillableMetricIds: jest.fn().mockResolvedValue(['metric-id']),
      getPrepaidBalance: jest.fn().mockResolvedValue({ balance }),
      previewUsage: jest.fn().mockResolvedValue({
        invoices: [
          {
            contractId: 'contract-id',
            customerId: 'customer-id',
            id: 'invoice-id',
            lineItems: [
              {
                name: 'Reviewed operation',
                productId: 'product-id',
                total: 7,
                type: 'usage',
              },
            ],
            total: 0,
          },
        ],
      }),
    } as Pick<
      MetronomeClientService,
      'getBillableMetricIds' | 'getPrepaidBalance' | 'previewUsage'
    >;
    const metronomeWorkspaceCustomerService = {
      ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
    } as Pick<
      MetronomeWorkspaceCustomerService,
      'ensureWorkspaceContract' | 'ensureWorkspaceCustomer'
    >;
    const twentyConfigService = {
      get: jest.fn(() => metronomeEnabled),
    } as Pick<TwentyConfigService, 'get'>;
    const managedProviderPoolService = {
      assertReservationAllowed: jest.fn().mockResolvedValue(undefined),
      isManagedWorkspace: jest.fn().mockReturnValue(managedWorkspace),
    } as Pick<
      ManagedProviderPoolService,
      'assertReservationAllowed' | 'isManagedWorkspace'
    >;
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
    } as Pick<MessageQueueService, 'add'>;

    return {
      activeReservationQuery,
      manager,
      previewUsageMock:
        metronomeClientService.previewUsage as unknown as jest.Mock,
      metronomeClientService,
      metronomeWorkspaceCustomerService,
      managedProviderPoolService,
      operationRepository,
      messageQueueService,
      service: new ManagedProviderOperationService(
        operationRepository as Repository<ManagedProviderOperationEntity>,
        metronomeClientService as MetronomeClientService,
        metronomeWorkspaceCustomerService as MetronomeWorkspaceCustomerService,
        twentyConfigService as TwentyConfigService,
        managedProviderPoolService as ManagedProviderPoolService,
        messageQueueService as MessageQueueService,
      ),
    };
  };

  it('quotes camel-case JSONB columns when checking overrun quarantine', async () => {
    const { operationRepository, service } = createService();
    const queryBuilder = {
      andWhere: jest.fn(),
      getExists: jest.fn().mockResolvedValue(false),
      where: jest.fn(),
    };

    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    (
      operationRepository.createQueryBuilder as unknown as jest.Mock
    ).mockReturnValue(queryBuilder);

    await expect(
      service.assertProviderConfigurationActive(
        'openrouter',
        'openrouter/google/gemma-4-31b-it:free',
        '2026-07-20-v3',
      ),
    ).resolves.toBeUndefined();

    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      `operation."actualUsageProperties"->>'overrun' = 'true'`,
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      3,
      `operation."actualUsageProperties"->>'tariffVersion' = :tariffVersion`,
      { tariffVersion: '2026-07-20-v3' },
    );
  });

  it('reserves the pre-balance usage total under the workspace lock', async () => {
    const { manager, metronomeClientService, operationRepository, service } =
      createService();

    await expect(service.reserveOperation(input)).resolves.toMatchObject({
      id: 'operation-id',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.RESERVED,
      expectedBillableMetricIds: ['metric-id'],
    });
    expect(metronomeClientService.previewUsage).toHaveBeenCalledWith({
      customerId: 'customer-id',
      eventType: 'managed-provider-operation',
      properties: { quantity: 7 },
    });
    expect(metronomeClientService.getPrepaidBalance).toHaveBeenCalledWith(
      'customer-id',
    );
    expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      (metronomeClientService.getPrepaidBalance as jest.Mock).mock
        .invocationCallOrder[0],
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      MyahWorkspaceInstallationEntity,
      {
        lock: { mode: 'pessimistic_write' },
        where: { workspaceId },
      },
    );
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        expectedProductIds: ['product-id'],
        reservedAmountCents: '7',
        state: ManagedProviderOperationState.RESERVED,
      }),
    );
    expect(manager.getRepository).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
    );
    expect(operationRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('rejects a zero-priced preview for the reference-priced Gemma route', async () => {
    const { manager, metronomeClientService, service } = createService();
    const freeInput = {
      ...input,
      metronomeEventType: 'managed_openrouter_generation',
      providerConfigurationKey: 'openrouter/google/gemma-4-31b-it:free',
      providerKey: 'openrouter',
    };
    (metronomeClientService.previewUsage as jest.Mock).mockResolvedValueOnce({
      invoices: [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Free usage',
              productId: 'product-id',
              total: 0,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    });

    await expect(service.reserveOperation(freeInput)).rejects.toThrow(
      'Metronome usage preview is ambiguous',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('locks and validates the durable provider pool before reserving', async () => {
    const { managedProviderPoolService, service } = createService({
      managedWorkspace: true,
    });
    const managedInput = {
      ...input,
      maximumUsageProperties: {
        quantity: 7,
        multiplierEvidenceVersion: 'evidence-v2',
        tariffVersion: '2026-07-19-v2',
      },
      providerKey: 'openrouter',
    };

    await expect(service.reserveOperation(managedInput)).resolves.toMatchObject(
      {
        state: ManagedProviderOperationState.RESERVED,
      },
    );
    expect(
      managedProviderPoolService.assertReservationAllowed,
    ).toHaveBeenCalledWith(expect.any(Object), {
      configurationDigest: MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST,
      providerKey: 'openrouter',
      tariffVersion: '2026-07-19-v2',
    });
  });

  it('rejects insufficient prepaid balance without creating an operation', async () => {
    const { manager, service } = createService({ balance: 6 });

    await expect(service.reserveOperation(input)).rejects.toMatchObject({
      code: ManagedProviderBillingExceptionCode.INSUFFICIENT_PREPAID_BALANCE,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns an exact request replay before remote pricing or balance calls', async () => {
    const existingOperation = {
      ...input,
      id: 'existing-operation-id',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.RESERVED,
    };
    const { metronomeClientService, operationRepository, service } =
      createService({ existingOperation });

    await expect(service.reserveOperation(input)).resolves.toBe(
      existingOperation,
    );
    expect(operationRepository.findOneBy).toHaveBeenCalledWith({
      requestId: input.requestId,
      workspaceId,
    });
    expect(metronomeClientService.previewUsage).not.toHaveBeenCalled();
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
  });

  it('returns a concurrent exact replay before a failure-prone balance read', async () => {
    const concurrentOperation = {
      ...input,
      id: 'concurrent-operation-id',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.RESERVED,
    };
    const { manager, metronomeClientService, service } = createService();
    const transactionOperationRepository = manager.getRepository(
      ManagedProviderOperationEntity,
    ) as {
      findOneBy: jest.Mock;
    };

    transactionOperationRepository.findOneBy.mockResolvedValue(
      concurrentOperation,
    );
    (metronomeClientService.getPrepaidBalance as jest.Mock).mockRejectedValue(
      new Error('temporary Metronome failure'),
    );

    await expect(service.reserveOperation(input)).resolves.toBe(
      concurrentOperation,
    );
    expect(transactionOperationRepository.findOneBy).toHaveBeenCalledWith({
      requestId: input.requestId,
      workspaceId,
    });
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
  });

  it('rejects a request replay with a different immutable product mapping', async () => {
    const existingOperation = {
      ...input,
      expectedProductIds: ['different-product-id'],
      id: 'existing-operation-id',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.RESERVED,
    };
    const { metronomeClientService, service } = createService({
      existingOperation,
    });

    await expect(service.reserveOperation(input)).rejects.toMatchObject({
      code: ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
    });
    expect(metronomeClientService.previewUsage).not.toHaveBeenCalled();
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
  });

  it('fails closed when Metronome is disabled before replaying an operation', async () => {
    const existingOperation = {
      ...input,
      id: 'existing-operation-id',
      reservedAmountCents: '7',
      state: ManagedProviderOperationState.RESERVED,
    };
    const { metronomeClientService, service } = createService({
      existingOperation,
      metronomeEnabled: false,
    });

    await expect(service.reserveOperation(input)).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
    });
    expect(metronomeClientService.previewUsage).not.toHaveBeenCalled();
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
  });

  it('checks disabled Metronome before validating reservation input', async () => {
    const { service } = createService({ metronomeEnabled: false });

    await expect(
      service.reserveOperation({ ...input, expectedProductIds: [] }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
    });
  });

  it.each([
    ['no invoice', []],
    [
      'multiple invoices',
      [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Reviewed operation',
              productId: 'product-id',
              total: 7,
              type: 'usage',
            },
          ],
          total: 0,
        },
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'second-invoice-id',
          lineItems: [],
          total: 0,
        },
      ],
    ],
    [
      'a workspace identity mismatch',
      [
        {
          contractId: 'other-contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [],
          total: 0,
        },
      ],
    ],
    [
      'an unexpected line item',
      [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Unexpected usage',
              productId: 'other-product-id',
              total: 7,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    ],
    [
      'a non-usage line item',
      [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Commitment',
              productId: 'product-id',
              total: 7,
              type: 'commitment',
            },
          ],
          total: 0,
        },
      ],
    ],
    [
      'a zero line item total',
      [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Zero usage',
              productId: 'product-id',
              total: 0,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    ],
    [
      'a fractional line item total',
      [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Fractional usage',
              productId: 'product-id',
              total: 7.5,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    ],
    [
      'a negative line item total',
      [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Negative usage',
              productId: 'product-id',
              total: -7,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    ],
  ])(
    'rejects %s before balance authorization or persistence',
    async (_, invoices) => {
      const {
        manager,
        metronomeClientService,
        operationRepository,
        previewUsageMock,
        service,
      } = createService();
      previewUsageMock.mockResolvedValue({ invoices });

      await expect(service.reserveOperation(input)).rejects.toThrow();

      expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
      expect(operationRepository.manager.transaction).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('sums multiple validated usage lines without trusting invoice total', async () => {
    const { manager, previewUsageMock, service } = createService();
    previewUsageMock.mockResolvedValue({
      invoices: [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'First expected usage',
              productId: 'first-product-id',
              total: 4,
              type: 'usage',
            },
            {
              name: 'Second expected usage',
              productId: 'second-product-id',
              total: 6,
              type: 'usage',
            },
          ],
          total: 999_999,
        },
      ],
    });

    await service.reserveOperation({
      ...input,
      expectedProductIds: ['second-product-id', 'first-product-id'],
    });

    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({ reservedAmountCents: '10' }),
    );
  });

  it('rejects unsafe quote totals before balance authorization or persistence', async () => {
    const {
      manager,
      metronomeClientService,
      operationRepository,
      previewUsageMock,
      service,
    } = createService();
    previewUsageMock.mockResolvedValue({
      invoices: [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Unsafe usage',
              productId: 'product-id',
              total: Number.MAX_SAFE_INTEGER + 1,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    });

    await expect(service.reserveOperation(input)).rejects.toThrow();

    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(operationRepository.manager.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not persist a reservation when metric resolution fails', async () => {
    const { manager, metronomeClientService, operationRepository, service } =
      createService();
    jest
      .spyOn(metronomeClientService, 'getBillableMetricIds')
      .mockRejectedValue(new Error('missing billable metric'));

    await expect(service.reserveOperation(input)).rejects.toThrow(
      'missing billable metric',
    );

    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(operationRepository.manager.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('durably attaches a provider execution id before completion', async () => {
    const reservedOperation = {
      ...input,
      id: 'operation-id',
      providerExecutionId: null,
      state: ManagedProviderOperationState.RESERVED,
    };
    const { manager, service } = createService();

    manager.findOne.mockResolvedValue(reservedOperation);
    manager.save.mockImplementation((_, values) => values);

    await expect(
      service.attachProviderExecutionId({
        operationId: 'operation-id',
        providerConfigurationKey: input.providerConfigurationKey,
        providerExecutionId: 'generation-id',
        providerKey: input.providerKey,
        workspaceId,
      }),
    ).resolves.toMatchObject({ providerExecutionId: 'generation-id' });
    expect(manager.findOne).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      {
        lock: { mode: 'pessimistic_write' },
        where: { id: 'operation-id', workspaceId },
      },
    );
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({ providerExecutionId: 'generation-id' }),
    );
  });

  it('rejects a conflicting provider execution id attachment', async () => {
    const { manager, service } = createService();

    manager.findOne.mockResolvedValue({
      ...input,
      id: 'operation-id',
      providerExecutionId: 'first-generation-id',
      state: ManagedProviderOperationState.RESERVED,
    });

    await expect(
      service.attachProviderExecutionId({
        operationId: 'operation-id',
        providerConfigurationKey: input.providerConfigurationKey,
        providerExecutionId: 'second-generation-id',
        providerKey: input.providerKey,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('locks a reserved operation and records a billable completion as usage pending', async () => {
    const reservedOperation = {
      ...input,
      actualUsageProperties: null,
      completedAt: null,
      id: 'operation-id',
      providerCostMicrousd: null,
      providerExecutionId: null,
      quotedActualAmountCents: null,
      releasedAt: null,
      state: ManagedProviderOperationState.RESERVED,
    };
    const { manager, messageQueueService, service } = createService();
    manager.findOne.mockImplementation((entity) =>
      entity === ManagedProviderOperationEntity ? reservedOperation : null,
    );
    manager.save.mockImplementation((_, values) => values);
    const completion: CompleteManagedProviderOperationInput = {
      actualUsageProperties: { quantity: 3 },
      actorUserWorkspaceId: 'user-workspace-id',
      operationId: 'operation-id',
      operationKey: 'reviewed-operation',
      outcome: 'BILLABLE',
      providerConfigurationKey: 'reviewed-configuration',
      providerCostMicrousd: '1234',
      providerExecutionId: 'provider-execution-id',
      providerKey: 'provider',
      workspaceId,
    };
    await service.completeOperation(completion);

    expect(manager.findOne).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      {
        lock: { mode: 'pessimistic_write' },
        where: { id: 'operation-id', workspaceId },
      },
    );
    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        actualUsageProperties: { quantity: 3 },
        completedAt: expect.any(Date),
        providerCostMicrousd: '1234',
        providerExecutionId: 'provider-execution-id',
        state: ManagedProviderOperationState.USAGE_PENDING,
      }),
    );
    expect(messageQueueService.add).toHaveBeenCalledWith(
      DeliverManagedProviderUsageJob.name,
      { operationId: 'operation-id' },
      { id: 'managed-provider-usage:operation-id', retryLimit: 3 },
    );
  });
  it('returns durable billable completion when usage publication fails', async () => {
    const reservedOperation = {
      ...input,
      actualUsageProperties: null,
      completedAt: null,
      id: 'operation-id',
      providerCostMicrousd: null,
      providerExecutionId: null,
      quotedActualAmountCents: null,
      releasedAt: null,
      state: ManagedProviderOperationState.RESERVED,
    };
    const { manager, messageQueueService, service } = createService();
    manager.findOne.mockImplementation((entity) =>
      entity === ManagedProviderOperationEntity ? reservedOperation : null,
    );
    manager.save.mockImplementation((_, values) => values);
    (messageQueueService.add as jest.Mock).mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    await expect(
      service.completeOperation({
        actualUsageProperties: { quantity: 3 },
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome: 'BILLABLE',
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: '1234',
        providerExecutionId: 'provider-execution-id',
        providerKey: 'provider',
        workspaceId,
      }),
    ).resolves.toMatchObject({
      id: 'operation-id',
      state: ManagedProviderOperationState.USAGE_PENDING,
    });

    expect(manager.save).toHaveBeenCalledWith(
      ManagedProviderOperationEntity,
      expect.objectContaining({
        state: ManagedProviderOperationState.USAGE_PENDING,
      }),
    );
    expect(messageQueueService.add).toHaveBeenCalledTimes(1);
  });

  it('records billable completion when provider cost is unavailable', async () => {
    const reservedOperation = {
      ...input,
      actualUsageProperties: null,
      completedAt: null,
      id: 'operation-id',
      providerCostMicrousd: null,
      providerExecutionId: null,
      quotedActualAmountCents: null,
      releasedAt: null,
      state: ManagedProviderOperationState.RESERVED,
    };
    const { manager, service } = createService();

    manager.findOne.mockImplementation((entity) =>
      entity === ManagedProviderOperationEntity ? reservedOperation : null,
    );
    manager.save.mockImplementation((_, values) => values);

    await expect(
      service.completeOperation({
        actualUsageProperties: { quantity: 3 },
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome: 'BILLABLE',
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: null,
        providerExecutionId: 'provider-execution-id',
        providerKey: 'provider',
        workspaceId,
      }),
    ).resolves.toMatchObject({
      providerCostMicrousd: null,
      state: ManagedProviderOperationState.USAGE_PENDING,
    });
  });

  it('returns an exact billable completion replay without writing again', async () => {
    const completedOperation = {
      ...input,
      actualUsageProperties: { quantity: 3 },
      completedAt: new Date(),
      completionOutcome: 'BILLABLE',
      id: 'operation-id',
      providerCostMicrousd: '1234',
      providerExecutionId: 'provider-execution-id',
      quotedActualAmountCents: null,
      releasedAt: null,
      state: ManagedProviderOperationState.USAGE_PENDING,
    };
    const { manager, service } = createService();
    manager.findOne.mockImplementation((entity) =>
      entity === ManagedProviderOperationEntity ? completedOperation : null,
    );

    await expect(
      service.completeOperation({
        actualUsageProperties: { quantity: 3 },
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome: 'BILLABLE',
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: '1234',
        providerExecutionId: 'provider-execution-id',
        providerKey: 'provider',
        workspaceId,
      }),
    ).resolves.toBe(completedOperation);

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects conflicting completion facts without changing the first receipt', async () => {
    const completedOperation = {
      ...input,
      actualUsageProperties: { quantity: 3 },
      completedAt: new Date(),
      id: 'operation-id',
      providerCostMicrousd: '1234',
      providerExecutionId: 'provider-execution-id',
      quotedActualAmountCents: null,
      releasedAt: null,
      state: ManagedProviderOperationState.USAGE_PENDING,
    };
    const { manager, service } = createService();
    manager.findOne.mockImplementation((entity) =>
      entity === ManagedProviderOperationEntity ? completedOperation : null,
    );

    await expect(
      service.completeOperation({
        actualUsageProperties: { quantity: 4 },
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome: 'BILLABLE',
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: '1234',
        providerExecutionId: 'provider-execution-id',
        providerKey: 'provider',
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
    });

    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['NON_BILLABLE_FAILURE', ManagedProviderOperationState.RELEASED, true],
    ['UNKNOWN', ManagedProviderOperationState.RECONCILIATION_REQUIRED, false],
  ] as const)(
    'records a %s completion without delivering usage',
    async (outcome, state, isReleased) => {
      const reservedOperation = {
        ...input,
        actualUsageProperties: null,
        completedAt: null,
        id: 'operation-id',
        providerCostMicrousd: null,
        providerExecutionId: null,
        quotedActualAmountCents: null,
        releasedAt: null,
        state: ManagedProviderOperationState.RESERVED,
      };
      const { manager, service } = createService();
      manager.findOne.mockImplementation((entity) =>
        entity === ManagedProviderOperationEntity ? reservedOperation : null,
      );

      await service.completeOperation({
        actualUsageProperties: {},
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome,
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: null,
        providerExecutionId: null,
        providerKey: 'provider',
        workspaceId,
      });

      expect(manager.save).toHaveBeenCalledWith(
        ManagedProviderOperationEntity,
        expect.objectContaining({
          releasedAt: isReleased ? expect.any(Date) : null,
          state,
        }),
      );
    },
  );

  it('does not move a terminal operation backward during completion', async () => {
    const settledOperation = {
      ...input,
      actualUsageProperties: { quantity: 3 },
      completedAt: new Date(),
      id: 'operation-id',
      providerCostMicrousd: '1234',
      providerExecutionId: 'provider-execution-id',
      quotedActualAmountCents: null,
      releasedAt: null,
      state: ManagedProviderOperationState.USAGE_SETTLED,
    };
    const { manager, service } = createService();
    manager.findOne.mockImplementation((entity) =>
      entity === ManagedProviderOperationEntity ? settledOperation : null,
    );

    await expect(
      service.completeOperation({
        actualUsageProperties: { quantity: 3 },
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome: 'BILLABLE',
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: '1234',
        providerExecutionId: 'provider-execution-id',
        providerKey: 'provider',
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
    });

    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative provider cost', { providerCostMicrousd: '-1' }],
    [
      'unsafe provider properties',
      { actualUsageProperties: { prompt: 'secret' } },
    ],
  ])('rejects %s before taking the completion lock', async (_, changes) => {
    const { manager, service } = createService();

    await expect(
      service.completeOperation({
        actualUsageProperties: {},
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-id',
        operationKey: 'reviewed-operation',
        outcome: 'BILLABLE',
        providerConfigurationKey: 'reviewed-configuration',
        providerCostMicrousd: '1234',
        providerExecutionId: 'provider-execution-id',
        providerKey: 'provider',
        workspaceId,
        ...changes,
      }),
    ).rejects.toThrow();

    expect(manager.findOne).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });
});
