import { createV3RecoveryFixture } from './instagram-message-v3-recovery.fixture';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { InstagramMessageReconciliationService } from '../instagram-message-reconciliation.service';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramSendOutcomeResolutionEntity } from 'src/engine/core-modules/instagram-message/entities/instagram-send-outcome-resolution.entity';
import { InstagramSendOutcomeResolutionService } from 'src/engine/core-modules/instagram-message/services/instagram-send-outcome-resolution.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const receiptId = '00000000-0000-4000-8000-000000000002';
const userWorkspaceId = '00000000-0000-4000-8000-000000000003';

const buildHarness = () => {
  const receipt = {
    id: receiptId,
    workspaceId,
    state: ActionExecutionReceiptState.UNKNOWN,
    providerCode: 'unknown',
    redactedOutcome: 'unknown',
  };
  let storedResolution: Record<string, unknown> | null = null;
  const manager = {
    findOne: jest.fn(async (entity) =>
      entity === ActionExecutionReceiptEntity ? receipt : storedResolution,
    ),
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (entity, value) => {
      if (entity === InstagramSendOutcomeResolutionEntity) {
        storedResolution = { ...value, id: 'resolution-id' };
        return storedResolution;
      }

      return value;
    }),
  };
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const resolutionRepository = {
    findOne: jest.fn(async () => storedResolution),
  };
  const receiptRepository = {
    findOne: jest.fn().mockResolvedValue(receipt),
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    getRepository: jest.fn((entity) =>
      entity === ActionExecutionReceiptEntity
        ? receiptRepository
        : resolutionRepository,
    ),
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const reconciliationService = {
    inspectUnknown: jest.fn().mockResolvedValue({
      kind: 'MATCH',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    }),
    reconcile: jest.fn(async () => {
      receipt.state = ActionExecutionReceiptState.SENT;
      return { kind: 'MATCH' };
    }),
    finalizeProviderAccepted: jest.fn(async () => {
      receipt.state = ActionExecutionReceiptState.SENT;
    }),
  };
  const budgetService = {
    releaseStartTargetForReceipt: jest.fn().mockResolvedValue(undefined),
  };
  const service = new InstagramSendOutcomeResolutionService(
    dataSource as never,
    reconciliationService as never,
    budgetService as never,
  );

  return {
    budgetService,
    manager,
    queryRunner,
    receipt,
    resolutionRepository,
    receiptRepository,
    reconciliationService,
    service,
  };
};

const baseInput = {
  workspaceId,
  receiptId,
  resolvedByUserWorkspaceId: userWorkspaceId,
  outcome: 'CONFIRMED_SENT' as const,
  notes: 'Verified in provider read',
};

describe('InstagramSendOutcomeResolutionService', () => {
  it('confirms sent only from one verified match, projects the same receipt, and releases the target once', async () => {
    const harness = buildHarness();

    await expect(harness.service.resolve(baseInput)).resolves.toMatchObject({
      id: 'resolution-id',
      outcome: 'CONFIRMED_SENT',
      actionExecutionReceiptId: receiptId,
    });
    expect(harness.reconciliationService.reconcile).toHaveBeenCalledWith({
      workspaceId,
      receiptId,
    });
    expect(harness.manager.save.mock.invocationCallOrder[0]).toBeLessThan(
      harness.reconciliationService.reconcile.mock.invocationCallOrder[0],
    );
    expect(
      harness.budgetService.releaseStartTargetForReceipt,
    ).toHaveBeenCalledWith({
      workspaceId,
      actionExecutionReceiptId: receiptId,
      reason: 'RESOLVED',
    });
    expect(harness.queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_lock(hashtext($1))',
      [`instagram-send-resolution:${workspaceId}:${receiptId}`],
    );
  });

  it('retries reconciliation from a persisted confirmed resolution after interruption', async () => {
    const harness = buildHarness();
    harness.reconciliationService.reconcile.mockRejectedValueOnce(
      new Error('projection interrupted'),
    );

    await expect(harness.service.resolve(baseInput)).rejects.toThrow(
      'projection interrupted',
    );
    await expect(harness.resolutionRepository.findOne()).resolves.toMatchObject(
      {
        outcome: 'CONFIRMED_SENT',
        actionExecutionReceiptId: receiptId,
      },
    );

    await expect(harness.service.resolve(baseInput)).resolves.toMatchObject({
      outcome: 'CONFIRMED_SENT',
      actionExecutionReceiptId: receiptId,
    });
    expect(harness.reconciliationService.reconcile).toHaveBeenCalledTimes(2);
    expect(harness.receipt.state).toBe(ActionExecutionReceiptState.SENT);
  });

  it('clears a provably never-dispatched receipt without an exhaustive provider search', async () => {
    const harness = buildHarness();
    harness.reconciliationService.inspectUnknown.mockResolvedValue({
      kind: 'NOT_DISPATCHED',
    });

    await expect(
      harness.service.resolve({
        ...baseInput,
        outcome: 'CLEARED_NOT_SENT',
        senderUiReviewed: true,
        recipientUiReviewed: true,
      }),
    ).resolves.toMatchObject({ outcome: 'CLEARED_NOT_SENT' });
    expect(harness.receipt).toMatchObject({
      state: ActionExecutionReceiptState.FAILED,
      providerCode: 'failed',
    });
  });

  it('derives safe evidence server-side when a sufficiently old complete read proves not sent', async () => {
    const harness = buildHarness();
    harness.reconciliationService.inspectUnknown.mockResolvedValue({
      kind: 'NO_MATCH_COMPLETE',
    });

    await expect(
      harness.service.resolve({
        ...baseInput,
        outcome: 'CLEARED_NOT_SENT',
        senderUiReviewed: true,
        recipientUiReviewed: true,
      }),
    ).resolves.toMatchObject({ outcome: 'CLEARED_NOT_SENT' });
    expect(harness.receipt).toMatchObject({
      state: ActionExecutionReceiptState.FAILED,
      providerCode: 'failed',
    });
    expect(harness.reconciliationService.reconcile).not.toHaveBeenCalled();
    expect(harness.manager.save).toHaveBeenCalledWith(
      InstagramSendOutcomeResolutionEntity,
      expect.objectContaining({
        evidenceTypes: [
          'PROVIDER_RECONCILIATION_COMPLETE',
          'SENDER_UI_REVIEW',
          'RECIPIENT_UI_REVIEW',
        ],
        evidenceDigests: [
          expect.stringMatching(/^[0-9a-f]{64}$/),
          expect.stringMatching(/^[0-9a-f]{64}$/),
          expect.stringMatching(/^[0-9a-f]{64}$/),
        ],
      }),
    );
  });

  it('rejects absent or indeterminate provider evidence', async () => {
    const noMatch = buildHarness();
    noMatch.reconciliationService.inspectUnknown.mockResolvedValue({
      kind: 'NO_MATCH_COMPLETE',
    });
    await expect(noMatch.service.resolve(baseInput)).rejects.toThrow(
      'Confirmed sent resolution requires one verified provider message',
    );
  });
});

it('retains a confirmed resolution and target when accepted projection has not durably completed', async () => {
  const h = buildHarness();
  h.reconciliationService.reconcile.mockImplementation(async () => {
    h.receipt.state = ActionExecutionReceiptState.PROVIDER_ACCEPTED;
    return { kind: 'MATCH' };
  });
  await expect(h.service.resolve(baseInput)).rejects.toThrow(
    'Verified Instagram send projection is incomplete',
  );
  expect(h.budgetService.releaseStartTargetForReceipt).not.toHaveBeenCalled();
  expect(h.receipt.state).toBe(ActionExecutionReceiptState.PROVIDER_ACCEPTED);
});

describe('InstagramSendOutcomeResolutionService actual v3 reconciliation', () => {
  const setup = () => {
    const h = createV3RecoveryFixture();
    h.receipt.state = ActionExecutionReceiptState.UNKNOWN;
    const reservation = {
      providerAttemptedAt: new Date('2026-09-03T12:00:00Z'),
    };
    let resolution: Record<string, unknown> | null = null;
    const manager = {
      findOne: async (entity: unknown) =>
        entity === ActionExecutionReceiptEntity
          ? h.receipt
          : entity === ActionApprovalBindingEntity
            ? { ...h.binding, state: 'CONSUMED' }
            : resolution,
      find: async () => [],
      create: (_entity: unknown, value: unknown) => value,
      save: async (entity: unknown, value: Record<string, unknown>) => {
        if (entity === InstagramSendOutcomeResolutionEntity)
          resolution = { ...value, id: 'resolution-v3' };
        return entity === InstagramSendOutcomeResolutionEntity
          ? resolution
          : value;
      },
    };
    const dataSource = {
      transaction: async (callback: (manager: unknown) => unknown) =>
        callback(manager),
      getRepository: (entity: unknown) =>
        entity === ActionExecutionReceiptEntity
          ? h.receiptRepository
          : { findOne: async () => resolution },
      createQueryRunner: () => ({
        connect: async () => undefined,
        query: async () => [],
        release: async () => undefined,
      }),
    };
    const approval = new ActionApprovalService(
      dataSource as never,
      h.projector,
    );
    const budget = { releaseStartTargetForReceipt: jest.fn() };
    const reconciliation = new InstagramMessageReconciliationService(
      h.receiptRepository as never,
      { findOne: async () => reservation } as never,
      approval,
      h.reader,
      h.client,
      h.projector,
      h.writer,
      budget as never,
    );
    const service = new InstagramSendOutcomeResolutionService(
      dataSource as never,
      reconciliation,
      budget as never,
    );
    const input = {
      workspaceId: h.workspaceId,
      receiptId: h.receipt.id,
      resolvedByUserWorkspaceId: h.binding.initiatorUserWorkspaceId,
      outcome: 'CONFIRMED_SENT' as const,
    };
    return { ...h, budget, reservation, service, input };
  };
  it('retries an interrupted confirmed resolution from accepted identity, with no repeated send or duplicate projection', async () => {
    const h = setup();
    const draft = h.rows.myahInstagramReplyDraft;
    h.rows.myahInstagramReplyDraft = [];
    await expect(h.service.resolve(h.input)).rejects.toThrow(
      'Instagram message draft content changed',
    );
    expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
    expect(h.budget.releaseStartTargetForReceipt).not.toHaveBeenCalled();
    h.rows.myahInstagramReplyDraft = draft;
    await expect(h.service.resolve(h.input)).resolves.toMatchObject({
      outcome: 'CONFIRMED_SENT',
    });
    expect(h.receipt.state).toBe('SENT');
    expect(h.rows.myahSocialMessage).toHaveLength(1);
    expect(h.rows.myahSocialConversation).toHaveLength(1);
    expect(
      h.fetch.mock.calls.every(
        ([url, init]) => init.method === 'GET' && !url.includes('/users'),
      ),
    ).toBe(true);
  });
  it.each([
    { age: 1, reviewed: true },
    { age: 25, reviewed: false },
    { age: 25, reviewed: true },
  ])(
    'requires minimum age and explicit human review for no-match clear: %j',
    async ({ age, reviewed }) => {
      const h = setup();
      h.message.text = 'unrelated';
      h.reservation.providerAttemptedAt = new Date(
        Date.now() - age * 60 * 60 * 1000,
      );
      const result = h.service.resolve({
        ...h.input,
        outcome: 'CLEARED_NOT_SENT',
        senderUiReviewed: reviewed,
        recipientUiReviewed: reviewed,
      });
      if (age < 24 || !reviewed) {
        await expect(result).rejects.toThrow();
        expect(h.receipt.state).toBe('UNKNOWN');
        expect(h.budget.releaseStartTargetForReceipt).not.toHaveBeenCalled();
      } else {
        await expect(result).resolves.toMatchObject({
          outcome: 'CLEARED_NOT_SENT',
        });
        expect(h.receipt.state).toBe('FAILED');
        expect(h.budget.releaseStartTargetForReceipt).toHaveBeenCalled();
      }
      expect(h.rows.myahSocialMessage).toHaveLength(0);
      expect(
        h.fetch.mock.calls.every(([, init]) => init.method === 'GET'),
      ).toBe(true);
    },
  );
});
