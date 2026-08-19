import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';

import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type FlatLogicFunction } from 'src/engine/metadata-modules/logic-function/types/flat-logic-function.type';
import { type WorkflowToolOutreachAccessGuardService } from 'src/modules/workflow/workflow-tools/services/workflow-tool-outreach-access-guard.service';
import { type WorkflowToolContext } from 'src/modules/workflow/workflow-tools/types/workflow-tool-dependencies.type';

const listLogicFunctionToolsSchema = z.object({});

export const createListLogicFunctionToolsTool = (
  deps: {
    flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService;
    workflowToolOutreachAccessGuardService: WorkflowToolOutreachAccessGuardService;
  },
  context: WorkflowToolContext,
) => ({
  name: 'list_logic_function_tools' as const,
  description:
    'List all logic functions exposed as workflow actions, which can be added as LOGIC_FUNCTION steps in workflows. Returns their IDs, names, and descriptions.',
  inputSchema: listLogicFunctionToolsSchema,
  execute: async () => {
    const [{ flatLogicFunctionMaps }, campaignLogicFunctionIds] =
      await Promise.all([
        deps.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps({
          workspaceId: context.workspaceId,
          flatMapsKeys: ['flatLogicFunctionMaps'],
        }),
        deps.workflowToolOutreachAccessGuardService.getCampaignOutreachLogicFunctionIds(
          { workspaceId: context.workspaceId },
        ),
      ]);

    const workflowActionFunctions = Object.values(
      flatLogicFunctionMaps.byUniversalIdentifier,
    ).filter(
      (fn): fn is FlatLogicFunction =>
        isDefined(fn) &&
        isDefined(fn.workflowActionTriggerSettings) &&
        fn.deletedAt === null &&
        !campaignLogicFunctionIds.has(fn.id),
    );

    return {
      success: true,
      logicFunctions: workflowActionFunctions.map((fn) => ({
        id: fn.id,
        name: fn.name,
        displayName: fn.workflowActionTriggerSettings?.label ?? fn.name,
        description: fn.description,
      })),
    };
  },
});
