import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';

const READ_ONLY_DATABASE_OPERATIONS = new Set([
  'find_many',
  'find_one',
  'group_by',
]);

export const getPreApprovalExcludedToolNames = (
  toolCatalog: ToolIndexEntry[],
): Set<string> =>
  new Set(
    toolCatalog
      .filter((entry) => {
        if (entry.executionRef.kind !== 'database_crud') {
          return true;
        }

        return !READ_ONLY_DATABASE_OPERATIONS.has(entry.executionRef.operation);
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
