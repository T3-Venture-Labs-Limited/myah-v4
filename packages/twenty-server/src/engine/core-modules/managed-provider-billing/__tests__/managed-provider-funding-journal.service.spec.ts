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

  it('recovers an exact concurrent insert race without duplicating the action', async () => {
    const { repository, service } = createService();

    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedAction);
    repository.save.mockRejectedValueOnce(new Error('unique violation'));

    await expect(service.createPending(intent)).resolves.toBe(persistedAction);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
