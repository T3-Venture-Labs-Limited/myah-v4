import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import {
  MYAH_CAMPAIGN_OUTREACH_READ_TOOL_NAMES,
  MYAH_CREATOR_OPS_READ_TOOL_NAMES,
  MYAH_INBOX_READ_TOOL_NAMES,
  MYAH_INBOX_REPLY_SEND_STATUS_TOOL_NAMES,
  REGISTERED_ACTION_TOOL_NAMES,
} from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { isValidUuid } from 'twenty-shared/utils';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';

const READ_ONLY_DATABASE_OPERATIONS: Readonly<Record<string, true>> = {
  find_many: true,
  find_one: true,
  group_by: true,
};

// These Composio functions are bounded, read-only calls. They remain
// executable before approval so the agent can discover current Instagram
// state. The application runtime can materialize these as static or logic
// function entries, so the source-controlled generated tool name is the gate.
export const PRE_APPROVAL_READ_ONLY_TOOL_NAMES: Readonly<Record<string, true>> =
  {
    app_myah_list_instagram_conversations: true,
    app_myah_list_instagram_messages: true,
  };

// Read, proposal, and status tools are safe before generic approval. Every
// mutation remains excluded until generic or registered approval enables it.
export const PRE_APPROVAL_SAFE_TOOL_NAMES: Readonly<Record<string, true>> =
  Object.freeze(
    Object.fromEntries(
      [
        ...Object.keys(PRE_APPROVAL_READ_ONLY_TOOL_NAMES),
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
  input?: unknown;
  output?: unknown;
  toolOutput?: unknown;
};

type MessageLike = {
  role?: string;
  parts?: MessagePartLike[];
};

type ApprovalToolResult = {
  status?: string;
  decision?: string;
  actionApprovalBindingId?: string;
};

type ApprovalToolOutput = {
  result: ApprovalToolResult;
};

export const getLatestApprovedGenericToolName = (
  messages: MessageLike[],
): string | null => {
  const latestMessage = messages[messages.length - 1];

  if (latestMessage?.role !== 'assistant') {
    return null;
  }

  for (const part of latestMessage.parts ?? []) {
    const output = part.output ?? part.toolOutput;

    if (
      part.type !== `tool-${REQUEST_APPROVAL_TOOL_NAME}` ||
      !isApprovalToolOutput(output) ||
      output.result.status !== 'resolved' ||
      output.result.decision !== 'approved' ||
      isRegisteredActionApprovalOutput(output) ||
      !part.input ||
      typeof part.input !== 'object' ||
      !('toolName' in part.input)
    ) {
      continue;
    }

    const toolName = part.input.toolName;

    if (
      typeof toolName === 'string' &&
      toolName.length > 0 &&
      REGISTERED_ACTION_TOOL_NAMES_BY_NAME[toolName] !== true
    ) {
      return toolName;
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
