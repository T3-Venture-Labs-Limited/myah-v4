import { type EntityManager } from 'typeorm';

import { type RequestApprovalInvalidReason } from 'twenty-shared/ai';

// Matches ACTION_APPROVAL_TTL_MS for registered approvals.
const GENERIC_APPROVAL_DECISION_TTL_MINUTES = 30;

export type GenericApprovalPartTarget = {
  workspaceId: string;
  threadId: string;
  userWorkspaceId: string;
  messageId: string;
  toolCallId: string;
  argumentsDigest: string;
};

// One conditional UPDATE on the stored approval part: it moves only a
// resolved + approved approval of this user's thread, bound to this exact
// arguments digest, so at most one caller can ever win the transition.
const TRANSITION_APPROVAL_QUERY = `
  WITH transitioned AS (
    UPDATE core."agentMessagePart" part
    SET "toolOutput" = jsonb_set(
      jsonb_set(part."toolOutput", '{result,status}', to_jsonb($7::text)),
      $8::text[],
      to_jsonb($9::text)
    )
    FROM core."agentMessage" message, core."agentChatThread" thread
    WHERE part."workspaceId" = $1
      AND part."messageId" = $4
      AND part."toolCallId" = $5
      AND part."toolName" = 'request_approval'
      AND message.id = part."messageId"
      AND message."workspaceId" = $1
      AND message."threadId" = $2
      AND thread.id = message."threadId"
      AND thread."workspaceId" = $1
      AND thread."userWorkspaceId" = $3
      AND thread."deletedAt" IS NULL
      AND part."toolOutput" #>> '{result,status}' = 'resolved'
      AND part."toolOutput" #>> '{result,decision}' = 'approved'
      AND part."toolOutput" #>> '{result,reviewedAction,argumentsDigest}' = $6
      AND (
        $10::boolean = false
        OR (part."toolOutput" #>> '{result,decidedAt}')::timestamptz
          > NOW() - make_interval(mins => $11::int)
      )
    RETURNING part.id
  )
  SELECT count(*)::int AS "count" FROM transitioned
`;

const transitionApproval = async (
  manager: Pick<EntityManager, 'query'>,
  target: GenericApprovalPartTarget,
  transition:
    | { status: 'consumed' }
    | { status: 'invalidated'; reason: RequestApprovalInvalidReason },
): Promise<boolean> => {
  const rows: Array<{ count: number }> = await manager.query(
    TRANSITION_APPROVAL_QUERY,
    [
      target.workspaceId,
      target.threadId,
      target.userWorkspaceId,
      target.messageId,
      target.toolCallId,
      target.argumentsDigest,
      transition.status,
      transition.status === 'consumed'
        ? ['result', 'consumedAt']
        : ['result', 'invalidReason'],
      transition.status === 'consumed'
        ? new Date().toISOString()
        : transition.reason,
      // Only consumption requires an unexpired decision; an expired approval
      // can still be marked invalidated so the chat shows it did not run.
      transition.status === 'consumed',
      GENERIC_APPROVAL_DECISION_TTL_MINUTES,
    ],
  );

  return rows[0]?.count === 1;
};

export const consumeApprovedGenericAction = (
  manager: Pick<EntityManager, 'query'>,
  target: GenericApprovalPartTarget,
) => transitionApproval(manager, target, { status: 'consumed' });

// Consumption happens before dispatch. Only a reported result can confirm a
// run; a missing outcome remains uncertain (including a crash mid-dispatch).
export const recordApprovedGenericActionOutcome = async (
  manager: Pick<EntityManager, 'query'>,
  target: GenericApprovalPartTarget,
  outcome: 'succeeded' | 'failed',
): Promise<boolean> => {
  const rows: Array<{ count: number }> = await manager.query(
    `WITH updated AS (
      UPDATE core."agentMessagePart" part
      SET "toolOutput" = jsonb_set(
        part."toolOutput", '{result,executionOutcome}', to_jsonb($7::text)
      )
      FROM core."agentMessage" message, core."agentChatThread" thread
      WHERE part."workspaceId" = $1
        AND part."messageId" = $4
        AND part."toolCallId" = $5
        AND part."toolName" = 'request_approval'
        AND message.id = part."messageId"
        AND message."workspaceId" = $1
        AND message."threadId" = $2
        AND thread.id = message."threadId"
        AND thread."workspaceId" = $1
        AND thread."userWorkspaceId" = $3
        AND thread."deletedAt" IS NULL
        AND part."toolOutput" #>> '{result,status}' = 'consumed'
        AND part."toolOutput" #>> '{result,decision}' = 'approved'
        AND part."toolOutput" #>> '{result,reviewedAction,argumentsDigest}' = $6
        AND part."toolOutput" #>> '{result,executionOutcome}' IS NULL
      RETURNING part.id
    )
    SELECT count(*)::int AS "count" FROM updated`,
    [
      target.workspaceId,
      target.threadId,
      target.userWorkspaceId,
      target.messageId,
      target.toolCallId,
      target.argumentsDigest,
      outcome,
    ],
  );

  return rows[0]?.count === 1;
};

export const invalidateApprovedGenericAction = (
  manager: Pick<EntityManager, 'query'>,
  target: GenericApprovalPartTarget,
  reason: RequestApprovalInvalidReason,
) => transitionApproval(manager, target, { status: 'invalidated', reason });
