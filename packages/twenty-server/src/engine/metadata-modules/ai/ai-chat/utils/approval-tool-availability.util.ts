import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import {
  MYAH_CAMPAIGN_OUTREACH_READ_TOOL_NAMES,
  MYAH_CREATOR_OPS_READ_TOOL_NAMES,
  MYAH_INBOX_READ_TOOL_NAMES,
  MYAH_INBOX_REPLY_SEND_STATUS_TOOL_NAMES,
  REGISTERED_ACTION_TOOL_NAMES,
} from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { type ReviewedGenericAction } from 'twenty-shared/ai';
import { isValidUuid } from 'twenty-shared/utils';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';

const READ_ONLY_DATABASE_OPERATIONS: Readonly<Record<string, true>> = {
  find_many: true,
  find_one: true,
  group_by: true,
};

// Read, proposal, and status tools are safe before generic approval. Retired
// Composio Instagram tools and every mutation remain excluded.
export const PRE_APPROVAL_SAFE_TOOL_NAMES: Readonly<Record<string, true>> =
  Object.freeze(
    Object.fromEntries(
      [
        ...MYAH_CREATOR_OPS_READ_TOOL_NAMES,
        ...MYAH_CAMPAIGN_OUTREACH_READ_TOOL_NAMES,
        ...MYAH_INBOX_READ_TOOL_NAMES,
        ...MYAH_INBOX_REPLY_SEND_STATUS_TOOL_NAMES,
        'prepare_instagram_reply_draft',
        'prepare_outreach_email_draft',
      ].map((toolName): [string, true] => [toolName, true]),
    ),
  );

const REGISTERED_ACTION_TOOL_NAMES_BY_NAME: Readonly<Record<string, true>> =
  Object.freeze(
    Object.fromEntries(
      REGISTERED_ACTION_TOOL_NAMES.map((toolName): [string, true] => [
        toolName,
        true,
      ]),
    ),
  );

export const allowRegisteredActionSenders = (
  excludedToolNames: Set<string>,
): void => {
  for (const toolName of REGISTERED_ACTION_TOOL_NAMES) {
    excludedToolNames.delete(toolName);
  }
};

export const getPreApprovalExcludedToolNames = (
  toolCatalog: ToolIndexEntry[],
): Set<string> =>
  new Set(
    toolCatalog
      .filter((entry) => {
        if (entry.executionRef.kind === 'database_crud') {
          return !READ_ONLY_DATABASE_OPERATIONS[entry.executionRef.operation];
        }

        return !PRE_APPROVAL_SAFE_TOOL_NAMES[entry.name];
      })
      .map((entry) => entry.name),
  );

export const getGenericApprovedResumeActiveToolNames = (toolNames: string[]) =>
  toolNames.filter((toolName) => toolName !== REQUEST_APPROVAL_TOOL_NAME);

type MessagePartLike = {
  type?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  toolOutput?: unknown;
};

type MessageLike = {
  id?: string;
  role?: string;
  parts?: MessagePartLike[];
};

type ApprovalToolResult = {
  status?: string;
  decision?: string;
  actionApprovalBindingId?: string;
  reviewedAction?: unknown;
};

type ApprovalToolOutput = {
  result: ApprovalToolResult;
};

export type LatestApprovedGenericAction = {
  messageId: string;
  toolCallId: string;
  reviewedAction: ReviewedGenericAction;
};

const isReviewedGenericAction = (
  value: unknown,
): value is ReviewedGenericAction => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<ReviewedGenericAction>;

  return (
    candidate.version === 1 &&
    typeof candidate.toolName === 'string' &&
    candidate.toolName.length > 0 &&
    typeof candidate.argumentsDigest === 'string' &&
    /^[0-9a-f]{64}$/.test(candidate.argumentsDigest) &&
    !!candidate.arguments &&
    typeof candidate.arguments === 'object' &&
    !Array.isArray(candidate.arguments) &&
    !!candidate.target &&
    typeof candidate.target === 'object'
  );
};

// Only a resolved, approved generic approval that carries its server-derived
// reviewed action can unlock a write. Consumed, invalidated, rejected,
// legacy (tool-name-only), and registered approvals unlock nothing here.
export const getLatestApprovedGenericAction = (
  messages: MessageLike[],
): LatestApprovedGenericAction | null => {
  const latestMessage = messages[messages.length - 1];

  if (latestMessage?.role !== 'assistant' || !latestMessage.id) {
    return null;
  }

  for (const part of latestMessage.parts ?? []) {
    const output = part.output ?? part.toolOutput;

    if (
      part.type !== `tool-${REQUEST_APPROVAL_TOOL_NAME}` ||
      !part.toolCallId ||
      !isApprovalToolOutput(output) ||
      output.result.status !== 'resolved' ||
      output.result.decision !== 'approved' ||
      isRegisteredActionApprovalOutput(output) ||
      !isReviewedGenericAction(output.result.reviewedAction) ||
      !part.input ||
      typeof part.input !== 'object' ||
      !('toolName' in part.input)
    ) {
      continue;
    }

    const { reviewedAction } = output.result;

    if (
      part.input.toolName === reviewedAction.toolName &&
      REGISTERED_ACTION_TOOL_NAMES_BY_NAME[reviewedAction.toolName] !== true
    ) {
      return {
        messageId: latestMessage.id,
        toolCallId: part.toolCallId,
        reviewedAction,
      };
    }
  }

  return null;
};

// A registered approval exposes the registered senders without adding action
// metadata to chat output. Each sender still rejects a binding for another
// action and rechecks thread, workspace, and immutable source graph.
export const hasApprovedRegisteredActionApproval = (messages: MessageLike[]) =>
  messages.some(
    (message) =>
      message.role === 'assistant' &&
      (message.parts ?? []).some((part) => {
        const output = part.output ?? part.toolOutput;

        return (
          part.type === `tool-${REQUEST_APPROVAL_TOOL_NAME}` &&
          isApprovalToolOutput(output) &&
          isRegisteredActionApprovalOutput(output)
        );
      }),
  );
const isApprovalToolOutput = (
  output: unknown,
): output is ApprovalToolOutput => {
  if (!output || typeof output !== 'object' || !('result' in output)) {
    return false;
  }

  const result = output.result;

  return !!result && typeof result === 'object';
};

const isRegisteredActionApprovalOutput = (
  output: ApprovalToolOutput,
): output is ApprovalToolOutput & {
  result: ApprovalToolResult & { actionApprovalBindingId: string };
} =>
  output.result.status === 'resolved' &&
  typeof output.result.actionApprovalBindingId === 'string' &&
  isValidUuid(output.result.actionApprovalBindingId);
