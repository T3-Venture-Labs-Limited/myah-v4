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
