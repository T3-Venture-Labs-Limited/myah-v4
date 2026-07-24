import { type LanguageModel, type ToolSet } from 'ai';
import request from 'supertest';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { SendEmailService } from 'src/modules/messaging/message-outbound-manager/services/send-email.service';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

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

const serverUrl = 'http://127.0.0.1:3072';
const serverClient = request(serverUrl);

const getOperatorAccessToken = async () => {
  const origin = serverUrl;
  const loginResponse = await serverClient.post('/metadata').send({
    query: `
      mutation Login($email: String!, $password: String!, $origin: String!) {
        getLoginTokenFromCredentials(
          email: $email
          password: $password
          origin: $origin
        ) {
          loginToken {
            token
          }
        }
      }
    `,
    variables: {
      email: 'jane.austen@apple.dev',
      password: 'tim@apple.dev',
      origin,
    },
  });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.errors).toBeUndefined();

  const tokenResponse = await serverClient.post('/metadata').send({
    query: `
      mutation Exchange($loginToken: String!, $origin: String!) {
        getAuthTokensFromLoginToken(
          loginToken: $loginToken
          origin: $origin
        ) {
          tokens {
            accessOrWorkspaceAgnosticToken {
              token
            }
          }
        }
      }
    `,
    variables: {
      loginToken:
        loginResponse.body.data.getLoginTokenFromCredentials.loginToken.token,
      origin,
    },
  });

  expect(tokenResponse.status).toBe(200);
  expect(tokenResponse.body.errors).toBeUndefined();

  return tokenResponse.body.data.getAuthTokensFromLoginToken.tokens
    .accessOrWorkspaceAgnosticToken.token as string;
};

const countNativeMessages = async (accessToken: string) => {
  let after: string | undefined;
  let count = 0;
  let hasNextPage: boolean;

  do {
    const response = await serverClient
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `
          query Messages($first: Int, $after: String) {
            messages(first: $first, after: $after) {
              edges {
                node {
                  id
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        variables: { first: 100, after },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    count += response.body.data.messages.edges.length;
    hasNextPage = response.body.data.messages.pageInfo.hasNextPage;
    after = response.body.data.messages.pageInfo.endCursor ?? undefined;
  } while (hasNextPage);

  return count;
};

describe('Myah Inbox reply proposal direct/tool integration', () => {
  it('invokes the shared resolver/service graph without sending, calling a provider, persisting a Message, or changing Message count', async () => {
    const operatorAccessToken = await getOperatorAccessToken();
    const beforeMessageCount = await countNativeMessages(operatorAccessToken);
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
    const toolService = new MyahInboxToolWorkspaceService(proposalService);
    const mutationService = {
      updateMyahInboxThread: jest.fn(),
      saveMyahInboxDraft: jest.fn(),
    };
    const resolver = new MyahInboxResolver(
      queryService as never,
      mutationService as never,
      proposalService,
    );
    const proposalServiceInvocation = jest.spyOn(
      proposalService,
      'generateReplyProposal',
    );
    const sendEmailBoundary = jest.spyOn(
      SendEmailService.prototype,
      'sendComposedEmail',
    );
    const providerDispatchBoundary = jest.spyOn(
      MessagingMessageOutboundService.prototype,
      'sendMessage',
    );
    const messagePersistenceBoundary = jest.spyOn(
      SentMessagePersistenceService.prototype,
      'persistSentMessage',
    );

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

    const afterMessageCount = await countNativeMessages(operatorAccessToken);

    expect(directResult).toEqual(proposal);
    expect(toolResult).toEqual({
      success: true,
      message: 'Generated Myah Inbox reply proposal',
      result: proposal,
    });
    expect(toolResult.result).toEqual(directResult);
    expect(proposalServiceInvocation).toHaveBeenCalledTimes(2);
    expect(mutationService.updateMyahInboxThread).not.toHaveBeenCalled();
    expect(mutationService.saveMyahInboxDraft).not.toHaveBeenCalled();
    expect(sendEmailBoundary).not.toHaveBeenCalled();
    expect(providerDispatchBoundary).not.toHaveBeenCalled();
    expect(messagePersistenceBoundary).not.toHaveBeenCalled();
    expect(afterMessageCount).toBe(beforeMessageCount);
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });
});
