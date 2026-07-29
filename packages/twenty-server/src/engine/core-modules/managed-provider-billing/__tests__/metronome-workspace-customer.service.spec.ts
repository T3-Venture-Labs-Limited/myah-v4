import { type Repository } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';

import {
  type MetronomeCurrentContract,
  type MetronomeCustomer,
  MetronomeClientService,
  type MetronomeRateCard,
} from '../services/metronome-client.service';
import { MetronomeWorkspaceCustomerService } from '../services/metronome-workspace-customer.service';

describe('MetronomeWorkspaceCustomerService', () => {
  const workspaceId = 'workspace-id';
  const workspaceAlias = `myah-workspace:${workspaceId}`;
  const recoveredCustomer: MetronomeCustomer = {
    archivedAt: null,
    id: 'metronome-customer-id',
    ingestAliases: [workspaceAlias],
  };

  const createService = ({
    createContractError,
    createCustomerError,
    contracts = [],
    customerLookups,
    customers = [],
    installations,
    managedEmailEnabled = true,
    metronomeEnabled = true,
    rateCard = { aliases: [], id: 'rate-card-id' },
    updateAffected = 1,
    workspace = { displayName: 'Workspace', id: workspaceId },
  }: {
    createContractError?: unknown;
    createCustomerError?: unknown;
    contracts?: MetronomeCurrentContract[];
    customerLookups?: MetronomeCustomer[][];
    customers?: MetronomeCustomer[];
    installations: Array<Partial<MyahWorkspaceInstallationEntity> | null>;
    managedEmailEnabled?: boolean;
    metronomeEnabled?: boolean;
    rateCard?: MetronomeRateCard;
    updateAffected?: number;
    workspace?: Partial<WorkspaceEntity> | null;
  }) => {
    const installationRepository: jest.Mocked<
      Pick<Repository<MyahWorkspaceInstallationEntity>, 'findOneBy' | 'update'>
    > = {
      findOneBy: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: updateAffected }),
    };
    installations.forEach((installation) => {
      installationRepository.findOneBy.mockResolvedValueOnce(
        installation as MyahWorkspaceInstallationEntity | null,
      );
    });
    const workspaceRepository = {
      findOneBy: jest.fn().mockResolvedValue(workspace),
    } as Pick<Repository<WorkspaceEntity>, 'findOneBy'>;
    const lookupResults = customerLookups ?? [customers];
    const metronomeClientService: jest.Mocked<
      Pick<
        MetronomeClientService,
        | 'createContract'
        | 'createCustomer'
        | 'findCurrentContracts'
        | 'findCustomerByIngestAlias'
        | 'getRateCard'
        | 'getPrepaidBalance'
        | 'createCustomerCredit'
        | 'previewUsage'
        | 'ingestUsage'
      >
    > = {
      createContract: jest
        .fn()
        .mockResolvedValue({ id: 'created-contract-id' }),
      createCustomer: jest
        .fn()
        .mockResolvedValue({ id: 'created-customer-id' }),
      findCurrentContracts: jest.fn().mockResolvedValue(contracts),
      findCustomerByIngestAlias: jest.fn(),
      getRateCard: jest.fn().mockResolvedValue(rateCard),
      getPrepaidBalance: jest.fn(),
      createCustomerCredit: jest.fn(),
      previewUsage: jest.fn(),
      ingestUsage: jest.fn(),
    };
    lookupResults.forEach((customersForLookup) => {
      metronomeClientService.findCustomerByIngestAlias.mockResolvedValueOnce(
        customersForLookup,
      );
    });
    if (createCustomerError !== undefined) {
      metronomeClientService.createCustomer.mockRejectedValue(
        createCustomerError,
      );
    }
    if (createContractError !== undefined) {
      metronomeClientService.createContract.mockRejectedValue(
        createContractError,
      );
    }
    const twentyConfigService = {
      get: jest.fn((key: keyof ConfigVariables) => {
        if (key === 'METRONOME_ENABLED') return metronomeEnabled;
        if (key === 'MANAGED_EMAIL_ENABLED') return managedEmailEnabled;
        if (key === 'METRONOME_RATE_CARD_ALIAS') return 'managed-provider';
        if (key === 'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS')
          return 'managed-email';
        if (key === 'MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID')
          return 'managed-email-delivery-method';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as Pick<TwentyConfigService, 'get'>;

    return {
      installationRepository,
      metronomeClientService,
      service: new MetronomeWorkspaceCustomerService(
        installationRepository,
        metronomeClientService as unknown as MetronomeClientService,
        workspaceRepository as Repository<WorkspaceEntity>,
        twentyConfigService as TwentyConfigService,
      ),
      workspaceRepository,
    };
  };

  it('returns an existing workspace customer ID without a remote call', async () => {
    const { installationRepository, metronomeClientService, service } =
      createService({
        installations: [
          {
            metronomeCustomerId: 'metronome-customer-id',
            workspaceId,
          },
        ],
      });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'metronome-customer-id',
    );
    expect(installationRepository.findOneBy).toHaveBeenCalledWith({
      workspaceId,
    });
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when Metronome is disabled even with a stored customer ID', async () => {
    const { metronomeClientService, service } = createService({
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
      metronomeEnabled: false,
    });

    await expect(
      service.ensureWorkspaceCustomer(workspaceId),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
    });
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).not.toHaveBeenCalled();
    expect(metronomeClientService.createCustomer).not.toHaveBeenCalled();
  });

  it('fails before contacting Metronome when the workspace is not installed', async () => {
    const { metronomeClientService, service } = createService({
      installations: [null],
    });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).rejects.toThrow(
      'Workspace installation was not found',
    );
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).not.toHaveBeenCalled();
  });

  it('reuses and stores an exact active workspace alias', async () => {
    const { installationRepository, metronomeClientService, service } =
      createService({
        customers: [recoveredCustomer],
        installations: [{ metronomeCustomerId: null, workspaceId }],
      });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'metronome-customer-id',
    );
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).toHaveBeenCalledWith(workspaceAlias);
    expect(installationRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: expect.objectContaining({ _type: 'isNull' }),
        workspaceId,
      }),
      { metronomeCustomerId: 'metronome-customer-id' },
    );
  });

  it('converges on an identical concurrently stored customer ID', async () => {
    const { installationRepository, service } = createService({
      customers: [recoveredCustomer],
      installations: [
        { metronomeCustomerId: null, workspaceId },
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
      updateAffected: 0,
    });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'metronome-customer-id',
    );
    expect(installationRepository.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a divergent concurrently stored customer ID', async () => {
    const { installationRepository, service } = createService({
      customers: [recoveredCustomer],
      installations: [
        { metronomeCustomerId: null, workspaceId },
        { metronomeCustomerId: 'different-customer-id', workspaceId },
      ],
      updateAffected: 0,
    });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).rejects.toThrow(
      'Metronome customer could not be stored',
    );
    expect(installationRepository.update).toHaveBeenCalledTimes(1);
  });

  it('creates and stores a customer when the workspace alias is unused', async () => {
    const { metronomeClientService, service, workspaceRepository } =
      createService({
        customers: [],
        installations: [{ metronomeCustomerId: null, workspaceId }],
        workspace: { displayName: 'Acme Workspace', id: workspaceId },
      });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'created-customer-id',
    );
    expect(workspaceRepository.findOneBy).toHaveBeenCalledWith({
      id: workspaceId,
    });
    expect(metronomeClientService.createCustomer).toHaveBeenCalledWith({
      alias: workspaceAlias,
      name: 'Acme Workspace',
    });
  });

  it('uses the workspace ID when the display name is blank', async () => {
    const { metronomeClientService, service } = createService({
      customers: [],
      installations: [{ metronomeCustomerId: null, workspaceId }],
      workspace: { displayName: '   ', id: workspaceId },
    });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'created-customer-id',
    );
    expect(metronomeClientService.createCustomer).toHaveBeenCalledWith({
      alias: workspaceAlias,
      name: workspaceId,
    });
  });

  it('fails before creating a customer when the workspace is missing', async () => {
    const { metronomeClientService, service } = createService({
      customers: [],
      installations: [{ metronomeCustomerId: null, workspaceId }],
      workspace: null,
    });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).rejects.toThrow(
      'Workspace was not found',
    );
    expect(metronomeClientService.createCustomer).not.toHaveBeenCalled();
  });

  it('converges after creating a customer when the stored ID matches', async () => {
    const { installationRepository, metronomeClientService, service } =
      createService({
        customers: [],
        installations: [
          { metronomeCustomerId: null, workspaceId },
          { metronomeCustomerId: 'created-customer-id', workspaceId },
        ],
        updateAffected: 0,
      });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'created-customer-id',
    );
    expect(metronomeClientService.createCustomer).toHaveBeenCalledTimes(1);
    expect(installationRepository.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    MetronomeClientExceptionCode.CONFLICT,
    MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
  ])('recovers a customer after create outcome %s', async (createErrorCode) => {
    const { metronomeClientService, service } = createService({
      createCustomerError: new MetronomeClientException(createErrorCode),
      customerLookups: [[], [recoveredCustomer]],
      installations: [{ metronomeCustomerId: null, workspaceId }],
    });

    await expect(service.ensureWorkspaceCustomer(workspaceId)).resolves.toBe(
      'metronome-customer-id',
    );
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).toHaveBeenCalledTimes(2);
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).toHaveBeenNthCalledWith(1, workspaceAlias);
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).toHaveBeenNthCalledWith(2, workspaceAlias);
    expect(metronomeClientService.createCustomer).toHaveBeenCalledTimes(1);
  });

  it('requires reconciliation when a create conflict has no recoverable alias', async () => {
    const { metronomeClientService, service } = createService({
      createCustomerError: new MetronomeClientException(
        MetronomeClientExceptionCode.CONFLICT,
      ),
      customerLookups: [[], []],
      installations: [{ metronomeCustomerId: null, workspaceId }],
    });

    await expect(
      service.ensureWorkspaceCustomer(workspaceId),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: MetronomeClientExceptionCode.CONFLICT,
      }),
      message: 'Metronome customer recovery requires reconciliation',
    });
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).toHaveBeenCalledTimes(2);
    expect(metronomeClientService.createCustomer).toHaveBeenCalledTimes(1);
  });

  it('does not recover a generic customer creation failure', async () => {
    const { metronomeClientService, service } = createService({
      createCustomerError: new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      ),
      customerLookups: [[]],
      installations: [{ metronomeCustomerId: null, workspaceId }],
    });

    await expect(
      service.ensureWorkspaceCustomer(workspaceId),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.REQUEST_FAILED,
    });
    expect(
      metronomeClientService.findCustomerByIngestAlias,
    ).toHaveBeenCalledTimes(1);
    expect(metronomeClientService.createCustomer).toHaveBeenCalledTimes(1);
  });

  it('creates a workspace contract with the configured rate-card alias', async () => {
    const { metronomeClientService, service } = createService({
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
    });

    await expect(service.ensureWorkspaceContract(workspaceId)).resolves.toBe(
      'created-contract-id',
    );
    expect(metronomeClientService.createContract).toHaveBeenCalledWith({
      customerId: 'metronome-customer-id',
      rateCardAlias: 'managed-provider',
      uniquenessKey: `myah-workspace-contract:${workspaceId}`,
    });
    expect(metronomeClientService.findCurrentContracts).not.toHaveBeenCalled();
    expect(metronomeClientService.getRateCard).not.toHaveBeenCalled();
  });

  it('propagates a non-conflict contract creation failure without recovery', async () => {
    const error = new MetronomeClientException(
      MetronomeClientExceptionCode.REQUEST_FAILED,
    );
    const { metronomeClientService, service } = createService({
      createContractError: error,
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
    });

    await expect(service.ensureWorkspaceContract(workspaceId)).rejects.toBe(
      error,
    );
    expect(metronomeClientService.findCurrentContracts).not.toHaveBeenCalled();
    expect(metronomeClientService.getRateCard).not.toHaveBeenCalled();
  });

  it('recovers one matching current contract after a uniqueness conflict', async () => {
    const { metronomeClientService, service } = createService({
      contracts: [
        {
          id: 'recovered-contract-id',
          rateCardId: 'rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
      createContractError: new MetronomeClientException(
        MetronomeClientExceptionCode.CONFLICT,
      ),
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
      rateCard: {
        aliases: [
          {
            endingBefore: null,
            name: 'managed-provider',
            startingAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        id: 'rate-card-id',
      },
    });

    await expect(service.ensureWorkspaceContract(workspaceId)).resolves.toBe(
      'recovered-contract-id',
    );
    expect(metronomeClientService.createContract).toHaveBeenCalledTimes(1);
    expect(metronomeClientService.findCurrentContracts).toHaveBeenCalledWith(
      'metronome-customer-id',
    );
    expect(metronomeClientService.getRateCard).toHaveBeenCalledWith(
      'rate-card-id',
    );
  });

  it.each([
    [
      'accepts an alias beginning at the contract start time',
      null,
      'recovered-contract-id',
    ],
    [
      'rejects an alias ending at the contract start time',
      '2026-07-16T12:00:00.000Z',
      undefined,
    ],
  ])('%s', async (_, endingBefore, expectedContractId) => {
    const { service } = createService({
      contracts: [
        {
          id: 'recovered-contract-id',
          rateCardId: 'rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
      createContractError: new MetronomeClientException(
        MetronomeClientExceptionCode.CONFLICT,
      ),
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
      rateCard: {
        aliases: [
          {
            endingBefore,
            name: 'managed-provider',
            startingAt: '2026-07-16T12:00:00.000Z',
          },
        ],
        id: 'rate-card-id',
      },
    });

    if (expectedContractId) {
      await expect(service.ensureWorkspaceContract(workspaceId)).resolves.toBe(
        expectedContractId,
      );
      return;
    }

    await expect(
      service.ensureWorkspaceContract(workspaceId),
    ).rejects.toMatchObject({
      message: 'Metronome contract recovery requires reconciliation',
    });
  });

  it.each([
    ['no matching current contract', []],
    [
      'multiple matching current contracts',
      [
        {
          id: 'contract-id-1',
          rateCardId: 'rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
        {
          id: 'contract-id-2',
          rateCardId: 'rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
    ],
    [
      'a missing rate-card ID',
      [
        {
          id: 'contract-id',
          rateCardId: null,
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
    ],
  ])('requires contract reconciliation for %s', async (_, contracts) => {
    const { service } = createService({
      contracts,
      createContractError: new MetronomeClientException(
        MetronomeClientExceptionCode.CONFLICT,
      ),
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
    });

    await expect(
      service.ensureWorkspaceContract(workspaceId),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: MetronomeClientExceptionCode.CONFLICT,
      }),
      message: 'Metronome contract recovery requires reconciliation',
    });
  });

  it('requires contract reconciliation for a mismatched retrieved rate-card ID', async () => {
    const { service } = createService({
      contracts: [
        {
          id: 'contract-id',
          rateCardId: 'expected-rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
      createContractError: new MetronomeClientException(
        MetronomeClientExceptionCode.CONFLICT,
      ),
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
      rateCard: {
        aliases: [
          {
            endingBefore: null,
            name: 'managed-provider',
            startingAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        id: 'unexpected-rate-card-id',
      },
    });

    await expect(
      service.ensureWorkspaceContract(workspaceId),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: MetronomeClientExceptionCode.CONFLICT,
      }),
      message: 'Metronome contract recovery requires reconciliation',
    });
  });

  it('fails closed when managed email is disabled before ensuring the shared customer', async () => {
    const { installationRepository, metronomeClientService, service } =
      createService({
        installations: [
          { metronomeCustomerId: 'metronome-customer-id', workspaceId },
        ],
        managedEmailEnabled: false,
      });

    await expect(
      service.ensureWorkspaceManagedEmailContract(workspaceId),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
    });
    expect(installationRepository.findOneBy).not.toHaveBeenCalled();
    expect(metronomeClientService.createContract).not.toHaveBeenCalled();
  });

  it('creates and verifies the exact managed-email Stripe contract boundary', async () => {
    const { metronomeClientService, service } = createService({
      contracts: [
        {
          activeBillingProviderConfiguration: {
            billingProvider: 'stripe',
            deliveryMethod: 'direct_to_billing_provider',
            deliveryMethodId: 'managed-email-delivery-method',
            id: 'billing-config-id',
          },
          id: 'created-contract-id',
          rateCardId: 'managed-email-rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-managed-email-workspace-contract:${workspaceId}`,
        },
      ],
      installations: [
        { metronomeCustomerId: 'metronome-customer-id', workspaceId },
      ],
      rateCard: {
        aliases: [
          {
            endingBefore: null,
            name: 'managed-email',
            startingAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        fiatCreditType: { id: 'usd-credit-type-id', name: 'USD' },
        id: 'managed-email-rate-card-id',
      },
    });

    await expect(
      service.ensureWorkspaceManagedEmailContract(workspaceId),
    ).resolves.toBe('created-contract-id');
    expect(metronomeClientService.createContract).toHaveBeenCalledWith({
      billingProviderConfiguration: {
        billingProvider: 'stripe',
        deliveryMethod: 'direct_to_billing_provider',
      },
      customerId: 'metronome-customer-id',
      rateCardAlias: 'managed-email',
      uniquenessKey: `myah-managed-email-workspace-contract:${workspaceId}`,
    });
    expect(metronomeClientService.findCurrentContracts).toHaveBeenCalledWith(
      'metronome-customer-id',
    );
    expect(metronomeClientService.getRateCard).toHaveBeenCalledWith(
      'managed-email-rate-card-id',
    );
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
    expect(metronomeClientService.createCustomerCredit).not.toHaveBeenCalled();
    expect(metronomeClientService.previewUsage).not.toHaveBeenCalled();
    expect(metronomeClientService.ingestUsage).not.toHaveBeenCalled();
  });

  it.each([
    [
      'wrong rate-card alias',
      {
        activeBillingProviderConfiguration: {
          billingProvider: 'stripe',
          deliveryMethod: 'direct_to_billing_provider',
          deliveryMethodId: 'managed-email-delivery-method',
          id: 'billing-config-id',
        },
      },
      { id: 'usd-credit-type-id', name: 'USD' },
      'other-alias',
    ],
    [
      'non-USD rate card',
      {
        activeBillingProviderConfiguration: {
          billingProvider: 'stripe',
          deliveryMethod: 'direct_to_billing_provider',
          deliveryMethodId: 'managed-email-delivery-method',
          id: 'billing-config-id',
        },
      },
      { id: 'eur-credit-type-id', name: 'EUR' },
      'managed-email',
    ],
    [
      'wrong delivery method ID',
      {
        activeBillingProviderConfiguration: {
          billingProvider: 'stripe',
          deliveryMethod: 'direct_to_billing_provider',
          deliveryMethodId: 'wrong-delivery-method',
          id: 'billing-config-id',
        },
      },
      { id: 'usd-credit-type-id', name: 'USD' },
      'managed-email',
    ],
    [
      'missing active billing configuration',
      { activeBillingProviderConfiguration: null },
      { id: 'usd-credit-type-id', name: 'USD' },
      'managed-email',
    ],
  ])(
    'requires reconciliation for managed email with %s',
    async (_, contractPatch, fiatCreditType, aliasName) => {
      const { service } = createService({
        contracts: [
          {
            ...contractPatch,
            id: 'created-contract-id',
            rateCardId: 'managed-email-rate-card-id',
            startingAt: '2026-07-16T12:00:00.000Z',
            uniquenessKey: `myah-managed-email-workspace-contract:${workspaceId}`,
          } as MetronomeCurrentContract,
        ],
        installations: [
          { metronomeCustomerId: 'metronome-customer-id', workspaceId },
        ],
        rateCard: {
          aliases: [
            {
              endingBefore: null,
              name: aliasName,
              startingAt: '2026-07-01T00:00:00.000Z',
            },
          ],
          fiatCreditType,
          id: 'managed-email-rate-card-id',
        },
      });

      await expect(
        service.ensureWorkspaceManagedEmailContract(workspaceId),
      ).rejects.toMatchObject({
        message:
          'Metronome managed-email contract recovery requires reconciliation',
      });
    },
  );

  it.each([
    MetronomeClientExceptionCode.CONFLICT,
    MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
  ])(
    'recovers and verifies the exact managed-email contract after %s',
    async (createErrorCode) => {
      const { metronomeClientService, service } = createService({
        contracts: [
          {
            activeBillingProviderConfiguration: {
              billingProvider: 'stripe',
              deliveryMethod: 'direct_to_billing_provider',
              deliveryMethodId: 'managed-email-delivery-method',
              id: 'billing-config-id',
            },
            id: 'recovered-contract-id',
            rateCardId: 'managed-email-rate-card-id',
            startingAt: '2026-07-16T12:00:00.000Z',
            uniquenessKey: `myah-managed-email-workspace-contract:${workspaceId}`,
          },
        ],
        createContractError: new MetronomeClientException(createErrorCode),
        installations: [
          { metronomeCustomerId: 'metronome-customer-id', workspaceId },
        ],
        rateCard: {
          aliases: [
            {
              endingBefore: null,
              name: 'managed-email',
              startingAt: '2026-07-01T00:00:00.000Z',
            },
          ],
          fiatCreditType: { id: 'usd-credit-type-id', name: 'USD' },
          id: 'managed-email-rate-card-id',
        },
      });

      await expect(
        service.ensureWorkspaceManagedEmailContract(workspaceId),
      ).resolves.toBe('recovered-contract-id');
      expect(metronomeClientService.createContract).toHaveBeenCalledTimes(1);
      expect(metronomeClientService.findCurrentContracts).toHaveBeenCalledTimes(
        1,
      );
    },
  );
});
