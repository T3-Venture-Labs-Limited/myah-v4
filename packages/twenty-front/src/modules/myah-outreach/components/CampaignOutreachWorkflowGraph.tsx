import { getWorkflowVisualizerComponentInstanceId } from '@/workflow/utils/getWorkflowVisualizerComponentInstanceId';
import { WorkflowDiagramCanvasEditable } from '@/workflow/workflow-diagram/components/WorkflowDiagramCanvasEditable';
import { WorkflowDiagramEffect } from '@/workflow/workflow-diagram/components/WorkflowDiagramEffect';
import { WorkflowSSESubscribeEffect } from '@/workflow/workflow-diagram/components/WorkflowSSESubscribeEffect';
import { WorkflowVisualizerEffect } from '@/workflow/workflow-diagram/components/WorkflowVisualizerEffect';
import { WorkflowVisualizerComponentInstanceContext } from '@/workflow/workflow-diagram/states/contexts/WorkflowVisualizerComponentInstanceContext';
import { styled } from '@linaria/react';

const StyledGraph = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

type CampaignOutreachWorkflowGraphProps = {
  workflowId: string;
};

export const CampaignOutreachWorkflowGraph = ({
  workflowId,
}: CampaignOutreachWorkflowGraphProps) => {
  return (
    <StyledGraph>
      <WorkflowVisualizerComponentInstanceContext.Provider
        value={{
          instanceId: getWorkflowVisualizerComponentInstanceId({
            recordId: workflowId,
          }),
        }}
      >
        <WorkflowVisualizerEffect workflowId={workflowId} />
        <WorkflowSSESubscribeEffect workflowId={workflowId} />
        <WorkflowDiagramEffect />
        <WorkflowDiagramCanvasEditable />
      </WorkflowVisualizerComponentInstanceContext.Provider>
    </StyledGraph>
  );
};
