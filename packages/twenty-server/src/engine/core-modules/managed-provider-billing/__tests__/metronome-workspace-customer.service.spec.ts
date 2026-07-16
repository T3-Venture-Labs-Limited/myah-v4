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
  type MetronomeRateCardPage,
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
    metronomeEnabled = true,
    rateCardPage = { hasNextPage: false, rateCards: [] },
    updateAffected = 1,
    workspace = { displayName: 'Workspace', id: workspaceId },
  }: {
    createContractError?: unknown;
    createCustomerError?: unknown;
    contracts?: MetronomeCurrentContract[];
    customerLookups?: MetronomeCustomer[][];
    customers?: MetronomeCustomer[];
    installations: Array<Partial<MyahWorkspaceInstallationEntity> | null>;
    metronomeEnabled?: boolean;
    rateCardPage?: MetronomeRateCardPage;
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
        | 'listRateCards'
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
      listRateCards: jest.fn().mockResolvedValue(rateCardPage),
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
        if (key === 'METRONOME_RATE_CARD_ALIAS') return 'managed-provider';
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
    expect(metronomeClientService.listRateCards).not.toHaveBeenCalled();
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
    expect(metronomeClientService.listRateCards).not.toHaveBeenCalled();
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
      rateCardPage: {
        hasNextPage: false,
        rateCards: [
          {
            aliases: [
              {
                endingBefore: null,
                name: 'managed-provider',
                startingAt: '2026-07-01T00:00:00.000Z',
              },
            ],
            id: 'rate-card-id',
          },
        ],
      },
    });

    await expect(service.ensureWorkspaceContract(workspaceId)).resolves.toBe(
      'recovered-contract-id',
    );
    expect(metronomeClientService.createContract).toHaveBeenCalledTimes(1);
    expect(metronomeClientService.findCurrentContracts).toHaveBeenCalledWith(
      'metronome-customer-id',
    );
    expect(metronomeClientService.listRateCards).toHaveBeenCalledTimes(1);
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
      rateCardPage: {
        hasNextPage: false,
        rateCards: [
          {
            aliases: [
              {
                endingBefore,
                name: 'managed-provider',
                startingAt: '2026-07-16T12:00:00.000Z',
              },
            ],
            id: 'rate-card-id',
          },
        ],
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
    [
      'no matching current contract',
      [],
      {
        hasNextPage: false,
        rateCards: [
          {
            aliases: [
              {
                endingBefore: null,
                name: 'managed-provider',
                startingAt: '2026-07-01T00:00:00.000Z',
              },
            ],
            id: 'rate-card-id',
          },
        ],
      },
    ],
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
      {
        hasNextPage: false,
        rateCards: [],
      },
    ],
    [
      'a mismatched rate-card ID',
      [
        {
          id: 'contract-id',
          rateCardId: 'unexpected-rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
      {
        hasNextPage: false,
        rateCards: [
          {
            aliases: [
              {
                endingBefore: null,
                name: 'managed-provider',
                startingAt: '2026-07-01T00:00:00.000Z',
              },
            ],
            id: 'rate-card-id',
          },
        ],
      },
    ],
    [
      'an incomplete rate-card page',
      [
        {
          id: 'contract-id',
          rateCardId: 'rate-card-id',
          startingAt: '2026-07-16T12:00:00.000Z',
          uniquenessKey: `myah-workspace-contract:${workspaceId}`,
        },
      ],
      {
        hasNextPage: true,
        rateCards: [],
      },
    ],
  ])(
    'requires contract reconciliation for %s',
    async (_, contracts, rateCardPage) => {
      const { service } = createService({
        contracts,
        createContractError: new MetronomeClientException(
          MetronomeClientExceptionCode.CONFLICT,
        ),
        installations: [
          { metronomeCustomerId: 'metronome-customer-id', workspaceId },
        ],
        rateCardPage,
      });

      await expect(
        service.ensureWorkspaceContract(workspaceId),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          code: MetronomeClientExceptionCode.CONFLICT,
        }),
        message: 'Metronome contract recovery requires reconciliation',
      });
    },
  );
});
