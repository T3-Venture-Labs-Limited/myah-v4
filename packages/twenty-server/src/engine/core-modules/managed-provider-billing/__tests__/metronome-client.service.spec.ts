import { Metronome } from '@metronome/sdk';

import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { MetronomeClientService } from '../services/metronome-client.service';

jest.mock('@metronome/sdk', () => ({
  Metronome: jest.fn(),
}));

describe('MetronomeClientService', () => {
  const metronomeConstructor = jest.mocked(Metronome);

  const createService = () => {
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        switch (key) {
          case 'METRONOME_ENABLED':
            return false;
          case 'METRONOME_API_KEY':
          case 'METRONOME_RATE_CARD_ALIAS':
            return '';
          case 'METRONOME_USAGE_SETTLEMENT_DELAY_MS':
            return 30_000;
          default:
            throw new Error(`Unexpected config key: ${key}`);
        }
      }),
    } as Pick<TwentyConfigService, 'get'>;

    return new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );
  };

  beforeEach(() => {
    metronomeConstructor.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    [
      'findCustomerByIngestAlias',
      (service: MetronomeClientService) =>
        service.findCustomerByIngestAlias('myah-workspace:workspace-id'),
    ],
    [
      'createCustomer',
      (service: MetronomeClientService) =>
        service.createCustomer({
          alias: 'myah-workspace:workspace-id',
          name: 'Workspace',
        }),
    ],
    [
      'createContract',
      (service: MetronomeClientService) =>
        service.createContract({
          customerId: 'customer-id',
          rateCardAlias: 'managed-provider',
          uniquenessKey: 'myah-workspace-contract:workspace-id',
        }),
    ],
    [
      'findCurrentContracts',
      (service: MetronomeClientService) =>
        service.findCurrentContracts('customer-id'),
    ],
    [
      'previewUsage',
      (service: MetronomeClientService) =>
        service.previewUsage({
          customerId: 'customer-id',
          eventType: 'managed_provider_operation',
          properties: { operation: 'test' },
        }),
    ],
    [
      'getPrepaidBalance',
      (service: MetronomeClientService) =>
        service.getPrepaidBalance('customer-id'),
    ],
    [
      'ingestUsage',
      (service: MetronomeClientService) =>
        service.ingestUsage({
          customerId: 'customer-id',
          eventType: 'managed_provider_operation',
          properties: { operation: 'test' },
          timestamp: '2026-07-16T12:00:00.000Z',
          transactionId: 'operation-id',
        }),
    ],
    [
      'searchUsageEvents',
      (service: MetronomeClientService) =>
        service.searchUsageEvents(['operation-id']),
    ],
  ])(
    'fails closed without constructing the SDK when disabled: %s',
    async (_, operation) => {
      const service = createService();

      await expect(operation(service)).rejects.toMatchObject({
        code: MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      } satisfies Pick<MetronomeClientException, 'code'>);
      expect(metronomeConstructor).not.toHaveBeenCalled();
    },
  );

  it('maps an enabled ingest-alias customer lookup to Myah-owned customer data', async () => {
    const listCustomers = jest.fn().mockResolvedValue({
      data: [
        {
          archived_at: null,
          id: 'customer-id',
          ingest_aliases: ['myah-workspace:workspace-id'],
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: {
              list: listCustomers,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        switch (key) {
          case 'METRONOME_ENABLED':
            return true;
          case 'METRONOME_API_KEY':
            return 'metronome-api-key';
          case 'METRONOME_RATE_CARD_ALIAS':
            return 'managed-provider';
          case 'METRONOME_USAGE_SETTLEMENT_DELAY_MS':
            return 30_000;
          default:
            throw new Error(`Unexpected config key: ${key}`);
        }
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.findCustomerByIngestAlias('myah-workspace:workspace-id'),
    ).resolves.toEqual([
      {
        archivedAt: null,
        id: 'customer-id',
        ingestAliases: ['myah-workspace:workspace-id'],
      },
    ]);
    expect(metronomeConstructor).toHaveBeenCalledWith({
      bearerToken: 'metronome-api-key',
    });
    expect(listCustomers).toHaveBeenCalledWith({
      ingest_alias: 'myah-workspace:workspace-id',
    });
  });

  it('maps enabled customer creation to a deterministic ingest alias', async () => {
    const createCustomer = jest.fn().mockResolvedValue({
      data: { id: 'customer-id' },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: {
              create: createCustomer,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createCustomer({
        alias: 'myah-workspace:workspace-id',
        name: 'Workspace',
      }),
    ).resolves.toEqual({ id: 'customer-id' });
    expect(createCustomer).toHaveBeenCalledWith({
      ingest_aliases: ['myah-workspace:workspace-id'],
      name: 'Workspace',
    });
  });

  it('maps enabled contract creation to the configured rate card and uniqueness key', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const createContract = jest.fn().mockResolvedValue({
      data: { id: 'contract-id' },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              create: createContract,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createContract({
        customerId: 'customer-id',
        rateCardAlias: 'managed-provider',
        uniquenessKey: 'myah-workspace-contract:workspace-id',
      }),
    ).resolves.toEqual({ id: 'contract-id' });
    expect(createContract).toHaveBeenCalledWith({
      customer_id: 'customer-id',
      rate_card_alias: 'managed-provider',
      starting_at: '2026-07-16T12:00:00.000Z',
      uniqueness_key: 'myah-workspace-contract:workspace-id',
    });
  });

  it('classifies an observed contract uniqueness conflict', async () => {
    const createContract = jest.fn().mockRejectedValue({ status: 409 });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              create: createContract,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createContract({
        customerId: 'customer-id',
        rateCardAlias: 'managed-provider',
        uniquenessKey: 'myah-workspace-contract:workspace-id',
      }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CONFLICT,
    });
  });

  it('keeps non-conflict contract creation failures generic', async () => {
    const createContract = jest.fn().mockRejectedValue({ status: 500 });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              create: createContract,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createContract({
        customerId: 'customer-id',
        rateCardAlias: 'managed-provider',
        uniquenessKey: 'myah-workspace-contract:workspace-id',
      }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.REQUEST_FAILED,
    });
  });
  it('reads current contracts through v2 and maps reconciliation fields', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const listContracts = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'contract-id',
          rate_card_id: 'rate-card-id',
          starting_at: '2026-07-16T12:00:00.000Z',
          uniqueness_key: 'myah-workspace-contract:workspace-id',
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v2: {
            contracts: {
              list: listContracts,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(service.findCurrentContracts('customer-id')).resolves.toEqual([
      {
        id: 'contract-id',
        rateCardId: 'rate-card-id',
        startingAt: '2026-07-16T12:00:00.000Z',
        uniquenessKey: 'myah-workspace-contract:workspace-id',
      },
    ]);
    expect(listContracts).toHaveBeenCalledWith({
      covering_date: '2026-07-16T12:00:00.000Z',
      customer_id: 'customer-id',
    });
  });

  it('maps one bounded rate-card page for contract replay verification', async () => {
    const listRateCards = jest.fn().mockResolvedValue({
      getPaginatedItems: jest.fn().mockReturnValue([
        {
          aliases: [
            {
              ending_before: '2026-08-01T00:00:00.000Z',
              name: 'managed-provider',
              starting_at: '2026-07-01T00:00:00.000Z',
            },
          ],
          id: 'rate-card-id',
        },
      ]),
      hasNextPage: jest.fn().mockReturnValue(false),
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              rateCards: {
                list: listRateCards,
              },
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(service.listRateCards()).resolves.toEqual({
      hasNextPage: false,
      rateCards: [
        {
          aliases: [
            {
              endingBefore: '2026-08-01T00:00:00.000Z',
              name: 'managed-provider',
              startingAt: '2026-07-01T00:00:00.000Z',
            },
          ],
          id: 'rate-card-id',
        },
      ],
    });
    expect(listRateCards).toHaveBeenCalledWith({ limit: 100 });
  });

  it('reads only prepaid USD balance including draft invoices', async () => {
    const getNetBalance = jest.fn().mockResolvedValue({
      data: { balance: 500 },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              getNetBalance,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(service.getPrepaidBalance('customer-id')).resolves.toEqual({
      balance: 500,
    });
    expect(getNetBalance).toHaveBeenCalledWith({
      customer_id: 'customer-id',
      filters: [{ balance_types: ['PREPAID_COMMIT'] }],
      invoice_inclusion_mode: 'FINALIZED_AND_DRAFT',
    });
  });
  it('maps a usage preview into the internal invoice shape', async () => {
    const previewEvents = jest.fn().mockResolvedValue({
      data: [
        {
          contract_id: 'contract-id',
          customer_id: 'customer-id',
          id: 'invoice-id',
          line_items: [
            {
              name: 'Managed provider operation',
              product_id: 'product-id',
              total: 7,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: {
              previewEvents,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.previewUsage({
        customerId: 'customer-id',
        eventType: 'managed_provider_operation',
        properties: { operation: 'test' },
      }),
    ).resolves.toEqual({
      invoices: [
        {
          contractId: 'contract-id',
          customerId: 'customer-id',
          id: 'invoice-id',
          lineItems: [
            {
              name: 'Managed provider operation',
              productId: 'product-id',
              total: 7,
              type: 'usage',
            },
          ],
          total: 0,
        },
      ],
    });
    expect(previewEvents).toHaveBeenCalledWith({
      customer_id: 'customer-id',
      events: [
        {
          event_type: 'managed_provider_operation',
          properties: { operation: 'test' },
        },
      ],
      mode: 'replace',
    });
  });
  it('ingests usage with a deterministic transaction ID and timestamp', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const ingest = jest.fn().mockResolvedValue(undefined);
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            usage: {
              ingest,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.ingestUsage({
        customerId: 'customer-id',
        eventType: 'managed_provider_operation',
        properties: { operation: 'test' },
        timestamp: '2026-07-16T12:00:00.000Z',
        transactionId: 'operation-id',
      }),
    ).resolves.toBeUndefined();
    expect(ingest).toHaveBeenCalledWith({
      usage: [
        {
          customer_id: 'customer-id',
          event_type: 'managed_provider_operation',
          properties: { operation: 'test' },
          timestamp: '2026-07-16T12:00:00.000Z',
          transaction_id: 'operation-id',
        },
      ],
    });
  });
  it('maps uncertain customer creation failures to a safe internal error', async () => {
    const createCustomer = jest
      .fn()
      .mockRejectedValue(
        new Error('provider rejected bearer token metronome-api-key'),
      );
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: {
              create: createCustomer,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createCustomer({
        alias: 'myah-workspace:workspace-id',
        name: 'Workspace',
      }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      message: 'Metronome managed-provider request failed',
    });
  });

  it.each([
    ['observed conflict', 409, MetronomeClientExceptionCode.CONFLICT],
    [
      'server failure with uncertain outcome',
      500,
      MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    ],
    [
      'non-conflict client failure',
      400,
      MetronomeClientExceptionCode.REQUEST_FAILED,
    ],
  ])('classifies customer creation %s', async (_, status, expectedCode) => {
    const createCustomer = jest.fn().mockRejectedValue({ status });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: {
              create: createCustomer,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createCustomer({
        alias: 'myah-workspace:workspace-id',
        name: 'Workspace',
      }),
    ).rejects.toMatchObject({ code: expectedCode });
  });
  it.each([
    [
      'previewUsage',
      (service: MetronomeClientService) =>
        service.previewUsage({
          customerId: 'customer-id',
          eventType: 'managed_provider_operation',
          properties: { apiKey: 'secret' },
        }),
    ],
    [
      'ingestUsage',
      (service: MetronomeClientService) =>
        service.ingestUsage({
          customerId: 'customer-id',
          eventType: 'managed_provider_operation',
          properties: { apiKey: 'secret' },
          transactionId: 'operation-id',
        }),
    ],
  ])(
    'rejects unsafe properties before constructing the SDK: %s',
    async (_, operation) => {
      const twentyConfigService = {
        get: jest.fn((key: keyof ConfigVariables) => {
          if (key === 'METRONOME_ENABLED') return true;
          if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
          throw new Error(`Unexpected config key: ${key}`);
        }),
      } as Pick<TwentyConfigService, 'get'>;
      const service = new MetronomeClientService(
        twentyConfigService as unknown as TwentyConfigService,
      );

      await expect(operation(service)).rejects.toMatchObject({
        code: MetronomeClientExceptionCode.UNSAFE_EVENT_PROPERTIES,
      });
      expect(metronomeConstructor).not.toHaveBeenCalled();
    },
  );
  it('maps SDK construction failures to a safe internal error', async () => {
    metronomeConstructor.mockImplementation(() => {
      throw new Error('invalid bearer token metronome-api-key');
    });
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.createCustomer({
        alias: 'myah-workspace:workspace-id',
        name: 'Workspace',
      }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.REQUEST_FAILED,
      message: 'Metronome managed-provider request failed',
    });
  });

  it('normalizes event-search responses for reconciliation', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        billable_metrics: [{ id: 'sandbox-metric-id' }],
        id: 'event-id',
        customer_id: 'customer-id',
        matched_customer: { id: 'customer-id' },
        event_type: 'managed_provider_operation',
        is_duplicate: true,
        processed_at: '2026-07-16T12:01:00.000Z',
        timestamp: '2026-07-16T12:00:00.000Z',
        properties: { quantity: '3' },
        transaction_id: 'operation-id',
      },
      {
        id: 'event-id-2',
        customer_id: 'customer-id',
        event_type: 'managed_provider_operation',
        matched_billable_metrics: [{ id: 'sdk-metric-id' }],
        matched_customer: { id: 'customer-id' },
        timestamp: '2026-07-16T12:00:00.000Z',
        transaction_id: 'operation-id-2',
      },
    ]);
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            usage: {
              search,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.searchUsageEvents(['operation-id', 'operation-id-2']),
    ).resolves.toEqual([
      {
        customerId: 'customer-id',
        eventType: 'managed_provider_operation',
        isDuplicate: true,
        matchedBillableMetricIds: ['sandbox-metric-id'],
        timestamp: '2026-07-16T12:00:00.000Z',
        matchedCustomerId: 'customer-id',
        processedAt: '2026-07-16T12:01:00.000Z',
        properties: { quantity: '3' },
        transactionId: 'operation-id',
      },
      {
        customerId: 'customer-id',
        eventType: 'managed_provider_operation',
        isDuplicate: false,
        matchedBillableMetricIds: ['sdk-metric-id'],
        timestamp: '2026-07-16T12:00:00.000Z',
        matchedCustomerId: 'customer-id',
        processedAt: null,
        properties: {},
        transactionId: 'operation-id-2',
      },
    ]);
    expect(search).toHaveBeenCalledWith({
      transactionIds: ['operation-id', 'operation-id-2'],
    });
  });

  it('maps a rate-limited event search to the typed rate-limit error', async () => {
    const search = jest.fn().mockRejectedValue({ status: 429 });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            usage: {
              search,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.searchUsageEvents(['operation-id']),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.RATE_LIMITED,
    } satisfies Pick<MetronomeClientException, 'code'>);
  });
  it('resolves preview products to a canonical billable metric set', async () => {
    const retrieve = jest
      .fn()
      .mockResolvedValueOnce({
        data: { current: { billable_metric_id: ' metric-b ' } },
      })
      .mockResolvedValueOnce({
        data: { current: { billable_metric_id: 'metric-a' } },
      })
      .mockResolvedValueOnce({
        data: { current: { billable_metric_id: 'metric-b' } },
      });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { contracts: { products: { retrieve } } },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.getBillableMetricIds(['product-b', 'product-a', 'product-b-2']),
    ).resolves.toEqual(['metric-a', 'metric-b']);
    expect(retrieve).toHaveBeenCalledWith({ id: 'product-b' });
    expect(retrieve).toHaveBeenCalledWith({ id: 'product-a' });
    expect(retrieve).toHaveBeenCalledWith({ id: 'product-b-2' });
  });

  it('fails closed when a preview product has no billable metric', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      data: { current: { billable_metric_id: ' ' } },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { contracts: { products: { retrieve } } },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(
      service.getBillableMetricIds(['product-id']),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.REQUEST_FAILED,
    });
  });
});
