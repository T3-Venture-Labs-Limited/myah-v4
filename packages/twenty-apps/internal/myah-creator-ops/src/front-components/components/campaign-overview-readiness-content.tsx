import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { CampaignOverviewReadinessView } from 'src/front-components/components/campaign-overview-readiness-view';
import { type CampaignOverviewSnapshot } from 'src/front-components/types/campaign-overview-snapshot.type';
import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';
import { type CoreApiClientLike } from 'src/front-components/types/core-api-client-like.type';
import { changeCampaignStatus } from 'src/front-components/utils/change-campaign-status.util';
import { fetchCampaignOverview } from 'src/front-components/utils/fetch-campaign-overview.util';
import { isPermissionError } from 'src/front-components/utils/is-permission-error.util';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; snapshot: CampaignOverviewSnapshot }
  | { kind: 'missing' }
  | { kind: 'read-restricted' }
  | { kind: 'error'; message: string };

type Feedback = {
  kind: 'error' | 'conflict';
  message: string;
  source: 'mutation' | 'refresh';
};

type LoadCampaignOptions = {
  showLoading?: boolean;
};

type CampaignOverviewReadinessContentProps = {
  campaignId: string;
};

export const CampaignOverviewReadinessContent = ({
  campaignId,
}: CampaignOverviewReadinessContentProps) => {
  const client = useMemo<CoreApiClientLike>(() => new CoreApiClient(), []);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [isUpdateRestricted, setIsUpdateRestricted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const isSavingRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  const loadCampaign = useCallback(
    async ({ showLoading = true }: LoadCampaignOptions = {}) => {
      if (isSavingRef.current) {
        return;
      }

      const requestId = ++loadRequestIdRef.current;

      if (showLoading) {
        setLoadState({ kind: 'loading' });
        setFeedback(null);
      }

      try {
        const snapshot = await fetchCampaignOverview({ client, campaignId });

        if (requestId !== loadRequestIdRef.current || isSavingRef.current) {
          return;
        }

        setLoadState(
          snapshot === null
            ? { kind: 'missing' }
            : { kind: 'loaded', snapshot },
        );

        if (!showLoading) {
          setFeedback((currentFeedback) =>
            currentFeedback?.source === 'refresh' ? null : currentFeedback,
          );
        }
      } catch (error) {
        if (requestId !== loadRequestIdRef.current || isSavingRef.current) {
          return;
        }

        if (isPermissionError(error)) {
          setLoadState({ kind: 'read-restricted' });
        } else if (showLoading) {
          setLoadState({
            kind: 'error',
            message: 'Campaign data could not load. Retry.',
          });
        } else {
          setFeedback({
            kind: 'error',
            message: 'Campaign data could not refresh. Retry.',
            source: 'refresh',
          });
        }
      }
    },
    [campaignId, client],
  );

  useEffect(() => {
    void loadCampaign();

    const refreshCampaign = () => {
      if (document.visibilityState !== 'hidden') {
        void loadCampaign({ showLoading: false });
      }
    };
    const refreshIntervalId = window.setInterval(refreshCampaign, 5000);

    window.addEventListener('focus', refreshCampaign);
    document.addEventListener('visibilitychange', refreshCampaign);

    return () => {
      loadRequestIdRef.current += 1;
      window.clearInterval(refreshIntervalId);
      window.removeEventListener('focus', refreshCampaign);
      document.removeEventListener('visibilitychange', refreshCampaign);
    };
  }, [loadCampaign]);

  const handleChangeStatus = async (targetStatus: CampaignStatus) => {
    if (isSavingRef.current || loadState.kind !== 'loaded') {
      return;
    }

    const observedSnapshot = loadState.snapshot;
    loadRequestIdRef.current += 1;
    isSavingRef.current = true;
    setIsSaving(true);
    setFeedback(null);

    try {
      const result = await changeCampaignStatus({
        client,
        campaignId,
        targetStatus,
      });

      if (result.kind === 'conflict') {
        setLoadState(
          result.campaign === null
            ? { kind: 'missing' }
            : { kind: 'loaded', snapshot: result.campaign },
        );
        setFeedback({
          kind: 'conflict',
          message: 'This Campaign changed. Review it and try again.',
          source: 'mutation',
        });
        return;
      }

      setLoadState({
        kind: 'loaded',
        snapshot: {
          ...observedSnapshot,
          status: result.campaign.status,
        },
      });

      try {
        const refreshedSnapshot = await fetchCampaignOverview({
          client,
          campaignId,
        });

        setLoadState(
          refreshedSnapshot === null
            ? { kind: 'missing' }
            : { kind: 'loaded', snapshot: refreshedSnapshot },
        );
      } catch {
        setFeedback({
          kind: 'error',
          message: 'Campaign changed, but refreshed data could not load.',
          source: 'mutation',
        });
      }
    } catch (error) {
      if (isPermissionError(error)) {
        setIsUpdateRestricted(true);
      } else {
        setFeedback({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Campaign status could not be changed.',
          source: 'mutation',
        });
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <CampaignOverviewReadinessView
      loadState={loadState}
      isUpdateRestricted={isUpdateRestricted}
      isSaving={isSaving}
      feedback={feedback}
      onRetry={() => void loadCampaign()}
      onChangeStatus={(targetStatus) => void handleChangeStatus(targetStatus)}
    />
  );
};
