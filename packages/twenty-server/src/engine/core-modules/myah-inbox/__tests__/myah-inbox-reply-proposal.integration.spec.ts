import { type LanguageModel, type ToolSet } from 'ai';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const roleId = '20202020-0b5c-4178-bed7-d371f6411eab';
const workspace = { id: workspaceId };
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

const proposal = {
  subject: 'Re: Partnership timing',
  body: {
    markdown: 'Tuesday works. Please send the final assets.',
    blocknote: null,
  },
};

const executeProposalTool = async (toolSet: ToolSet) => {
  const selectedTool = toolSet[
    'generate_myah_inbox_reply_proposal'
  ] as unknown as {
    execute: (parameters: Record<string, unknown>) => Promise<{
      success: boolean;
      result?: typeof proposal;
    }>;
  };

  return selectedTool.execute({
    threadId,
    operatorInstructions: 'Confirm Tuesday.',
  });
};

describe('Myah Inbox reply proposal direct/tool integration', () => {
  it('returns the same validated proposal through GraphQL and the sidebar tool without changing the draft revision', async () => {
    let draftRevision = 7;
    const draftRepositoryUpdate = jest.fn(() => {
      draftRevision += 1;
    });
    const messageProviderSend = jest.fn();
    const doGenerate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(proposal) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 8, text: 8, reasoning: 0 },
      },
      warnings: [],
    });
    const model = {
      specificationVersion: 'v3',
      provider: 'fake',
      modelId: 'fake/reply-model',
      supportedUrls: {},
      doGenerate,
      doStream: jest.fn(),
    } as unknown as LanguageModel;
    const queryService = {
      getThreadSummary: jest.fn().mockResolvedValue({
        id: threadId,
        lastActivityAt: '2026-07-24T10:00:00.000Z',
        subject: 'Partnership timing',
        lastMessagePreview: 'Can we launch next Tuesday?',
        lastMessageSender: 'creator@example.com',
        state: 'NEEDS_REPLY',
        snoozedUntil: null,
        creator: { id: 'creator-id', name: 'Ada Creator' },
        campaign: { id: 'campaign-id', name: 'Autumn Launch' },
        inboxOwner: { id: workspaceMemberId, name: 'Owner' },
      }),
      listThreads: jest.fn(),
    };
    const actorContextService = {
      buildUserAndAgentActorContext: jest.fn().mockResolvedValue({
        actorContext: {
          source: 'AGENT',
          workspaceMemberId,
          name: 'Operator',
          context: {},
        },
        roleId,
        userId,
        userWorkspaceId,
        authContext: userAuthContext,
        userContext: {
          firstName: 'Operator',
          lastName: 'User',
          locale: 'en',
          timezone: null,
        },
      }),
    };
    const proposalService = new MyahInboxReplyProposalService(
      queryService as never,
      actorContextService as never,
      {
        run: jest.fn().mockResolvedValue({
          required: true,
          called: true,
          contextPart: '<brand_brain_context>Warm voice.</brand_brain_context>',
        }),
      } as never,
      {
        getDefaultSpeedModel: jest.fn().mockReturnValue({
          modelId: 'fake/reply-model',
          model,
          providerName: 'fake',
          sdkPackage: 'fake',
        }),
        getEffectiveModelConfig: jest
          .fn()
          .mockReturnValue({ modelId: 'fake/reply-model' }),
      } as never,
      {
        hasAvailableCreditsOrThrow: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        calculateAndBillUsage: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        isManagedModel: jest.fn().mockReturnValue(false),
        wrapModel: jest.fn(({ model: inputModel }) => inputModel),
      } as never,
    );
    const mutationService = {
      updateMyahInboxThread: jest.fn(),
      saveMyahInboxDraft: jest.fn(),
    };
    const resolver = new MyahInboxResolver(
      queryService as never,
      mutationService as never,
      proposalService,
    );
    const toolService = new MyahInboxToolWorkspaceService(proposalService);

    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);

    const directResult = await resolver.generateMyahInboxReplyProposal(
      { threadId, operatorInstructions: 'Confirm Tuesday.' },
      workspace as never,
      workspaceMemberId,
    );
    const toolSet = await toolService.generateMyahInboxTools({
      workspaceId,
      roleId,
      rolePermissionConfig: { unionOf: [roleId] },
      authContext: userAuthContext,
      userId,
      userWorkspaceId,
      actorContext: {
        source: 'AGENT',
        workspaceMemberId,
        name: 'Operator',
        context: {},
      },
    } as never);
    const toolResult = await executeProposalTool(toolSet);

    expect(directResult).toEqual(proposal);
    expect(toolResult).toEqual({
      success: true,
      message: 'Generated Myah Inbox reply proposal',
      result: proposal,
    });
    expect(toolResult.result).toEqual(directResult);
    expect(draftRevision).toBe(7);
    expect(draftRepositoryUpdate).not.toHaveBeenCalled();
    expect(mutationService.updateMyahInboxThread).not.toHaveBeenCalled();
    expect(mutationService.saveMyahInboxDraft).not.toHaveBeenCalled();
    expect(messageProviderSend).not.toHaveBeenCalled();
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });
});
