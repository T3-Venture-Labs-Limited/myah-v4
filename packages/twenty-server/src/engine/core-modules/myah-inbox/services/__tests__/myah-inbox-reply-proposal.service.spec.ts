import { type LanguageModel } from 'ai';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';

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
} as unknown as UserWorkspaceAuthContext;

const thread = {
  id: threadId,
  lastActivityAt: '2026-07-24T10:00:00.000Z',
  subject: 'Partnership timing',
  lastMessagePreview: 'Can we launch next Tuesday?',
  lastMessageSender: 'creator@example.com',
  state: 'NEEDS_REPLY',
  snoozedUntil: null,
  creator: { id: '20202020-f7c5-4e2f-a44a-240b2d3a9d02', name: 'Ada Creator' },
  campaign: { id: '20202020-f7c5-4e2f-a44a-240b2d3a9d03', name: 'Autumn Launch' },
  inboxOwner: { id: workspaceMemberId, name: 'Owner' },
};

const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 8, text: 8, reasoning: 0 },
};

const createFakeModel = (modelOutput: unknown) => {
  const doGenerate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(modelOutput) }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
  });

  return {
    doGenerate,
    model: {
      specificationVersion: 'v3',
      provider: 'fake',
      modelId: 'fake/reply-model',
      supportedUrls: {},
      doGenerate,
      doStream: jest.fn(),
    } as unknown as LanguageModel,
  };
};

const createService = (modelOutput: unknown) => {
  const fakeModel = createFakeModel(modelOutput);
  const queryService = {
    getThreadSummary: jest.fn().mockResolvedValue(thread),
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
  const brandBrainPreflightService = {
    run: jest.fn().mockResolvedValue({
      required: true,
      called: true,
      contextPart: '<brand_brain_context>Use a warm, concise voice.</brand_brain_context>',
    }),
  };
  const aiModelRegistryService = {
    getDefaultSpeedModel: jest.fn().mockReturnValue({
      modelId: 'fake/reply-model',
      model: fakeModel.model,
      providerName: 'fake',
      sdkPackage: 'fake',
    }),
    getEffectiveModelConfig: jest.fn().mockReturnValue({
      modelId: 'fake/reply-model',
    }),
  };
  const billingUsageService = {
    hasAvailableCreditsOrThrow: jest.fn().mockResolvedValue(undefined),
  };
  const aiBillingService = {
    calculateAndBillUsage: jest.fn().mockResolvedValue(undefined),
  };
  const managedOpenRouterModelService = {
    isManagedModel: jest.fn().mockReturnValue(false),
    wrapModel: jest.fn(({ model }: { model: LanguageModel }) => model),
  };
  const draftRepositoryUpdate = jest.fn();
  const messageProviderSend = jest.fn();
  const service = new MyahInboxReplyProposalService(
    queryService as never,
    actorContextService as never,
    brandBrainPreflightService as never,
    aiModelRegistryService as never,
    billingUsageService as never,
    aiBillingService as never,
    managedOpenRouterModelService as never,
  );

  return {
    service,
    fakeModel,
    queryService,
    actorContextService,
    brandBrainPreflightService,
    aiModelRegistryService,
    billingUsageService,
    aiBillingService,
    managedOpenRouterModelService,
    draftRepositoryUpdate,
    messageProviderSend,
  };
};

const request = {
  authContext: userAuthContext,
  threadId,
  operatorInstructions: 'Confirm Tuesday and ask for final assets.',
};

describe('MyahInboxReplyProposalService', () => {
  it('loads the policy-visible selected thread and Brand Brain context before returning only the validated proposal', async () => {
    const proposal = {
      subject: 'Re: Partnership timing',
      body: {
        markdown: 'Tuesday works for us. Please send the final assets.',
        blocknote: null,
      },
    };
    const setup = createService(proposal);

    const result = await setup.service.generateReplyProposal(request);

    expect(result).toEqual(proposal);

    expect(setup.actorContextService.buildUserAndAgentActorContext).toHaveBeenCalledWith(
      userWorkspaceId,
      workspaceId,
    );
    expect(setup.queryService.getThreadSummary).toHaveBeenCalledWith({
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
      threadId,
    });
    expect(setup.brandBrainPreflightService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUserMessageText: expect.stringContaining('Ada Creator'),
        toolContext: expect.objectContaining({
          workspaceId,
          roleId,
          userId,
          userWorkspaceId,
          authContext: userAuthContext,
        }),
      }),
    );
    expect(setup.fakeModel.doGenerate).toHaveBeenCalledTimes(1);
    expect(setup.billingUsageService.hasAvailableCreditsOrThrow).toHaveBeenCalledWith(
      workspaceId,
    );
    expect(setup.aiBillingService.calculateAndBillUsage).toHaveBeenCalledTimes(1);
    expect(setup.draftRepositoryUpdate).not.toHaveBeenCalled();
    expect(setup.messageProviderSend).not.toHaveBeenCalled();
    expect(Object.keys(result)).toEqual(['subject', 'body']);
  });

  it('lets the real Brand Brain preflight extract the operator-provided permitted brand', async () => {
    const proposal = {
      subject: 'Re: Partnership timing',
      body: { markdown: 'Warm reply', blocknote: null },
    };
    const setup = createService(proposal);
    const resolveAndExecute = jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      result: {
        brandSlug: 'acme-beauty-labs',
        pageCount: 1,
        hasRoot: true,
        hasIndex: true,
        hasLog: true,
        contextMarkdown: 'Use a warm voice.',
      },
    });
    const realPreflight = new BrandBrainPreflightService({
      get: jest.fn().mockReturnValue({ resolveAndExecute }),
    } as never);

    setup.brandBrainPreflightService.run.mockImplementation((input) =>
      realPreflight.run(input as never),
    );

    await setup.service.generateReplyProposal({
      ...request,
      operatorInstructions:
        'Write creator outreach for Acme Beauty Labs with a warm voice.',
    });

    expect(resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      expect.objectContaining({ brandNameOrSlug: 'Acme Beauty Labs' }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('rejects malformed structured model output instead of returning or persisting it', async () => {
    const setup = createService({
      subject: 'Missing body',
      reasoning: 'raw chain of thought',
    });

    await expect(
      setup.service.generateReplyProposal(request),
    ).rejects.toThrow();
    expect(setup.draftRepositoryUpdate).not.toHaveBeenCalled();
    expect(setup.messageProviderSend).not.toHaveBeenCalled();
  });

  it('fails closed when the resolved current actor does not match the requested user or workspace member', async () => {
    const setup = createService({
      subject: null,
      body: { markdown: 'Safe', blocknote: null },
    });

    await expect(
      setup.service.generateReplyProposal({
        ...request,
        authContext: {
          ...userAuthContext,
          user: { id: 'other-user' },
        } as unknown as UserWorkspaceAuthContext,
      }),
    ).rejects.toThrow();
    expect(setup.queryService.getThreadSummary).not.toHaveBeenCalled();
    expect(setup.fakeModel.doGenerate).not.toHaveBeenCalled();
  });
});
