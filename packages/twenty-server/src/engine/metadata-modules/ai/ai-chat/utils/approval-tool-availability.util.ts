import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';

const READ_ONLY_DATABASE_OPERATIONS = new Set([
  'find_many',
  'find_one',
  'group_by',
]);

// These Composio functions are bounded, read-only calls. They remain
// executable before approval so the agent can discover current Instagram
// state. The application runtime can materialize these as static or logic
// function entries, so the source-controlled generated tool name is the gate.
export const PRE_APPROVAL_READ_ONLY_TOOL_NAMES = new Set([
  'app_myah_list_instagram_conversations',
  'app_myah_list_instagram_messages',
]);

// This narrow native action may create a reviewable local draft and
// conversation candidate after a user requests an outbound reply. It performs
// no provider I/O and cannot deliver a message; all generic writes stay denied.
export const PRE_APPROVAL_SAFE_TOOL_NAMES = new Set([
  ...PRE_APPROVAL_READ_ONLY_TOOL_NAMES,
  'prepare_instagram_reply_draft',
]);

export const getPreApprovalExcludedToolNames = (
  toolCatalog: ToolIndexEntry[],
): Set<string> =>
  new Set(
    toolCatalog
      .filter((entry) => {
        if (entry.executionRef.kind === 'database_crud') {
          return !READ_ONLY_DATABASE_OPERATIONS.has(
            entry.executionRef.operation,
          );
        }

        return !PRE_APPROVAL_SAFE_TOOL_NAMES.has(entry.name);
      })
      .map((entry) => entry.name),
  );

export const getApprovedResumeActiveToolNames = (toolNames: string[]) =>
  toolNames.filter((toolName) => toolName !== REQUEST_APPROVAL_TOOL_NAME);

type MessagePartLike = {
  type?: string;
  output?: unknown;
  toolOutput?: unknown;
};

type MessageLike = {
  role?: string;
  parts?: MessagePartLike[];
};

export const hasLatestMessageApprovedApproval = (messages: MessageLike[]) => {
  const latestMessage = messages[messages.length - 1];

  if (latestMessage?.role !== 'assistant') {
    return false;
  }

  return (latestMessage.parts ?? []).some((part) => {
    const output = part.output ?? part.toolOutput;

    if (!isApprovalToolOutput(output)) {
      return false;
    }

    return (
      part.type === `tool-${REQUEST_APPROVAL_TOOL_NAME}` &&
      output.result.status === 'resolved' &&
      output.result.decision === 'approved'
    );
  });
};

const isApprovalToolOutput = (
  output: unknown,
): output is { result: { status?: string; decision?: string } } => {
  if (!output || typeof output !== 'object' || !('result' in output)) {
    return false;
  }

  const result = output.result;

  return !!result && typeof result === 'object';
};
