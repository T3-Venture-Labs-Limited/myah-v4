import { useCallback, useEffect, useRef, useState } from 'react';

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

type CampaignOutreachTabState = {
  campaignId: string;
  creationError?: boolean;
} & (
  | { kind: 'loading' }
  | { kind: 'loaded'; workflow: CampaignOutreachWorkflow | null }
  | { kind: 'permission-error' }
  | { kind: 'request-error' }
);

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
    campaignId,
    kind: 'loading',
  });
  const [creatingCampaignId, setCreatingCampaignId] = useState<string | null>(
    null,
  );
  const [reloadCount, setReloadCount] = useState(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentCampaignIdRef = useRef(campaignId);
  currentCampaignIdRef.current = campaignId;

  useEffect(() => {
    let isMounted = true;

    setState({ campaignId, kind: 'loading' });

    const loadCampaignOutreachWorkflow = async () => {
      try {
        const { data } =
          await apolloCoreClient.query<FindCampaignOutreachWorkflowResult>({
            fetchPolicy: 'network-only',
            query: FIND_CAMPAIGN_OUTREACH_WORKFLOW,
            variables: { campaignId },
          });

        if (!data) {
          throw new Error('Campaign Outreach query returned no data');
        }

        if (!isMounted) {
          return;
        }

        setState({
          campaignId,
          kind: 'loaded',
          workflow: data.findCampaignOutreachWorkflow,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState(
          isGraphqlErrorOfType(error, 'FORBIDDEN')
            ? { campaignId, kind: 'permission-error' }
            : { campaignId, kind: 'request-error' },
        );
      }
    };

    void loadCampaignOutreachWorkflow();

    return () => {
      isMounted = false;
    };
  }, [apolloCoreClient, campaignId, reloadCount]);

  useEffect(() => {
    if (state.campaignId !== campaignId || !state.creationError) {
      return;
    }

    enqueueErrorSnackBar({
      message: 'Unable to create the outreach workflow.',
    });
    setState((currentState) =>
      currentState.campaignId === campaignId && currentState.creationError
        ? { ...currentState, creationError: false }
        : currentState,
    );
  }, [campaignId, enqueueErrorSnackBar, state.campaignId, state.creationError]);
  const isCreating = creatingCampaignId === campaignId;

  const createCampaignOutreachWorkflow = useCallback(async () => {
    if (isCreating) {
      return;
    }

    setCreatingCampaignId(campaignId);

    try {
      const { data } =
        await apolloCoreClient.mutate<CreateCampaignOutreachWorkflowResult>({
          mutation: CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
          variables: { campaignId },
        });

      if (!data) {
        throw new Error('Campaign Outreach creation returned no data');
      }

      if (currentCampaignIdRef.current !== campaignId) {
        return;
      }

      setState((currentState) =>
        currentState.campaignId === campaignId
          ? {
              campaignId,
              kind: 'loaded',
              workflow: data.createCampaignOutreachWorkflow,
            }
          : currentState,
      );
    } catch {
      if (currentCampaignIdRef.current !== campaignId) {
        return;
      }
      setState((currentState) =>
        currentState.campaignId === campaignId
          ? { ...currentState, creationError: true }
          : currentState,
      );
    } finally {
      setCreatingCampaignId((currentCampaignId) =>
        currentCampaignId === campaignId ? null : currentCampaignId,
      );
    }
  }, [apolloCoreClient, campaignId, currentCampaignIdRef, isCreating]);

  if (state.campaignId !== campaignId || state.kind === 'loading') {
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
          onClick: () => setReloadCount((count) => count + 1),
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
