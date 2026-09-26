import { randomUUID } from 'node:crypto';
import { type LanguageModel } from 'ai';

type ScriptedCall = {
  toolName: string;
  input: Record<string, unknown>;
};

type NestModules = {
  container: {
    getModules: () => Map<
      unknown,
      {
        metatype?: { name?: string };
        providers: Map<unknown, { instance?: unknown }>;
      }
    >;
  };
};

// Resolves a provider instance registered in AiChatModule of the test app.
export const getAiChatProvider = <T>(providerName: string): T => {
  const app = global.app as unknown as NestModules;
  const aiChatModule = [...app.container.getModules().values()].find(
    ({ metatype }) => metatype?.name === 'AiChatModule',
  );
  const instance = aiChatModule
    ? [...aiChatModule.providers.entries()].find(
        ([token]) => typeof token === 'function' && token.name === providerName,
      )?.[1].instance
    : undefined;

  if (!instance) {
    throw new Error(`${providerName} is not registered in AiChatModule`);
  }

  return instance as T;
};

// Deterministic model: emits one scripted tool call per step, then a summary.
const createScriptedLanguageModel = (calls: ScriptedCall[]) => {
  const emittedToolCalls: string[] = [];
  const resolvedToolInputs: Record<string, unknown>[] = [];
  let cursor = 0;

  const model: LanguageModel = {
    specificationVersion: 'v3',
    provider: 'myah-scripted-integration',
    modelId: 'myah-scripted-integration',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('Scripted model only supports streaming');
    },
    doStream: jest.fn(async () => {
      const call = calls[cursor++];
      const input = call?.input;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });

          if (call && input) {
            emittedToolCalls.push(call.toolName);
            resolvedToolInputs.push(input);
            controller.enqueue({
              type: 'tool-call',
              toolCallId: `script-${cursor}`,
              toolName: call.toolName,
              input: JSON.stringify(input),
            });
          } else {
            controller.enqueue({ type: 'text-start', id: 'summary' });
            controller.enqueue({
              type: 'text-delta',
              id: 'summary',
              delta: 'Script completed.',
            });
            controller.enqueue({ type: 'text-end', id: 'summary' });
          }

          controller.enqueue({
            type: 'finish',
            finishReason: {
              unified: call ? 'tool-calls' : 'stop',
              raw: call ? 'tool_calls' : 'stop',
            },
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          });
          controller.close();
        },
      });

      return { stream };
    }),
  };

  return { emittedToolCalls, model, resolvedToolInputs };
};

type ChatExecutionLike = {
  aiModelRegistryService: unknown;
  streamChat: (options: Record<string, unknown>) => Promise<{
    stream: {
      fullStream: AsyncIterable<Record<string, unknown>>;
      steps: Promise<unknown>;
    };
  }>;
};

export type ScriptedChatTurn = {
  workspaceId: string;
  userWorkspaceId: string;
  chatThreadId: string;
  messages: unknown[];
  calls: ScriptedCall[];
};

// Streams one chat turn through the real ChatExecutionService with a scripted
// model, so tool availability, approval review, and guards are production code.
export const runScriptedChatTurn = async ({
  workspaceId,
  userWorkspaceId,
  chatThreadId,
  messages,
  calls,
}: ScriptedChatTurn) => {
  const { emittedToolCalls, model, resolvedToolInputs } =
    createScriptedLanguageModel(calls);
  const chatExecution = getAiChatProvider<ChatExecutionLike>(
    'ChatExecutionService',
  );
  const aiModelRegistry = chatExecution.aiModelRegistryService as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const resolveModel = jest
    .spyOn(aiModelRegistry, 'resolveModelForAgent')
    .mockResolvedValue({
      modelId: 'myah-scripted-integration',
      model,
      sdkPackage: 'openai',
      providerName: 'scripted',
    } as never);
  const validateModel = jest
    .spyOn(aiModelRegistry, 'validateModelAvailability')
    .mockImplementation(() => undefined);
  const modelConfig = jest
    .spyOn(aiModelRegistry, 'getEffectiveModelConfig')
    .mockReturnValue({
      contextWindowTokens: 128_000,
      modalities: ['text'],
    } as never);

  try {
    const execution = await chatExecution.streamChat({
      workspace: {
        id: workspaceId,
        smartModel: 'myah-scripted-integration',
        aiAdditionalInstructions: null,
      },
      userWorkspaceId,
      threadId: chatThreadId,
      messages,
      browsingContext: null,
      managedProviderRequestIdRoot: `myah-scripted-${randomUUID()}`,
      conversationSizeTokens: 0,
    });
    const chunks: Record<string, unknown>[] = [];

    for await (const chunk of execution.stream.fullStream) {
      chunks.push(chunk);
    }
    await execution.stream.steps;

    return { chunks, modelToolCalls: emittedToolCalls, resolvedToolInputs };
  } finally {
    modelConfig.mockRestore();
    validateModel.mockRestore();
    resolveModel.mockRestore();
  }
};

type AgentChatServiceLike = {
  resolvePendingApproval: (input: {
    threadId: string;
    messageId: string;
    decision: { decision: string; comment?: string };
    streamId: string;
    workspaceId: string;
    userWorkspaceId: string;
  }) => Promise<{ shouldResume: boolean }>;
};

export type ProposedGenericApproval =
  | {
      proposed: true;
      messageId: string;
      toolCallId: string;
      // The stored approval message as the resume stream loads it.
      loadMessage: () => Promise<unknown>;
      decide: (
        decision: 'approved' | 'rejected' | 'changes_requested',
      ) => Promise<void>;
    }
  | { proposed: false; error: string };

// Proposes a generic write through the real request_approval tool (the server
// derives the reviewed action), then persists it as the pending approval
// message of the chat thread, exactly as the chat stream would.
export const proposeGenericApproval = async ({
  workspaceId,
  userWorkspaceId,
  chatThreadId,
  toolName,
  proposedArguments,
}: {
  workspaceId: string;
  userWorkspaceId: string;
  chatThreadId: string;
  toolName: string;
  proposedArguments: Record<string, unknown>;
}): Promise<ProposedGenericApproval> => {
  const input = {
    title: `Run ${toolName}`,
    summary: `Run ${toolName} once with the reviewed arguments.`,
    actionKind: 'internal_record_write',
    riskLevel: 'low',
    toolName,
    proposedArguments,
    consequences: ['The reviewed change will be applied.'],
  };
  const { chunks } = await runScriptedChatTurn({
    workspaceId,
    userWorkspaceId,
    chatThreadId,
    messages: [
      {
        id: randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: 'Propose the change for approval.' }],
      },
    ],
    calls: [{ toolName: 'request_approval', input }],
  });
  const toolResult = chunks.find(
    (chunk) =>
      chunk.type === 'tool-result' && chunk.toolName === 'request_approval',
  );

  if (!toolResult) {
    const toolError = chunks.find((chunk) => chunk.type === 'tool-error');

    return { proposed: false, error: String(toolError?.error ?? 'no result') };
  }

  const messageId = randomUUID();
  const toolCallId = toolResult.toolCallId as string;

  await global.testDataSource.query(
    `INSERT INTO core."agentMessage" (id, "workspaceId", "threadId", role, status)
     VALUES ($1, $2, $3, 'assistant', 'sent')`,
    [messageId, workspaceId, chatThreadId],
  );
  await global.testDataSource.query(
    `INSERT INTO core."agentMessagePart" (
       id, "workspaceId", "messageId", "orderIndex", type, "toolName",
       "toolCallId", "toolInput", "toolOutput", state
     ) VALUES ($1, $2, $3, 0, 'tool-request_approval', 'request_approval',
       $4, $5::jsonb, $6::jsonb, 'output-available')`,
    [
      randomUUID(),
      workspaceId,
      messageId,
      toolCallId,
      JSON.stringify(input),
      JSON.stringify(toolResult.output),
    ],
  );
  await global.testDataSource.query(
    `UPDATE core."agentChatThread"
        SET "pendingQuestionMessageId" = $2, "activeStreamId" = NULL
      WHERE id = $1`,
    [chatThreadId, messageId],
  );

  const loadMessage = async () => {
    const [part] = await global.testDataSource.query<
      { toolInput: unknown; toolOutput: unknown }[]
    >(
      `SELECT "toolInput", "toolOutput" FROM core."agentMessagePart"
        WHERE "messageId" = $1 AND "toolCallId" = $2`,
      [messageId, toolCallId],
    );

    return {
      id: messageId,
      role: 'assistant',
      parts: [
        {
          type: 'tool-request_approval',
          toolCallId,
          state: 'output-available',
          input: part.toolInput,
          output: part.toolOutput,
        },
      ],
    };
  };

  return {
    proposed: true,
    messageId,
    toolCallId,
    loadMessage,
    decide: async (decision) => {
      await getAiChatProvider<AgentChatServiceLike>(
        'AgentChatService',
      ).resolvePendingApproval({
        threadId: chatThreadId,
        messageId,
        decision: { decision },
        streamId: randomUUID(),
        workspaceId,
        userWorkspaceId,
      });
      // The test drives the resume directly, so release the stream claim.
      await global.testDataSource.query(
        `UPDATE core."agentChatThread" SET "activeStreamId" = NULL WHERE id = $1`,
        [chatThreadId],
      );
    },
  };
};

export const readApprovalResult = async (
  messageId: string,
): Promise<Record<string, unknown>> => {
  const [part] = await global.testDataSource.query<
    { toolOutput: { result: Record<string, unknown> } }[]
  >(
    `SELECT "toolOutput" FROM core."agentMessagePart"
      WHERE "messageId" = $1 AND "toolName" = 'request_approval'`,
    [messageId],
  );

  return part.toolOutput.result;
};
