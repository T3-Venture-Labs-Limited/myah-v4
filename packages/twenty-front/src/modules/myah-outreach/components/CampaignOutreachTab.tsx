import { useCallback, useEffect, useRef, useState } from 'react';
import { styled } from '@linaria/react';
import { InlineBanner, Loader } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';

import { CampaignOutreachEmptyState } from '@/myah-outreach/components/CampaignOutreachEmptyState';
import { CampaignOutreachWorkflowEditor } from '@/myah-outreach/components/CampaignOutreachWorkflowEditor';
import {
  CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
  REPLACE_LEGACY_CAMPAIGN_SEQUENCE,
} from '@/myah-outreach/graphql/operations';
import { useCampaignSequence } from '@/myah-outreach/hooks/useCampaignSequence';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

const StyledCampaignOutreachTab = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
`;

const StyledLegacyState = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: auto;
  max-width: 560px;
`;

type CampaignOutreachTabProps = {
  campaignId: string;
  isInSidePanel?: boolean;
};

export const CampaignOutreachTab = ({
  campaignId,
  isInSidePanel = false,
}: CampaignOutreachTabProps) => {
  const apolloCoreClient = useApolloCoreClient();
  const sequenceState = useCampaignSequence(campaignId);
  const { enqueueErrorSnackBar } = useSnackBar();
  const [pendingActionCampaignId, setPendingActionCampaignId] = useState<
    string | null
  >(null);
  // Request identity, not render state: prevents an old Campaign mutation from applying.
  // oxlint-disable-next-line twenty/no-state-useref
  const campaignIdRef = useRef(campaignId);
  // oxlint-disable-next-line twenty/no-state-useref
  const mountedRef = useRef(true);
  campaignIdRef.current = campaignId;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runDefinitionAction = useCallback(
    async (action: 'CREATE' | 'REPLACE', expectedWorkflowId?: string) => {
      if (pendingActionCampaignId === campaignId) {
        return;
      }

      const requestCampaignId = campaignId;
      setPendingActionCampaignId(requestCampaignId);

      try {
        if (action === 'CREATE') {
          const result = await apolloCoreClient.mutate({
            mutation: CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
            variables: { campaignId: requestCampaignId },
          });
          if (!result.data) {
            throw new Error('Campaign sequence creation returned no data.');
          }
        } else {
          const result = await apolloCoreClient.mutate({
            mutation: REPLACE_LEGACY_CAMPAIGN_SEQUENCE,
            variables: {
              input: {
                campaignId: requestCampaignId,
                expectedWorkflowId,
              },
            },
          });
          if (!result.data) {
            throw new Error('Legacy replacement returned no data.');
          }
        }

        if (mountedRef.current && campaignIdRef.current === requestCampaignId) {
          await sequenceState.reload();
        }
      } catch {
        if (mountedRef.current && campaignIdRef.current === requestCampaignId) {
          enqueueErrorSnackBar({
            message:
              action === 'CREATE'
                ? 'Unable to create the Campaign sequence.'
                : 'Unable to replace legacy Campaign outreach.',
          });
        }
      } finally {
        if (mountedRef.current) {
          setPendingActionCampaignId((currentCampaignId) =>
            currentCampaignId === requestCampaignId ? null : currentCampaignId,
          );
        }
      }
    },
    [
      apolloCoreClient,
      campaignId,
      enqueueErrorSnackBar,
      pendingActionCampaignId,
      sequenceState,
    ],
  );

  if (sequenceState.loading) {
    return (
      <div aria-label="Loading Campaign Outreach">
        <Loader />
      </div>
    );
  }

  if (sequenceState.error && sequenceState.loadResult === null) {
    return (
      <InlineBanner
        button={{ onClick: () => void sequenceState.reload(), title: 'Retry' }}
        color="danger"
        message="Campaign Outreach could not load. Retry."
      />
    );
  }

  if (sequenceState.loadResult === null) {
    return null;
  }

  const isPending = pendingActionCampaignId === campaignId;

  return (
    <StyledCampaignOutreachTab data-testid="campaign-outreach-tab">
      {sequenceState.loadResult.kind === 'ABSENT' ? (
        <CampaignOutreachEmptyState
          isCreating={isPending}
          onCreate={() => runDefinitionAction('CREATE')}
        />
      ) : sequenceState.loadResult.kind === 'LEGACY' ? (
        <StyledLegacyState aria-label="Legacy Campaign outreach">
          <h2>Legacy Campaign outreach</h2>
          <p>
            This Campaign uses an older generic workflow definition. Viewing
            this tab does not modify it. Replace it explicitly to start a new
            restricted sequence; legacy graph content is not migrated.
          </p>
          <Button
            ariaLabel="Replace legacy outreach"
            disabled={isPending}
            isLoading={isPending}
            onClick={() =>
              void runDefinitionAction(
                'REPLACE',
                sequenceState.loadResult?.kind === 'LEGACY'
                  ? sequenceState.loadResult.workflowId
                  : undefined,
              )
            }
            title="Replace legacy outreach"
            variant="secondary"
          />
        </StyledLegacyState>
      ) : (
        <CampaignOutreachWorkflowEditor
          campaignId={campaignId}
          isInSidePanel={isInSidePanel}
          sequenceState={sequenceState}
        />
      )}
    </StyledCampaignOutreachTab>
  );
};
