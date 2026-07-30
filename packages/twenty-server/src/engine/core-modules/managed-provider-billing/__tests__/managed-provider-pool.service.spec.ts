import { type Repository } from 'typeorm';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { ManagedProviderPoolEntity } from '../entities/managed-provider-pool.entity';
import { ManagedProviderPoolState } from '../enums/managed-provider-pool-state.enum';
import { ManagedProviderPoolService } from '../services/managed-provider-pool.service';

describe('ManagedProviderPoolService', () => {
  const activePool = {
    activeConfigurationDigest: 'evidence-v2',
    activeTariffVersion: 'tariff-v2',
    appliedDesiredStateDigest: 'digest-v2',
    appliedDesiredStateEpoch: '2',
    providerKey: 'openrouter',
    rowVersion: 2,
    state: ManagedProviderPoolState.ACTIVE,
  } as ManagedProviderPoolEntity;

  const createService = ({
    current = activePool,
    hasUnresolvedOperations = false,
  }: {
    current?: ManagedProviderPoolEntity | null;
    hasUnresolvedOperations?: boolean;
  } = {}) => {
    const operationQuery = {
      andWhere: jest.fn(),
      getExists: jest.fn().mockResolvedValue(hasUnresolvedOperations),
      where: jest.fn(),
    };
    operationQuery.where.mockReturnValue(operationQuery);
    operationQuery.andWhere.mockReturnValue(operationQuery);
    const poolTransactionRepository = {
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(current),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ManagedProviderPoolEntity
          ? poolTransactionRepository
          : { createQueryBuilder: () => operationQuery },
      ),
      query: jest.fn().mockResolvedValue(undefined),
    };
    const poolRepository = {
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    } as unknown as Repository<ManagedProviderPoolEntity>;
    const configService = { get: jest.fn() } as unknown as TwentyConfigService;
    return {
      manager,
      operationQuery,
      poolTransactionRepository,
      service: new ManagedProviderPoolService(poolRepository, configService),
    };
  };

  it.each([
    [null, false],
    ['core.managedProviderPool', true],
  ])(
    'reports pool storage availability from the database catalog',
    async (tableName, expected) => {
      const poolRepository = {
        manager: {
          query: jest.fn().mockResolvedValue([{ tableName }]),
        },
      } as unknown as Repository<ManagedProviderPoolEntity>;
      const configService = {
        get: jest.fn(),
      } as unknown as TwentyConfigService;
      const service = new ManagedProviderPoolService(
        poolRepository,
        configService,
      );

      await expect(service.isStorageAvailable()).resolves.toBe(expected);
      expect(poolRepository.manager.query).toHaveBeenCalledWith(
        `SELECT to_regclass('core."managedProviderPool"') AS "tableName"`,
      );
    },
  );

  it('locks and admits only an exact active tariff and evidence version', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(activePool),
    } as unknown as Repository<ManagedProviderPoolEntity>;
    const { service } = createService();

    await expect(
      service.assertReservationAllowed(repository, {
        configurationDigest: 'evidence-v2',
        providerKey: 'openrouter',
        tariffVersion: 'tariff-v2',
      }),
    ).resolves.toBeUndefined();
    expect(repository.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { providerKey: 'openrouter' },
    });

    await expect(
      service.assertReservationAllowed(repository, {
        configurationDigest: 'stale-evidence',
        providerKey: 'openrouter',
        tariffVersion: 'tariff-v2',
      }),
    ).rejects.toThrow('Managed provider pool admission is not active');
  });

  it('treats lower epochs as stale and equal-epoch digest changes as conflicts', async () => {
    const { manager, poolTransactionRepository, service } = createService();

    await expect(
      service.reconcileDesiredState({
        configurationDigest: null,
        digest: 'older',
        epoch: '1',
        providerKey: 'openrouter',
        state: ManagedProviderPoolState.DISABLED,
        tariffVersion: null,
      }),
    ).resolves.toBe(activePool);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['myah:managed-provider-pool:openrouter'],
    );
    await expect(
      service.reconcileDesiredState({
        configurationDigest: null,
        digest: 'different',
        epoch: '2',
        providerKey: 'openrouter',
        state: ManagedProviderPoolState.DISABLED,
        tariffVersion: null,
      }),
    ).rejects.toThrow('Managed provider pool desired state conflict');
    expect(poolTransactionRepository.save).not.toHaveBeenCalled();
  });

  it('serializes concurrent first reconciliation and replays exact desired state', async () => {
    const rows: ManagedProviderPoolEntity[] = [];
    const events: string[] = [];
    let lockTail = Promise.resolve();
    const poolRepository = {
      manager: {
        transaction: async (
          callback: (manager: unknown) => Promise<unknown>,
        ) => {
          const previous = lockTail;
          let release!: () => void;
          lockTail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          const poolTransactionRepository = {
            create: jest.fn((value) => value),
            findOne: jest.fn(async () => {
              events.push('findOne');
              return rows[0] ?? null;
            }),
            save: jest.fn(async (value: ManagedProviderPoolEntity) => {
              if (rows.length > 0) throw new Error('duplicate provider row');
              rows.push(value);
              return value;
            }),
          };
          const operationQuery = {
            andWhere: jest.fn(),
            getExists: jest.fn().mockResolvedValue(false),
            where: jest.fn(),
          };
          operationQuery.where.mockReturnValue(operationQuery);
          operationQuery.andWhere.mockReturnValue(operationQuery);
          const manager = {
            query: jest.fn(async () => {
              events.push('advisory-lock');
            }),
            getRepository: jest.fn((entity) =>
              entity === ManagedProviderPoolEntity
                ? poolTransactionRepository
                : { createQueryBuilder: () => operationQuery },
            ),
          };

          try {
            return await callback(manager);
          } finally {
            release();
          }
        },
      },
    } as unknown as Repository<ManagedProviderPoolEntity>;
    const service = new ManagedProviderPoolService(
      poolRepository,
      {} as TwentyConfigService,
    );
    const desired = {
      configurationDigest: 'evidence-v1',
      digest: 'digest-v1',
      epoch: '1',
      providerKey: 'test-provider',
      state: ManagedProviderPoolState.ACTIVE,
      tariffVersion: 'tariff-v1',
    };

    const [first, second] = await Promise.all([
      service.reconcileDesiredState(desired),
      service.reconcileDesiredState(desired),
    ]);

    expect(first).toEqual(second);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowVersion).toBe(1);
    expect(events).toEqual([
      'advisory-lock',
      'findOne',
      'advisory-lock',
      'findOne',
    ]);
    await expect(
      service.reconcileDesiredState({
        ...desired,
        digest: 'conflicting-digest',
      }),
    ).rejects.toThrow('Managed provider pool desired state conflict');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowVersion).toBe(1);
  });

  it('refuses to activate while provider operations remain unresolved', async () => {
    const { operationQuery, service } = createService({
      hasUnresolvedOperations: true,
    });

    await expect(
      service.reconcileDesiredState({
        configurationDigest: 'evidence-v3',
        digest: 'digest-v3',
        epoch: '3',
        providerKey: 'test-provider',
        state: ManagedProviderPoolState.ACTIVE,
        tariffVersion: 'tariff-v3',
      }),
    ).rejects.toThrow(
      'Managed provider pool cannot activate with unresolved operations',
    );
    expect(operationQuery.getExists).toHaveBeenCalledTimes(1);
  });
});
