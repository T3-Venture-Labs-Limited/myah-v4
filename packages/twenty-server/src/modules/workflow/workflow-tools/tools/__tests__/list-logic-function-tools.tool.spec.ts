import { createListLogicFunctionToolsTool } from 'src/modules/workflow/workflow-tools/tools/list-logic-function-tools.tool';

describe('createListLogicFunctionToolsTool', () => {
  it('excludes Campaign Outreach code functions', async () => {
    const flatEntityMapsCacheService = {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
        flatLogicFunctionMaps: {
          byUniversalIdentifier: {
            campaign: {
              deletedAt: null,
              id: 'campaign-function',
              name: 'Campaign Code',
              workflowActionTriggerSettings: {},
            },
            general: {
              deletedAt: null,
              id: 'general-function',
              name: 'General Code',
              workflowActionTriggerSettings: {},
            },
          },
        },
      }),
    };
    const workflowToolOutreachAccessGuardService = {
      getCampaignOutreachLogicFunctionIds: jest
        .fn()
        .mockResolvedValue(new Set(['campaign-function'])),
    };
    const tool = createListLogicFunctionToolsTool(
      {
        flatEntityMapsCacheService,
        workflowToolOutreachAccessGuardService,
      } as never,
      { workspaceId: 'workspace-a' },
    );

    const result = await tool.execute();

    expect(result.logicFunctions).toEqual([
      expect.objectContaining({ id: 'general-function' }),
    ]);
  });
});
