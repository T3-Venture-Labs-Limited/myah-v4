import { type Repository } from 'typeorm';

import { type ManagedProviderFundingActionEntity } from '../entities/managed-provider-funding-action.entity';
import {
  type CreateFundingIntent,
  ManagedProviderFundingJournalService,
} from '../services/managed-provider-funding-journal.service';

const intent: CreateFundingIntent = {
  actionType: 'SPONSORED_CREDIT',
  amountCents: 5_000,
  applicability: { workspaceId: 'workspace-id' },
  applicableProductIds: ['charge-product-id'],
  creditProductId: 'credit-product-id',
  currency: 'USD',
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  externalReference: 'pilot-grant-1',
  idempotencyKey: 'pilot-grant-1',
  operatorIdentity: 'operator-id',
  paymentEvidence: null,
  permissionUsed: 'managed_provider_grant',
  reason: 'design partner pilot',
  workspaceId: 'workspace-id',
};

const persistedAction = {
  ...intent,
  amountCents: String(intent.amountCents),
  correctedOperationId: null,
  id: 'funding-action-id',
  metronomeUniquenessKey: `myah:${'a'.repeat(64)}`,
  state: 'PENDING',
} as ManagedProviderFundingActionEntity;

const createService = ({
  existing = null,
}: { existing?: ManagedProviderFundingActionEntity | null } = {}) => {
  const repository = {
    create: jest.fn((value) => value),
    findOne: jest.fn().mockResolvedValue(existing),
    save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
  };

  return {
    repository,
    service: new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    ),
  };
};

describe('ManagedProviderFundingJournalService', () => {
  it('persists immutable funding intent with a bounded deterministic Metronome key', async () => {
    const { repository, service } = createService();

    await expect(service.createPending(intent)).resolves.toMatchObject({
      actionType: 'SPONSORED_CREDIT',
      amountCents: '5000',
      externalReference: 'pilot-grant-1',
      operatorIdentity: 'operator-id',
      permissionUsed: 'managed_provider_grant',
      state: 'PENDING',
    });
    const saved = repository.save.mock.calls[0][0];

    expect(saved.creditProductId).toBe('credit-product-id');
    expect(saved.applicableProductIds).toEqual(['charge-product-id']);

    expect(saved.metronomeUniquenessKey).toMatch(/^myah:[a-f0-9]{64}$/);
    expect(saved.metronomeUniquenessKey).toHaveLength(69);
  });

  it('returns an exact idempotent replay without creating another row', async () => {
    const { repository, service } = createService({
      existing: persistedAction,
    });

    await expect(service.createPending(intent)).resolves.toBe(persistedAction);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects an idempotency replay whose immutable funding facts differ', async () => {
    const { repository, service } = createService({
      existing: persistedAction,
    });

    await expect(
      service.createPending({ ...intent, amountCents: 5_001 }),
    ).rejects.toThrow('funding replay conflicts');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a replay whose persisted product scope differs', async () => {
    const { service } = createService({
      existing: {
        ...persistedAction,
        creditProductId: 'different-credit-product-id',
      } as ManagedProviderFundingActionEntity,
    });

    await expect(service.createPending(intent)).rejects.toThrow(
      'funding replay conflicts',
    );
  });

  it('recovers an exact concurrent insert race without duplicating the action', async () => {
    const { repository, service } = createService();

    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedAction);
    repository.save.mockRejectedValueOnce(new Error('unique violation'));

    await expect(service.createPending(intent)).resolves.toBe(persistedAction);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['fractional amount', { amountCents: 1.5 }],
    ['negative amount', { amountCents: -1 }],
    ['oversized amount', { amountCents: '9007199254740992' }],
    ['fractional principal', { prepaidPrincipalCents: 1.5 }],
    ['negative tax', { taxCents: -1 }],
    ['oversized total', { collectedTotalCents: '9007199254740992' }],
  ])('rejects %s before persisting', async (_label, invalidInput) => {
    const { repository, service } = createService();

    await expect(
      service.createPending({ ...intent, ...invalidInput } as CreateFundingIntent),
    ).rejects.toThrow('must be a non-negative safe integer');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('serializes rate-limit count and intent creation under the operator lock', async () => {
    const transactionalRepository = {
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(19),
      })),
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    };
    const repository = {
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const service = new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    );

    await expect(
      service.createPendingRateLimited(intent, 20),
    ).resolves.toMatchObject({ state: 'PENDING' });
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['myah:sponsored-grant-rate:operator-id'],
    );
    expect(transactionalRepository.save).toHaveBeenCalledTimes(1);
  });

  it('transitions only the exact workspace action from the expected state', async () => {
    const action = {
      ...persistedAction,
      workspaceId: 'workspace-id',
      state: 'PAYMENT_PENDING',
    } as ManagedProviderFundingActionEntity;
    const repository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneByOrFail: jest.fn().mockResolvedValue(action),
    };
    const service = new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    );

    await expect(
      service.transitionCompareAndSet({
        id: action.id,
        workspaceId: action.workspaceId as string,
        expectedState: 'PENDING',
        nextState: 'PAYMENT_PENDING',
        patch: { metronomeInvoiceId: 'invoice-id' },
      }),
    ).resolves.toBe(action);
    expect(repository.update).toHaveBeenCalledWith(
      { id: action.id, workspaceId: action.workspaceId, state: 'PENDING' },
      { state: 'PAYMENT_PENDING', metronomeInvoiceId: 'invoice-id' },
    );
  });

  it('accepts a compare-and-set replay when the exact next state is already persisted', async () => {
    const action = {
      ...persistedAction,
      workspaceId: 'workspace-id',
      state: 'PAYMENT_PENDING',
    } as ManagedProviderFundingActionEntity;
    const repository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      findOne: jest.fn().mockResolvedValue(action),
      findOneByOrFail: jest.fn().mockResolvedValue(action),
    };
    const service = new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    );

    await expect(
      service.transitionCompareAndSet({
        id: action.id,
        workspaceId: action.workspaceId as string,
        expectedState: 'PENDING',
        nextState: 'PAYMENT_PENDING',
      }),
    ).resolves.toBe(action);
  });

  it('atomically claims due reconciliation actions and increments attempts', async () => {
    const dueAction = {
      ...persistedAction,
      workspaceId: 'workspace-id',
      state: 'RECONCILIATION_REQUIRED',
      reconciliationAttemptCount: 2,
      nextReconciliationAt: new Date('2026-08-29T00:00:00.000Z'),
    } as ManagedProviderFundingActionEntity;
    const claimedAction = {
      ...dueAction,
      reconciliationAttemptCount: 3,
    };
    const managerRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue(claimedAction),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([dueAction]),
      getRepository: jest.fn().mockReturnValue(managerRepository),
    };
    const repository = {
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const service = new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    );
    const now = new Date('2026-08-29T01:00:00.000Z');

    await expect(service.claimDueReconciliationActions(10, now)).resolves.toEqual(
      [claimedAction],
    );
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['myah:managed-provider-funding-reconciliation'],
    );
    expect(managerRepository.update).toHaveBeenCalledWith(
      {
        id: dueAction.id,
        state: 'RECONCILIATION_REQUIRED',
      },
      expect.objectContaining({
        reconciliationClaimedAt: now,
        reconciliationAttemptCount: 3,
      }),
    );
  });

  it('replays CAS with equivalent persisted dates and receipt JSON', async () => {
    const action = {
      ...persistedAction,
      workspaceId: 'workspace-id',
      state: 'PAYMENT_PENDING',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      paymentReceipt: { totalCents: 5_000, paymentId: 'payment-id' },
    } as ManagedProviderFundingActionEntity;
    const repository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      findOne: jest.fn().mockResolvedValue(action),
    };
    const service = new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    );

    await expect(
      service.transitionCompareAndSet({
        id: action.id,
        workspaceId: action.workspaceId as string,
        expectedState: 'PENDING',
        nextState: 'PAYMENT_PENDING',
        patch: {
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          paymentReceipt: { paymentId: 'payment-id', totalCents: 5_000 },
        },
      }),
    ).resolves.toBe(action);
  });

  it('selects reclaimable refund states and leaves exhausted attempts for review', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(),
    };
    const repository = {
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const service = new ManagedProviderFundingJournalService(
      repository as unknown as Repository<ManagedProviderFundingActionEntity>,
    );

    await expect(
      service.claimDueReconciliationActions(
        10,
        new Date('2026-08-29T01:00:00.000Z'),
      ),
    ).resolves.toEqual([]);
    expect(manager.query.mock.calls[1][0]).toContain(
      `'REFUND_INTENT_RECORDED', 'REFUND_RECONCILIATION_REQUIRED'`,
    );
    expect(manager.query.mock.calls[1][0]).toContain(
      '"reconciliationAttemptCount" < $3',
    );
    expect(manager.query.mock.calls[1][0]).toContain(
      '"reconciliationClaimedAt" IS NULL OR',
    );
    expect(manager.query.mock.calls[1][0]).toContain(
      '"reconciliationClaimedAt" <= $2',
    );
  });
});
