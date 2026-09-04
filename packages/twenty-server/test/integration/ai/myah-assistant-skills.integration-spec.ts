import { randomUUID } from 'node:crypto';
import { type LanguageModel } from 'ai';

jest.mock('@e2b/code-interpreter', () => ({}));
jest.mock('@file-type/pdf', () => ({ detectPdf: jest.fn() }));
jest.mock(
  'file-type',
  () => ({
    FileTypeParser: class {
      fromBuffer = jest.fn();
    },
    supportedMimeTypes: { has: jest.fn() },
  }),
  { virtual: true },
);

const {
  ChatExecutionService,
} = require('src/engine/metadata-modules/ai/ai-chat/services/chat-execution.service');
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { activateWorkspace } from 'test/integration/graphql/utils/activate-workspace.util';
import { deleteUser } from 'test/integration/graphql/utils/delete-user.util';
import { getAuthTokensFromLoginToken } from 'test/integration/graphql/utils/get-auth-tokens-from-login-token.util';
import { getCurrentUser } from 'test/integration/graphql/utils/get-current-user.util';
import { signUpInNewWorkspace } from 'test/integration/graphql/utils/sign-up-in-new-workspace.util';
import { signUp } from 'test/integration/graphql/utils/sign-up.util';
import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import {
  cleanupMyahInboxTask7Fixture,
  getDomainService,
  seedMyahInboxTask7Fixture,
  type MyahInboxTask7Fixture,
} from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';
import { waitForAllJobsToFinish } from 'test/integration/utils/wait-for-all-jobs-to-finish.util';

type ScriptedCall = {
  toolName: string;
  input: Record<string, unknown>;
};

type ScriptedChatExecution = {
  chunks: unknown[];
  modelToolCalls: string[];
  resolvedToolInputs: Record<string, unknown>[];
};

type Fixture = {
  campaignId: string;
  chatThreadId: string;
  campaignName: string;
  creatorId: string;
  creatorEmail: string;
  creatorName: string;
  creatorListId: string;
  creatorListName: string;
  schemaName: string;
  userWorkspaceId: string;
  workspaceAccessToken: string;
  workspaceId: string;
};
let createdUserAccessToken: string | undefined;

const genericApprovalMessage = (toolName: string) => ({
  id: 'generic-approval',
  role: 'assistant' as const,
  parts: [
    {
      type: 'tool-request_approval' as const,
      toolCallId: 'generic-approval-call',
      state: 'output-available' as const,
      input: { toolName },
      output: { result: { status: 'resolved', decision: 'approved' } },
    },
  ],
});

const registeredApprovalMessage = (actionApprovalBindingId: string) => ({
  id: 'registered-approval',
  role: 'assistant' as const,
  parts: [
    {
      type: 'tool-request_approval' as const,
      toolCallId: 'registered-approval-call',
      state: 'output-available' as const,
      input: { toolName: 'send_myah_inbox_reply' },
      output: {
        result: {
          status: 'resolved',
          decision: 'approved',
          actionApprovalBindingId,
        },
      },
    },
  ],
});

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

const getChatExecutionService = () => {
  const app = global.app as unknown as {
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
  const aiChatModule = [...app.container.getModules().values()].find(
    ({ metatype }) => metatype?.name === 'AiChatModule',
  );
  const chatExecution = aiChatModule
    ? [...aiChatModule.providers.entries()].find(
        ([token]) =>
          typeof token === 'function' && token.name === 'ChatExecutionService',
      )?.[1].instance
    : undefined;

  if (!chatExecution) {
    throw new Error('ChatExecutionService is not registered in AiChatModule');
  }

  return chatExecution as InstanceType<typeof ChatExecutionService>;
};

const seedMyahAssistantSkillsFixture = async (): Promise<Fixture> => {
  const uniqueId = randomUUID();
  const email = `myah-156-scripted-${uniqueId}@example.com`;
  const creatorEmail = `creator-${uniqueId}@example.com`;
  const creatorName = `MYAH-156 scripted ${uniqueId}`;
  const campaignName = `MYAH-156 campaign ${uniqueId}`;
  const creatorListName = `MYAH-156 list ${uniqueId}`;
  const chatThreadId = randomUUID();
  const { data: signUpData } = await signUp({
    input: { email, password: 'Test123!@#' },
    expectToFail: false,
  });

  createdUserAccessToken =
    signUpData.signUp.tokens.accessOrWorkspaceAgnosticToken.token;

  await global.testDataSource.query(
    'UPDATE core."user" SET "isEmailVerified" = true WHERE email = $1',
    [email],
  );

  const { data: workspaceSignUpData } = await signUpInNewWorkspace({
    accessToken: createdUserAccessToken,
    displayName: `MYAH-156 scripted ${uniqueId}`,
    expectToFail: false,
  });
  const { workspace, loginToken } = workspaceSignUpData.signUpInNewWorkspace;

  const { data: activationAuthTokensData } = await getAuthTokensFromLoginToken({
    origin: workspace.workspaceUrls.subdomainUrl,
    loginToken: loginToken.token,
    expectToFail: false,
  });
  const activationAccessToken =
    activationAuthTokensData.getAuthTokensFromLoginToken.tokens
      .accessOrWorkspaceAgnosticToken.token;

  await activateWorkspace({
    accessToken: activationAccessToken,
    expectToFail: false,
  });
  await waitForAllJobsToFinish();

  const { data: workspaceAuthTokensData } = await getAuthTokensFromLoginToken({
    origin: workspace.workspaceUrls.subdomainUrl,
    loginToken: loginToken.token,
    expectToFail: false,
  });
  const workspaceAccessToken =
    workspaceAuthTokensData.getAuthTokensFromLoginToken.tokens
      .accessOrWorkspaceAgnosticToken.token;

  const { data: currentUserData } = await getCurrentUser({
    accessToken: workspaceAccessToken,
    expectToFail: false,
  });
  const currentWorkspace = currentUserData.currentUser.currentWorkspace;
  const currentUserWorkspace = currentUserData.currentUser.currentUserWorkspace;

  if (!currentWorkspace || !currentUserWorkspace) {
    throw new Error('Activated workspace did not provide user workspace data');
  }

  expect(currentWorkspace.id).toBe(workspace.id);
  await global.testDataSource.query(
    `INSERT INTO core."agentChatThread"
       (id, "workspaceId", "userWorkspaceId", title)
     VALUES ($1, $2, $3, $4)`,
    [
      chatThreadId,
      currentWorkspace.id,
      currentUserWorkspace.id,
      'MYAH-156 scripted chat',
    ],
  );

  const creatorResponse = await makeGraphqlAPIRequest(
    createOneOperationFactory({
      objectMetadataSingularName: 'creator',
      data: {
        creatorStatus: 'REVIEWING',
        email: creatorEmail,
        location: 'Dublin',
        language: 'English',
        name: creatorName,
      },
      gqlFields: 'id creatorStatus',
    }),
    workspaceAccessToken,
  );
  const campaignResponse = await makeGraphqlAPIRequest(
    createOneOperationFactory({
      objectMetadataSingularName: 'campaign',
      data: {
        name: campaignName,
        objective: 'Validate Myah assistant skills',
      },
      gqlFields: 'id lifecycleStatus',
    }),
    workspaceAccessToken,
  );
  const creatorListResponse = await makeGraphqlAPIRequest(
    createOneOperationFactory({
      objectMetadataSingularName: 'creatorList',
      data: { name: creatorListName },
      gqlFields: 'id',
    }),
    workspaceAccessToken,
  );

  expect(creatorResponse.body.errors).toBeUndefined();
  expect(campaignResponse.body.errors).toBeUndefined();
  expect(creatorListResponse.body.errors).toBeUndefined();
  const schemaName = getWorkspaceSchemaName(currentWorkspace.id);

  await global.testDataSource.query(
    `UPDATE "${schemaName}"."campaign"
        SET "campaignBriefMarkdown" = $2,
            "communicationGuidelinesMarkdown" = $3,
            "replyRulesMarkdown" = $4,
            "escalationBoundariesMarkdown" = $5,
            "additionalNotesMarkdown" = $6,
            "emailSignatureMarkdown" = $7
      WHERE id = $1`,
    [
      campaignResponse.body.data.createCampaign.id,
      'MYAH-156 detailed campaign brief',
      'MYAH-156 communication guidelines',
      'MYAH-156 approved reply rules',
      'MYAH-156 escalation boundaries',
      'MYAH-156 additional operations notes',
      'MYAH-156 campaign signature',
    ],
  );
  expect(campaignResponse.body.data.createCampaign.lifecycleStatus).toBe(
    'DRAFT',
  );

  return {
    campaignId: campaignResponse.body.data.createCampaign.id,
    campaignName,
    chatThreadId,
    creatorId: creatorResponse.body.data.createCreator.id,
    creatorName,
    creatorEmail,
    creatorListId: creatorListResponse.body.data.createCreatorList.id,
    creatorListName,
    schemaName,
    userWorkspaceId: currentUserWorkspace.id,
    workspaceAccessToken,
    workspaceId: currentWorkspace.id,
  };
};

const readCreatorQualification = async (fixture: Fixture) => {
  const [creator] = await global.testDataSource.query(
    `SELECT "creatorStatus" FROM "${fixture.schemaName}"."creator" WHERE id = $1`,
    [fixture.creatorId],
  );

  return creator?.creatorStatus;
};

const runScriptedChat = async ({
  fixture,
  approvedToolName,
  registeredApprovalBindingId,
  calls,
}: {
  fixture: Fixture;
  approvedToolName?: string;
  registeredApprovalBindingId?: string;
  calls: ScriptedCall[];
}) => {
  const { emittedToolCalls, model, resolvedToolInputs } =
    createScriptedLanguageModel(calls);
  const chatExecution = getChatExecutionService();
  const aiModelRegistry = chatExecution['aiModelRegistryService'];
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
        id: fixture.workspaceId,
        smartModel: 'myah-scripted-integration',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: fixture.userWorkspaceId,
      threadId: fixture.chatThreadId,
      messages: [
        registeredApprovalBindingId
          ? registeredApprovalMessage(registeredApprovalBindingId)
          : approvedToolName
            ? genericApprovalMessage(approvedToolName)
            : {
                id: 'user-message',
                role: 'user' as const,
                parts: [
                  { type: 'text' as const, text: 'Run the requested read.' },
                ],
              },
      ] as never,
      browsingContext: null,
      managedProviderRequestIdRoot: `myah-156-${fixture.creatorId}`,
      conversationSizeTokens: 0,
    });
    const chunks = [];

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

const buildInboxChatFixture = (
  inboxFixture: MyahInboxTask7Fixture,
  chatThreadId: string,
): Fixture => ({
  campaignId: inboxFixture.campaignId,
  campaignName: inboxFixture.campaignName,
  chatThreadId,
  creatorId: inboxFixture.creatorId,
  creatorEmail: inboxFixture.markers.senderEmail,
  creatorName: inboxFixture.markers.creatorName,
  creatorListId: inboxFixture.creatorId,
  creatorListName: 'Not used by Inbox scenarios',
  schemaName: getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID),
  userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JANE,
  workspaceAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
  workspaceId: SEED_APPLE_WORKSPACE_ID,
});

const clearInboxApprovalEvidence = async () => {
  await global.testDataSource.query(
    `DELETE FROM core."actionExecutionReceipt" receipt
      USING core."actionApprovalBinding" binding
      WHERE receipt."actionApprovalBindingId" = binding.id
        AND binding."workspaceId" = $1
        AND binding."actionName" = 'send_inbox_reply'`,
    [SEED_APPLE_WORKSPACE_ID],
  );
  await global.testDataSource.query(
    `DELETE FROM core."actionApprovalBinding"
      WHERE "workspaceId" = $1
        AND "actionName" = 'send_inbox_reply'`,
    [SEED_APPLE_WORKSPACE_ID],
  );
};

describe('Myah assistant skills scripted model integration', () => {
  let fixture: Fixture | undefined;
  let inboxFixture: MyahInboxTask7Fixture | undefined;
  let inboxChatThreadId: string | undefined;
  beforeAll(async () => {
    fixture = await seedMyahAssistantSkillsFixture();
    await clearInboxApprovalEvidence();
    inboxFixture = await seedMyahInboxTask7Fixture({
      operatorAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
    });
    inboxChatThreadId = randomUUID();
    await global.testDataSource.query(
      `INSERT INTO core."agentChatThread"
         (id, "workspaceId", "userWorkspaceId", title)
       VALUES ($1, $2, $3, $4)`,
      [
        inboxChatThreadId,
        SEED_APPLE_WORKSPACE_ID,
        USER_WORKSPACE_DATA_SEED_IDS.JANE,
        'MYAH-156 Inbox scripted chat',
      ],
    );
  });

  afterAll(async () => {
    await clearInboxApprovalEvidence();
    if (inboxChatThreadId) {
      await global.testDataSource.query(
        'DELETE FROM core."agentChatThread" WHERE id = $1',
        [inboxChatThreadId],
      );
    }

    if (inboxFixture) {
      await cleanupMyahInboxTask7Fixture({
        operatorAccessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });
    }

    if (!createdUserAccessToken) {
      return;
    }

    await deleteUser({
      accessToken: createdUserAccessToken,
      expectToFail: false,
    });

    if (fixture) {
      const [workspace] = await global.testDataSource.query<
        { deletedAt: Date | null }[]
      >('SELECT "deletedAt" FROM core.workspace WHERE id = $1', [
        fixture.workspaceId,
      ]);

      expect(workspace?.deletedAt).toBeDefined();
    }
  });

  it('loads the Creator skill and finds a Creator by name without write approval', async () => {
    if (!fixture) {
      throw new Error('Expected dynamic workspace fixture');
    }

    const execution = await runScriptedChat({
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-creators'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['find_many_creators'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'find_many_creators',
            arguments: {
              name: { eq: fixture.creatorName },
              select: [
                'id',
                'name',
                'email',
                'creatorStatus',
                'location',
                'language',
              ],
            },
          },
        },
      ],
    });

    expect(execution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    const result = JSON.stringify(execution.chunks);

    expect(result).toContain(fixture.creatorName);
    expect(result).toContain(fixture.creatorEmail);
    expect(result).toContain('REVIEWING');
    expect(result).toContain('Dublin');
    expect(result).toContain('English');
  });

  it('loads the Campaign skill and reads Campaign Home, Agent, and Operations fields', async () => {
    if (!fixture) {
      throw new Error('Expected dynamic workspace fixture');
    }

    const execution = await runScriptedChat({
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['find_one_campaign'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'find_one_campaign',
            arguments: {
              id: fixture.campaignId,
              select: [
                'id',
                'name',
                'objective',
                'lifecycleStatus',
                'campaignBrief',
                'communicationGuidelines',
                'replyRules',
                'escalationBoundaries',
                'additionalNotes',
                'emailSignature',
              ],
            },
          },
        },
      ],
    });

    expect(execution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    const result = JSON.stringify(execution.chunks);

    expect(result).toContain(fixture.campaignName);
    expect(result).toContain('Validate Myah assistant skills');
    expect(result).toContain('MYAH-156 detailed campaign brief');
    expect(result).toContain('MYAH-156 communication guidelines');
    expect(result).toContain('MYAH-156 campaign signature');
  });

  it('streams skill discovery and a persisted Creator qualification update through ChatExecutionService', async () => {
    if (!fixture) {
      throw new Error('Expected dynamic workspace fixture');
    }

    const execution = await runScriptedChat({
      approvedToolName: 'update_one_creator',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-creators'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['find_one_creator', 'update_one_creator'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_one_creator',
            arguments: {
              id: fixture.creatorId,
              creatorStatus: 'QUALIFIED',
            },
          },
        },
      ],
    });

    expect(execution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(execution.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool-call' }),
        expect.objectContaining({ type: 'tool-result' }),
      ]),
    );
    expect(await readCreatorQualification(fixture)).toBe('QUALIFIED');
  });

  it('uses separate approved turns to create native Campaign Tasks, Notes, and targets', async () => {
    if (!fixture) {
      throw new Error('Expected dynamic workspace fixture');
    }

    const taskTitle = `MYAH-156 task ${randomUUID()}`;
    const taskExecution = await runScriptedChat({
      approvedToolName: 'create_one_task',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['create_one_task'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'create_one_task',
            arguments: { title: taskTitle },
          },
        },
      ],
    });
    const [task] = await global.testDataSource.query<{ id: string }[]>(
      `SELECT id FROM "${fixture.schemaName}"."task" WHERE title = $1`,
      [taskTitle],
    );

    if (!task) {
      throw new Error('Expected approved Task write to persist');
    }

    const taskTargetExecution = await runScriptedChat({
      approvedToolName: 'create_one_task_target',
      fixture,
      calls: [
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'create_one_task_target',
            arguments: {
              taskId: task.id,
              targetCampaignId: fixture.campaignId,
            },
          },
        },
      ],
    });

    const noteTitle = `MYAH-156 note ${randomUUID()}`;
    const noteExecution = await runScriptedChat({
      approvedToolName: 'create_one_note',
      fixture,
      calls: [
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'create_one_note',
            arguments: { title: noteTitle },
          },
        },
      ],
    });
    const [note] = await global.testDataSource.query<{ id: string }[]>(
      `SELECT id FROM "${fixture.schemaName}"."note" WHERE title = $1`,
      [noteTitle],
    );

    if (!note) {
      throw new Error('Expected approved Note write to persist');
    }

    const noteTargetExecution = await runScriptedChat({
      approvedToolName: 'create_one_note_target',
      fixture,
      calls: [
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'create_one_note_target',
            arguments: {
              noteId: note.id,
              targetCampaignId: fixture.campaignId,
            },
          },
        },
      ],
    });

    expect(taskExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(taskTargetExecution.modelToolCalls).toEqual(['execute_tool']);
    expect(noteExecution.modelToolCalls).toEqual(['execute_tool']);
    expect(noteTargetExecution.modelToolCalls).toEqual(['execute_tool']);

    const [taskTarget] = await global.testDataSource.query<
      { targetCampaignId: string; taskId: string }[]
    >(
      `SELECT "taskId", "targetCampaignId"
       FROM "${fixture.schemaName}"."taskTarget"
       WHERE "taskId" = $1`,
      [task.id],
    );
    const [noteTarget] = await global.testDataSource.query<
      { noteId: string; targetCampaignId: string }[]
    >(
      `SELECT "noteId", "targetCampaignId"
       FROM "${fixture.schemaName}"."noteTarget"
       WHERE "noteId" = $1`,
      [note.id],
    );

    expect(taskTarget).toEqual({
      taskId: task.id,
      targetCampaignId: fixture.campaignId,
    });
    expect(noteTarget).toEqual({
      noteId: note.id,
      targetCampaignId: fixture.campaignId,
    });
  });

  it('creates, configures, and validates Campaign Outreach through its focused skill', async () => {
    if (!fixture) {
      throw new Error('Expected dynamic workspace fixture');
    }

    const creationExecution = await runScriptedChat({
      approvedToolName: 'create_campaign_outreach_workflow',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['create_campaign_outreach_workflow'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'create_campaign_outreach_workflow',
            arguments: { campaignId: fixture.campaignId },
          },
        },
      ],
    });
    const [workflow] = await global.testDataSource.query<{ id: string }[]>(
      `SELECT id
       FROM "${fixture.schemaName}"."workflow"
       WHERE "outreachCampaignId" = $1`,
      [fixture.campaignId],
    );

    if (!workflow) {
      throw new Error('Expected Campaign Outreach workflow to persist');
    }

    const [workflowVersion] = await global.testDataSource.query<
      { id: string }[]
    >(
      `SELECT id
       FROM "${fixture.schemaName}"."workflowVersion"
       WHERE "workflowId" = $1 AND status = 'DRAFT'`,
      [workflow.id],
    );

    if (!workflowVersion) {
      throw new Error('Expected Campaign Outreach DRAFT version to persist');
    }

    const trigger = {
      name: 'Manual outreach review',
      type: 'MANUAL',
      settings: { outputSchema: {} },
      nextStepIds: [],
    };
    const configurationExecution = await runScriptedChat({
      approvedToolName: 'update_campaign_outreach_workflow_trigger',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['update_campaign_outreach_workflow_trigger'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_campaign_outreach_workflow_trigger',
            arguments: {
              campaignId: fixture.campaignId,
              workflowVersionId: workflowVersion.id,
              trigger,
            },
          },
        },
      ],
    });
    const validationExecution = await runScriptedChat({
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['validate_campaign_outreach_workflow'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'validate_campaign_outreach_workflow',
            arguments: {
              campaignId: fixture.campaignId,
              workflowVersionId: workflowVersion.id,
            },
          },
        },
      ],
    });
    const [configuredVersion] = await global.testDataSource.query<
      { trigger: { type?: string } | null }[]
    >(
      `SELECT trigger
       FROM "${fixture.schemaName}"."workflowVersion"
       WHERE id = $1`,
      [workflowVersion.id],
    );

    expect(creationExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(configurationExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(validationExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(configuredVersion.trigger?.type).toBe('MANUAL');
  });

  it('drives Campaign lifecycle readiness, audience provenance, and stale lifecycle recovery', async () => {
    if (!fixture) {
      throw new Error('Expected dynamic workspace fixture');
    }

    const readinessExecution = await runScriptedChat({
      approvedToolName: 'update_many_campaigns',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['update_many_campaigns'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_many_campaigns',
            arguments: {
              data: { lifecycleStatus: 'ACTIVE' },
              filter: { id: { eq: fixture.campaignId } },
            },
          },
        },
      ],
    });
    const [beforeAudienceCampaign] = await global.testDataSource.query<
      { lifecycleStatus: string }[]
    >(
      `SELECT "lifecycleStatus"
       FROM "${fixture.schemaName}"."campaign"
       WHERE id = $1`,
      [fixture.campaignId],
    );

    expect(readinessExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(beforeAudienceCampaign.lifecycleStatus).toBe('DRAFT');

    const membershipExecution = await runScriptedChat({
      approvedToolName: 'add_creators_to_creator_list',
      fixture,
      calls: [
        {
          toolName: 'load_skills',
          input: { skillNames: ['myah-creator-lists'] },
        },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['add_creators_to_creator_list'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'add_creators_to_creator_list',
            arguments: {
              creatorIds: [fixture.creatorId],
              creatorListId: fixture.creatorListId,
            },
          },
        },
      ],
    });
    const duplicateMembershipExecution = await runScriptedChat({
      approvedToolName: 'add_creators_to_creator_list',
      fixture,
      calls: [
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'add_creators_to_creator_list',
            arguments: {
              creatorIds: [fixture.creatorId],
              creatorListId: fixture.creatorListId,
            },
          },
        },
      ],
    });
    const [membershipCount] = await global.testDataSource.query<
      { count: number }[]
    >(
      `SELECT COUNT(*)::int AS count
       FROM "${fixture.schemaName}"."creatorListMember"
       WHERE "creatorListId" = $1 AND "creatorId" = $2`,
      [fixture.creatorListId, fixture.creatorId],
    );

    expect(membershipExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(duplicateMembershipExecution.modelToolCalls).toEqual([
      'execute_tool',
    ]);
    expect(membershipCount.count).toBe(1);

    const attachExecution = await runScriptedChat({
      approvedToolName: 'attach_creator_lists_to_campaign',
      fixture,
      calls: [
        {
          toolName: 'load_skills',
          input: { skillNames: ['myah-creator-lists', 'myah-campaigns'] },
        },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: [
              'attach_creator_lists_to_campaign',
              'get_campaign_audience',
            ],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'attach_creator_lists_to_campaign',
            arguments: {
              campaignId: fixture.campaignId,
              creatorListIds: [fixture.creatorListId],
            },
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'get_campaign_audience',
            arguments: { campaignId: fixture.campaignId },
          },
        },
      ],
    });
    const [campaignCreator] = await global.testDataSource.query<
      { id: string }[]
    >(
      `SELECT id
       FROM "${fixture.schemaName}"."campaignCreator"
       WHERE "campaignId" = $1 AND "creatorId" = $2`,
      [fixture.campaignId, fixture.creatorId],
    );
    const [campaignCreatorListSource] = await global.testDataSource.query<
      { id: string }[]
    >(
      `SELECT id
       FROM "${fixture.schemaName}"."campaignCreatorListSource"
       WHERE "campaignCreatorId" = $1 AND "creatorListId" = $2`,
      [campaignCreator.id, fixture.creatorListId],
    );

    expect(attachExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
      'execute_tool',
    ]);
    expect(campaignCreator).toBeDefined();
    expect(campaignCreatorListSource).toBeDefined();

    const stageExecution = await runScriptedChat({
      approvedToolName: 'update_one_campaign_creator',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['update_one_campaign_creator'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_one_campaign_creator',
            arguments: { id: campaignCreator.id, stage: 'CONTACTED' },
          },
        },
      ],
    });
    const [updatedCampaignCreator] = await global.testDataSource.query<
      { stage: string }[]
    >(
      `SELECT stage
       FROM "${fixture.schemaName}"."campaignCreator"
       WHERE id = $1`,
      [campaignCreator.id],
    );

    expect(stageExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(updatedCampaignCreator.stage).toBe('CONTACTED');

    const lifecycleExecution = await runScriptedChat({
      approvedToolName: 'update_many_campaigns',
      fixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-campaigns'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['update_many_campaigns'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_many_campaigns',
            arguments: {
              data: { lifecycleStatus: 'ACTIVE' },
              filter: { id: { eq: fixture.campaignId } },
            },
          },
        },
      ],
    });
    const pauseLifecycleExecution = await runScriptedChat({
      approvedToolName: 'update_many_campaigns',
      fixture,
      calls: [
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'update_many_campaigns',
            arguments: {
              data: { lifecycleStatus: 'PAUSED' },
              filter: { id: { eq: fixture.campaignId } },
            },
          },
        },
      ],
    });
    const [pausedCampaign] = await global.testDataSource.query<
      { lifecycleStatus: string }[]
    >(
      `SELECT "lifecycleStatus"
       FROM "${fixture.schemaName}"."campaign"
       WHERE id = $1`,
      [fixture.campaignId],
    );

    expect(lifecycleExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(pauseLifecycleExecution.modelToolCalls).toEqual(['execute_tool']);
    expect(pausedCampaign.lifecycleStatus).toBe('PAUSED');

    const fixtureForConcurrentUpdate = fixture;

    const lifecycleService = getDomainService<CampaignLifecycleService>(
      'CampaignLifecycleService',
    );
    const prepareUpdateMany =
      lifecycleService.prepareUpdateMany.bind(lifecycleService);
    const prepareUpdateManySpy = jest
      .spyOn(lifecycleService, 'prepareUpdateMany')
      .mockImplementation(async (...args) => {
        const prepared = await prepareUpdateMany(...args);

        await global.testDataSource.query(
          `UPDATE "${fixtureForConcurrentUpdate.schemaName}"."campaign"
              SET "lifecycleStatus" = 'COMPLETED'
            WHERE id = $1`,
          [fixtureForConcurrentUpdate.campaignId],
        );

        return prepared;
      });
    let staleLifecycleExecution: ScriptedChatExecution;

    try {
      staleLifecycleExecution = await runScriptedChat({
        approvedToolName: 'update_many_campaigns',
        fixture,
        calls: [
          {
            toolName: 'load_skills',
            input: { skillNames: ['myah-campaigns'] },
          },
          {
            toolName: 'learn_tools',
            input: {
              toolNames: ['update_many_campaigns', 'find_one_campaign'],
              aspects: ['schema'],
            },
          },
          {
            toolName: 'execute_tool',
            input: {
              toolName: 'update_many_campaigns',
              arguments: {
                data: { lifecycleStatus: 'ACTIVE' },
                filter: { id: { eq: fixture.campaignId } },
              },
            },
          },
          {
            toolName: 'execute_tool',
            input: {
              toolName: 'find_one_campaign',
              arguments: {
                id: fixture.campaignId,
                select: ['id', 'lifecycleStatus'],
              },
            },
          },
        ],
      });
    } finally {
      prepareUpdateManySpy.mockRestore();
    }
    const [staleCampaign] = await global.testDataSource.query<
      { lifecycleStatus: string }[]
    >(
      `SELECT "lifecycleStatus"
       FROM "${fixture.schemaName}"."campaign"
       WHERE id = $1`,
      [fixture.campaignId],
    );

    expect(staleLifecycleExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
      'execute_tool',
    ]);
    const staleToolResults = staleLifecycleExecution.chunks.flatMap((chunk) =>
      typeof chunk === 'object' &&
      chunk !== null &&
      'type' in chunk &&
      chunk.type === 'tool-result' &&
      'toolName' in chunk &&
      chunk.toolName === 'execute_tool' &&
      'output' in chunk
        ? [chunk.output]
        : [],
    );

    if (!JSON.stringify(staleToolResults).includes('Updated 0')) {
      throw new Error(
        `Stale lifecycle write did not return a zero-row result: ${JSON.stringify(
          staleToolResults,
        )}`,
      );
    }
    expect(staleCampaign.lifecycleStatus).toBe('COMPLETED');

    const removalExecution = await runScriptedChat({
      approvedToolName: 'remove_creator_from_creator_list',
      fixture,
      calls: [
        {
          toolName: 'load_skills',
          input: { skillNames: ['myah-creator-lists'] },
        },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['remove_creator_from_creator_list'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'remove_creator_from_creator_list',
            arguments: {
              creatorId: fixture.creatorId,
              creatorListId: fixture.creatorListId,
            },
          },
        },
      ],
    });
    const [removedMembershipCount] = await global.testDataSource.query<
      { count: number }[]
    >(
      `SELECT COUNT(*)::int AS count
       FROM "${fixture.schemaName}"."creatorListMember"
       WHERE "creatorListId" = $1
         AND "creatorId" = $2
         AND "deletedAt" IS NULL`,
      [fixture.creatorListId, fixture.creatorId],
    );

    expect(removalExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(removedMembershipCount.count).toBe(0);

    const detachExecution = await runScriptedChat({
      approvedToolName: 'detach_creator_list_from_campaign',
      fixture,
      calls: [
        {
          toolName: 'load_skills',
          input: { skillNames: ['myah-creator-lists', 'myah-campaigns'] },
        },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: ['detach_creator_list_from_campaign'],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'detach_creator_list_from_campaign',
            arguments: {
              campaignId: fixture.campaignId,
              creatorListId: fixture.creatorListId,
            },
          },
        },
      ],
    });
    const campaignCreatorLists = await global.testDataSource.query(
      `SELECT id
       FROM "${fixture.schemaName}"."campaignCreatorList"
       WHERE "campaignId" = $1
         AND "creatorListId" = $2
         AND "deletedAt" IS NULL`,
      [fixture.campaignId, fixture.creatorListId],
    );
    const [retainedCampaignCreator] = await global.testDataSource.query<
      { id: string }[]
    >(
      `SELECT id
       FROM "${fixture.schemaName}"."campaignCreator"
       WHERE id = $1`,
      [campaignCreator.id],
    );
    const [retainedSource] = await global.testDataSource.query<
      { id: string }[]
    >(
      `SELECT id
       FROM "${fixture.schemaName}"."campaignCreatorListSource"
       WHERE id = $1`,
      [campaignCreatorListSource.id],
    );

    expect(detachExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
    ]);
    expect(campaignCreatorLists).toEqual([]);
    expect(retainedCampaignCreator).toEqual(campaignCreator);
    expect(retainedSource).toEqual(campaignCreatorListSource);
  });

  it('searches and reads a complete Inbox thread through the Myah Inbox skill', async () => {
    if (!inboxFixture || !inboxChatThreadId) {
      throw new Error('Expected seeded Inbox fixture and chat thread');
    }
    const inboxChatFixture = buildInboxChatFixture(
      inboxFixture,
      inboxChatThreadId,
    );
    const execution = await runScriptedChat({
      fixture: inboxChatFixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-inbox'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: [
              'search_myah_inbox_threads',
              'get_myah_inbox_thread_context',
            ],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'search_myah_inbox_threads',
            arguments: {
              first: 20,
              search: inboxFixture.markers.creatorName,
            },
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'get_myah_inbox_thread_context',
            arguments: {
              messageThreadId: inboxFixture.threadIds.draft,
            },
          },
        },
      ],
    });

    expect(execution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
      'execute_tool',
    ]);
    expect(JSON.stringify(execution.chunks)).toContain(
      inboxFixture.markers.draftPriorBody,
    );
  });

  it('saves one exact Inbox draft revision and returns a stale conflict without retrying', async () => {
    if (!inboxFixture || !inboxChatThreadId) {
      throw new Error('Expected seeded Inbox fixture and chat thread');
    }
    const inboxChatFixture = buildInboxChatFixture(
      inboxFixture,
      inboxChatThreadId,
    );
    const draftBody = {
      markdown: 'MYAH-156 scripted exact draft',
      blocknote: null,
    };
    const saveExecution = await runScriptedChat({
      approvedToolName: 'save_myah_inbox_reply_draft',
      fixture: inboxChatFixture,
      calls: [
        { toolName: 'load_skills', input: { skillNames: ['myah-inbox'] } },
        {
          toolName: 'learn_tools',
          input: {
            toolNames: [
              'get_myah_inbox_reply_send_readiness',
              'save_myah_inbox_reply_draft',
            ],
            aspects: ['schema'],
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'get_myah_inbox_reply_send_readiness',
            arguments: {
              messageThreadId: inboxFixture.threadIds.draft,
            },
          },
        },
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'save_myah_inbox_reply_draft',
            arguments: {
              messageThreadId: inboxFixture.threadIds.draft,
              expectedRevision: inboxFixture.draftRevision,
              body: draftBody,
            },
          },
        },
      ],
    });
    const [savedDraft] = await global.testDataSource.query<
      {
        myahReplyDraftBodyMarkdown: string;
        myahReplyDraftRevision: number;
      }[]
    >(
      `SELECT "myahReplyDraftBodyMarkdown", "myahReplyDraftRevision"
       FROM "${inboxChatFixture.schemaName}"."messageThread"
       WHERE id = $1`,
      [inboxFixture.threadIds.draft],
    );
    const staleExecution = await runScriptedChat({
      approvedToolName: 'save_myah_inbox_reply_draft',
      fixture: inboxChatFixture,
      calls: [
        {
          toolName: 'execute_tool',
          input: {
            toolName: 'save_myah_inbox_reply_draft',
            arguments: {
              messageThreadId: inboxFixture.threadIds.draft,
              expectedRevision: inboxFixture.draftRevision,
              body: {
                markdown: 'MYAH-156 stale overwrite',
                blocknote: null,
              },
            },
          },
        },
      ],
    });

    expect(saveExecution.modelToolCalls).toEqual([
      'load_skills',
      'learn_tools',
      'execute_tool',
      'execute_tool',
    ]);
    expect(savedDraft).toEqual({
      myahReplyDraftBodyMarkdown: draftBody.markdown,
      myahReplyDraftRevision: inboxFixture.draftRevision + 1,
    });
    expect(staleExecution.modelToolCalls).toEqual(['execute_tool']);
    expect(JSON.stringify(staleExecution.chunks)).toContain('CONFLICT');
  });

  it('stops for registered Inbox approval, executes one stubbed send, and hides an unreadable thread', async () => {
    if (!inboxFixture || !inboxChatThreadId) {
      throw new Error('Expected seeded Inbox fixture and chat thread');
    }
    const inboxChatFixture = buildInboxChatFixture(
      inboxFixture,
      inboxChatThreadId,
    );
    const [channel] = await global.testDataSource.query<
      {
        id: string;
        channelHandle: string;
        accountHandle: string;
        isSyncEnabled: boolean;
        syncStatus: string;
        parentMessageId: string;
        parentHeaderMessageId: string | null;
      }[]
    >(
      `SELECT channel.id, channel."isSyncEnabled", channel."syncStatus",
              channel.handle AS "channelHandle",
              account.handle AS "accountHandle",
              message.id AS "parentMessageId",
              message."headerMessageId" AS "parentHeaderMessageId"
         FROM core."messageChannel" channel
         JOIN core."connectedAccount" account
           ON account.id = channel."connectedAccountId"
         JOIN "${inboxChatFixture.schemaName}"."messageChannelMessageAssociation" association
           ON association."messageChannelId" = channel.id
         JOIN "${inboxChatFixture.schemaName}"."message" message
           ON message.id = association."messageId"
        WHERE message."messageThreadId" = $1
        ORDER BY message."receivedAt" DESC
        LIMIT 1`,
      [inboxFixture.threadIds.draft],
    );

    if (!channel) {
      throw new Error('Expected Inbox fixture MessageChannel');
    }

    const chatExecution = getChatExecutionService();
    const actionDefinition = chatExecution['myahInboxReplyActionDefinition'];
    const actionApprovalService = chatExecution['actionApprovalService'];
    const outboundService = actionDefinition['messagingMessageOutboundService'];
    const eligibilityService =
      actionDefinition['managedEmailCampaignEligibilityService'];
    const assertSendable = jest
      .spyOn(outboundService, 'assertConnectedAccountSendable')
      .mockResolvedValue(undefined);
    const sendMessage = jest
      .spyOn(outboundService, 'sendMessage')
      .mockResolvedValue({
        headerMessageId: '<myah-156-scripted-send@example.test>',
        messageExternalId: 'myah-156-scripted-provider-message',
        threadExternalId: 'myah-156-scripted-provider-thread',
      });
    const assertEligible = jest
      .spyOn(eligibilityService, 'assertConnectedIdentityEligibleForFollowUp')
      .mockResolvedValue({ id: 'myah-156-managed-mailbox' } as never);
    const findEligible = jest
      .spyOn(eligibilityService, 'findConnectedIdentity')
      .mockResolvedValue({ id: 'myah-156-managed-mailbox' } as never);
    const approvedExecutionService = getDomainService<{
      projector: { projectReceipt: (receiptId: string) => Promise<void> };
    }>('MyahInboxReplyApprovedExecutionService');
    const projectionErrors: unknown[] = [];
    const projectReceipt =
      approvedExecutionService.projector.projectReceipt.bind(
        approvedExecutionService.projector,
      );
    const projectReceiptSpy = jest
      .spyOn(approvedExecutionService.projector, 'projectReceipt')
      .mockImplementation(async (receiptId) => {
        try {
          await projectReceipt(receiptId);
        } catch (error) {
          projectionErrors.push(error);
          throw error;
        }
      });

    try {
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
            SET "isSyncEnabled" = true,
                "syncStatus" = 'ACTIVE',
                handle = $2
          WHERE id = $1`,
        [channel.id, channel.accountHandle],
      );
      await global.testDataSource.query(
        `UPDATE "${inboxChatFixture.schemaName}"."message"
            SET "headerMessageId" = $2
          WHERE id = $1`,
        [channel.parentMessageId, '<myah-156-parent@example.test>'],
      );
      const [sendDraftRows] = await global.testDataSource.query<
        [{ revision: number }[], number]
      >(
        `UPDATE "${inboxChatFixture.schemaName}"."messageThread"
            SET "myahReplyDraftBodyMarkdown" = $2,
                "myahReplyDraftBodyBlocknote" = NULL,
                "myahReplyDraftRevision" = "myahReplyDraftRevision" + 1
          WHERE id = $1
          RETURNING "myahReplyDraftRevision" AS revision`,
        [inboxFixture.threadIds.draft, 'MYAH-156 scripted exact draft'],
      );
      const [sendDraft] = sendDraftRows;

      if (!sendDraft) {
        throw new Error('Expected Inbox send draft to persist');
      }

      const approvalExecution = await runScriptedChat({
        fixture: inboxChatFixture,
        calls: [
          { toolName: 'load_skills', input: { skillNames: ['myah-inbox'] } },
          {
            toolName: 'request_approval',
            input: {
              toolName: 'send_myah_inbox_reply',
              actionInput: {
                messageThreadId: inboxFixture.threadIds.draft,
                expectedDraftRevision: sendDraft.revision,
              },
            },
          },
          {
            toolName: 'execute_tool',
            input: {
              toolName: 'send_myah_inbox_reply',
              arguments: { actionApprovalBindingId: randomUUID() },
            },
          },
        ],
      });
      const [pendingBinding] = await global.testDataSource.query<
        { id: string; state: string }[]
      >(
        `SELECT id, state
           FROM core."actionApprovalBinding"
          WHERE "threadId" = $1
            AND "actionName" = 'send_inbox_reply'
          ORDER BY "createdAt" DESC
          LIMIT 1`,
        [inboxChatThreadId],
      );

      const approvalSummary = approvalExecution.chunks.map((chunk) => {
        if (typeof chunk !== 'object' || chunk === null) {
          return chunk;
        }
        const part = chunk as {
          type?: unknown;
          toolName?: unknown;
          input?: unknown;
          output?: unknown;
          error?: unknown;
        };

        return {
          type: part.type,
          toolName: part.toolName,
          ...(part.toolName === 'request_approval'
            ? { input: part.input, output: part.output, error: part.error }
            : {}),
        };
      });

      if (!pendingBinding) {
        throw new Error(
          `Registered Inbox approval did not persist: ${JSON.stringify(
            approvalSummary,
          )}`,
        );
      }

      expect(approvalExecution.modelToolCalls).toEqual([
        'load_skills',
        'request_approval',
      ]);
      expect(approvalExecution.modelToolCalls).not.toContain('execute_tool');
      expect(pendingBinding.state).toBe('PENDING');

      await actionApprovalService.decidePendingBinding({
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JANE,
        threadId: inboxChatThreadId,
        approvalBindingId: pendingBinding.id,
        decision: 'approved',
      });

      const sendExecution = await runScriptedChat({
        fixture: inboxChatFixture,
        registeredApprovalBindingId: pendingBinding.id,
        calls: [
          { toolName: 'load_skills', input: { skillNames: ['myah-inbox'] } },
          {
            toolName: 'learn_tools',
            input: {
              toolNames: ['send_myah_inbox_reply'],
              aspects: ['schema'],
            },
          },
          {
            toolName: 'execute_tool',
            input: {
              toolName: 'send_myah_inbox_reply',
              arguments: {
                actionApprovalBindingId: pendingBinding.id,
              },
            },
          },
        ],
      });
      const hiddenExecution = await runScriptedChat({
        fixture: inboxChatFixture,
        calls: [
          { toolName: 'load_skills', input: { skillNames: ['myah-inbox'] } },
          {
            toolName: 'learn_tools',
            input: {
              toolNames: ['get_myah_inbox_thread_context'],
              aspects: ['schema'],
            },
          },
          {
            toolName: 'execute_tool',
            input: {
              toolName: 'get_myah_inbox_thread_context',
              arguments: {
                messageThreadId: inboxFixture.threadIds.hiddenOnly,
              },
            },
          },
        ],
      });
      const receipts = await global.testDataSource.query<
        { id: string; state: string }[]
      >(
        `SELECT id, state
           FROM core."actionExecutionReceipt"
          WHERE "actionApprovalBindingId" = $1`,
        [pendingBinding.id],
      );
      const sentMessages = await global.testDataSource.query<
        { id: string; text: string }[]
      >(
        `SELECT id, text
           FROM "${inboxChatFixture.schemaName}"."message"
          WHERE "headerMessageId" = $1`,
        ['<myah-156-scripted-send@example.test>'],
      );

      expect(sendExecution.modelToolCalls).toEqual([
        'load_skills',
        'learn_tools',
        'execute_tool',
      ]);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'MYAH-156 scripted exact draft',
        }),
        expect.anything(),
      );
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.state).toBe('PROVIDER_ACCEPTED');
      if (sentMessages.length === 0) {
        throw new Error(
          `Inbox receipt projection failed: ${projectionErrors
            .map((error) =>
              error instanceof Error ? error.message : String(error),
            )
            .join('; ')}`,
        );
      }
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.text).toBe('MYAH-156 scripted exact draft');
      expect(JSON.stringify(hiddenExecution.chunks)).not.toContain(
        inboxFixture.markers.hiddenBody,
      );
    } finally {
      assertSendable.mockRestore();
      sendMessage.mockRestore();
      projectReceiptSpy.mockRestore();
      await global.testDataSource.query(
        `UPDATE "${inboxChatFixture.schemaName}"."message"
            SET "headerMessageId" = $2
          WHERE id = $1`,
        [channel.parentMessageId, channel.parentHeaderMessageId],
      );
      assertEligible.mockRestore();
      findEligible.mockRestore();
      await global.testDataSource.query(
        `DELETE FROM "${inboxChatFixture.schemaName}"."messageParticipant"
          WHERE "messageId" IN (
            SELECT id
              FROM "${inboxChatFixture.schemaName}"."message"
             WHERE "headerMessageId" = $1
          )`,
        ['<myah-156-scripted-send@example.test>'],
      );
      await global.testDataSource.query(
        `DELETE FROM "${inboxChatFixture.schemaName}"."messageChannelMessageAssociation"
          WHERE "messageId" IN (
            SELECT id
              FROM "${inboxChatFixture.schemaName}"."message"
             WHERE "headerMessageId" = $1
          )`,
        ['<myah-156-scripted-send@example.test>'],
      );
      await global.testDataSource.query(
        `DELETE FROM "${inboxChatFixture.schemaName}"."message"
          WHERE "headerMessageId" = $1`,
        ['<myah-156-scripted-send@example.test>'],
      );
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
            SET "isSyncEnabled" = $2,
                "syncStatus" = $3,
                handle = $4
          WHERE id = $1`,
        [
          channel.id,
          channel.isSyncEnabled,
          channel.syncStatus,
          channel.channelHandle,
        ],
      );
    }
  });
});
