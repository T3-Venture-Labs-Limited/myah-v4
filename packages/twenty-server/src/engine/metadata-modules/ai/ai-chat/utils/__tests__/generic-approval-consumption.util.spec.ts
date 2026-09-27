import {
  consumeApprovedGenericAction,
  invalidateApprovedGenericAction,
  recordApprovedGenericActionOutcome,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/generic-approval-consumption.util';

const target = {
  workspaceId: 'workspace-id',
  threadId: 'thread-id',
  userWorkspaceId: 'user-workspace-id',
  messageId: 'message-id',
  toolCallId: 'tool-call-id',
  argumentsDigest: 'a'.repeat(64),
};

const managerReturning = (count: number) => ({
  query: jest.fn().mockResolvedValue([{ count }]),
});

describe('generic approval consumption', () => {
  it('consumes only a fresh, resolved, approved part of this thread and digest', async () => {
    const manager = managerReturning(1);

    await expect(consumeApprovedGenericAction(manager, target)).resolves.toBe(
      true,
    );

    const [sql, parameters] = manager.query.mock.calls[0];

    expect(sql).toContain(`#>> '{result,status}' = 'resolved'`);
    expect(sql).toContain(`#>> '{result,decision}' = 'approved'`);
    expect(sql).toContain(`#>> '{result,reviewedAction,argumentsDigest}' = $6`);
    expect(sql).toContain(`thread."userWorkspaceId" = $3`);
    expect(sql).toContain(`thread."deletedAt" IS NULL`);
    expect(parameters).toEqual([
      'workspace-id',
      'thread-id',
      'user-workspace-id',
      'message-id',
      'tool-call-id',
      'a'.repeat(64),
      'consumed',
      ['result', 'consumedAt'],
      expect.any(String),
      true,
      30,
    ]);
  });

  it('reports refusal when no row transitioned (already used, invalidated, or expired)', async () => {
    await expect(
      consumeApprovedGenericAction(managerReturning(0), target),
    ).resolves.toBe(false);
  });

  it('records a result only for the consumed matching approval once', async () => {
    const manager = managerReturning(1);

    await expect(
      recordApprovedGenericActionOutcome(manager, target, 'succeeded'),
    ).resolves.toBe(true);
    const [sql, parameters] = manager.query.mock.calls[0];

    expect(sql).toContain(`#>> '{result,status}' = 'consumed'`);
    expect(sql).toContain(`#>> '{result,executionOutcome}' IS NULL`);
    expect(sql).toContain(`#>> '{result,reviewedAction,argumentsDigest}' = $6`);
    expect(sql).toContain(`thread."userWorkspaceId" = $3`);
    expect(parameters).toEqual([
      'workspace-id',
      'thread-id',
      'user-workspace-id',
      'message-id',
      'tool-call-id',
      'a'.repeat(64),
      'succeeded',
    ]);
    await expect(
      recordApprovedGenericActionOutcome(managerReturning(0), target, 'failed'),
    ).resolves.toBe(false);
  });

  it('invalidates with a reason without requiring an unexpired decision', async () => {
    const manager = managerReturning(1);

    await expect(
      invalidateApprovedGenericAction(manager, target, 'ACTION_CHANGED'),
    ).resolves.toBe(true);
    expect(manager.query.mock.calls[0][1].slice(6)).toEqual([
      'invalidated',
      ['result', 'invalidReason'],
      'ACTION_CHANGED',
      false,
      30,
    ]);
  });
});
