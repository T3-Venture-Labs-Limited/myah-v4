import { randomUUID } from 'node:crypto';

import { type LanguageModel, type ToolSet } from 'ai';
import gql from 'graphql-tag';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

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

const readContextQuery = gql`
  query Task7ReadContext($input: MyahInboxReplyDraftInput!) {
    myahInboxReplyDraft(input: $input) {
      resolvedContext {
        contextFingerprint
      }
    }
  }
`;

const draftStateQuery = gql`
  query Task7DraftState($input: MyahInboxReplyDraftInput!) {
    myahInboxReplyDraft(input: $input) {
      revision
      executionState
      incomingState
      bodyEdited
      resolvedContext {
        contextFingerprint
      }
    }
  }
`;

const saveDraftMutation = gql`
  mutation Task7SaveDraft($input: SaveMyahInboxDraftInput!) {
    saveMyahInboxDraft(input: $input) {
      status
      revision
    }
  }
`;

const reviewMutation = gql`
  mutation Task7Review($input: ReviewMyahInboxReplyContextInput!) {
    reviewMyahInboxReplyContext(input: $input) {
      revision
      executionState
    }
  }
`;

const sendReadinessQuery = gql`
  query Task7SendReadiness($input: MyahInboxReplyDraftInput!) {
    myahInboxReplySendReadiness(input: $input) {
      status
    }
  }
`;

const generateWithFingerprintMutation = gql`
  mutation Task7GenerateWithFingerprint(
    $input: GenerateMyahInboxReplyProposalInput!
  ) {
    generateMyahInboxReplyProposal(input: $input) {
      contextFingerprint
      body {
        markdown
        blocknote
      }
    }
  }
`;

const sendMutation = gql`
  mutation Task7Send($input: SendMyahInboxReplyInput!) {
    sendMyahInboxReply(input: $input) {
      outcome
    }
  }
`;

const generateProposalMutation = gql`
  mutation Task7GenerateProposal($input: GenerateMyahInboxReplyProposalInput!) {
    generateMyahInboxReplyProposal(input: $input) {
      body {
        markdown
        blocknote
      }
    }
  }
`;

const proposal = {
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

// Stubs only model/billing/brand boundaries; the resolver/service graph is real.
const stubProposalModel = () => {
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

  return doGenerate;
};

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

    const doGenerate = stubProposalModel();
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
    const replyTarget = {
      channel: 'EMAIL',
      contactId: encodeMyahInboxContactId({
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        identity: { kind: 'creator', recordId: fixture.creatorId },
      }),
      threadId: fixture.threadIds.draft,
    };
    const replyContext = { kind: 'CAMPAIGN', campaignId: fixture.campaignId };
    const contextResponse = await makeGraphqlAPIRequest(
      {
        query: readContextQuery,
        variables: {
          input: {
            expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
            target: replyTarget,
            replyContext,
          },
        },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    expect(contextResponse.body.errors).toBeUndefined();
    const expectedContextFingerprint =
      contextResponse.body.data.myahInboxReplyDraft.resolvedContext
        .contextFingerprint;
    const directResponse = await makeGraphqlAPIRequest(
      {
        query: generateProposalMutation,
        variables: {
          input: {
            expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
            target: replyTarget,
            replyContext,
            expectedContextFingerprint,
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
      myahInboxSelection: {
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        threadId: fixture.threadIds.draft,
      },
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

  it('fails closed at generation, apply, review and send when a readable inbound arrives, without bumping the draft revision', async () => {
    const doGenerate = stubProposalModel();
    const sendEmailService = getDomainService<{
      sendComposedEmail: (...args: never[]) => Promise<unknown>;
    }>('SendEmailService');
    const providerDispatchService = getDomainService<{
      sendMessage: (...args: never[]) => Promise<unknown>;
    }>('MessagingMessageOutboundService');
    // Guard rails: a wrong assumption must never reach a provider.
    const sendEmailBoundary = jest
      .spyOn(sendEmailService, 'sendComposedEmail')
      .mockRejectedValue(new Error('provider disabled in test'));
    const providerDispatchBoundary = jest
      .spyOn(providerDispatchService, 'sendMessage')
      .mockRejectedValue(new Error('provider disabled in test'));
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    const threadId = fixture.threadIds.draft;
    const [source] = await global.testDataSource.query<
      Array<{ channelId: string; threadExternalId: string; handle: string }>
    >(
      // pi-lens-ignore: sql-injection, no-sql-in-code
      `SELECT association."messageChannelId" AS "channelId",
              association."messageThreadExternalId" AS "threadExternalId",
              participant.handle
       FROM "${schema}".message message
       JOIN "${schema}"."messageChannelMessageAssociation" association
         ON association."messageId"=message.id AND association."deletedAt" IS NULL
       JOIN "${schema}"."messageParticipant" participant
         ON participant."messageId"=message.id AND participant.role='FROM'
       WHERE message."messageThreadId"=$1 AND association.direction='INCOMING'
       ORDER BY message."receivedAt" DESC LIMIT 1`,
      [threadId],
    );
    expect(source).toBeDefined();
    const inserted: string[] = [];
    const addInbound = async (receivedAt: string) => {
      const id = randomUUID();
      inserted.push(id);
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `INSERT INTO "${schema}".message (id,"messageThreadId","receivedAt",subject,text,"isDraft")
         VALUES ($1,$2,$3,'MYAH-415 arrival','A new creator message',false)`,
        [id, threadId, receivedAt],
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."messageChannelMessageAssociation"
           (id,"messageId","messageChannelId","messageExternalId","messageThreadExternalId",direction)
         VALUES ($1,$2,$3,$4,$5,'INCOMING')`,
        [
          randomUUID(),
          id,
          source.channelId,
          `arrival-${id}`,
          source.threadExternalId,
        ],
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."messageParticipant" (id,"messageId",role,handle)
         VALUES ($1,$2,'FROM',$3)`,
        [randomUUID(), id, source.handle],
      );
    };
    const draftInput = {
      expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
      target: {
        channel: 'EMAIL',
        contactId: encodeMyahInboxContactId({
          workspaceId: SEED_APPLE_WORKSPACE_ID,
          identity: { kind: 'creator', recordId: fixture.creatorId },
        }),
        threadId,
      },
      replyContext: { kind: 'CAMPAIGN', campaignId: fixture.campaignId },
    };
    const request = (query: typeof draftStateQuery, input: object) =>
      makeGraphqlAPIRequest(
        { query, variables: { input } },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
    const readDraft = async () => {
      const response = await request(draftStateQuery, draftInput);
      expect(response.body.errors).toBeUndefined();

      return response.body.data.myahInboxReplyDraft as {
        revision: number;
        executionState: string;
        incomingState: string | null;
        bodyEdited: boolean | null;
        resolvedContext: { contextFingerprint: string };
      };
    };
    const generate = (expectedContextFingerprint: string) =>
      request(generateWithFingerprintMutation, {
        ...draftInput,
        expectedContextFingerprint,
        operatorInstructions: 'Confirm Tuesday.',
      });
    const proposalResult = await doGenerate.getMockImplementation()!();

    try {
      const initial = await readDraft();
      const revision = initial.revision;

      // 1. Incoming during generation: the generated body is not returned.
      doGenerate.mockImplementationOnce(async () => {
        await addInbound('2100-01-01T00:00:00.000Z');
        return proposalResult;
      });
      const duringGeneration = await generate(
        initial.resolvedContext.contextFingerprint,
      );
      expect(duringGeneration.body.errors).toBeDefined();
      expect(
        duringGeneration.body.data?.generateMyahInboxReplyProposal ?? null,
      ).toBeNull();

      // 2. Incoming between generation and apply: the stale apply is rejected.
      const beforeApply = await readDraft();
      expect(beforeApply.revision).toBe(revision);
      expect(beforeApply.resolvedContext.contextFingerprint).not.toBe(
        initial.resolvedContext.contextFingerprint,
      );
      const generated = await generate(
        beforeApply.resolvedContext.contextFingerprint,
      );
      expect(generated.body.errors).toBeUndefined();
      await addInbound('2100-01-02T00:00:00.000Z');
      const staleApply = await request(saveDraftMutation, {
        ...draftInput,
        expectedRevision: revision,
        body: generated.body.data.generateMyahInboxReplyProposal.body,
        proposalContextFingerprint:
          generated.body.data.generateMyahInboxReplyProposal.contextFingerprint,
      });
      expect(staleApply.body.errors?.[0].message).toContain(
        'Reply context changed',
      );
      expect((await readDraft()).revision).toBe(revision);

      // A current proposal applies as an untouched, incoming-current body.
      const current = (await readDraft()).resolvedContext.contextFingerprint;
      const fresh = await generate(current);
      const applied = await request(saveDraftMutation, {
        ...draftInput,
        expectedRevision: revision,
        body: fresh.body.data.generateMyahInboxReplyProposal.body,
        proposalContextFingerprint: current,
      });
      expect(applied.body.data.saveMyahInboxDraft).toMatchObject({
        status: 'SAVED',
        revision: revision + 1,
      });
      expect(await readDraft()).toMatchObject({
        revision: revision + 1,
        executionState: 'READY',
        incomingState: 'CURRENT',
        bodyEdited: false,
      });

      // 3. Incoming before review: stale, no revision bump, old review rejected.
      await addInbound('2100-01-03T00:00:00.000Z');
      const stale = await readDraft();
      expect(stale).toMatchObject({
        revision: revision + 1,
        executionState: 'NEEDS_REVIEW',
        incomingState: 'STALE',
        bodyEdited: false,
      });
      const staleReview = await request(reviewMutation, {
        ...draftInput,
        expectedDraftRevision: revision + 1,
        expectedContextFingerprint: current,
      });
      expect(staleReview.body.errors?.[0].message).toContain(
        'Reply context or draft changed before review',
      );

      // 4. Explicit current review, then incoming before final send authority.
      const reviewed = await request(reviewMutation, {
        ...draftInput,
        expectedDraftRevision: revision + 1,
        expectedContextFingerprint: stale.resolvedContext.contextFingerprint,
      });
      expect(reviewed.body.errors).toBeUndefined();
      expect(
        reviewed.body.data.reviewMyahInboxReplyContext.executionState,
      ).toBe('READY');
      await addInbound('2100-01-04T00:00:00.000Z');
      const readiness = await request(sendReadinessQuery, draftInput);
      expect(readiness.body.data.myahInboxReplySendReadiness.status).toBe(
        'NEEDS_REVIEW',
      );
      const send = await request(sendMutation, {
        ...draftInput,
        expectedDraftRevision: revision + 1,
      });
      expect(
        send.body.data?.sendMyahInboxReply?.outcome ?? 'REJECTED',
      ).not.toBe('SENT');
      expect(sendEmailBoundary).not.toHaveBeenCalled();
      expect(providerDispatchBoundary).not.toHaveBeenCalled();
      expect((await readDraft()).revision).toBe(revision + 1);
    } finally {
      for (const table of [
        'messageParticipant',
        'messageChannelMessageAssociation',
      ])
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await global.testDataSource.query(
          `DELETE FROM "${schema}"."${table}" WHERE "messageId"=ANY($1::uuid[])`,
          [inserted],
        );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `DELETE FROM "${schema}".message WHERE id=ANY($1::uuid[])`,
        [inserted],
      );
      await global.testDataSource.query(
        `DELETE FROM core."myahInboxReplyContextDraft"
         WHERE "workspaceId"=$1 AND "deliveryTargetId"=$2 AND "bodyProvenance" IS NOT NULL`,
        [SEED_APPLE_WORKSPACE_ID, threadId],
      );
    }
  });
});
