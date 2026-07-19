import { type UIMessageChunk } from 'ai';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { StreamAgentChatJob } from 'src/engine/metadata-modules/ai/ai-chat/jobs/stream-agent-chat.job';
import { type StreamAgentChatJobData } from 'src/engine/metadata-modules/ai/ai-chat/jobs/stream-agent-chat-job.types';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';

type PublishedEvent = { type: string } & Record<string, unknown>;

const TEXT_CHUNKS: UIMessageChunk[] = [
  { type: 'start', messageId: 'assistant-message-id' },
  { type: 'start-step' },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', delta: 'Hello' },
  { type: 'text-end', id: 'text-1' },
];

const RESPONSE_MESSAGE = {
  role: 'assistant' as const,
  parts: [{ type: 'text' as const, text: 'Hello' }],
};

type FakeChatStream = {
  toUIMessageStream: (options: {
    onError?: (error: unknown) => string;
    onFinish?: (event: {
      responseMessage: typeof RESPONSE_MESSAGE;
      isAborted: boolean;
    }) => Promise<void> | void;
  }) => ReadableStream<UIMessageChunk>;
};

const createFakeChatStream = ({
  chunks = TEXT_CHUNKS,
  responseMessage = RESPONSE_MESSAGE,
  midStreamError,
  onFirstChunk,
}: {
  chunks?: UIMessageChunk[];
  responseMessage?: typeof RESPONSE_MESSAGE;
  midStreamError?: Error;
  onFirstChunk?: () => void;
} = {}): FakeChatStream => ({
  toUIMessageStream: (options) =>
    new ReadableStream<UIMessageChunk>({
      async start(controller) {
        let isFirstChunk = true;

        for (const chunk of chunks) {
          controller.enqueue(chunk);

          if (isFirstChunk) {
            isFirstChunk = false;
            onFirstChunk?.();
          }
        }

        if (midStreamError) {
          const errorText = options.onError?.(midStreamError) ?? '';

          controller.enqueue({ type: 'error', errorText });
        }

        await options.onFinish?.({ responseMessage, isAborted: false });

        controller.close();
      },
    }),
});

describe('StreamAgentChatJob', () => {
  const workspace = { id: 'workspace-id' } as WorkspaceEntity;

  const jobData: StreamAgentChatJobData = {
    threadId: 'thread-id',
    streamId: 'stream-id',
    userWorkspaceId: 'user-workspace-id',
    workspaceId: 'workspace-id',
    messages: [],
    browsingContext: null,
    lastUserMessageText: 'hello',
    lastUserMessageParts: [{ type: 'text', text: 'hello' }],
    hasTitle: true,
    conversationSizeTokens: 0,
    existingTurnId: 'turn-id',
  };

  const buildJob = ({
    workspaceFound = true,
    chatStream = createFakeChatStream(),
    streamChatRejection,
    addMessageRejection,
    assistantPersistRejection,
    publishRejection,
    totalsUpdateAffected = 1,
    titlePromise = Promise.resolve(null),
  }: {
    workspaceFound?: boolean;
    chatStream?: FakeChatStream;
    streamChatRejection?: Error;
    addMessageRejection?: Error;
    assistantPersistRejection?: Error;
    publishRejection?: Error;
    totalsUpdateAffected?: number;
    titlePromise?: Promise<string | null>;
  } = {}) => {
    const publishedEvents: PublishedEvent[] = [];

    const threadRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'thread-id', deletedAt: null }),
      update: jest.fn().mockImplementation((_workspaceId, _criteria, values) =>
        Promise.resolve({
          affected:
            values && typeof values.totalInputTokens === 'function'
              ? totalsUpdateAffected
              : 1,
        }),
      ),
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspaceFound ? workspace : null),
    };
    const agentChatService = {
      addMessage: addMessageRejection
        ? jest.fn().mockRejectedValue(addMessageRejection)
        : jest.fn().mockResolvedValue({ id: 'assistant-message-id' }),
      upsertAssistantMessage: assistantPersistRejection
        ? jest.fn().mockRejectedValue(assistantPersistRejection)
        : jest.fn().mockResolvedValue(undefined),
      generateTitleIfNeeded: jest.fn().mockReturnValue(titlePromise),
      notifyThreadUsageUpdated: jest.fn().mockResolvedValue(undefined),
    };
    const chatExecutionService = {
      streamChat: streamChatRejection
        ? jest.fn().mockRejectedValue(streamChatRejection)
        : jest.fn().mockResolvedValue({
            stream: chatStream,
            modelConfig: { contextWindowTokens: 100000 },
            hasNoMoreAvailableCredits: () => false,
          }),
    };
    const eventPublisherService = {
      resetStreamState: jest.fn().mockResolvedValue(undefined),
      publish: jest
        .fn()
        .mockImplementation(({ event }: { event: PublishedEvent }) => {
          publishedEvents.push(event);

          if (
            publishRejection &&
            event.type === 'stream-chunk' &&
            publishedEvents.filter((item) => item.type === 'stream-chunk')
              .length === 1
          ) {
            return Promise.reject(publishRejection);
          }

          return Promise.resolve();
        }),
    };
    const cancelCallbacks: Array<() => void> = [];
    const cancelSubscriberService = {
      subscribe: jest
        .fn()
        .mockImplementation((_channel: string, callback: () => void) => {
          cancelCallbacks.push(callback);

          return Promise.resolve();
        }),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
    };
    const agentChatStreamingService = {
      flushNextQueuedMessage: jest.fn().mockResolvedValue(undefined),
    };
    const streamHeartbeatService = {
      startRunning: jest.fn().mockReturnValue(() => {}),
      markClaimed: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    const job = new StreamAgentChatJob(
      threadRepository as never,
      workspaceRepository as never,
      agentChatService as never,
      chatExecutionService as never,
      eventPublisherService as never,
      cancelSubscriberService as never,
      agentChatStreamingService as never,
      streamHeartbeatService as never,
    );

    return {
      job,
      publishedEvents,
      threadRepository,
      agentChatService,
      eventPublisherService,
      chatExecutionService,
      agentChatStreamingService,
      cancelCallbacks,
    };
  };

  it('publishes all chunks in order with message-persisted last on success', async () => {
    const {
      job,
      publishedEvents,
      threadRepository,
      agentChatService,
      chatExecutionService,
      agentChatStreamingService,
    } = buildJob();

    await job.handle(jobData);

    const chunkEvents = publishedEvents.filter(
      (event) => event.type === 'stream-chunk',
    );

    expect(chunkEvents).toHaveLength(TEXT_CHUNKS.length);
    expect(publishedEvents[publishedEvents.length - 1]).toMatchObject({
      type: 'message-persisted',
    });
    expect(agentChatService.upsertAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        turnId: 'turn-id',
        parts: expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
        ]),
      }),
    );
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      expect.objectContaining({ lastStreamError: null }),
    );
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      { activeStreamId: null },
    );
    expect(agentChatStreamingService.flushNextQueuedMessage).toHaveBeenCalled();
    expect(chatExecutionService.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        managedProviderRequestIdRoot: 'turn-id:resume:stream-id',
      }),
    );
  });

  it('keeps resume roots unique per stream and stable on replay', async () => {
    const { job, chatExecutionService } = buildJob();

    await job.handle(jobData);
    await job.handle({ ...jobData, streamId: 'stream-id-2' });
    await job.handle(jobData);

    expect(
      chatExecutionService.streamChat.mock.calls.map(
        ([options]: [{ managedProviderRequestIdRoot: string }]) =>
          options.managedProviderRequestIdRoot,
      ),
    ).toEqual([
      'turn-id:resume:stream-id',
      'turn-id:resume:stream-id-2',
      'turn-id:resume:stream-id',
    ]);
  });

  it('waits for a late human-input chunk before persisting the assistant turn', async () => {
    const lateHumanInput = {
      type: 'tool-ask_questions',
      toolCallId: 'tool-call-id',
      state: 'output-available',
      input: {},
      output: {
        result: {
          status: 'pending',
          questions: [{ question: 'Continue?', options: [{ label: 'Yes' }] }],
        },
      },
    };
    const { job, threadRepository, publishedEvents } = buildJob({
      chatStream: createFakeChatStream({
        chunks: [
          ...TEXT_CHUNKS,
          {
            type: 'data-code-execution',
            id: 'write-after-finish',
            data: {},
          } as UIMessageChunk,
        ],
        responseMessage: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello' }, lateHumanInput],
        } as never,
      }),
    });

    await job.handle(jobData);

    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      expect.objectContaining({ pendingQuestionMessageId: expect.any(String) }),
    );
    expect(
      publishedEvents.find((event) => event.type === 'message-persisted'),
    ).toBeDefined();
  });

  it('does not wait for title generation before finishing a pending approval stream', async () => {
    const pendingApproval = {
      type: 'tool-request_approval',
      toolCallId: 'approval-call-id',
      state: 'output-available',
      input: {},
      output: {
        result: {
          status: 'pending',
          request: {},
        },
      },
    };
    const neverResolvingTitle = new Promise<string | null>(() => {});
    const { job, publishedEvents, threadRepository } = buildJob({
      titlePromise: neverResolvingTitle,
      chatStream: createFakeChatStream({
        responseMessage: {
          role: 'assistant',
          parts: [pendingApproval],
        } as never,
      }),
    });

    await job.handle({ ...jobData, hasTitle: false });

    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      expect.objectContaining({ pendingQuestionMessageId: expect.any(String) }),
    );
    expect(publishedEvents[publishedEvents.length - 1]).toMatchObject({
      type: 'message-persisted',
    });
  });

  it('gates the thread totals on still owning the stream so a prior completion is not double-counted', async () => {
    const { job, agentChatService, threadRepository } = buildJob({
      totalsUpdateAffected: 0,
    });

    await job.handle(jobData);

    expect(agentChatService.upsertAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-id' }),
    );
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      expect.objectContaining({ lastStreamError: null }),
    );
    expect(agentChatService.notifyThreadUsageUpdated).not.toHaveBeenCalled();
  });

  it('applies thread totals when the claim is still held even if the message already exists from a checkpoint', async () => {
    const { job, agentChatService } = buildJob({ totalsUpdateAffected: 1 });

    await job.handle(jobData);

    expect(agentChatService.upsertAssistantMessage).toHaveBeenCalled();
    expect(agentChatService.notifyThreadUsageUpdated).toHaveBeenCalled();
  });

  it('never publishes the opaque error chunk to subscribers', async () => {
    const { job, publishedEvents } = buildJob({
      chatStream: createFakeChatStream({
        midStreamError: new Error('provider exploded'),
      }),
    });

    await expect(job.handle(jobData)).rejects.toThrow('provider exploded');

    const chunkTypes = publishedEvents
      .filter((event) => event.type === 'stream-chunk')
      .map((event) => (event.chunk as { type: string }).type);

    expect(chunkTypes).not.toContain('error');
  });

  it('rejects, persists the error, and unblocks the thread when the model stream fails mid-stream', async () => {
    const { job, publishedEvents, threadRepository, agentChatService } =
      buildJob({
        chatStream: createFakeChatStream({
          midStreamError: new Error('provider exploded'),
        }),
      });

    await expect(job.handle(jobData)).rejects.toThrow('provider exploded');

    expect(publishedEvents.map((event) => event.type)).not.toContain(
      'message-persisted',
    );
    expect(agentChatService.upsertAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-id' }),
    );
    expect(publishedEvents.map((event) => event.type)).toContain(
      'stream-error',
    );
    expect(agentChatService.notifyThreadUsageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-id' }),
    );
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id' },
      {
        lastStreamError: expect.objectContaining({
          code: 'STREAM_EXECUTION_FAILED',
          message: 'provider exploded',
        }),
      },
    );
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      { activeStreamId: null },
    );
  });
  it('drains and persists the finish event before rethrowing a publisher failure', async () => {
    const publishError = new Error('redis unavailable');
    const { job, publishedEvents, agentChatService, eventPublisherService } =
      buildJob({ publishRejection: publishError });

    await expect(job.handle(jobData)).rejects.toBe(publishError);
    expect(eventPublisherService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'stream-error' }),
      }),
    );
    expect(publishedEvents.map((event) => event.type)).not.toContain(
      'message-persisted',
    );
    expect(agentChatService.upsertAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-id' }),
    );
  });

  it('rejects promptly when execution setup throws instead of hanging until the queue lock expires', async () => {
    const { job, publishedEvents, threadRepository } = buildJob({
      streamChatRejection: new Error('model resolution failed'),
    });

    await expect(job.handle(jobData)).rejects.toThrow(
      'model resolution failed',
    );

    expect(publishedEvents[publishedEvents.length - 2]).toMatchObject({
      type: 'stream-error',
      message: 'model resolution failed',
    });
    expect(publishedEvents[publishedEvents.length - 1]).toMatchObject({
      type: 'queue-updated',
    });
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      { activeStreamId: null },
    );
  });

  it('terminates the stream with an error when assistant persistence fails after draining chunks', async () => {
    const { job, publishedEvents } = buildJob({
      assistantPersistRejection: new Error('insert failed'),
    });

    await expect(job.handle(jobData)).rejects.toThrow('insert failed');

    const chunkEvents = publishedEvents.filter(
      (event) => event.type === 'stream-chunk',
    );

    expect(chunkEvents).toHaveLength(TEXT_CHUNKS.length);
    expect(publishedEvents[publishedEvents.length - 2]).toMatchObject({
      type: 'stream-error',
    });
    expect(publishedEvents[publishedEvents.length - 1]).toMatchObject({
      type: 'queue-updated',
    });
    expect(publishedEvents.map((event) => event.type)).not.toContain(
      'message-persisted',
    );
  });

  it('persists the error and unblocks the thread when the workspace is missing', async () => {
    const { job, publishedEvents, threadRepository } = buildJob({
      workspaceFound: false,
    });

    await expect(job.handle(jobData)).rejects.toMatchObject({
      code: AiExceptionCode.WORKSPACE_NOT_FOUND,
    });

    expect(publishedEvents[publishedEvents.length - 2]).toMatchObject({
      type: 'stream-error',
      code: AiExceptionCode.WORKSPACE_NOT_FOUND,
    });
    expect(publishedEvents[publishedEvents.length - 1]).toMatchObject({
      type: 'queue-updated',
    });
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id' },
      {
        lastStreamError: expect.objectContaining({
          code: AiExceptionCode.WORKSPACE_NOT_FOUND,
        }),
      },
    );
    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', activeStreamId: 'stream-id' },
      { activeStreamId: null },
    );
  });

  it('resolves without flushing the queue when the stream is cancelled', async () => {
    let triggerCancel: (() => void) | undefined;

    const {
      job,
      publishedEvents,
      agentChatService,
      agentChatStreamingService,
      cancelCallbacks,
    } = buildJob({
      chatStream: createFakeChatStream({
        onFirstChunk: () => triggerCancel?.(),
      }),
    });

    triggerCancel = () => cancelCallbacks.forEach((callback) => callback());

    await job.handle(jobData);

    expect(publishedEvents.map((event) => event.type)).not.toContain(
      'stream-error',
    );
    expect(
      agentChatStreamingService.flushNextQueuedMessage,
    ).not.toHaveBeenCalled();
    expect(agentChatService.notifyThreadUsageUpdated).toHaveBeenCalled();
  });
});
