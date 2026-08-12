import { useCallback, useEffect, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { CampaignOutreachEmptyState } from '@/myah-outreach/components/CampaignOutreachEmptyState';
import { CampaignOutreachWorkflowEditor } from '@/myah-outreach/components/CampaignOutreachWorkflowEditor';
import {
  CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
  FIND_CAMPAIGN_OUTREACH_WORKFLOW,
} from '@/myah-outreach/graphql/operations';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import { InlineBanner, Loader } from 'twenty-ui/feedback';
import { styled } from '@linaria/react';

type CampaignOutreachWorkflow = {
  campaignId: string;
  currentVersionId: string | null;
  name: string | null;
  workflowId: string;
};

type FindCampaignOutreachWorkflowResult = {
  findCampaignOutreachWorkflow: CampaignOutreachWorkflow | null;
};

type CreateCampaignOutreachWorkflowResult = {
  createCampaignOutreachWorkflow: CampaignOutreachWorkflow;
};

type CampaignOutreachTabProps = {
  campaignId: string;
};

type CampaignOutreachTabState =
  | { kind: 'loading' }
  | { kind: 'loaded'; workflow: CampaignOutreachWorkflow | null }
  | { kind: 'permission-error' }
  | { kind: 'request-error' };

const StyledCampaignOutreachTab = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
`;

export const CampaignOutreachTab = ({
  campaignId,
}: CampaignOutreachTabProps) => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueErrorSnackBar } = useSnackBar();
  const [state, setState] = useState<CampaignOutreachTabState>({
    kind: 'loading',
  });
  const [isCreating, setIsCreating] = useState(false);

  const loadCampaignOutreachWorkflow = useCallback(async () => {
    setState({ kind: 'loading' });

    try {
      const { data } =
        await apolloCoreClient.query<FindCampaignOutreachWorkflowResult>({
          query: FIND_CAMPAIGN_OUTREACH_WORKFLOW,
          variables: { campaignId },
        });

      if (!data) {
        throw new Error('Campaign Outreach query returned no data');
      }

      setState({
        kind: 'loaded',
        workflow: data.findCampaignOutreachWorkflow,
      });
    } catch (error) {
      setState(
        isGraphqlErrorOfType(error, 'FORBIDDEN')
          ? { kind: 'permission-error' }
          : { kind: 'request-error' },
      );
    }
  }, [apolloCoreClient, campaignId]);

  useEffect(() => {
    void loadCampaignOutreachWorkflow();
  }, [loadCampaignOutreachWorkflow]);

  const createCampaignOutreachWorkflow = useCallback(async () => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const { data } =
        await apolloCoreClient.mutate<CreateCampaignOutreachWorkflowResult>({
          mutation: CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
          variables: { campaignId },
        });

      if (!data) {
        throw new Error('Campaign Outreach creation returned no data');
      }

      setState({
        kind: 'loaded',
        workflow: data.createCampaignOutreachWorkflow,
      });
    } catch {
      enqueueErrorSnackBar({
        message: 'Unable to create the outreach workflow.',
      });
    } finally {
      setIsCreating(false);
    }
  }, [apolloCoreClient, campaignId, enqueueErrorSnackBar, isCreating]);

  if (state.kind === 'loading') {
    return (
      <div aria-label="Loading Campaign Outreach">
        <Loader />
      </div>
    );
  }

  if (state.kind === 'permission-error') {
    return (
      <InlineBanner
        color="danger"
        message="You don't have permission to view Campaign Outreach."
      />
    );
  }

  if (state.kind === 'request-error') {
    return (
      <InlineBanner
        button={{
          onClick: () => void loadCampaignOutreachWorkflow(),
          title: 'Retry',
        }}
        color="danger"
        message="Campaign Outreach could not load. Retry."
      />
    );
  }

  return (
    <StyledCampaignOutreachTab data-testid="campaign-outreach-tab">
      {state.workflow ? (
        <CampaignOutreachWorkflowEditor
          campaignId={campaignId}
          workflowId={state.workflow.workflowId}
        />
      ) : (
        <CampaignOutreachEmptyState
          isCreating={isCreating}
          onCreate={createCampaignOutreachWorkflow}
        />
      )}
    </StyledCampaignOutreachTab>
  );
};
