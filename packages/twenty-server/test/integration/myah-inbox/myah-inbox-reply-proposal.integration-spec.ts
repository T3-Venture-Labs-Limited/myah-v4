import { type LanguageModel, type ToolSet } from 'ai';
import gql from 'graphql-tag';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';

import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

import {
  cleanupMyahInboxTask7Fixture,
  getDomainService,
  seedMyahInboxTask7Fixture,
  type MyahInboxTask7CleanupEvidence,
  type MyahInboxTask7Fixture,
} from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

type WorkspaceOrmManager = {
  executeInWorkspaceContext: <T>(
    operation: () => Promise<T>,
    authContext: WorkspaceAuthContext,
  ) => Promise<T>;
  getRepository: (
    workspaceId: string,
    objectName: string,
    options: { shouldBypassPermissionChecks: boolean },
  ) => Promise<{ count: () => Promise<number> }>;
};

const generateProposalMutation = gql`
  mutation Task7GenerateProposal($input: GenerateMyahInboxReplyProposalInput!) {
    generateMyahInboxReplyProposal(input: $input) {
      subject
      body {
        markdown
        blocknote
      }
    }
  }
`;

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
    threadId: fixture.threadIds.draft,
    operatorInstructions: 'Confirm Tuesday.',
  });
};

const countNativeMessages = async () => {
  const workspaceOrmManager = getDomainService<WorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );

  return workspaceOrmManager.executeInWorkspaceContext(async () => {
    const messageRepository = await workspaceOrmManager.getRepository(
      SEED_APPLE_WORKSPACE_ID,
      'message',
      { shouldBypassPermissionChecks: true },
    );

    return messageRepository.count();
  }, buildSystemAuthContext(SEED_APPLE_WORKSPACE_ID));
};

let cleanupFixture: () => Promise<MyahInboxTask7CleanupEvidence>;
let fixture: MyahInboxTask7Fixture;

beforeAll(async () => {
  cleanupFixture = () =>
    cleanupMyahInboxTask7Fixture({
      operatorAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
    });
  fixture = await seedMyahInboxTask7Fixture({
    operatorAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
  });
});

afterAll(async () => {
  expect(await cleanupFixture()).toEqual({
    fixtureGraphqlRecordsRemaining: [],
    fixtureChannelIdsRemaining: [],
    foreignCreatorRemaining: false,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Myah Inbox reply proposal Nest integration', () => {
  it('uses one resolver/tool service graph without provider dispatch, send, Message persistence, or Message creation', async () => {
    const toolService = getDomainService<{
      generateMyahInboxTools: (context: never) => ToolSet;
    }>('MyahInboxToolWorkspaceService');
    const proposalService = getDomainService<{
      generateReplyProposal: (
        input: Record<string, unknown>,
      ) => Promise<typeof proposal>;
    }>('MyahInboxReplyProposalService');
    const actorContextService = getDomainService<{
      buildUserAndAgentActorContext: (
        userWorkspaceId: string,
        workspaceId: string,
      ) => Promise<{
        authContext: WorkspaceAuthContext;
        roleId: string;
        userId: string;
        userWorkspaceId: string;
        actorContext: Record<string, unknown>;
      }>;
    }>('AgentActorContextService');
    const modelRegistryService = getDomainService<{
      getDefaultSpeedModel: (...args: never[]) => unknown;
      getEffectiveModelConfig: (...args: never[]) => unknown;
    }>('AiModelRegistryService');
    const brandBrainPreflightService = getDomainService<{
      run: (...args: never[]) => Promise<unknown>;
    }>('BrandBrainPreflightService');
    const billingUsageService = getDomainService<{
      hasAvailableCreditsOrThrow: (...args: never[]) => Promise<void>;
    }>('BillingUsageService');
    const aiBillingService = getDomainService<{
      calculateAndBillUsage: (...args: never[]) => Promise<void>;
    }>('AiBillingService');
    const managedModelService = getDomainService<{
      isManagedModel: (...args: never[]) => boolean;
      wrapModel: (input: { model: LanguageModel }) => LanguageModel;
    }>('ManagedOpenRouterModelService');
    const sendEmailService = getDomainService<{
      sendComposedEmail: (...args: never[]) => Promise<unknown>;
    }>('SendEmailService');
    const providerDispatchService = getDomainService<{
      sendMessage: (...args: never[]) => Promise<unknown>;
    }>('MessagingMessageOutboundService');
    const sentMessagePersistenceService = getDomainService<{
      persistSentMessage: (...args: never[]) => Promise<unknown>;
    }>('SentMessagePersistenceService');
    const actor = await actorContextService.buildUserAndAgentActorContext(
      USER_WORKSPACE_DATA_SEED_IDS.JANE,
      SEED_APPLE_WORKSPACE_ID,
    );

    if (!isUserAuthContext(actor.authContext) || !actor.authContext.user) {
      throw new Error('Task 7 proposal integration requires Jane user auth');
    }

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

    jest.spyOn(brandBrainPreflightService, 'run').mockResolvedValue({
      required: true,
      called: true,
      contextPart: '<brand_brain_context>Warm voice.</brand_brain_context>',
    } as never);
    jest.spyOn(modelRegistryService, 'getDefaultSpeedModel').mockReturnValue({
      modelId: 'fake/reply-model',
      model,
      providerName: 'fake',
      sdkPackage: 'fake',
    });
    jest
      .spyOn(modelRegistryService, 'getEffectiveModelConfig')
      .mockReturnValue({ modelId: 'fake/reply-model' } as never);
    jest
      .spyOn(billingUsageService, 'hasAvailableCreditsOrThrow')
      .mockResolvedValue(undefined);
    jest
      .spyOn(aiBillingService, 'calculateAndBillUsage')
      .mockResolvedValue(undefined);
    jest.spyOn(managedModelService, 'isManagedModel').mockReturnValue(false);
    jest
      .spyOn(managedModelService, 'wrapModel')
      .mockImplementation(({ model: inputModel }) => inputModel);

    const proposalServiceInvocation = jest.spyOn(
      proposalService,
      'generateReplyProposal',
    );
    const sendEmailBoundary = jest.spyOn(sendEmailService, 'sendComposedEmail');
    const providerDispatchBoundary = jest.spyOn(
      providerDispatchService,
      'sendMessage',
    );
    const messagePersistenceBoundary = jest.spyOn(
      sentMessagePersistenceService,
      'persistSentMessage',
    );
    const beforeMessageCount = await countNativeMessages();
    const directResponse = await makeGraphqlAPIRequest(
      {
        query: generateProposalMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.draft,
            operatorInstructions: 'Confirm Tuesday.',
          },
        },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    expect(directResponse.body.errors).toBeUndefined();
    const directResult =
      directResponse.body.data.generateMyahInboxReplyProposal;
    const toolSet = toolService.generateMyahInboxTools({
      workspaceId: SEED_APPLE_WORKSPACE_ID,
      roleId: actor.roleId,
      rolePermissionConfig: { unionOf: [actor.roleId] },
      authContext: actor.authContext,
      userId: actor.userId,
      userWorkspaceId: actor.userWorkspaceId,
      actorContext: actor.actorContext,
    } as never);
    const toolResult = await executeProposalTool(toolSet);
    const afterMessageCount = await countNativeMessages();

    expect(directResult).toEqual(proposal);
    expect(toolResult).toEqual({
      success: true,
      message: 'Generated Myah Inbox reply proposal',
      result: proposal,
    });
    expect(toolResult.result).toEqual(directResult);
    expect(proposalServiceInvocation).toHaveBeenCalledTimes(2);
    expect(sendEmailBoundary).not.toHaveBeenCalled();
    expect(providerDispatchBoundary).not.toHaveBeenCalled();
    expect(messagePersistenceBoundary).not.toHaveBeenCalled();
    expect(afterMessageCount).toBe(beforeMessageCount);
    expect(doGenerate).toHaveBeenCalledTimes(2);
    const modelRequests = doGenerate.mock.calls.map((call) =>
      JSON.stringify(call),
    );

    expect(modelRequests).toHaveLength(2);
    for (const modelRequest of modelRequests) {
      expect(modelRequest).toContain(fixture.markers.draftPriorBody);
      expect(modelRequest).toContain('Task 7 shared draft source message');
      expect(modelRequest.indexOf(fixture.markers.draftPriorBody)).toBeLessThan(
        modelRequest.indexOf('Task 7 shared draft source message'),
      );
      expect(modelRequest).not.toContain(fixture.markers.draftMaskedSubject);
      expect(modelRequest).not.toContain(fixture.markers.draftMaskedBody);
      expect(modelRequest).not.toContain(fixture.markers.draftHiddenSubject);
      expect(modelRequest).not.toContain(fixture.markers.draftHiddenBody);
    }
  });
});
