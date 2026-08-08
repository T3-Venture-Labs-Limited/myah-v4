import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useEffect, useMemo, useState } from 'react';

import {
  type CreatorBulkRelationshipPreview,
  type CreatorBulkRelationshipTarget,
} from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';

type CreatorBulkRelationshipPreviewRecord = {
  id: string;
  creatorId: string;
};

type CreatorBulkRelationshipRecord = CreatorBulkRelationshipPreviewRecord & {
  __typename: string;
  isDirectlyAdded?: boolean;
};

type CreatorListMembershipRemovalImpact = {
  affectedCampaignIds: string[];
  requiresConfirmation: boolean;
  confirmationToken?: string;
};

type CreatorListMembershipRemovalImpactData = {
  creatorListMembershipRemovalImpact: CreatorListMembershipRemovalImpact;
};

const CREATOR_LIST_MEMBERSHIP_REMOVAL_IMPACT = gql`
  query CreatorListMembershipRemovalImpact(
    $input: CreatorListMembershipIntentInput!
  ) {
    creatorListMembershipRemovalImpact(input: $input) {
      affectedCampaignIds
      requiresConfirmation
      confirmationToken
    }
  }
`;

type CampaignPreviewRecord = ObjectRecord & {
  name?: string;
};

export const buildCreatorBulkRelationshipPreview = ({
  selectedCreatorIds,
  relationshipRecords,
  targetKind = 'creator-list',
}: {
  selectedCreatorIds: string[];
  relationshipRecords: ReadonlyArray<
    CreatorBulkRelationshipPreviewRecord & { isDirectlyAdded?: boolean }
  >;
  targetKind?: CreatorBulkRelationshipTarget['kind'];
}): CreatorBulkRelationshipPreview => {
  const selectedCreatorIdsSet = new Set(selectedCreatorIds);
  const selectedRelationshipRecords = relationshipRecords.filter(
    ({ creatorId }) => selectedCreatorIdsSet.has(creatorId),
  );
  const linkedCreatorIds = new Set(
    selectedRelationshipRecords
      .filter(
        ({ isDirectlyAdded }) =>
          targetKind !== 'campaign' || isDirectlyAdded !== false,
      )
      .map(({ creatorId }) => creatorId),
  );

  return {
    selectedCreatorIds,
    linkedCreatorIds: selectedCreatorIds.filter((creatorId) =>
      linkedCreatorIds.has(creatorId),
    ),
    unlinkedCreatorIds: selectedCreatorIds.filter(
      (creatorId) => !linkedCreatorIds.has(creatorId),
    ),
    relationshipRecordIds: selectedRelationshipRecords.map(({ id }) => id),
  };
};

export const useCreatorBulkRelationshipPreview = ({
  target,
  selectedCreatorIds,
}: {
  target: CreatorBulkRelationshipTarget;
  selectedCreatorIds: string[];
}) => {
  const [hasPaginationError, setHasPaginationError] = useState(false);

  const objectNameSingular =
    target.kind === 'creator-list' ? 'creatorListMember' : 'campaignCreator';
  const targetFieldName =
    target.kind === 'creator-list' ? 'creatorListId' : 'campaignId';

  const {
    records,
    loading,
    error,
    hasReadPermission,
    hasNextPage,
    isFetchingMoreRecords,
    pageInfo,
    fetchMoreRecords,
    refetch,
  } = useFindManyRecords<CreatorBulkRelationshipRecord>({
    objectNameSingular,
    filter: {
      and: [
        { [targetFieldName]: { eq: target.id } },
        { creatorId: { in: selectedCreatorIds } },
      ],
    },
    recordGqlFields: {
      id: true,
      creatorId: true,
      ...(target.kind === 'campaign' ? { isDirectlyAdded: true } : {}),
    },
    limit: selectedCreatorIds.length,
    skip: selectedCreatorIds.length === 0,
  });
  const preview = useMemo(
    () =>
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds,
        relationshipRecords: records,
        targetKind: target.kind,
      }),
    [records, selectedCreatorIds, target.kind],
  );

  const impactEnabled =
    target.kind === 'creator-list' &&
    preview.relationshipRecordIds.length === 1 &&
    preview.linkedCreatorIds.length === 1;
  const {
    data: impactData,
    loading: impactLoading,
    error: impactError,
    refetch: refetchImpact,
  } = useQuery<
    CreatorListMembershipRemovalImpactData,
    { input: { creatorListId: string; creatorId: string } }
  >(CREATOR_LIST_MEMBERSHIP_REMOVAL_IMPACT, {
    variables: {
      input: {
        creatorListId: target.id,
        creatorId: preview.linkedCreatorIds[0] ?? '',
      },
    },
    skip: !impactEnabled,
  });
  const impact = impactData?.creatorListMembershipRemovalImpact;
  const {
    records: campaignRecords = [],
    loading: campaignsLoading,
    error: campaignsError,
  } = useFindManyRecords<CampaignPreviewRecord>({
    objectNameSingular: 'campaign',
    filter: { id: { in: impact?.affectedCampaignIds ?? [] } },
    recordGqlFields: { id: true, name: true },
    limit: impact?.affectedCampaignIds.length ?? 0,
    skip: !impactEnabled || !impact?.requiresConfirmation,
  });
  const campaignImpact =
    impact?.requiresConfirmation === true
      ? {
          campaignIds: impact.affectedCampaignIds,
          campaigns: campaignRecords.map(({ id, name }) => ({
            id,
            label: name?.trim() || 'Campaign (name unavailable)',
          })),
          confirmationToken: impact.confirmationToken,
        }
      : undefined;

  useEffect(() => {
    if (
      selectedCreatorIds.length === 0 ||
      !hasNextPage ||
      isFetchingMoreRecords ||
      hasPaginationError
    ) {
      return;
    }

    let isMounted = true;

    void fetchMoreRecords().then((fetchMoreResult) => {
      if (isMounted && fetchMoreResult?.error) {
        setHasPaginationError(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    fetchMoreRecords,
    hasNextPage,
    hasPaginationError,
    isFetchingMoreRecords,
    records,
    selectedCreatorIds.length,
  ]);

  return {
    ...preview,
    loading:
      loading ||
      hasNextPage ||
      pageInfo?.hasNextPage === true ||
      (impactEnabled && (impactLoading || campaignsLoading)),
    isPreviewUnavailable:
      selectedCreatorIds.length > 0 &&
      (!hasReadPermission ||
        error !== undefined ||
        hasPaginationError ||
        (impactEnabled &&
          (impactError !== undefined || campaignsError !== undefined))),
    campaignImpact,
    refetch,
    refetchImpact,
  };
};
