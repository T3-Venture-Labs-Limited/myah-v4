import { useEffect, useMemo, useState } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';

export type MyahInboxInstagramCampaignOption = {
  value: string;
  label: string;
};

export type MyahInboxInstagramCampaignOptionsResult =
  | { status: 'loading'; options: []; reason: null }
  | { status: 'unavailable'; options: []; reason: string }
  | {
      status: 'ready';
      options: MyahInboxInstagramCampaignOption[];
      reason: null;
    };

type CampaignCreatorRecord = {
  id: string;
  campaignId: string;
  __typename: string;
};

type CampaignRecord = {
  id: string;
  name: string | null;
  __typename: string;
};

const CREATOR_UNLINKED_REASON =
  'Link this Instagram conversation to a Creator to show Campaign context.';
const READ_FAILURE_REASON =
  'Campaign context is unavailable because associated Campaigns could not be read.';

// Reads only readable, non-deleted Campaigns connected through CampaignCreator
// memberships for the linked Creator. These are membership-scoped guidance
// candidates: unlike Email's reply-context options, membership alone is
// sufficient here and does not assert outreach evidence or reply eligibility.
// Evidence-backed Instagram context eligibility is MYAH-413's scope.
export const useMyahInboxInstagramCampaignOptions = (
  creatorId: string | null,
): MyahInboxInstagramCampaignOptionsResult => {
  const [campaignCreatorPaginationError, setCampaignCreatorPaginationError] =
    useState(false);
  const {
    records: campaignCreatorRecords,
    loading: campaignCreatorLoading,
    error: campaignCreatorError,
    hasReadPermission: hasCampaignCreatorReadPermission,
    hasNextPage: hasMoreCampaignCreators,
    isFetchingMoreRecords: isFetchingMoreCampaignCreators,
    fetchMoreRecords: fetchMoreCampaignCreators,
  } = useFindManyRecords<CampaignCreatorRecord>({
    objectNameSingular: 'campaignCreator',
    filter: creatorId ? { creatorId: { eq: creatorId } } : undefined,
    recordGqlFields: { id: true, campaignId: true },
    skip: !creatorId,
  });

  useEffect(() => {
    if (
      !creatorId ||
      !hasMoreCampaignCreators ||
      isFetchingMoreCampaignCreators ||
      campaignCreatorPaginationError
    ) {
      return;
    }

    let isMounted = true;
    void fetchMoreCampaignCreators().then((result) => {
      if (isMounted && result?.error) {
        setCampaignCreatorPaginationError(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    creatorId,
    hasMoreCampaignCreators,
    isFetchingMoreCampaignCreators,
    campaignCreatorPaginationError,
    fetchMoreCampaignCreators,
  ]);

  const campaignCreatorsFailed =
    Boolean(creatorId) &&
    (Boolean(campaignCreatorError) ||
      campaignCreatorPaginationError ||
      !hasCampaignCreatorReadPermission);
  const campaignCreatorsSettled =
    Boolean(creatorId) &&
    !campaignCreatorLoading &&
    !hasMoreCampaignCreators &&
    !isFetchingMoreCampaignCreators;

  const campaignIds = useMemo(
    () => [
      ...new Set(campaignCreatorRecords.map(({ campaignId }) => campaignId)),
    ],
    [campaignCreatorRecords],
  );

  const [campaignPaginationError, setCampaignPaginationError] = useState(false);
  const skipCampaignQuery =
    !creatorId ||
    !campaignCreatorsSettled ||
    campaignCreatorsFailed ||
    campaignIds.length === 0;
  const {
    records: campaignRecords,
    loading: campaignLoading,
    error: campaignError,
    hasReadPermission: hasCampaignReadPermission,
    hasNextPage: hasMoreCampaigns,
    isFetchingMoreRecords: isFetchingMoreCampaigns,
    fetchMoreRecords: fetchMoreCampaigns,
  } = useFindManyRecords<CampaignRecord>({
    objectNameSingular: 'campaign',
    filter: campaignIds.length ? { id: { in: campaignIds } } : undefined,
    recordGqlFields: { id: true, name: true },
    limit: campaignIds.length || undefined,
    skip: skipCampaignQuery,
  });

  useEffect(() => {
    if (
      skipCampaignQuery ||
      !hasMoreCampaigns ||
      isFetchingMoreCampaigns ||
      campaignPaginationError
    ) {
      return;
    }

    let isMounted = true;
    void fetchMoreCampaigns().then((result) => {
      if (isMounted && result?.error) {
        setCampaignPaginationError(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    skipCampaignQuery,
    hasMoreCampaigns,
    isFetchingMoreCampaigns,
    campaignPaginationError,
    fetchMoreCampaigns,
  ]);

  return useMemo<MyahInboxInstagramCampaignOptionsResult>(() => {
    if (!creatorId) {
      return {
        status: 'unavailable',
        options: [],
        reason: CREATOR_UNLINKED_REASON,
      };
    }
    if (campaignCreatorsFailed) {
      return {
        status: 'unavailable',
        options: [],
        reason: READ_FAILURE_REASON,
      };
    }
    if (!campaignCreatorsSettled) {
      return { status: 'loading', options: [], reason: null };
    }
    if (campaignIds.length === 0) {
      return { status: 'ready', options: [], reason: null };
    }

    const campaignsFailed =
      Boolean(campaignError) ||
      campaignPaginationError ||
      !hasCampaignReadPermission;
    if (campaignsFailed) {
      return {
        status: 'unavailable',
        options: [],
        reason: READ_FAILURE_REASON,
      };
    }

    const campaignsSettled =
      !campaignLoading && !hasMoreCampaigns && !isFetchingMoreCampaigns;
    if (!campaignsSettled) {
      return { status: 'loading', options: [], reason: null };
    }

    // Only readable, non-deleted Campaigns (already excluded by the query)
    // become options; a stale membership pointing at a deleted or
    // unreadable Campaign is silently dropped rather than shown.
    const readableCampaignById = new Map(
      campaignRecords.map((record) => [record.id, record]),
    );
    const options = campaignIds
      .filter((id) => readableCampaignById.has(id))
      .map((id) => ({
        value: id,
        label:
          readableCampaignById.get(id)?.name?.trim() || 'Untitled Campaign',
      }))
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
      );

    return { status: 'ready', options, reason: null };
  }, [
    creatorId,
    campaignCreatorsFailed,
    campaignCreatorsSettled,
    campaignIds,
    campaignError,
    campaignPaginationError,
    hasCampaignReadPermission,
    campaignLoading,
    hasMoreCampaigns,
    isFetchingMoreCampaigns,
    campaignRecords,
  ]);
};
