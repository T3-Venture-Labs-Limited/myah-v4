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
      'createCustomerCredit',
      (service: MetronomeClientService) =>
        service.createCustomerCredit({
          amountCents: 5_000,
          applicableProductIds: ['charge-product-id'],
          contractId: 'contract-id',
          customerId: 'customer-id',
          endingBefore: '2027-01-01T00:00:00.000Z',
          name: 'Design partner credit',
          productId: 'credit-product-id',
          startingAt: '2026-07-19T00:00:00.000Z',
          uniquenessKey: 'design-partner-credit-1',
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
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:37:42.123Z'));
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

  it('retrieves one rate card for contract replay verification', async () => {
    const retrieveRateCard = jest.fn().mockResolvedValue({
      data: {
        aliases: [
          {
            ending_before: '2026-08-01T00:00:00.000Z',
            name: 'managed-provider',
            starting_at: '2026-07-01T00:00:00.000Z',
          },
        ],
        id: 'rate-card-id',
      },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              rateCards: {
                retrieve: retrieveRateCard,
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

    await expect(service.getRateCard('rate-card-id')).resolves.toEqual({
      aliases: [
        {
          endingBefore: '2026-08-01T00:00:00.000Z',
          name: 'managed-provider',
          startingAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      id: 'rate-card-id',
    });
    expect(retrieveRateCard).toHaveBeenCalledWith({ id: 'rate-card-id' });
  });

  it('reads eligible sponsored credits and prepaid commitments including draft invoices', async () => {
    const listBalances = jest.fn().mockResolvedValue({
      data: [
        {
          type: 'PREPAID',
          balance: 300,
          product: {
            id: 'managed-openrouter-credit-product-id',
            name: 'Managed OpenRouter credit',
          },
          applicable_product_ids: ['managed-openrouter-charge-product-id'],
        },
        {
          type: 'CREDIT',
          balance: 200,
          product: {
            id: 'managed-openrouter-credit-product-id',
            name: 'Managed OpenRouter credit',
          },
          applicable_product_ids: ['managed-openrouter-charge-product-id'],
          custom_fields: { myah_managed_openrouter: 'sponsored' },
        },
      ],
      next_page: '',
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              listBalances,
            },
          },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        if (key === 'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID')
          return 'managed-openrouter-charge-product-id';
        if (key === 'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID')
          return 'managed-openrouter-credit-product-id';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;
    const service = new MetronomeClientService(
      twentyConfigService as unknown as TwentyConfigService,
    );

    await expect(service.getPrepaidBalance('customer-id')).resolves.toEqual({
      balance: 500,
    });
    expect(listBalances).toHaveBeenCalledWith({
      customer_id: 'customer-id',
      include_balance: true,
      limit: 25,
    });
  });

  it('follows multiple balance pages and excludes postpaid and unrelated credit products', async () => {
    const listBalances = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            type: 'PREPAID',
            balance: 300,
            product: {
              id: 'managed-openrouter-credit-product-id',
              name: 'Managed OpenRouter credit',
            },
            applicable_product_ids: ['managed-openrouter-charge-product-id'],
          },
          {
            type: 'POSTPAID_COMMIT',
            balance: 400,
            product: {
              id: 'managed-openrouter-credit-product-id',
              name: 'Managed OpenRouter credit',
            },
            applicable_product_ids: ['managed-openrouter-charge-product-id'],
          },
          {
            type: 'CREDIT',
            balance: 500,
            product: { id: 'other-credit-product-id', name: 'Other credit' },
            applicable_product_ids: ['managed-openrouter-charge-product-id'],
            custom_fields: { myah_managed_openrouter: 'sponsored' },
          },
        ],
        next_page: 'page-2',
      })
      .mockResolvedValueOnce({
        data: [
          {
            type: 'PREPAID',
            balance: 200,
            product: {
              id: 'managed-openrouter-credit-product-id',
              name: 'Managed OpenRouter credit',
            },
            applicable_product_ids: ['managed-openrouter-charge-product-id'],
          },
        ],
        next_page: '',
      });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { contracts: { listBalances } },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        if (key === 'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID')
          return 'managed-openrouter-charge-product-id';
        if (key === 'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID')
          return 'managed-openrouter-credit-product-id';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;

    await expect(
      new MetronomeClientService(
        twentyConfigService as unknown as TwentyConfigService,
      ).getPrepaidBalance('customer-id'),
    ).resolves.toEqual({ balance: 500 });
    expect(listBalances).toHaveBeenNthCalledWith(2, {
      customer_id: 'customer-id',
      include_balance: true,
      limit: 25,
      next_page: 'page-2',
    });
  });

  it('excludes balances scoped to another product', async () => {
    const listBalances = jest.fn().mockResolvedValue({
      data: [
        {
          type: 'PREPAID_COMMIT',
          balance: 400,
          applicable_product_ids: ['other-product-id'],
        },
        {
          type: 'CREDIT',
          balance: 200,
          applicable_product_ids: ['other-product-id'],
          custom_fields: { myah_managed_openrouter: 'sponsored' },
        },
      ],
      next_page: '',
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { contracts: { listBalances } },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        if (key === 'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID')
          return 'managed-openrouter-charge-product-id';
        if (key === 'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID')
          return 'managed-openrouter-credit-product-id';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;

    await expect(
      new MetronomeClientService(
        twentyConfigService as unknown as TwentyConfigService,
      ).getPrepaidBalance('customer-id'),
    ).resolves.toEqual({ balance: 0 });
  });

  it.each([
    ['missing applicability', undefined],
    ['ambiguous applicability', 'not-an-array'],
  ])('fails closed for sponsored credits with %s', async (_, applicability) => {
    const listBalances = jest.fn().mockResolvedValue({
      data: [
        {
          type: 'CREDIT',
          balance: 200,
          ...(applicability === undefined
            ? {}
            : { applicable_product_ids: applicability }),
          custom_fields: { myah_managed_openrouter: 'sponsored' },
        },
      ],
      next_page: '',
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { contracts: { listBalances } },
        }) as unknown as Metronome,
    );
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        if (key === 'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID')
          return 'managed-openrouter-charge-product-id';
        if (key === 'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID')
          return 'managed-openrouter-credit-product-id';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;

    await expect(
      new MetronomeClientService(
        twentyConfigService as unknown as TwentyConfigService,
      ).getPrepaidBalance('customer-id'),
    ).resolves.toEqual({ balance: 0 });
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
        timestamp: '2026-07-16T12:00:00.000Z',
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
          timestamp: '2026-07-16T12:00:00.000Z',
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

  it('creates an idempotent credit through the active v2 contract edit', async () => {
    const edit = jest.fn().mockResolvedValue({
      data: {
        id: 'contract-id',
        edit: { id: 'edit-id', add_credits: [{ id: 'credit-id' }] },
      },
    });
    metronomeConstructor.mockImplementation(
      () => ({ v2: { contracts: { edit } } }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.createCustomerCredit({
        amountCents: 5_000,
        applicableProductIds: ['charge-product-id'],
        contractId: 'contract-id',
        customerId: 'customer-id',
        endingBefore: '2027-01-01T00:47:13.444Z',
        name: 'Design partner credit',
        productId: 'credit-product-id',
        startingAt: '2026-07-19T00:37:42.123Z',
        uniquenessKey: 'design-partner-credit-1',
      }),
    ).resolves.toEqual({ creditId: 'credit-id', metronomeEditId: 'edit-id' });
    expect(edit).toHaveBeenCalledWith({
      contract_id: 'contract-id',
      customer_id: 'customer-id',
      add_credits: [
        {
          access_schedule: {
            schedule_items: [
              {
                amount: 5_000,
                ending_before: '2027-01-01T00:00:00.000Z',
                starting_at: '2026-07-19T00:00:00.000Z',
              },
            ],
          },
          applicable_product_ids: ['charge-product-id'],
          name: 'Design partner credit',
          priority: 0,
          product_id: 'credit-product-id',
        },
      ],
      uniqueness_key: 'design-partner-credit-1',
    });
  });
  it('fails closed when the v2 edit receipt is incomplete', async () => {
    const edit = jest.fn().mockResolvedValue({
      data: { id: 'contract-id', edit: { id: 'edit-id', add_credits: [] } },
    });
    metronomeConstructor.mockImplementation(
      () => ({ v2: { contracts: { edit } } }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.createCustomerCredit({
        amountCents: 5_000,
        applicableProductIds: ['charge-product-id'],
        contractId: 'contract-id',
        customerId: 'customer-id',
        endingBefore: '2027-01-01T00:00:00.000Z',
        name: 'Design partner credit',
        productId: 'credit-product-id',
        startingAt: '2026-07-19T00:00:00.000Z',
        uniquenessKey: 'design-partner-credit-1',
      }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    });
  });

  it.each([
    [
      'an ambiguous server failure as recoverable',
      { status: 500 },
      MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    ],
    [
      'the live 422 uniqueness-key response as a conflict',
      { status: 422, message: '422 Uniqueness key already exists: credit-key' },
      MetronomeClientExceptionCode.CONFLICT,
    ],
    [
      'an unrelated 422 validation response as a request failure',
      { status: 422, message: '422 Invalid contract credit payload' },
      MetronomeClientExceptionCode.REQUEST_FAILED,
    ],
  ])('classifies %s', async (_, providerError, expectedCode) => {
    const edit = jest.fn().mockRejectedValue(providerError);
    metronomeConstructor.mockImplementation(
      () => ({ v2: { contracts: { edit } } }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.createCustomerCredit({
        amountCents: 5_000,
        applicableProductIds: ['charge-product-id'],
        contractId: 'contract-id',
        customerId: 'customer-id',
        endingBefore: '2027-01-01T00:00:00.000Z',
        name: 'Design partner credit',
        productId: 'credit-product-id',
        startingAt: '2026-07-19T00:00:00.000Z',
        uniquenessKey: 'design-partner-credit-1',
      }),
    ).rejects.toMatchObject({ code: expectedCode });
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
          timestamp: '2026-07-17T00:00:00.000Z',
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
