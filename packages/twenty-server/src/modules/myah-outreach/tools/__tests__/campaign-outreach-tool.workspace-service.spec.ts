import { z } from 'zod';

jest.mock(
  'src/modules/myah-outreach/services/campaign-outreach-workflow.service',
  () => ({ CampaignOutreachWorkflowService: class {} }),
);
jest.mock(
  'src/modules/myah-outreach/tools/campaign-outreach-tool-access-guard.service',
  () => ({ CampaignOutreachToolAccessGuardService: class {} }),
);

import { CampaignOutreachToolWorkspaceService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool.workspace-service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const campaignId = '20202020-1c25-4d02-bf25-6aeccf7ea420';
const workflowId = '20202020-1c25-4d02-bf25-6aeccf7ea421';
const authContext = { type: 'user', workspace: { id: workspaceId } } as never;

const names = [
  'get_campaign_outreach_workflow',
  'create_campaign_outreach_workflow',
  'get_campaign_outreach_workflow_current_version',
  'create_campaign_outreach_workflow_draft',
  'create_campaign_outreach_workflow_step',
  'update_campaign_outreach_workflow_step',
  'delete_campaign_outreach_workflow_step',
  'create_campaign_outreach_workflow_edge',
  'delete_campaign_outreach_workflow_edge',
  'update_campaign_outreach_workflow_trigger',
  'update_campaign_outreach_workflow_positions',
  'compute_campaign_outreach_step_output_schema',
  'validate_campaign_outreach_workflow',
  'activate_campaign_outreach_workflow',
  'deactivate_campaign_outreach_workflow',
  'list_campaign_outreach_workflow_runs',
  'get_campaign_outreach_workflow_run',
  'list_campaign_outreach_logic_function_tools',
  'update_campaign_outreach_logic_function_source',
  'update_campaign_outreach_agent',
] as const;

const baseNames = [
  'get_workflow_current_version',
  'create_draft_from_workflow_version',
  'create_workflow_version_step',
  'update_workflow_version_step',
  'delete_workflow_version_step',
  'create_workflow_version_edge',
  'delete_workflow_version_edge',
  'update_workflow_version_trigger',
  'update_workflow_version_positions',
  'compute_step_output_schema',
  'validate_workflow',
  'activate_workflow_version',
  'deactivate_workflow_version',
  'list_workflow_runs',
  'get_workflow_run',
  'list_logic_function_tools',
  'update_logic_function_source',
  'update_agent',
] as const;

describe('CampaignOutreachToolWorkspaceService', () => {
  it('prefixes the allowed workflow factories, requires campaignId, guards targets and strips only the wrapper field', async () => {
    const execute = jest.fn().mockResolvedValue({ result: 'ok' });
    const toolSet = Object.fromEntries(
      baseNames.map((name) => [
        name,
        {
          name,
          description: name,
          inputSchema: z.object({ workflowId: z.string().uuid().optional() }),
          execute,
        },
      ]),
    );
    const buildWorkflowToolSet = jest.fn().mockReturnValue({
      ...toolSet,
      list_workflows: { name: 'list_workflows', inputSchema: z.object({}) },
      create_complete_workflow: {
        name: 'create_complete_workflow',
        inputSchema: z.object({}),
      },
      delete_workflow: { name: 'delete_workflow', inputSchema: z.object({}) },
    });
    const assertTargetBelongsToCampaign = jest
      .fn()
      .mockResolvedValue(undefined);
    const campaignOutreachWorkflowService = {
      find: jest.fn().mockResolvedValue({ campaignId, workflowId }),
      createOrGet: jest.fn().mockResolvedValue({ campaignId, workflowId }),
    };
    const service = new CampaignOutreachToolWorkspaceService(
      campaignOutreachWorkflowService as never,
      { buildWorkflowToolSet } as never,
      { assertTargetBelongsToCampaign } as never,
    );

    const tools = service.generateCampaignOutreachTools({
      authContext,
      rolePermissionConfig: {} as never,
    });

    expect(Object.keys(tools).sort()).toEqual([...names].sort());
    expect(tools.create_complete_workflow).toBeUndefined();
    expect(tools.delete_workflow).toBeUndefined();
    expect(tools.list_workflows).toBeUndefined();
    for (const tool of Object.values(tools)) {
      expect(
        z.safeParse(tool.inputSchema as z.ZodType, { campaignId }).success,
      ).toBe(true);
      expect(z.safeParse(tool.inputSchema as z.ZodType, {}).success).toBe(
        false,
      );
    }

    await tools.get_campaign_outreach_workflow_current_version.execute!(
      { campaignId, workflowId },
      {} as never,
    );

    expect(assertTargetBelongsToCampaign).toHaveBeenCalledWith({
      action: 'ownedResource',
      authContext,
      campaignId,
      target: { type: 'workflow', id: workflowId },
    });
    expect(execute).toHaveBeenCalledWith({ workflowId }, {});
    await tools.create_campaign_outreach_workflow_step.execute!(
      {
        campaignId,
        defaultSettings: { input: { logicFunctionId: workflowId } },
      },
      {} as never,
    );
    expect(assertTargetBelongsToCampaign).toHaveBeenLastCalledWith({
      action: 'createWorkflowVersionStep',
      authContext,
      campaignId,
      target: { type: 'logicFunction', id: workflowId },
    });

    await tools.update_campaign_outreach_workflow_step.execute!(
      {
        campaignId,
        step: { settings: { input: { logicFunctionId: workflowId } } },
      },
      {} as never,
    );
    expect(assertTargetBelongsToCampaign).toHaveBeenLastCalledWith({
      action: 'updateWorkflowVersionStep',
      authContext,
      campaignId,
      target: { type: 'logicFunction', id: workflowId },
    });

    await tools.update_campaign_outreach_logic_function_source.execute!(
      {
        campaignId,
        logicFunctionId: workflowId,
      },
      {} as never,
    );
    expect(assertTargetBelongsToCampaign).toHaveBeenLastCalledWith({
      action: 'updateLogicFunctionSource',
      authContext,
      campaignId,
      target: { type: 'logicFunction', id: workflowId },
    });
  });
  it('lists runs only through the resolved Campaign workflow', async () => {
    const listRuns = jest.fn().mockResolvedValue({
      success: true,
      workflowRuns: [],
    });
    const execute = jest.fn();
    const campaignOutreachWorkflowService = {
      listRuns,
    };
    const service = new CampaignOutreachToolWorkspaceService(
      campaignOutreachWorkflowService as never,
      {
        buildWorkflowToolSet: jest.fn().mockReturnValue({
          list_workflow_runs: {
            name: 'list_workflow_runs',
            inputSchema: z.object({
              limit: z.number().optional(),
              status: z.string().optional(),
            }),
            execute,
          },
        }),
      } as never,
      { assertTargetBelongsToCampaign: jest.fn() } as never,
    );

    const result = await service.generateCampaignOutreachTools({
      authContext,
      rolePermissionConfig: {} as never,
    }).list_campaign_outreach_workflow_runs.execute!(
      { campaignId, limit: 5, status: 'FAILED' },
      {} as never,
    );

    expect(result).toEqual({ success: true, workflowRuns: [] });
    expect(listRuns).toHaveBeenCalledWith({
      authContext,
      campaignId,
      limit: 5,
      rolePermissionConfig: {},
      status: 'FAILED',
      workspaceId,
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it('denies targetless Campaign Outreach tools before delegation when the Campaign is unreadable', async () => {
    const execute = jest.fn();
    const campaignOutreachWorkflowService = {
      find: jest
        .fn()
        .mockRejectedValue(new Error('Campaign not found or inaccessible')),
    };
    const service = new CampaignOutreachToolWorkspaceService(
      campaignOutreachWorkflowService as never,
      {
        buildWorkflowToolSet: jest.fn().mockReturnValue({
          list_logic_function_tools: {
            name: 'list_logic_function_tools',
            inputSchema: z.object({}),
            execute,
          },
        }),
      } as never,
      { assertTargetBelongsToCampaign: jest.fn() } as never,
    );

    await expect(
      service.generateCampaignOutreachTools({
        authContext,
        rolePermissionConfig: {} as never,
      }).list_campaign_outreach_logic_function_tools.execute!(
        { campaignId },
        {} as never,
      ),
    ).rejects.toThrow('Campaign not found or inaccessible');

    expect(campaignOutreachWorkflowService.find).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses the Campaign workflow owner for find and creation', async () => {
    const campaignOutreachWorkflowService = {
      find: jest.fn().mockResolvedValue(null),
      createOrGet: jest.fn().mockResolvedValue({ campaignId, workflowId }),
    };
    const service = new CampaignOutreachToolWorkspaceService(
      campaignOutreachWorkflowService as never,
      { buildWorkflowToolSet: jest.fn().mockReturnValue({}) } as never,
      { assertTargetBelongsToCampaign: jest.fn() } as never,
    );
    const tools = service.generateCampaignOutreachTools({
      authContext,
      rolePermissionConfig: {} as never,
    });

    await tools.get_campaign_outreach_workflow.execute!(
      { campaignId },
      {} as never,
    );
    await tools.create_campaign_outreach_workflow.execute!(
      { campaignId },
      {} as never,
    );

    expect(campaignOutreachWorkflowService.find).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId,
    });
    expect(campaignOutreachWorkflowService.createOrGet).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId,
    });
  });

  it('leaves shared input schemas untouched and rewrites only next-step instructions', async () => {
    const execute = jest.fn().mockResolvedValue({
      nextStep:
        'Call update_logic_function_source, update_agent, update_workflow_version_step, then validate_workflow.',
      name: 'update_logic_function_source',
      prompt: 'Call update_logic_function_source after persisting this prompt.',
    });
    const inputSchema = z.object({
      logicFunctionId: z
        .string()
        .describe('Use list_logic_function_tools to find an ID.'),
    });

    const service = new CampaignOutreachToolWorkspaceService(
      {} as never,
      {
        buildWorkflowToolSet: jest.fn().mockReturnValue({
          create_workflow_version_step: {
            name: 'create_workflow_version_step',
            description:
              'Use list_logic_function_tools, then call validate_workflow.',
            inputSchema,
            execute,
          },
        }),
      } as never,
      { assertTargetBelongsToCampaign: jest.fn() } as never,
    );

    const tool = service.generateCampaignOutreachTools({
      authContext,
      rolePermissionConfig: {} as never,
    }).create_campaign_outreach_workflow_step;

    expect(inputSchema.shape.logicFunctionId.description).toBe(
      'Use list_logic_function_tools to find an ID.',
    );
    await expect(
      tool.execute!(
        { campaignId, workflowVersionId: 'version-a' },
        {} as never,
      ),
    ).resolves.toEqual({
      nextStep:
        'Call update_campaign_outreach_logic_function_source, update_campaign_outreach_agent, update_campaign_outreach_workflow_step, then validate_campaign_outreach_workflow.',
      name: 'update_logic_function_source',
      prompt: 'Call update_logic_function_source after persisting this prompt.',
    });
  });
});
