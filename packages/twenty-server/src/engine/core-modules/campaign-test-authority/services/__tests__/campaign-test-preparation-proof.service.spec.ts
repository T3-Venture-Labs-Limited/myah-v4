import { type EntityManager, type QueryRunner } from 'typeorm';

import { CampaignTestPreparationProofService } from 'src/engine/core-modules/campaign-test-authority/services/campaign-test-preparation-proof.service';
import {
  type CampaignTestPreparationProof,
  type CreateCampaignTestPreparationProofInput,
} from 'src/engine/core-modules/campaign-test-authority/types/campaign-test-authority.type';

const ids = {
  account: '11111111-1111-4111-8111-111111111111',
  attempt: '22222222-2222-4222-8222-222222222222',
  campaign: '33333333-3333-4333-8333-333333333333',
  capability: '44444444-4444-4444-8444-444444444444',
  channel: '55555555-5555-4555-8555-555555555555',
  confirmation: '66666666-6666-4666-8666-666666666666',
  creator: '77777777-7777-4777-8777-777777777777',
  message: '88888888-8888-4888-8888-888888888888',
  plannedMessage: '99999999-9999-4999-8999-999999999999',
  proof: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  requester: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  requesterWorkspace: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  version: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  workspace: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
const digest = 'a'.repeat(64);
const confirmationIssuedAt = new Date('2026-09-07T12:00:00.000Z');
const reservationEligibleUntil = new Date('2026-09-07T12:05:00.000Z');
const createdAt = new Date('2026-09-07T12:00:01.000Z');

const createInput = (): CreateCampaignTestPreparationProofInput => ({
  attemptId: ids.attempt,
  campaignCapacityTimeZone: 'America/New_York',
  campaignCreatorId: ids.creator,
  campaignId: ids.campaign,
  confirmationId: ids.confirmation,
  confirmationIssuedAt,
  connectedAccountId: ids.account,
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  plannedPriorMessageId: null,
  previewDigest: digest,
  priorAcceptedEvidenceId: null,
  provider: 'google',
  renderDigest: digest,
  requesterUserId: ids.requester,
  requesterUserWorkspaceId: ids.requesterWorkspace,
  reservationEligibleUntil,
  selectionConstraintKind: 'ROTATE',
  senderPoolFingerprint: digest,
  testPreparationProofId: ids.proof,
  testTransportDigest: digest,
  threadEnrollmentId: null,
  threadOccurrenceId: null,
  threadScopeKind: 'NEW_THREAD',
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const proof = (
  overrides: Partial<CampaignTestPreparationProof> = {},
): CampaignTestPreparationProof => ({
  ...createInput(),
  createdAt,
  finalEvidenceDigest: null,
  testSubmissionCapabilityId: null,
  ...overrides,
});

const queryResult = (records: unknown[], affected = records.length) => ({
  affected,
  raw: records,
  records,
});

const activeManager = (query: jest.Mock) => {
  const queryRunner = {
    isReleased: false,
    isTransactionActive: true,
    query,
  } as unknown as QueryRunner;
  const transaction = jest.fn();

  return {
    manager: { queryRunner, transaction } as unknown as EntityManager,
    queryRunner,
    transaction,
  };
};

describe('CampaignTestPreparationProofService', () => {
  const service = new CampaignTestPreparationProofService();

  it.each([
    ['undefined manager', undefined],
    ['null manager', null],
    ['primitive manager', 1],
    ['missing runner', {}],
    ['undefined runner', { queryRunner: undefined }],
    ['null runner', { queryRunner: null }],
    ['primitive runner', { queryRunner: 1 }],
    [
      'inactive runner',
      { queryRunner: { isReleased: false, isTransactionActive: false } },
    ],
    [
      'released runner',
      { queryRunner: { isReleased: true, isTransactionActive: true } },
    ],
    [
      'runner without query',
      { queryRunner: { isReleased: false, isTransactionActive: true } },
    ],
  ])(
    'fails closed for a malformed supplied manager: %s',
    async (_label, runtimeManager) => {
      const query = jest.fn();
      const manager =
        runtimeManager !== null && typeof runtimeManager === 'object'
          ? ({ ...runtimeManager, query } as unknown as EntityManager)
          : (runtimeManager as EntityManager);
      const confirmationScope = {
        confirmationId: ids.confirmation,
        requesterUserId: ids.requester,
        requesterUserWorkspaceId: ids.requesterWorkspace,
        workspaceId: ids.workspace,
      };
      const proofIdentity = {
        attemptId: ids.attempt,
        testPreparationProofId: ids.proof,
        workspaceId: ids.workspace,
      };
      const finalization = {
        ...proofIdentity,
        finalEvidenceDigest: 'b'.repeat(64),
        testSubmissionCapabilityId: ids.capability,
      };

      await expect(
        service.insertOrReplayInTransaction(createInput(), manager),
      ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
      await expect(
        service.readByConfirmationInTransaction(confirmationScope, manager),
      ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
      await expect(
        service.readByProofIdentityInTransaction(proofIdentity, manager),
      ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
      await expect(
        service.finalizeInTransaction(finalization, manager),
      ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('serializes the absent confirmation, inserts proof first, and returns the exact created row', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([proof()]));
    const { manager, transaction } = activeManager(query);

    await expect(
      service.insertOrReplayInTransaction(createInput(), manager),
    ).resolves.toEqual({ proof: proof(), status: 'CREATED' });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[2][0]).toContain(
      'INSERT INTO "core"."campaignTestPreparationProof"',
    );
    expect(query.mock.calls[2][1][0]).toBe(ids.proof);
    expect(query.mock.calls[2][1][1]).toBe(ids.confirmation);
    expect(query.mock.calls[2][1][2]).toBe(ids.attempt);
    expect(query.mock.calls.every((call) => call[2] === true)).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns exact replay for the same immutable proof and conflict for any mismatch', async () => {
    const exactQuery = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([proof()]));
    const conflictQuery = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(
        queryResult([proof({ previewDigest: 'b'.repeat(64) })]),
      );

    await expect(
      service.insertOrReplayInTransaction(
        createInput(),
        activeManager(exactQuery).manager,
      ),
    ).resolves.toEqual({ proof: proof(), status: 'EXACT_REPLAY' });
    await expect(
      service.insertOrReplayInTransaction(
        createInput(),
        activeManager(conflictQuery).manager,
      ),
    ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    expect(exactQuery).toHaveBeenCalledTimes(2);
    expect(conflictQuery).toHaveBeenCalledTimes(2);
  });

  it('replays immutable identity when a cached full proof contains stale finalization fields', async () => {
    const cachedFullProof = proof();
    const finalized = proof({
      finalEvidenceDigest: 'b'.repeat(64),
      testSubmissionCapabilityId: ids.capability,
    });
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([finalized]));

    await expect(
      service.insertOrReplayInTransaction(
        cachedFullProof,
        activeManager(query).manager,
      ),
    ).resolves.toEqual({ proof: finalized, status: 'EXACT_REPLAY' });
  });

  it('returns conflict when a proof, confirmation, or attempt unique identity is already consumed', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    await expect(
      service.insertOrReplayInTransaction(
        createInput(),
        activeManager(query).manager,
      ),
    ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    expect(query.mock.calls[2][0]).toContain('ON CONFLICT DO NOTHING');
  });

  it('scopes confirmation reads to workspace and both requester identities', async () => {
    const foundQuery = jest.fn().mockResolvedValueOnce(queryResult([proof()]));
    const missingQuery = jest.fn().mockResolvedValueOnce(queryResult([]));

    await expect(
      service.readByConfirmationInTransaction(
        {
          confirmationId: ids.confirmation,
          requesterUserId: ids.requester,
          requesterUserWorkspaceId: ids.requesterWorkspace,
          workspaceId: ids.workspace,
        },
        activeManager(foundQuery).manager,
      ),
    ).resolves.toEqual({ proof: proof(), status: 'FOUND' });
    await expect(
      service.readByConfirmationInTransaction(
        {
          confirmationId: ids.confirmation,
          requesterUserId: ids.requester,
          requesterUserWorkspaceId: ids.requesterWorkspace,
          workspaceId: ids.workspace,
        },
        activeManager(missingQuery).manager,
      ),
    ).resolves.toEqual({ status: 'NOT_FOUND' });

    expect(foundQuery.mock.calls[0][0]).toContain('"requesterUserId" = $3');
    expect(foundQuery.mock.calls[0][0]).toContain(
      '"requesterUserWorkspaceId" = $4',
    );
    expect(foundQuery.mock.calls[0][1]).toEqual([
      ids.workspace,
      ids.confirmation,
      ids.requester,
      ids.requesterWorkspace,
    ]);
  });

  it('scopes proof reads to proof, workspace, and attempt identity', async () => {
    const query = jest.fn().mockResolvedValueOnce(queryResult([proof()]));

    await expect(
      service.readByProofIdentityInTransaction(
        {
          attemptId: ids.attempt,
          testPreparationProofId: ids.proof,
          workspaceId: ids.workspace,
        },
        activeManager(query).manager,
      ),
    ).resolves.toEqual({ proof: proof(), status: 'FOUND' });
    expect(query.mock.calls[0][0]).toContain('"testPreparationProofId" = $3');
    expect(query.mock.calls[0][1]).toEqual([
      ids.workspace,
      ids.attempt,
      ids.proof,
    ]);
  });

  it('returns finalization conflict before writing when the capability belongs to another proof', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(
        queryResult([
          proof({
            testPreparationProofId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            finalEvidenceDigest: 'c'.repeat(64),
            testSubmissionCapabilityId: ids.capability,
          }),
        ]),
      );

    await expect(
      service.finalizeInTransaction(
        {
          attemptId: ids.attempt,
          finalEvidenceDigest: 'b'.repeat(64),
          testPreparationProofId: ids.proof,
          testSubmissionCapabilityId: ids.capability,
          workspaceId: ids.workspace,
        },
        activeManager(query).manager,
      ),
    ).resolves.toEqual({ status: 'FINALIZATION_CONFLICT' });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[0][1][0]).toContain(ids.capability);
    expect(query.mock.calls[1][0]).toContain(
      '"testSubmissionCapabilityId" = $1',
    );
    expect(query.mock.calls.every((call) => call[2] === true)).toBe(true);
  });

  it('finalizes by one write-once pair CAS and reports the winner', async () => {
    const finalized = proof({
      finalEvidenceDigest: 'b'.repeat(64),
      testSubmissionCapabilityId: ids.capability,
    });
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([finalized], 1));
    const { manager, transaction } = activeManager(query);

    await expect(
      service.finalizeInTransaction(
        {
          attemptId: ids.attempt,
          finalEvidenceDigest: 'b'.repeat(64),
          testPreparationProofId: ids.proof,
          testSubmissionCapabilityId: ids.capability,
          workspaceId: ids.workspace,
        },
        manager,
      ),
    ).resolves.toEqual({ proof: finalized, status: 'FINALIZED' });

    expect(query.mock.calls[2][0]).toContain(
      '"testSubmissionCapabilityId" IS NULL',
    );
    expect(query.mock.calls[2][0]).toContain('"finalEvidenceDigest" IS NULL');
    expect(query.mock.calls[2][1]).toEqual([
      ids.workspace,
      ids.attempt,
      ids.proof,
      ids.capability,
      'b'.repeat(64),
    ]);
    expect(query.mock.calls[2][2]).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['missing returned record', { affected: 1, raw: [], records: [] }],
    ['affected count mismatch', { affected: 0, raw: [], records: [proof()] }],
    ['unstructured PostgreSQL tuple', [[proof()], 1]],
  ])(
    'fails closed for a malformed successful finalization result: %s',
    async (_label, result) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce(queryResult([{ locked: true }]))
        .mockResolvedValueOnce(queryResult([]))
        .mockResolvedValueOnce(result);

      await expect(
        service.finalizeInTransaction(
          {
            attemptId: ids.attempt,
            finalEvidenceDigest: 'b'.repeat(64),
            testPreparationProofId: ids.proof,
            testSubmissionCapabilityId: ids.capability,
            workspaceId: ids.workspace,
          },
          activeManager(query).manager,
        ),
      ).resolves.toEqual({ status: 'INVALID_PERSISTED_PROOF' });
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[2][2]).toBe(true);
    },
  );

  it('returns exact replay or conflict after a finalization CAS loser', async () => {
    const finalized = proof({
      finalEvidenceDigest: 'b'.repeat(64),
      testSubmissionCapabilityId: ids.capability,
    });
    const exactQuery = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([], 0))
      .mockResolvedValueOnce(queryResult([finalized], 1));
    const conflictQuery = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([], 0))
      .mockResolvedValueOnce(
        queryResult(
          [
            proof({
              finalEvidenceDigest: 'c'.repeat(64),
              testSubmissionCapabilityId:
                'ffffffff-ffff-4fff-8fff-ffffffffffff',
            }),
          ],
          1,
        ),
      );

    await expect(
      service.finalizeInTransaction(
        {
          attemptId: ids.attempt,
          finalEvidenceDigest: 'b'.repeat(64),
          testPreparationProofId: ids.proof,
          testSubmissionCapabilityId: ids.capability,
          workspaceId: ids.workspace,
        },
        activeManager(exactQuery).manager,
      ),
    ).resolves.toEqual({ proof: finalized, status: 'EXACT_REPLAY' });
    await expect(
      service.finalizeInTransaction(
        {
          attemptId: ids.attempt,
          finalEvidenceDigest: 'b'.repeat(64),
          testPreparationProofId: ids.proof,
          testSubmissionCapabilityId: ids.capability,
          workspaceId: ids.workspace,
        },
        activeManager(conflictQuery).manager,
      ),
    ).resolves.toEqual({ status: 'FINALIZATION_CONFLICT' });
  });

  it('returns not found after a finalization CAS loser when the exact scoped proof is absent', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([{ locked: true }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([], 0))
      .mockResolvedValueOnce(queryResult([], 0));

    await expect(
      service.finalizeInTransaction(
        {
          attemptId: ids.attempt,
          finalEvidenceDigest: 'b'.repeat(64),
          testPreparationProofId: ids.proof,
          testSubmissionCapabilityId: ids.capability,
          workspaceId: ids.workspace,
        },
        activeManager(query).manager,
      ),
    ).resolves.toEqual({ status: 'NOT_FOUND' });
  });

  it.each([
    ['recipient mailbox', { normalizedRecipient: 'not-an-email' }],
    ['sender mailbox', { normalizedSenderHandle: 'not-an-email' }],
    ['capacity timezone', { campaignCapacityTimeZone: 'not-a-zone' }],
    ['noncanonical mailbox', { normalizedRecipient: 'User@example.com' }],
  ])(
    'rejects an invalid canonical %s before SQL',
    async (_label, overrides) => {
      const query = jest.fn();

      await expect(
        service.insertOrReplayInTransaction(
          { ...createInput(), ...overrides },
          activeManager(query).manager,
        ),
      ).resolves.toEqual({ status: 'INVALID_INPUT' });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['recipient mailbox', { normalizedRecipient: 'not-an-email' }],
    ['sender mailbox', { normalizedSenderHandle: 'not-an-email' }],
    ['capacity timezone', { campaignCapacityTimeZone: 'not-a-zone' }],
  ])('fails closed for a malformed persisted %s', async (_label, overrides) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(queryResult([proof(overrides)]));

    await expect(
      service.readByProofIdentityInTransaction(
        {
          attemptId: ids.attempt,
          testPreparationProofId: ids.proof,
          workspaceId: ids.workspace,
        },
        activeManager(query).manager,
      ),
    ).resolves.toEqual({ status: 'INVALID_PERSISTED_PROOF' });
  });

  it('executes zero SQL for an inactive runner across all public methods', async () => {
    const query = jest.fn();
    const manager = {
      queryRunner: {
        isReleased: false,
        isTransactionActive: false,
        query,
      },
    } as unknown as EntityManager;
    const identity = {
      attemptId: ids.attempt,
      testPreparationProofId: ids.proof,
      workspaceId: ids.workspace,
    };

    await expect(
      service.insertOrReplayInTransaction(createInput(), manager),
    ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
    await expect(
      service.readByConfirmationInTransaction(
        {
          confirmationId: ids.confirmation,
          requesterUserId: ids.requester,
          requesterUserWorkspaceId: ids.requesterWorkspace,
          workspaceId: ids.workspace,
        },
        manager,
      ),
    ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
    await expect(
      service.readByProofIdentityInTransaction(identity, manager),
    ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
    await expect(
      service.finalizeInTransaction(
        {
          ...identity,
          finalEvidenceDigest: 'b'.repeat(64),
          testSubmissionCapabilityId: ids.capability,
        },
        manager,
      ),
    ).resolves.toEqual({ status: 'TRANSACTION_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed for malformed persisted rows and invalid shape input', async () => {
    const malformedQuery = jest
      .fn()
      .mockResolvedValueOnce(
        queryResult([{ ...proof(), finalEvidenceDigest: digest }]),
      );

    await expect(
      service.readByProofIdentityInTransaction(
        {
          attemptId: ids.attempt,
          testPreparationProofId: ids.proof,
          workspaceId: ids.workspace,
        },
        activeManager(malformedQuery).manager,
      ),
    ).resolves.toEqual({ status: 'INVALID_PERSISTED_PROOF' });

    await expect(
      service.insertOrReplayInTransaction(
        { ...createInput(), reservationEligibleUntil: confirmationIssuedAt },
        activeManager(jest.fn()).manager,
      ),
    ).resolves.toEqual({ status: 'INVALID_INPUT' });
  });
});
