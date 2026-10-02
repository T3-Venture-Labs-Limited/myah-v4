import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { z } from 'zod';

import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const explicitThreadId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const receiptId = '20202020-0b5c-4178-bed7-d371f6411ea3';
const creatorId = '20202020-0b5c-4178-bed7-d371f6411ea4';
const campaignId = '20202020-0b5c-4178-bed7-d371f6411ea5';
const contextFingerprint = 'b'.repeat(64);
const workspace = { id: workspaceId };
const contactId = encodeMyahInboxContactId({
  workspaceId,
  identity: { kind: 'creator', recordId: creatorId },
});
const target = {
  channel: ReplyChannel.EMAIL,
  contactId,
  threadId: explicitThreadId,
};
const campaignContext = {
  kind: ReplyContextKind.CAMPAIGN,
  campaignId,
};
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};
const requestContext = {
  authContext: userAuthContext,
  user: userAuthContext.user,
  workspace,
  userWorkspaceId,
  workspaceMemberId,
};
const context = {
  workspaceId,
  roleId: '20202020-0b5c-4178-bed7-d371f6411eab',
  rolePermissionConfig: { unionOf: ['20202020-0b5c-4178-bed7-d371f6411eab'] },
  authContext: userAuthContext,
  userId,
  userWorkspaceId,
  actorContext: {
    source: 'AGENT',
    workspaceMemberId,
    name: 'Operator',
    context: {},
  },
  myahInboxSelection: {
    workspaceId,
    threadId,
  },
};

const executeTool = async (
  toolSet: ToolSet,
  name: string,
  args: Record<string, unknown>,
) => {
  const selectedTool = toolSet[name] as unknown as {
    execute: (parameters: Record<string, unknown>) => Promise<unknown>;
  };

  return selectedTool.execute(args);
};

const createService = () => {
  const queryService = {
    listThreads: jest.fn().mockResolvedValue({ edges: [], pageInfo: {} }),
    getThreadSummary: jest.fn().mockResolvedValue({
      id: explicitThreadId,
      creator: { id: creatorId },
    }),
  };
  const proposalService = {
    generateReplyProposal: jest.fn().mockResolvedValue({
      body: { markdown: 'Thanks!', blocknote: null },
    }),
    getReplyBriefing: jest.fn().mockResolvedValue({
      thread: { id: threadId },
    }),
  };
  const mutationService = {
    updateMyahInboxThread: jest.fn().mockResolvedValue({ id: threadId }),
    saveMyahInboxDraft: jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 4,
      body: { markdown: 'Thanks!', blocknote: null },
    }),
  };
  const replySendService = {
    getReadiness: jest
      .fn()
      .mockResolvedValue({ status: 'READY', reason: null }),
    getStatus: jest.fn().mockResolvedValue({ status: 'PENDING' }),
  };
  const replyContextOptionsService = {
    listOptions: jest.fn().mockResolvedValue({
      edges: [{ cursor: 'cursor', node: { id: campaignId, name: 'Launch' } }],
      pageInfo: { hasNextPage: false, endCursor: 'cursor' },
      generalAvailable: true,
      defaultContext: null,
    }),
  };
  const resolvedContext = {
    target: {
      channel: ReplyChannel.EMAIL,
      deliveryTargetId: explicitThreadId,
      contactAnchor: { kind: 'CREATOR', id: creatorId },
      creatorId,
    },
    selected: campaignContext,
    state: 'READY',
    contextFingerprint,
    campaignName: 'Launch',
  };
  const replyContextService = {
    resolveForAction: jest.fn().mockResolvedValue(resolvedContext),
  };
  const replyContextDraftService = {
    read: jest.fn().mockResolvedValue({
      revision: 3,
      body: { markdown: 'Campaign draft', blocknote: null },
    }),
  };

  const Service = MyahInboxToolWorkspaceService as unknown as new (
    ...args: unknown[]
  ) => MyahInboxToolWorkspaceService;

  return {
    queryService,
    proposalService,
    mutationService,
    replySendService,
    replyContextOptionsService,
    replyContextService,
    replyContextDraftService,
    resolvedContext,
    service: new Service(
      queryService as never,
      proposalService as never,
      mutationService as never,
      replySendService as never,
      replyContextOptionsService as never,
      replyContextService as never,
      replyContextDraftService as never,
    ),
  };
};

describe('MyahInboxToolWorkspaceService', () => {
  it('exposes the full Inbox read, proposal, triage, draft, readiness, and status tool set without a selection', () => {
    const { service } = createService();

    const toolSet = service.generateMyahInboxTools({
      ...context,
      myahInboxSelection: undefined,
    } as never);

    expect(Object.keys(toolSet).sort()).toEqual([
      'generate_myah_inbox_reply_proposal',
      'get_myah_inbox_reply_send_readiness',
      'get_myah_inbox_reply_send_status',
      'get_myah_inbox_thread_context',
      'list_myah_inbox_reply_contexts',
      'save_myah_inbox_reply_draft',
      'search_myah_inbox_threads',
      'update_myah_inbox_thread',
    ]);
    expect(toolSet).not.toHaveProperty('send_myah_inbox_reply');
  });

  it('uses the proposal service for public thread context', async () => {
    const { service, proposalService } = createService();
    const publicBriefing = { thread: { id: explicitThreadId } };
    proposalService.getReplyBriefing.mockResolvedValue(publicBriefing);
    const toolSet = service.generateMyahInboxTools({
      ...context,
      myahInboxSelection: undefined,
    } as never);

    await expect(
      executeTool(toolSet, 'get_myah_inbox_thread_context', {
        messageThreadId: explicitThreadId,
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Retrieved Myah Inbox thread context',
      result: publicBriefing,
    });

    expect(proposalService.getReplyBriefing).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId: explicitThreadId,
    });
  });

  it('lists only server-authorized reply contexts for an exact thread', async () => {
    const { service, queryService, replyContextOptionsService } =
      createService();
    const toolSet = service.generateMyahInboxTools(context as never);

    await executeTool(toolSet, 'list_myah_inbox_reply_contexts', {
      messageThreadId: explicitThreadId,
      first: 10,
      after: 'cursor',
    });

    expect(queryService.getThreadSummary).toHaveBeenCalledWith({
      ...requestContext,
      threadId: explicitThreadId,
    });
    expect(replyContextOptionsService.listOptions).toHaveBeenCalledWith({
      ...requestContext,
      expectedWorkspaceId: workspaceId,
      target,
      first: 10,
      after: 'cursor',
    });
  });

  it('reads the exact selected context with its fingerprint and independent draft', async () => {
    const {
      service,
      proposalService,
      replyContextService,
      replyContextDraftService,
      resolvedContext,
    } = createService();
    const briefing = { thread: { id: explicitThreadId }, campaign: {} };
    proposalService.getReplyBriefing.mockResolvedValue(briefing);
    const toolSet = service.generateMyahInboxTools(context as never);

    await expect(
      executeTool(toolSet, 'get_myah_inbox_thread_context', {
        messageThreadId: explicitThreadId,
        replyContext: campaignContext,
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Retrieved Myah Inbox thread context',
      result: {
        ...briefing,
        selectedContext: {
          ...campaignContext,
          campaignName: 'Launch',
          contextFingerprint,
          draftRevision: 3,
          draftBody: { markdown: 'Campaign draft', blocknote: null },
        },
      },
    });
    expect(replyContextService.resolveForAction).toHaveBeenCalledWith({
      ...requestContext,
      target,
      contactIdentity: { kind: 'creator', recordId: creatorId },
      replyContext: campaignContext,
    });
    expect(replyContextDraftService.read).toHaveBeenCalledWith({
      workspaceId,
      contactAnchorKind: 'CREATOR',
      contactAnchorId: creatorId,
      channel: ReplyChannel.EMAIL,
      deliveryTargetId: explicitThreadId,
      context: campaignContext,
    });
    expect(proposalService.getReplyBriefing).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId: explicitThreadId,
      selectedContext: resolvedContext,
    });
  });

  it('rejects explicit General reads when General is unavailable', async () => {
    const { service, replyContextOptionsService, replyContextService } =
      createService();
    replyContextOptionsService.listOptions.mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      generalAvailable: false,
      defaultContext: null,
    });
    const toolSet = service.generateMyahInboxTools(context as never);

    await expect(
      executeTool(toolSet, 'get_myah_inbox_thread_context', {
        messageThreadId: explicitThreadId,
        replyContext: { kind: ReplyContextKind.GENERAL },
      }),
    ).rejects.toEqual(
      new ForbiddenException('General reply context is not available'),
    );
    expect(replyContextService.resolveForAction).not.toHaveBeenCalled();
  });

  it('uses the matching current-workspace selection when a messageThreadId is omitted', async () => {
    const { service, proposalService } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);

    await executeTool(toolSet, 'generate_myah_inbox_reply_proposal', {
      operatorInstructions: 'Thank them and confirm Tuesday.',
    });

    expect(proposalService.generateReplyProposal).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId,
      operatorInstructions: 'Thank them and confirm Tuesday.',
    });
  });

  it('prefers an explicit messageThreadId over the current-workspace selection', async () => {
    const { service, mutationService } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);

    await executeTool(toolSet, 'update_myah_inbox_thread', {
      messageThreadId: explicitThreadId,
      creatorId,
    });

    expect(mutationService.updateMyahInboxThread).toHaveBeenCalledWith({
      ...requestContext,
      threadId: explicitThreadId,
      creatorId,
    });
  });

  it('delegates the exact selected context and freshness fingerprint to the contextual save', async () => {
    const { service, mutationService } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);

    await executeTool(toolSet, 'save_myah_inbox_reply_draft', {
      messageThreadId: explicitThreadId,
      replyContext: campaignContext,
      expectedContextFingerprint: contextFingerprint,
      expectedRevision: 2,
      body: { markdown: 'Campaign draft', blocknote: null },
    });

    expect(mutationService.saveMyahInboxDraft).toHaveBeenCalledWith({
      ...requestContext,
      expectedWorkspaceId: workspaceId,
      target,
      replyContext: campaignContext,
      expectedContextFingerprint: contextFingerprint,
      proposalContextFingerprint: null,
      expectedRevision: 2,
      body: { markdown: 'Campaign draft', blocknote: null },
    });
  });

  it('requires explicit IDs for mutations and reply-send reads even with a selection', async () => {
    const { service } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);
    const invalidCalls = [
      ['update_myah_inbox_thread', { creatorId }],
      [
        'save_myah_inbox_reply_draft',
        {
          expectedRevision: 0,
          body: { markdown: 'Draft', blocknote: null },
        },
      ],
      ['get_myah_inbox_reply_send_readiness', {}],
      ['get_myah_inbox_reply_send_status', { receiptId }],
    ] as const;

    for (const [name, input] of invalidCalls) {
      await expect(executeTool(toolSet, name, input)).rejects.toEqual(
        new BadRequestException(
          'A valid Myah Inbox MessageThread ID is required',
        ),
      );
    }
  });

  it('ignores a cross-workspace selection instead of treating it as authorization', async () => {
    const { service } = createService();
    const toolSet = service.generateMyahInboxTools({
      ...context,
      myahInboxSelection: {
        workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea420',
        threadId,
      },
    } as never);

    await expect(
      executeTool(toolSet, 'get_myah_inbox_thread_context', {}),
    ).rejects.toEqual(
      new BadRequestException(
        'A valid Myah Inbox MessageThread ID is required',
      ),
    );
  });

  it('delegates search to the authenticated user request context and describes its latest-message coverage', async () => {
    const { service, queryService } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);

    await executeTool(toolSet, 'search_myah_inbox_threads', {
      first: 10,
      search: 'Ada',
      campaignId: creatorId,
    });

    expect(queryService.listThreads).toHaveBeenCalledWith({
      ...requestContext,
      first: 10,
      search: 'Ada',
      campaignId: creatorId,
    });
    expect(
      (toolSet.search_myah_inbox_threads as { description: string })
        .description,
    ).toContain('latest visible message');
  });

  it('delegates a draft CAS conflict exactly once and returns the current draft result unchanged', async () => {
    const { service, mutationService } = createService();
    const conflict = {
      status: 'CONFLICT',
      revision: 7,
      body: { markdown: 'Current draft', blocknote: null },
    };
    mutationService.saveMyahInboxDraft.mockResolvedValue(conflict);
    const toolSet = service.generateMyahInboxTools(context as never);

    await expect(
      executeTool(toolSet, 'save_myah_inbox_reply_draft', {
        messageThreadId: explicitThreadId,
        replyContext: campaignContext,
        expectedContextFingerprint: contextFingerprint,
        expectedRevision: 6,
        body: { markdown: 'New draft', blocknote: null },
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Saved Myah Inbox reply draft',
      result: conflict,
    });

    expect(mutationService.saveMyahInboxDraft).toHaveBeenCalledTimes(1);
    expect(mutationService.saveMyahInboxDraft).toHaveBeenCalledWith({
      ...requestContext,
      expectedWorkspaceId: workspaceId,
      target,
      replyContext: campaignContext,
      expectedContextFingerprint: contextFingerprint,
      proposalContextFingerprint: null,
      expectedRevision: 6,
      body: { markdown: 'New draft', blocknote: null },
    });
  });

  it('strictly validates mutation and reply-send tool inputs', () => {
    const { service } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);
    const listContextsTool = toolSet['list_myah_inbox_reply_contexts'];
    const threadContextTool = toolSet['get_myah_inbox_thread_context'];
    const saveDraftTool = toolSet['save_myah_inbox_reply_draft'];
    const updateThreadTool = toolSet['update_myah_inbox_thread'];
    const readinessTool = toolSet['get_myah_inbox_reply_send_readiness'];
    const statusTool = toolSet['get_myah_inbox_reply_send_status'];

    expect(
      z.safeParse(saveDraftTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
        replyContext: campaignContext,
        expectedContextFingerprint: contextFingerprint,
        expectedRevision: 0,
        body: { markdown: 'Draft', blocknote: null },
      }).success,
    ).toBe(true);
    for (const invalidInput of [
      {
        messageThreadId: threadId,
        expectedRevision: 0,
        body: { markdown: 'Draft', blocknote: null },
      },
      {
        messageThreadId: threadId,
        replyContext: { kind: ReplyContextKind.GENERAL, campaignId },
        expectedContextFingerprint: contextFingerprint,
        expectedRevision: 0,
        body: { markdown: 'Draft', blocknote: null },
      },
      {
        messageThreadId: threadId,
        replyContext: campaignContext,
        expectedContextFingerprint: 'A'.repeat(64),
        expectedRevision: 0,
        body: { markdown: 'Draft', blocknote: null },
      },
      {
        messageThreadId: threadId,
        replyContext: campaignContext,
        expectedContextFingerprint: contextFingerprint,
        expectedRevision: 0,
        body: { markdown: 'Draft', blocknote: 'not supported by this tool' },
      },
    ]) {
      expect(
        z.safeParse(saveDraftTool.inputSchema as z.ZodType, invalidInput)
          .success,
      ).toBe(false);
    }
    expect(
      z.safeParse(listContextsTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
        first: 101,
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(threadContextTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
        replyContext: { kind: ReplyContextKind.CAMPAIGN },
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(threadContextTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
        replyContext: { kind: ReplyContextKind.GENERAL, unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(updateThreadTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
        creatorId,
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(updateThreadTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
        inboxState: MyahInboxState.CLOSED,
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(updateThreadTool.inputSchema as z.ZodType, {
        messageThreadId: threadId,
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(saveDraftTool.inputSchema as z.ZodType, {
        expectedRevision: 0,
        body: { markdown: 'Draft', blocknote: null },
      }).success,
    ).toBe(false);
    expect(
      z.safeParse(readinessTool.inputSchema as z.ZodType, {}).success,
    ).toBe(false);
    expect(
      z.safeParse(statusTool.inputSchema as z.ZodType, { receiptId }).success,
    ).toBe(false);
  });

  it('delegates readiness and status without exposing send execution', async () => {
    const { service, replySendService } = createService();
    const toolSet = service.generateMyahInboxTools(context as never);

    await executeTool(toolSet, 'get_myah_inbox_reply_send_readiness', {
      messageThreadId: explicitThreadId,
    });
    await executeTool(toolSet, 'get_myah_inbox_reply_send_status', {
      messageThreadId: explicitThreadId,
      receiptId,
    });

    expect(replySendService.getReadiness).toHaveBeenCalledWith({
      ...requestContext,
      threadId: explicitThreadId,
    });
    expect(replySendService.getStatus).toHaveBeenCalledWith({
      ...requestContext,
      threadId: explicitThreadId,
      receiptId,
    });
  });
});
