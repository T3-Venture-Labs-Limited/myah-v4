import { type DataSource } from 'typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';

import { InstagramActionReceiptReconciliationService } from '../instagram-action-receipt-reconciliation.service';

const workspaceId = 'workspace-id';
const actionExecutionReceiptId = 'receipt-id';
const now = new Date('2026-09-05T12:00:00.000Z');

const createReceipt = (
  state = ActionExecutionReceiptState.PROCESSING,
): ActionExecutionReceiptEntity =>
  ({
    actionApprovalBindingId: 'binding-id',
    id: actionExecutionReceiptId,
    providerCode: null,
    redactedOutcome: null,
    state,
    workspaceId,
  }) as ActionExecutionReceiptEntity;

const createBinding = (
  overrides: Partial<ActionApprovalBindingEntity> = {},
): ActionApprovalBindingEntity =>
  ({
    actionName: 'send_instagram_message',
    actionVersion: 2,
    id: 'binding-id',
    workspaceId,
    ...overrides,
  }) as ActionApprovalBindingEntity;

const createReservation = (
  overrides: Partial<InstagramActionReservationEntity> = {},
): InstagramActionReservationEntity =>
  ({
    actionExecutionReceiptId,
    id: 'reservation-id',
    providerAttemptedAt: null,
    releasedAt: null,
    releaseReason: null,
    targetLockReleasedAt: null,
    workspaceId,
    ...overrides,
  }) as InstagramActionReservationEntity;

const createHarness = ({
  binding = createBinding(),
  receipt = createReceipt(),
  reservation = createReservation(),
}: {
  binding?: ActionApprovalBindingEntity | null;
  receipt?: ActionExecutionReceiptEntity | null;
  reservation?: InstagramActionReservationEntity | null;
} = {}) => {
  const manager = {
    findOne: jest
      .fn()
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce(binding)
      .mockResolvedValueOnce(reservation),
    query: jest.fn(async (query: string) =>
      query === 'SELECT clock_timestamp() AS "dbNow"' ? [{ dbNow: now }] : [],
    ),
    save: jest.fn(async <T>(_entity: unknown, value: T) => value),
  };
  const dataSource = {
    transaction: jest.fn(
      async <T>(callback: (transactionManager: typeof manager) => Promise<T>) =>
        callback(manager),
    ),
  };

  return {
    dataSource,
    manager,
    receipt,
    reservation,
    service: new InstagramActionReceiptReconciliationService(
      dataSource as unknown as DataSource,
    ),
  };
};

describe('InstagramActionReceiptReconciliationService', () => {
  it('locks the workspace receipt and atomically fails an unreserved processing v2 Instagram action', async () => {
    const harness = createHarness({ reservation: null });

    await harness.service.reconcile({ workspaceId, actionExecutionReceiptId });

    expect(harness.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(harness.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`instagram-action-receipt:${workspaceId}:${actionExecutionReceiptId}`],
    );
    expect(harness.manager.findOne).toHaveBeenNthCalledWith(
      1,
      ActionExecutionReceiptEntity,
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
        where: { id: actionExecutionReceiptId, workspaceId },
      }),
    );
    expect(harness.manager.query).toHaveBeenCalledWith(
      'SELECT clock_timestamp() AS "dbNow"',
    );
    expect(harness.receipt).toEqual(
      expect.objectContaining({
        providerCode: 'INSTAGRAM_ACTION_NOT_DISPATCHED',
        redactedOutcome: 'Instagram action was not dispatched',
        state: ActionExecutionReceiptState.FAILED,
      }),
    );
    expect(harness.manager.save).toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      harness.receipt,
    );
    expect(harness.manager.findOne).toHaveBeenNthCalledWith(
      3,
      InstagramActionReservationEntity,
      {
        lock: { mode: 'pessimistic_write' },
        where: { actionExecutionReceiptId, workspaceId },
      },
    );
  });

  it('releases both capacity and the START_CHAT target lock when a processing receipt never reached the provider', async () => {
    const harness = createHarness();

    await harness.service.reconcile({ workspaceId, actionExecutionReceiptId });

    expect(harness.reservation).toEqual(
      expect.objectContaining({
        releasedAt: now,
        releaseReason: 'INSTAGRAM_ACTION_NOT_DISPATCHED',
        targetLockReleasedAt: now,
      }),
    );
    expect(harness.manager.save).toHaveBeenCalledWith(
      InstagramActionReservationEntity,
      harness.reservation,
    );
  });

  it('marks a provider-attempted processing receipt unknown without releasing its reservation', async () => {
    const reservation = createReservation({ providerAttemptedAt: now });
    const harness = createHarness({ reservation });

    await harness.service.reconcile({ workspaceId, actionExecutionReceiptId });

    expect(harness.receipt).toEqual(
      expect.objectContaining({
        providerCode: 'INSTAGRAM_ACTION_OUTCOME_UNKNOWN',
        redactedOutcome: 'Instagram action outcome requires reconciliation',
        state: ActionExecutionReceiptState.UNKNOWN,
      }),
    );
    expect(harness.reservation).toEqual(
      expect.objectContaining({
        providerAttemptedAt: now,
        releasedAt: null,
        targetLockReleasedAt: null,
      }),
    );
    expect(harness.manager.save).not.toHaveBeenCalledWith(
      InstagramActionReservationEntity,
      harness.reservation,
    );
  });

  it('does not mutate a terminal receipt when reconciliation replays', async () => {
    const harness = createHarness({
      receipt: createReceipt(ActionExecutionReceiptState.SENT),
    });

    await harness.service.reconcile({ workspaceId, actionExecutionReceiptId });

    expect(harness.manager.findOne).toHaveBeenCalledTimes(1);
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  it.each([
    { actionName: 'send_instagram_reply', actionVersion: 1 },
    { actionName: 'send_instagram_message', actionVersion: 1 },
    { actionName: 'send_instagram_message_v2', actionVersion: 2 },
  ])(
    'does not mutate legacy or non-exact action binding %o',
    async (binding) => {
      const harness = createHarness({ binding: createBinding(binding) });

      await harness.service.reconcile({
        workspaceId,
        actionExecutionReceiptId,
      });

      expect(harness.manager.findOne).toHaveBeenCalledTimes(2);
      expect(harness.manager.save).not.toHaveBeenCalled();
      expect(harness.receipt).toEqual(
        expect.objectContaining({
          state: ActionExecutionReceiptState.PROCESSING,
        }),
      );
    },
  );
});
