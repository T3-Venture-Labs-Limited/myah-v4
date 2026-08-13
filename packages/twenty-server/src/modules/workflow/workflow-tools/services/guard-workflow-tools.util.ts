import { type ToolSet } from 'ai';

import { getWorkflowToolOutreachAccessGuardTargets } from 'src/modules/workflow/workflow-tools/services/get-workflow-tool-outreach-access-guard-targets.util';

type WorkflowToolOutreachAccessGuard = {
  assertTargetIsGeneralAutomation: (args: {
    target: ReturnType<
      typeof getWorkflowToolOutreachAccessGuardTargets
    >[number];
    workspaceId: string;
  }) => Promise<void>;
};

export const guardWorkflowTools = ({
  assertTargetIsGeneralAutomation,
  tools,
  workspaceId,
}: {
  assertTargetIsGeneralAutomation: WorkflowToolOutreachAccessGuard['assertTargetIsGeneralAutomation'];
  tools: ToolSet;
  workspaceId: string;
}): ToolSet =>
  Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const execute = tool.execute;

      if (execute === undefined) {
        return [toolName, tool];
      }

      return [
        toolName,
        {
          ...tool,
          execute: async (...args: Parameters<typeof execute>) => {
            const [parameters] = args;

            for (const target of getWorkflowToolOutreachAccessGuardTargets(
              parameters,
            )) {
              await assertTargetIsGeneralAutomation({ target, workspaceId });
            }

            return execute(...args);
          },
        },
      ];
    }),
  );
