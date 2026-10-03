import { type LanguageModel } from 'ai';
import gql from 'graphql-tag';

import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import {
  cleanupMyahInboxTask7Fixture,
  getDomainService,
  seedMyahInboxTask7Fixture,
  type MyahInboxTask7Fixture,
} from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const draftQuery = gql`
  query ReplyAgentDraft($input: MyahInboxReplyDraftInput!) {
    myahInboxReplyDraft(input: $input) {
      revision
      executionState
      incomingState
      bodyEdited
      body {
        markdown
      }
    }
  }
`;

const decision = {
  decision: 'REPLY',
  body: 'Thanks for getting back to us! Tuesday works for the shoot.',
  reason: '',
  invitationIncluded: false,
};

// Stubs only the model and billing boundaries; the agent, Inbox draft store
// and reply-context graph are the real Nest services.
const stubModel = (output: object) => {
  const registry = getDomainService<{
    getDefaultSpeedModel: (...args: never[]) => unknown;
    getEffectiveModelConfig: (...args: never[]) => unknown;
  }>('AiModelRegistryService');
  const managed = getDomainService<{
    isManagedModel: (...args: never[]) => boolean;
    wrapModel: (input: { model: LanguageModel }) => LanguageModel;
  }>('ManagedOpenRouterModelService');
  const doGenerate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(output) }],
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
    modelId: 'fake/reply-agent',
    supportedUrls: {},
    doGenerate,
    doStream: jest.fn(),
  } as unknown as LanguageModel;

  jest.spyOn(registry, 'getDefaultSpeedModel').mockReturnValue({
    modelId: 'fake/reply-agent',
    model,
    providerName: 'fake',
    sdkPackage: 'fake',
  });
  jest
    .spyOn(registry, 'getEffectiveModelConfig')
    .mockReturnValue({ modelId: 'fake/reply-agent' } as never);
  jest
    .spyOn(
      getDomainService<{
        hasAvailableCreditsOrThrow: (...args: never[]) => Promise<void>;
      }>('BillingUsageService'),
      'hasAvailableCreditsOrThrow',
    )
    .mockResolvedValue(undefined);
  jest
    .spyOn(
      getDomainService<{
        calculateAndBillUsage: (...args: never[]) => Promise<void>;
      }>('AiBillingService'),
      'calculateAndBillUsage',
    )
    .mockResolvedValue(undefined);
  jest.spyOn(managed, 'isManagedModel').mockReturnValue(false);
  jest
    .spyOn(managed, 'wrapModel')
    .mockImplementation(({ model: inputModel }) => inputModel);

  return doGenerate;
};

let fixture: MyahInboxTask7Fixture;

const clearAgentState = () =>
  Promise.all([
    global.testDataSource.query(
      `DELETE FROM core."myahAgentRun" WHERE "workspaceId" = $1 AND "creatorId" = $2`,
      [SEED_APPLE_WORKSPACE_ID, fixture.creatorId],
    ),
    global.testDataSource.query(
      `DELETE FROM core."myahInboxReplyContextDraft" WHERE "workspaceId" = $1 AND "deliveryTargetId" = $2`,
      [SEED_APPLE_WORKSPACE_ID, fixture.threadIds.sharedFallback],
    ),
  ]);

beforeAll(async () => {
  fixture = await seedMyahInboxTask7Fixture({
    operatorAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
  });
  await clearAgentState();
});

afterAll(async () => {
  await clearAgentState();
  await cleanupMyahInboxTask7Fixture({
    operatorAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Reply agent on an email thread', () => {
  it('writes a ready, unedited Inbox draft once per creator message', async () => {
    const doGenerate = stubModel(decision);
    const agent = getDomainService<{
      run: (input: Record<string, unknown>) => Promise<void>;
    }>('MyahReplyAgentService');
    const input = {
      workspaceId: SEED_APPLE_WORKSPACE_ID,
      channel: 'EMAIL',
      conversationRecordId: fixture.threadIds.sharedFallback,
    };

    // The fixture mail is older than the live window; regenerate is the
    // explicit "answer the latest message" path.
    await agent.run({ ...input, regenerate: true });
    await agent.run(input);

    expect(doGenerate).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(doGenerate.mock.calls[0][0].prompt);
    expect(prompt).toContain('Reference data — Conversation so far');

    const runs = await global.testDataSource.query(
      `SELECT status, channel, "campaignId", reason FROM core."myahAgentRun"
        WHERE "workspaceId" = $1 AND "conversationRecordId" = $2`,
      [SEED_APPLE_WORKSPACE_ID, fixture.threadIds.sharedFallback],
    );
    expect(runs).toEqual([
      expect.objectContaining({
        status: 'DRAFTED',
        channel: 'EMAIL',
        campaignId: null,
      }),
    ]);

    const response = await makeGraphqlAPIRequest(
      {
        query: draftQuery,
        variables: {
          input: {
            expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
            target: {
              channel: 'EMAIL',
              contactId: encodeMyahInboxContactId({
                workspaceId: SEED_APPLE_WORKSPACE_ID,
                identity: { kind: 'creator', recordId: fixture.creatorId },
              }),
              threadId: fixture.threadIds.sharedFallback,
            },
            replyContext: { kind: 'CAMPAIGN', campaignId: fixture.campaignId },
          },
        },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.myahInboxReplyDraft).toMatchObject({
      executionState: 'READY',
      incomingState: 'CURRENT',
      bodyEdited: false,
    });
    expect(
      response.body.data.myahInboxReplyDraft.body.markdown.startsWith(
        decision.body,
      ),
    ).toBe(true);
  });
});
