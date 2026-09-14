jest.mock(
  'twenty-shared/ai',
  () => ({
    ToolCategory: {
      MYAH_CAMPAIGN_OUTREACH: 'MYAH_CAMPAIGN_OUTREACH',
      WORKFLOW: 'WORKFLOW',
    },
  }),
  { virtual: true },
);
jest.mock(
  'twenty-shared/constants',
  () => ({ PermissionFlagType: { WORKFLOWS: 'WORKFLOWS' } }),
  { virtual: true },
);
jest.mock(
  'twenty-shared/utils',
  () => ({
    isDefined: (value: unknown) => value !== null && value !== undefined,
  }),
  { virtual: true },
);
jest.mock('twenty-shared/workflow', () => ({ getEditDistance: jest.fn() }), {
  virtual: true,
});
jest.mock(
  'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util',
  () => ({
    toolSetToDescriptors: (
      toolSet: Record<string, { name: string }>,
      category: string,
    ) =>
      Object.values(toolSet).map((tool) => ({
        ...tool,
        category,
        executionRef: { kind: 'static', toolId: tool.name },
      })),
  }),
);
jest.mock(
  'src/engine/core-modules/tool-provider/services/tool-executor.service',
  () => ({ ToolExecutorService: class {} }),
);
jest.mock(
  'src/engine/core-modules/tool/services/tool-output-spill.service',
  () => ({ ToolOutputSpillService: class {} }),
);
jest.mock(
  'src/engine/core-modules/tool-provider/utils/execute-tool-from-tool-set.util',
  () => ({ executeToolFromToolSet: jest.fn() }),
);
jest.mock(
  'src/engine/metadata-modules/permissions/permissions.service',
  () => ({ PermissionsService: class {} }),
);
jest.mock(
  'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service',
  () => ({ WorkspaceManyOrAllFlatEntityMapsCacheService: class {} }),
);
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';

import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
jest.mock(
  'src/modules/myah-outreach/tools/campaign-outreach-tool.workspace-service',
  () => ({ CampaignOutreachToolWorkspaceService: class {} }),
);

import { MyahCampaignOutreachToolProvider } from 'src/engine/core-modules/tool-provider/providers/myah-campaign-outreach-tool.provider';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userId = '20202020-1234-4678-9012-345678901235';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userAuthContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId: '20202020-0b5c-4178-bed7-d371f6411eaa',
} as never;
const context = {
  workspaceId,
  userId,
  userWorkspaceId,
  roleId: 'role-id',
  actorContext: { workspaceMemberId: '20202020-0b5c-4178-bed7-d371f6411eaa' },
  authContext: userAuthContext,
  rolePermissionConfig: { unionOf: ['role-id'] },
} as unknown as ToolProviderContext;

const createActiveCampaignFlatEntityMapsCacheService = () => ({
  getOrRecomputeManyOrAllFlatEntityMaps: async () => ({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {
          id: 'campaign-object-id',
          isActive: true,
        },
      },
    },
  }),
});

describe('MyahCampaignOutreachToolProvider', () => {
  it('exposes Campaign outreach tools only to an authenticated user with WORKFLOWS permission', async () => {
    const generateCampaignOutreachTools = jest.fn().mockReturnValue({
      get_campaign_outreach_workflow: {
        name: 'get_campaign_outreach_workflow',
        description: 'Get Campaign outreach workflow',
        inputSchema: { jsonSchema: {} },
      },
    });
    const permissionsService = {
      checkRolesPermissions: jest.fn().mockResolvedValue(true),
    };
    const provider = new MyahCampaignOutreachToolProvider(
      { generateCampaignOutreachTools } as never,
      permissionsService as never,
      createActiveCampaignFlatEntityMapsCacheService() as never,
    );

    expect(await provider.isAvailable(context)).toBe(true);
    expect(await provider.generateDescriptors(context)).toHaveLength(1);
    expect(generateCampaignOutreachTools).toHaveBeenCalledWith({
      authContext: userAuthContext,
      rolePermissionConfig: context.rolePermissionConfig,
    });
  });

  it('hides Campaign outreach tools when the canonical Campaign object is inactive', async () => {
    const inactiveCampaignFlatEntityMapsCacheService = {
      getOrRecomputeManyOrAllFlatEntityMaps: async () => ({
        flatObjectMetadataMaps: {
          byUniversalIdentifier: {
            [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {
              id: 'campaign-object-id',
              isActive: false,
            },
          },
        },
      }),
    };
    const provider = new MyahCampaignOutreachToolProvider(
      { generateCampaignOutreachTools: jest.fn() } as never,
      { checkRolesPermissions: jest.fn().mockResolvedValue(true) } as never,
      inactiveCampaignFlatEntityMapsCacheService as never,
    );

    await expect(provider.isAvailable(context)).resolves.toBe(false);
    await expect(provider.generateDescriptors(context)).resolves.toEqual([]);
  });

  it('uses its distinct Campaign Outreach category', () => {
    const provider = new MyahCampaignOutreachToolProvider(
      null,
      {} as never,
      createActiveCampaignFlatEntityMapsCacheService() as never,
    );

    expect(provider.category).toBe('MYAH_CAMPAIGN_OUTREACH');
  });

  it('resolves Campaign schemas through its provider alongside general Workflow tools', async () => {
    const campaignTool = {
      name: 'get_campaign_outreach_workflow',
      description: 'Get Campaign outreach workflow',
      inputSchema: {
        type: 'object',
        properties: { campaignId: { type: 'string' } },
      },
    };
    const campaignProvider = new MyahCampaignOutreachToolProvider(
      {
        generateCampaignOutreachTools: jest.fn().mockReturnValue({
          [campaignTool.name]: campaignTool,
        }),
      } as never,
      { checkRolesPermissions: jest.fn().mockResolvedValue(true) } as never,
      createActiveCampaignFlatEntityMapsCacheService() as never,
    );
    const workflowProvider = {
      category: 'WORKFLOW',
      isAvailable: jest.fn().mockResolvedValue(true),
      generateDescriptors: jest.fn().mockResolvedValue([
        {
          name: 'get_workflow_current_version',
          description: 'Get workflow version',
          inputSchema: { type: 'object' },
          category: 'WORKFLOW',
          executionRef: {
            kind: 'static',
            toolId: 'get_workflow_current_version',
          },
        },
      ]),
      executeStaticTool: jest.fn(),
    };
    const registry = new ToolRegistryService(
      [workflowProvider, campaignProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(
      registry.resolveSchemas({
        toolNames: [campaignTool.name],
        context,
      }),
    ).resolves.toEqual(
      new Map([[campaignTool.name, campaignTool.inputSchema]]),
    );
  });
  it('rewrites only cloned Campaign descriptor schemas', async () => {
    const generalSchema = {
      type: 'object',
      properties: {
        logicFunctionId: {
          description: 'Use list_logic_function_tools to find an ID.',
          type: 'string',
        },
      },
    };
    const provider = new MyahCampaignOutreachToolProvider(
      {
        generateCampaignOutreachTools: jest.fn().mockReturnValue({
          create_campaign_outreach_workflow_step: {
            name: 'create_campaign_outreach_workflow_step',
            inputSchema: generalSchema,
          },
        }),
      } as never,
      { checkRolesPermissions: jest.fn().mockResolvedValue(true) } as never,
      createActiveCampaignFlatEntityMapsCacheService() as never,
    );

    const [descriptor] = await provider.generateDescriptors(context);

    expect(descriptor).toMatchObject({
      inputSchema: {
        properties: {
          logicFunctionId: {
            description:
              'Use list_campaign_outreach_logic_function_tools to find an ID.',
          },
        },
      },
    });
    expect(generalSchema).toEqual({
      type: 'object',
      properties: {
        logicFunctionId: {
          description: 'Use list_logic_function_tools to find an ID.',
          type: 'string',
        },
      },
    });
    if (!('inputSchema' in descriptor)) {
      throw new Error('Expected Campaign descriptor schema');
    }

    expect(descriptor.inputSchema).not.toBe(generalSchema);
  });

  it('rejects a missing service, non-user context, and missing WORKFLOWS permission', async () => {
    const permissionsService = {
      checkRolesPermissions: jest.fn().mockResolvedValue(false),
    };
    const noServiceProvider = new MyahCampaignOutreachToolProvider(
      null,
      permissionsService as never,
      createActiveCampaignFlatEntityMapsCacheService() as never,
    );
    const provider = new MyahCampaignOutreachToolProvider(
      { generateCampaignOutreachTools: jest.fn() } as never,
      permissionsService as never,
      createActiveCampaignFlatEntityMapsCacheService() as never,
    );

    expect(await noServiceProvider.isAvailable(context)).toBe(false);
    expect(
      await provider.isAvailable({ ...context, authContext: undefined }),
    ).toBe(false);
    expect(await provider.isAvailable(context)).toBe(false);
  });
});
