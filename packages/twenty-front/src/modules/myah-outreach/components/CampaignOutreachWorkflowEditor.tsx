import { CampaignOutreachWorkflowActionBar } from '@/myah-outreach/components/CampaignOutreachWorkflowActionBar';
import { CampaignOutreachWorkflowGraph } from '@/myah-outreach/components/CampaignOutreachWorkflowGraph';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useWorkflowWithCurrentVersion } from '@/workflow/hooks/useWorkflowWithCurrentVersion';
import { styled } from '@linaria/react';
import { Status } from 'twenty-ui/data-display';
import { IconSend } from 'twenty-ui/icon';

const StyledEditor = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
`;

type CampaignOutreachWorkflowEditorProps = {
  campaignId: string;
  workflowId: string;
};

export const CampaignOutreachWorkflowEditor = ({
  campaignId,
  workflowId,
}: CampaignOutreachWorkflowEditorProps) => {
  const workflow = useWorkflowWithCurrentVersion(workflowId);
  const workflowStatus = workflow?.currentVersion.status ?? 'DRAFT';

  return (
    <StyledEditor
      data-campaign-id={campaignId}
      data-testid="campaign-outreach-workflow-editor"
    >
      <PageCardLayout
        showInformationBanner={false}
        header={
          <PageCardHeader
            icon={<IconSend />}
            tag={
              <Status
                color={workflowStatus === 'ACTIVE' ? 'green' : 'gray'}
                text={workflowStatus === 'ACTIVE' ? 'Active' : 'Draft'}
                weight="medium"
              />
            }
            title="Campaign Outreach"
            actionButton={
              <CampaignOutreachWorkflowActionBar workflowId={workflowId} />
            }
          />
        }
      >
        <CampaignOutreachWorkflowGraph workflowId={workflowId} />
      </PageCardLayout>
    </StyledEditor>
  );
};
