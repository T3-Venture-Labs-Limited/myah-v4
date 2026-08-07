import { Metronome } from '@metronome/sdk';

import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { MetronomeClientService } from '../services/metronome-client.service';
import {
  type MetronomeAddSubscriptionInput,
  type MetronomeEndSubscriptionInput,
  type MetronomeQuantityUpdateInput,
} from '../types/metronome-subscription.type';

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
          case 'MANAGED_EMAIL_ENABLED':
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

  it('constructs the SDK with the configured Metronome environment root', async () => {
    const list = jest.fn().mockResolvedValue({ data: [] });
    metronomeConstructor.mockImplementation(
      () => ({ v1: { customers: { list } } }) as unknown as Metronome,
    );
    const service = new MetronomeClientService(
      {
        get: jest.fn((key: keyof ConfigVariables) => {
          if (key === 'METRONOME_ENABLED') return false;
          if (key === 'MANAGED_EMAIL_ENABLED') return true;
          if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
          throw new Error(`Unexpected config key: ${key}`);
        }),
      } as unknown as TwentyConfigService,
      'https://metronome.example',
    );

    await expect(
      service.findCustomerByIngestAlias('myah-workspace:workspace-id'),
    ).resolves.toEqual([]);
    expect(metronomeConstructor).toHaveBeenCalledWith({
      baseURL: 'https://metronome.example',
      bearerToken: 'metronome-api-key',
    });
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
      'setStripeBillingConfiguration',
      (service: MetronomeClientService) =>
        service.setStripeBillingConfiguration('customer-id', 'cus_123'),
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
      'addSubscription',
      (service: MetronomeClientService) =>
        service.addSubscription({
          billingFrequency: 'MONTHLY',
          contractId: 'contract-id',
          customerId: 'customer-id',
          productId: 'product-id',
          quantity: 1,
          startingAt: '2026-08-01T00:00:00.000Z',
          uniquenessKey: 'add-subscription-1',
          proration: {
            invoiceBehavior: 'BILL_IMMEDIATELY',
            isProrated: true,
          },
        }),
    ],
    [
      'scheduleSubscriptionQuantity',
      (service: MetronomeClientService) =>
        service.scheduleSubscriptionQuantity({
          contractId: 'contract-id',
          customerId: 'customer-id',
          effectiveAt: '2026-09-01T00:00:00.000Z',
          quantity: 2,
          subscriptionId: 'subscription-id',
          uniquenessKey: 'quantity-2',
        }),
    ],
    [
      'endSubscription',
      (service: MetronomeClientService) =>
        service.endSubscription({
          contractId: 'contract-id',
          customerId: 'customer-id',
          endingBefore: '2026-10-01T00:00:00.000Z',
          subscriptionId: 'subscription-id',
          uniquenessKey: 'end-subscription-1',
        }),
    ],
    [
      'findCurrentContracts',
      (service: MetronomeClientService) =>
        service.findCurrentContracts('customer-id'),
    ],
    [
      'listInvoicesFirstPage',
      (service: MetronomeClientService) =>
        service.listInvoicesFirstPage({
          contractId: 'contract-id',
          customerId: 'customer-id',
          endingBefore: '2026-09-01T00:00:00.000Z',
          startingOn: '2026-08-01T00:00:00.000Z',
        }),
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
      baseURL: 'https://api.metronome.com',
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
        activeBillingProviderConfiguration: null,
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
      fiatCreditType: null,
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

  it('sets the exact Stripe customer billing configuration through v1', async () => {
    const createBillingConfig = jest.fn().mockResolvedValue(undefined);
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: {
              billingConfig: { create: createBillingConfig },
            },
          },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.setStripeBillingConfiguration('customer-id', 'cus_123'),
    ).resolves.toBeUndefined();
    expect(createBillingConfig).toHaveBeenCalledWith(
      {
        billing_provider_customer_id: 'cus_123',
        billing_provider_type: 'stripe',
        customer_id: 'customer-id',
        stripe_collection_method: 'charge_automatically',
      },
      { maxRetries: 0 },
    );
  });

  it('creates the exact current Stripe billing configuration', async () => {
    const setBillingConfigurations = jest.fn().mockResolvedValue({
      data: [{ id: 'billing-config-id' }],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { customers: { setBillingConfigurations } },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.createBillingConfiguration({
        billingProviderType: 'stripe',
        customerId: 'customer-id',
        deliveryMethodId: 'delivery-method-id',
        stripeCollectionMethod: 'charge_automatically',
        stripeCustomerId: 'cus_123',
      }),
    ).resolves.toBeUndefined();
    expect(setBillingConfigurations).toHaveBeenCalledWith({
      data: [
        {
          billing_provider: 'stripe',
          configuration: {
            stripe_collection_method: 'charge_automatically',
            stripe_customer_id: 'cus_123',
          },
          customer_id: 'customer-id',
          delivery_method_id: 'delivery-method-id',
        },
      ],
    });
  });

  it('retrieves and normalizes the exact current Stripe billing configuration', async () => {
    const retrieveBillingConfigurations = jest.fn().mockResolvedValue({
      data: [
        {
          archived_at: null,
          billing_provider: 'stripe',
          configuration: {
            stripe_collection_method: 'charge_automatically',
            stripe_customer_id: 'cus_123',
          },
          customer_id: 'customer-id',
          delivery_method: 'direct_to_billing_provider',
          delivery_method_configuration: {},
          delivery_method_id: 'delivery-method-id',
          id: 'billing-config-id',
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: { retrieveBillingConfigurations },
          },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.getBillingConfiguration('customer-id'),
    ).resolves.toEqual({
      billingProviderType: 'stripe',
      deliveryMethod: 'direct_to_billing_provider',
      deliveryMethodId: 'delivery-method-id',
      id: 'billing-config-id',
      stripeCollectionMethod: 'charge_automatically',
      stripeCustomerId: 'cus_123',
    });
    expect(retrieveBillingConfigurations).toHaveBeenCalledWith({
      customer_id: 'customer-id',
    });
  });

  it('returns no billing configuration when no current configuration exists', async () => {
    const retrieveBillingConfigurations = jest
      .fn()
      .mockResolvedValue({ data: [] });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: { retrieveBillingConfigurations },
          },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.getBillingConfiguration('customer-id'),
    ).resolves.toBeNull();
  });

  it('fails closed when multiple active Stripe configurations exist', async () => {
    const configuration = {
      archived_at: null,
      billing_provider: 'stripe',
      configuration: {
        stripe_collection_method: 'charge_automatically',
        stripe_customer_id: 'cus_123',
      },
      customer_id: 'customer-id',
      delivery_method: 'direct_to_billing_provider',
      delivery_method_configuration: {},
      delivery_method_id: 'delivery-method-id',
      id: 'billing-config-id',
    };
    const retrieveBillingConfigurations = jest.fn().mockResolvedValue({
      data: [configuration, { ...configuration, id: 'other-config-id' }],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            customers: { retrieveBillingConfigurations },
          },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.getBillingConfiguration('customer-id'),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.REQUEST_FAILED,
    });
  });

  it('creates a managed-email contract with Stripe direct delivery without a configuration ID', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:37:42.123Z'));
    const createContract = jest.fn().mockResolvedValue({
      data: { id: 'contract-id' },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { contracts: { create: createContract } },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await service.createContract({
      billingProviderConfiguration: {
        billingProvider: 'stripe',
        deliveryMethod: 'direct_to_billing_provider',
      },
      customerId: 'customer-id',
      rateCardAlias: 'managed-email',
      uniquenessKey: 'myah-managed-email-workspace-contract:workspace-id',
    });

    expect(createContract).toHaveBeenCalledWith(
      {
        billing_provider_configuration: {
          billing_provider: 'stripe',
          delivery_method: 'direct_to_billing_provider',
        },
        customer_id: 'customer-id',
        rate_card_alias: 'managed-email',
        starting_at: '2026-07-16T12:00:00.000Z',
        uniqueness_key: 'myah-managed-email-workspace-contract:workspace-id',
      },
      { maxRetries: 0 },
    );
  });

  it('projects only the active billing-provider schedule entry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const listContracts = jest.fn().mockResolvedValue({
      data: [
        {
          billing_provider_configuration_schedule: [
            {
              billing_provider_configuration: {
                id: 'expired-config',
                billing_provider: 'stripe',
                delivery_method: 'direct_to_billing_provider',
                delivery_method_id: 'expired-delivery',
              },
              effective_at: '2026-06-01T00:00:00.000Z',
              effective_until: '2026-07-01T00:00:00.000Z',
            },
            {
              billing_provider_configuration: {
                id: 'active-config',
                billing_provider: 'stripe',
                delivery_method: 'direct_to_billing_provider',
                delivery_method_id: 'delivery-method-id',
              },
              effective_at: '2026-07-01T00:00:00.000Z',
              effective_until: '2026-08-01T00:00:00.000Z',
            },
            {
              billing_provider_configuration: {
                id: 'future-config',
                billing_provider: 'stripe',
                delivery_method: 'direct_to_billing_provider',
                delivery_method_id: 'future-delivery',
              },
              effective_at: '2026-08-01T00:00:00.000Z',
            },
          ],
          id: 'contract-id',
          rate_card_id: 'rate-card-id',
          starting_at: '2026-07-01T00:00:00.000Z',
          uniqueness_key: 'managed-email-key',
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v2: { contracts: { list: listContracts } },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(service.findCurrentContracts('customer-id')).resolves.toEqual([
      {
        activeBillingProviderConfiguration: {
          billingProvider: 'stripe',
          deliveryMethod: 'direct_to_billing_provider',
          deliveryMethodId: 'delivery-method-id',
          id: 'active-config',
        },
        id: 'contract-id',
        rateCardId: 'rate-card-id',
        startingAt: '2026-07-01T00:00:00.000Z',
        uniquenessKey: 'managed-email-key',
      },
    ]);
  });

  it('projects the rate-card fiat credit type for persisted USD proof', async () => {
    const retrieveRateCard = jest.fn().mockResolvedValue({
      data: {
        aliases: [],
        fiat_credit_type: { id: 'usd-credit-type', name: 'USD' },
        id: 'rate-card-id',
      },
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              rateCards: { retrieve: retrieveRateCard },
            },
          },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(service.getRateCard('rate-card-id')).resolves.toEqual({
      aliases: [],
      fiatCreditType: { id: 'usd-credit-type', name: 'USD' },
      id: 'rate-card-id',
    });
  });

  it('adds an advance quantity-only subscription and returns Myah-owned receipt IDs', async () => {
    const edit = jest.fn().mockResolvedValue({
      data: {
        edit: {
          add_subscriptions: [{ id: 'subscription-id' }],
          id: 'edit-id',
        },
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
    const input: MetronomeAddSubscriptionInput = {
      billingFrequency: 'MONTHLY',
      contractId: 'contract-id',
      customerId: 'customer-id',
      endingBefore: '2027-08-01T00:00:00.000Z',
      productId: 'product-id',
      quantity: 3,
      startingAt: '2026-08-01T00:00:00.000Z',
      uniquenessKey: 'add-subscription-1',
      proration: {
        invoiceBehavior: 'BILL_IMMEDIATELY',
        isProrated: true,
        rounding: { decimalPlaces: 0, roundingMethod: 'HALF_UP' },
      },
    };

    await expect(service.addSubscription(input)).resolves.toEqual({
      metronomeEditId: 'edit-id',
      subscriptionId: 'subscription-id',
    });
    expect(edit).toHaveBeenCalledWith(
      {
        add_subscriptions: [
          {
            collection_schedule: 'ADVANCE',
            ending_before: '2027-08-01T00:00:00.000Z',
            initial_quantity: 3,
            proration: {
              invoice_behavior: 'BILL_IMMEDIATELY',
              is_prorated: true,
              rounding: {
                decimal_places: 0,
                rounding_method: 'HALF_UP',
              },
            },
            quantity_management_mode: 'QUANTITY_ONLY',
            starting_at: '2026-08-01T00:00:00.000Z',
            subscription_rate: {
              billing_frequency: 'MONTHLY',
              product_id: 'product-id',
            },
          },
        ],
        contract_id: 'contract-id',
        customer_id: 'customer-id',
        uniqueness_key: 'add-subscription-1',
      },
      { maxRetries: 0 },
    );
  });

  it('recovers one exact added subscription from contract edit history', async () => {
    const getEditHistory = jest.fn().mockResolvedValue({
      data: [
        {
          add_subscriptions: [
            {
              billing_periods: {},
              collection_schedule: 'ADVANCE',
              ending_before: '2027-08-01T00:00:00.000Z',
              id: 'subscription-id',
              proration: {
                invoice_behavior: 'BILL_IMMEDIATELY',
                is_prorated: true,
                rounding: {
                  decimal_places: 0,
                  rounding_method: 'HALF_UP',
                },
              },
              quantity_management_mode: 'QUANTITY_ONLY',
              quantity_schedule: [
                {
                  quantity: 3,
                  starting_at: '2026-08-01T00:00:00.000Z',
                },
              ],
              starting_at: '2026-08-01T00:00:00.000Z',
              subscription_rate: {
                billing_frequency: 'MONTHLY',
                product: { id: 'product-id', name: 'Mailbox' },
              },
            },
          ],
          id: 'edit-id',
          uniqueness_key: 'add-subscription-1',
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () => ({ v2: { contracts: { getEditHistory } } }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);
    const input: MetronomeAddSubscriptionInput = {
      billingFrequency: 'MONTHLY',
      contractId: 'contract-id',
      customerId: 'customer-id',
      endingBefore: '2027-08-01T00:00:00.000Z',
      productId: 'product-id',
      quantity: 3,
      startingAt: '2026-08-01T00:00:00.000Z',
      uniquenessKey: 'add-subscription-1',
      proration: {
        invoiceBehavior: 'BILL_IMMEDIATELY',
        isProrated: true,
        rounding: { decimalPlaces: 0, roundingMethod: 'HALF_UP' },
      },
    };

    await expect(service.recoverAddedSubscription(input)).resolves.toEqual({
      metronomeEditId: 'edit-id',
      subscriptionId: 'subscription-id',
    });
    expect(getEditHistory).toHaveBeenCalledWith({
      contract_id: 'contract-id',
      customer_id: 'customer-id',
    });
  });

  it('fails closed when a recovered subscription does not exactly match', async () => {
    const getEditHistory = jest.fn().mockResolvedValue({
      data: [
        {
          add_subscriptions: [
            {
              collection_schedule: 'ADVANCE',
              id: 'subscription-id',
              proration: {
                invoice_behavior: 'BILL_IMMEDIATELY',
                is_prorated: false,
              },
              quantity_management_mode: 'QUANTITY_ONLY',
              quantity_schedule: [
                {
                  quantity: 1,
                  starting_at: '2026-08-01T00:00:00.000Z',
                },
              ],
              starting_at: '2026-08-01T00:00:00.000Z',
              subscription_rate: {
                billing_frequency: 'MONTHLY',
                product: { id: 'different-product', name: 'Wrong' },
              },
            },
          ],
          id: 'edit-id',
          uniqueness_key: 'add-subscription-1',
        },
      ],
    });
    metronomeConstructor.mockImplementation(
      () => ({ v2: { contracts: { getEditHistory } } }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.recoverAddedSubscription({
        billingFrequency: 'MONTHLY',
        contractId: 'contract-id',
        customerId: 'customer-id',
        productId: 'product-id',
        quantity: 1,
        startingAt: '2026-08-01T00:00:00.000Z',
        uniquenessKey: 'add-subscription-1',
        proration: {
          invoiceBehavior: 'BILL_IMMEDIATELY',
          isProrated: false,
        },
      }),
    ).rejects.toThrow('Metronome subscription recovery mismatch');
  });

  it('schedules an exact subscription quantity boundary and returns edit identity', async () => {
    const edit = jest.fn().mockResolvedValue({
      data: {
        edit: {
          id: 'edit-id',
          update_subscriptions: [{ id: 'subscription-id' }],
        },
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
    const input: MetronomeQuantityUpdateInput = {
      contractId: 'contract-id',
      customerId: 'customer-id',
      effectiveAt: '2026-09-01T00:00:00.000Z',
      prorationRounding: {
        decimalPlaces: 0,
        roundingMethod: 'HALF_UP',
      },
      quantity: 2,
      subscriptionId: 'subscription-id',
      uniquenessKey: 'quantity-2',
    };

    await expect(service.scheduleSubscriptionQuantity(input)).resolves.toEqual({
      metronomeEditId: 'edit-id',
      subscriptionId: 'subscription-id',
    });
    expect(edit).toHaveBeenCalledWith(
      {
        contract_id: 'contract-id',
        customer_id: 'customer-id',
        uniqueness_key: 'quantity-2',
        update_subscriptions: [
          {
            proration_rounding: {
              decimal_places: 0,
              rounding_method: 'HALF_UP',
            },
            quantity_updates: [
              {
                quantity: 2,
                starting_at: '2026-09-01T00:00:00.000Z',
              },
            ],
            subscription_id: 'subscription-id',
          },
        ],
      },
      { maxRetries: 0 },
    );
  });

  it('ends a subscription at the exact boundary and returns edit identity', async () => {
    const edit = jest.fn().mockResolvedValue({
      data: {
        edit: {
          id: 'edit-id',
          update_subscriptions: [{ id: 'subscription-id' }],
        },
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
    const input: MetronomeEndSubscriptionInput = {
      contractId: 'contract-id',
      customerId: 'customer-id',
      endingBefore: '2026-10-01T00:00:00.000Z',
      subscriptionId: 'subscription-id',
      uniquenessKey: 'end-subscription-1',
    };

    await expect(service.endSubscription(input)).resolves.toEqual({
      metronomeEditId: 'edit-id',
      subscriptionId: 'subscription-id',
    });
    expect(edit).toHaveBeenCalledWith(
      {
        contract_id: 'contract-id',
        customer_id: 'customer-id',
        uniqueness_key: 'end-subscription-1',
        update_subscriptions: [
          {
            ending_before: '2026-10-01T00:00:00.000Z',
            subscription_id: 'subscription-id',
          },
        ],
      },
      { maxRetries: 0 },
    );
  });

  it.each([
    ['add quantity', -1],
    ['schedule quantity', -1],
    ['schedule fractional quantity', 1.5],
  ])(
    'rejects unsafe %s before constructing the SDK',
    async (kind, quantity) => {
      const service = new MetronomeClientService({
        get: jest.fn((key: keyof ConfigVariables) => {
          if (key === 'METRONOME_ENABLED') return true;
          if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
          throw new Error(`Unexpected config key: ${key}`);
        }),
      } as unknown as TwentyConfigService);

      const operation =
        kind === 'add quantity'
          ? service.addSubscription({
              billingFrequency: 'MONTHLY',
              contractId: 'contract-id',
              customerId: 'customer-id',
              productId: 'product-id',
              quantity,
              startingAt: '2026-08-01T00:00:00.000Z',
              uniquenessKey: 'add-key',
              proration: {
                invoiceBehavior: 'BILL_IMMEDIATELY',
                isProrated: true,
              },
            })
          : service.scheduleSubscriptionQuantity({
              contractId: 'contract-id',
              customerId: 'customer-id',
              effectiveAt: '2026-09-01T00:00:00.000Z',
              quantity,
              subscriptionId: 'subscription-id',
              uniquenessKey: 'quantity-key',
            });

      await expect(operation).rejects.toThrow(
        /Metronome subscription quantity must be a safe (positive|nonnegative) integer/,
      );
      expect(metronomeConstructor).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'addSubscription',
      { status: 500 },
      MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    ],
    ['addSubscription', { status: 409 }, MetronomeClientExceptionCode.CONFLICT],
    [
      'endSubscription',
      { status: 429 },
      MetronomeClientExceptionCode.RATE_LIMITED,
    ],
    [
      'endSubscription',
      { status: 400 },
      MetronomeClientExceptionCode.REQUEST_FAILED,
    ],
  ])(
    'classifies %s edit failures without retrying',
    async (method, error, code) => {
      const edit = jest.fn().mockRejectedValue(error);
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

      const operation =
        method === 'addSubscription'
          ? service.addSubscription({
              billingFrequency: 'MONTHLY',
              contractId: 'contract-id',
              customerId: 'customer-id',
              productId: 'product-id',
              quantity: 1,
              startingAt: '2026-08-01T00:00:00.000Z',
              uniquenessKey: 'add-key',
              proration: {
                invoiceBehavior: 'BILL_IMMEDIATELY',
                isProrated: true,
              },
            })
          : service.endSubscription({
              contractId: 'contract-id',
              customerId: 'customer-id',
              endingBefore: '2026-10-01T00:00:00.000Z',
              subscriptionId: 'subscription-id',
              uniquenessKey: 'end-key',
            });

      await expect(operation).rejects.toMatchObject({ code });
      expect(edit).toHaveBeenCalledTimes(1);
    },
  );

  it('fails uncertain when the added subscription receipt is missing or ambiguous', async () => {
    const edit = jest.fn().mockResolvedValue({
      data: {
        edit: {
          add_subscriptions: [{ id: 'first' }, { id: 'second' }],
          id: 'edit-id',
        },
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
      service.addSubscription({
        billingFrequency: 'MONTHLY',
        contractId: 'contract-id',
        customerId: 'customer-id',
        productId: 'product-id',
        quantity: 1,
        startingAt: '2026-08-01T00:00:00.000Z',
        uniquenessKey: 'add-key',
        proration: {
          invoiceBehavior: 'BILL_IMMEDIATELY',
          isProrated: true,
        },
      }),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    });
  });

  it('projects only the bounded first invoice page and reports another page', async () => {
    const getNextPage = jest.fn();
    const hasNextPage = jest.fn().mockReturnValue(true);
    const listInvoices = jest.fn().mockResolvedValue({
      data: [
        {
          credit_type: { id: 'usd-credit-type-id', name: 'USD' },
          contract_id: 'contract-id',
          customer_id: 'customer-id',
          end_timestamp: '2026-09-01T00:00:00.000Z',
          external_invoice: {
            billing_provider_type: 'stripe',
            external_payment_id: 'pi_123',
            external_status: 'PAID',
            invoice_id: 'in_123',
            invoiced_total: 3_000,
          },
          id: 'invoice-id',
          line_items: [
            {
              credit_type: { id: 'usd', name: 'USD' },
              ending_before: '2026-09-01T00:00:00.000Z',
              is_prorated: false,
              name: 'Mailbox',
              product_id: 'product-id',
              quantity: 3,
              starting_at: '2026-08-01T00:00:00.000Z',
              subscription_id: 'subscription-id',
              total: 3_000,
              type: 'subscription',
              unit_price: 1_000,
            },
          ],
          start_timestamp: '2026-08-01T00:00:00.000Z',
          status: 'FINALIZED',
          total: 3_000,
          type: 'USAGE',
        },
      ],
      getNextPage,
      hasNextPage,
    });
    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: { customers: { invoices: { list: listInvoices } } },
        }) as unknown as Metronome,
    );
    const service = new MetronomeClientService({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as TwentyConfigService);

    await expect(
      service.listInvoicesFirstPage({
        contractId: 'contract-id',
        customerId: 'customer-id',
        endingBefore: '2026-09-01T00:00:00.000Z',
        startingOn: '2026-08-01T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      hasNextPage: true,
      invoices: [
        {
          contractId: 'contract-id',
          creditType: { id: 'usd-credit-type-id', name: 'USD' },
          customerId: 'customer-id',
          endingBefore: '2026-09-01T00:00:00.000Z',
          externalInvoice: {
            billingProvider: 'stripe',
            externalPaymentId: 'pi_123',
            externalStatus: 'PAID',
            invoiceId: 'in_123',
            invoicedTotal: 3_000,
          },
          id: 'invoice-id',
          lines: [
            {
              endingBefore: '2026-09-01T00:00:00.000Z',
              hasAppliedCommitOrCredit: false,
              isProrated: false,
              productId: 'product-id',
              quantity: 3,
              startingAt: '2026-08-01T00:00:00.000Z',
              subscriptionId: 'subscription-id',
              total: 3_000,
              type: 'subscription',
              unitPrice: 1_000,
            },
          ],
          startingAt: '2026-08-01T00:00:00.000Z',
          status: 'FINALIZED',
          total: 3_000,
        },
      ],
    });
    expect(listInvoices).toHaveBeenCalledWith({
      contract_id: 'contract-id',
      customer_id: 'customer-id',
      ending_before: '2026-09-01T00:00:00.000Z',
      starting_on: '2026-08-01T00:00:00.000Z',
    });
    expect(hasNextPage).toHaveBeenCalledTimes(1);
    expect(getNextPage).not.toHaveBeenCalled();
  });

  it('rejects a zero initial quantity before constructing the SDK', async () => {
    const service = new MetronomeClientService({
      get: jest.fn(),
    } as unknown as TwentyConfigService);

    await expect(
      service.addSubscription({
        billingFrequency: 'MONTHLY',
        contractId: 'contract-id',
        customerId: 'customer-id',
        productId: 'product-id',
        quantity: 0,
        startingAt: '2026-08-01T00:00:00.000Z',
        uniquenessKey: 'add-key',
        proration: {
          invoiceBehavior: 'BILL_IMMEDIATELY',
          isProrated: true,
        },
      }),
    ).rejects.toThrow('safe positive integer');
    expect(metronomeConstructor).not.toHaveBeenCalled();
  });

  it.each(['add', 'quantity', 'end'])(
    'rejects a non-ISO %s subscription boundary before constructing the SDK',
    async (operation) => {
      const service = new MetronomeClientService({
        get: jest.fn(),
      } as unknown as TwentyConfigService);
      const result =
        operation === 'add'
          ? service.addSubscription({
              billingFrequency: 'MONTHLY',
              contractId: 'contract-id',
              customerId: 'customer-id',
              productId: 'product-id',
              quantity: 1,
              startingAt: 'August 1, 2026',
              uniquenessKey: 'add-key',
              proration: {
                invoiceBehavior: 'BILL_IMMEDIATELY',
                isProrated: true,
              },
            })
          : operation === 'quantity'
            ? service.scheduleSubscriptionQuantity({
                contractId: 'contract-id',
                customerId: 'customer-id',
                effectiveAt: 'August 1, 2026',
                quantity: 1,
                subscriptionId: 'subscription-id',
                uniquenessKey: 'quantity-key',
              })
            : service.endSubscription({
                contractId: 'contract-id',
                customerId: 'customer-id',
                endingBefore: 'August 1, 2026',
                subscriptionId: 'subscription-id',
                uniquenessKey: 'end-key',
              });

      await expect(result).rejects.toThrow('must be an ISO instant');
      expect(metronomeConstructor).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['conflict', { status: 409 }, MetronomeClientExceptionCode.CONFLICT],
    ['rate limit', { status: 429 }, MetronomeClientExceptionCode.RATE_LIMITED],
    [
      'known client failure',
      { status: 400 },
      MetronomeClientExceptionCode.REQUEST_FAILED,
    ],
    [
      'server failure',
      { status: 500 },
      MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    ],
    [
      'timeout after write',
      new Error('socket timeout'),
      MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    ],
  ])(
    'classifies Stripe billing-configuration %s without retrying',
    async (_, providerError, expectedCode) => {
      const createBillingConfig = jest.fn().mockRejectedValue(providerError);
      metronomeConstructor.mockImplementation(
        () =>
          ({
            v1: {
              customers: {
                billingConfig: { create: createBillingConfig },
              },
            },
          }) as unknown as Metronome,
      );
      const service = new MetronomeClientService({
        get: jest.fn((key: keyof ConfigVariables) => {
          if (key === 'METRONOME_ENABLED') return true;
          if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
          throw new Error(`Unexpected config key: ${key}`);
        }),
      } as unknown as TwentyConfigService);

      await expect(
        service.setStripeBillingConfiguration('customer-id', 'cus_123'),
      ).rejects.toMatchObject({ code: expectedCode });
      expect(createBillingConfig).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['missing-status failure', new Error('connection reset')],
    ['server failure', { status: 500 }],
  ])(
    'classifies managed-email contract %s as an uncertain create outcome',
    async (_, providerError) => {
      const createContract = jest.fn().mockRejectedValue(providerError);
      metronomeConstructor.mockImplementation(
        () =>
          ({
            v1: { contracts: { create: createContract } },
          }) as unknown as Metronome,
      );
      const service = new MetronomeClientService({
        get: jest.fn((key: keyof ConfigVariables) => {
          if (key === 'METRONOME_ENABLED') return true;
          if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
          throw new Error(`Unexpected config key: ${key}`);
        }),
      } as unknown as TwentyConfigService);

      await expect(
        service.createContract({
          billingProviderConfiguration: {
            billingProvider: 'stripe',
            deliveryMethod: 'direct_to_billing_provider',
          },
          customerId: 'customer-id',
          rateCardAlias: 'managed-email',
          uniquenessKey: 'managed-email-key',
        }),
      ).rejects.toMatchObject({
        code: MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      });
      expect(createContract).toHaveBeenCalledTimes(1);
    },
  );
});

describe('MetronomeClientService rate-card product resolution', () => {
  const metronomeConstructor = jest.mocked(Metronome);
  const at = new Date('2026-08-06T12:00:00.000Z');
  const makeConfig = () =>
    ({
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return true;
        if (key === 'METRONOME_API_KEY') return 'redacted-in-test';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    }) as unknown as TwentyConfigService;

  const configureSdk = ({
    rateCardPages,
    schedulePages,
  }: {
    rateCardPages: Array<{
      data: unknown[];
      next_page?: string | null;
    }>;
    schedulePages: Array<{
      data: unknown[];
      next_page?: string | null;
    }>;
  }) => {
    const list = jest
      .fn()
      .mockImplementation(async () => rateCardPages.shift() ?? { data: [] });
    const retrieveRateSchedule = jest
      .fn()
      .mockImplementation(
        async () => schedulePages.shift() ?? { data: [], next_page: null },
      );

    metronomeConstructor.mockImplementation(
      () =>
        ({
          v1: {
            contracts: {
              rateCards: { list, retrieveRateSchedule },
            },
          },
        }) as unknown as Metronome,
    );

    return { list, retrieveRateSchedule };
  };

  const activeCard = {
    id: 'active-card',
    aliases: [
      {
        name: 'sandbox-managed-email',
        starting_at: '2026-08-01T00:00:00.000Z',
        ending_before: null,
      },
    ],
  };
  const domainRate = {
    billing_frequency: 'ANNUAL',
    ending_before: '2027-08-06T12:00:00.000Z',
    entitled: true,
    product_custom_fields: {},
    product_id: 'domain-product',
    product_name: 'Managed sending domain',
    product_tags: ['myah-managed-sending-domain-year'],
    rate: { rate_type: 'FLAT', price: 1000 },
    starting_at: '2026-08-01T00:00:00.000Z',
  };
  const mailboxRate = {
    billing_frequency: 'MONTHLY',
    ending_before: '2026-09-06T12:00:00.000Z',
    entitled: true,
    product_custom_fields: {},
    product_id: 'mailbox-product',
    product_name: 'Managed mailbox',
    product_tags: ['myah-managed-mailbox-month'],
    rate: { rate_type: 'FLAT', price: 500 },
    starting_at: '2026-08-01T00:00:00.000Z',
  };

  it('paginates rate cards and schedules, then maps exact active product tags', async () => {
    const { list, retrieveRateSchedule } = configureSdk({
      rateCardPages: [
        {
          data: [
            {
              id: 'inactive-card',
              aliases: [
                {
                  name: 'sandbox-managed-email',
                  starting_at: '2026-01-01T00:00:00.000Z',
                  ending_before: '2026-08-01T00:00:00.000Z',
                },
              ],
            },
          ],
          next_page: 'page-2',
        },
        { data: [activeCard], next_page: null },
      ],
      schedulePages: [
        { data: [domainRate], next_page: 'schedule-page-2' },
        { data: [mailboxRate], next_page: null },
      ],
    });
    const service = new MetronomeClientService(makeConfig());

    await expect(
      service.resolveRateCardProducts({
        alias: 'sandbox-managed-email',
        at,
        productTags: [
          'myah-managed-sending-domain-year',
          'myah-managed-mailbox-month',
        ],
      }),
    ).resolves.toEqual({
      rateCardId: 'active-card',
      productIdsByTag: {
        'myah-managed-sending-domain-year': 'domain-product',
        'myah-managed-mailbox-month': 'mailbox-product',
      },
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, { body: {} });
    expect(list).toHaveBeenNthCalledWith(2, {
      body: {},
      next_page: 'page-2',
    });
    expect(retrieveRateSchedule).toHaveBeenNthCalledWith(1, {
      rate_card_id: 'active-card',
      starting_at: at.toISOString(),
    });
    expect(retrieveRateSchedule).toHaveBeenNthCalledWith(2, {
      next_page: 'schedule-page-2',
      rate_card_id: 'active-card',
      starting_at: at.toISOString(),
    });
  });

  it('proves exact active flat-rate line prices and billing frequencies', async () => {
    const { retrieveRateSchedule } = configureSdk({
      rateCardPages: [],
      schedulePages: [{ data: [domainRate, mailboxRate], next_page: null }],
    });
    const service = new MetronomeClientService(makeConfig());

    await expect(
      service.assertRateCardLineItems({
        lines: [
          {
            billingFrequency: 'ANNUAL',
            productId: 'domain-product',
            startingAt: at.toISOString(),
            unitPriceCents: 1000,
          },
          {
            billingFrequency: 'MONTHLY',
            productId: 'mailbox-product',
            startingAt: at.toISOString(),
            unitPriceCents: 500,
          },
        ],
        rateCardId: 'active-card',
      }),
    ).resolves.toBeUndefined();
    expect(retrieveRateSchedule).toHaveBeenCalledWith({
      rate_card_id: 'active-card',
      starting_at: at.toISOString(),
    });
  });

  it.each([
    {
      name: 'missing product',
      rates: [domainRate],
      line: {
        billingFrequency: 'MONTHLY' as const,
        productId: 'missing-product',
        startingAt: at.toISOString(),
        unitPriceCents: 500,
      },
    },
    {
      name: 'wrong billing frequency',
      rates: [mailboxRate],
      line: {
        billingFrequency: 'ANNUAL' as const,
        productId: 'mailbox-product',
        startingAt: at.toISOString(),
        unitPriceCents: 500,
      },
    },
    {
      name: 'wrong unit price',
      rates: [mailboxRate],
      line: {
        billingFrequency: 'MONTHLY' as const,
        productId: 'mailbox-product',
        startingAt: at.toISOString(),
        unitPriceCents: 501,
      },
    },
    {
      name: 'unsupported rate type',
      rates: [
        {
          ...mailboxRate,
          rate: { is_prorated: true, quantity: 1, rate_type: 'SUBSCRIPTION' },
        },
      ],
      line: {
        billingFrequency: 'MONTHLY' as const,
        productId: 'mailbox-product',
        startingAt: at.toISOString(),
        unitPriceCents: 500,
      },
    },
    {
      name: 'duplicate matching rate',
      rates: [mailboxRate, { ...mailboxRate }],
      line: {
        billingFrequency: 'MONTHLY' as const,
        productId: 'mailbox-product',
        startingAt: at.toISOString(),
        unitPriceCents: 500,
      },
    },
  ])('rejects $name before a subscription edit', async ({ line, rates }) => {
    configureSdk({
      rateCardPages: [],
      schedulePages: [{ data: rates, next_page: null }],
    });
    const service = new MetronomeClientService(makeConfig());

    await expect(
      service.assertRateCardLineItems({
        lines: [line],
        rateCardId: 'active-card',
      }),
    ).rejects.toThrow(/rate card line/i);
  });

  it.each([
    {
      name: 'missing alias',
      cards: [{ id: 'card', aliases: [] }],
      rates: [mailboxRate],
      expected: /rate card/i,
    },
    {
      name: 'duplicate active aliases',
      cards: [activeCard, { ...activeCard, id: 'other-active-card' }],
      rates: [mailboxRate],
      expected: /exactly one/i,
    },
    {
      name: 'missing product tag',
      cards: [activeCard],
      rates: [],
      expected: /product|tag/i,
    },
    {
      name: 'duplicate product tag',
      cards: [activeCard],
      rates: [mailboxRate, { ...mailboxRate, product_id: 'other-product' }],
      expected: /exactly one/i,
    },
  ])(
    'rejects $name before returning a partial catalog',
    async ({ cards, expected, rates }) => {
      configureSdk({
        rateCardPages: [{ data: cards, next_page: null }],
        schedulePages: [{ data: rates, next_page: null }],
      });
      const service = new MetronomeClientService(makeConfig());

      await expect(
        service.resolveRateCardProducts({
          alias: 'sandbox-managed-email',
          at,
          productTags: ['myah-managed-mailbox-month'],
        }),
      ).rejects.toThrow(expected);
    },
  );
});
