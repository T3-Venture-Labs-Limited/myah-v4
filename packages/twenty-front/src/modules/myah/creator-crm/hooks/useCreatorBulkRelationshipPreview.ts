import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
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
};

export const buildCreatorBulkRelationshipPreview = ({
  selectedCreatorIds,
  relationshipRecords,
}: {
  selectedCreatorIds: string[];
  relationshipRecords: ReadonlyArray<CreatorBulkRelationshipPreviewRecord>;
}): CreatorBulkRelationshipPreview => {
  const selectedCreatorIdsSet = new Set(selectedCreatorIds);
  const selectedRelationshipRecords = relationshipRecords.filter(
    ({ creatorId }) => selectedCreatorIdsSet.has(creatorId),
  );
  const linkedCreatorIds = new Set(
    selectedRelationshipRecords.map(({ creatorId }) => creatorId),
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
    recordGqlFields: { id: true, creatorId: true },
    limit: selectedCreatorIds.length,
    skip: selectedCreatorIds.length === 0,
  });

  useEffect(() => {
    setHasPaginationError(false);
  }, [target.id, target.kind, selectedCreatorIds]);

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

  const preview = useMemo(
    () =>
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds,
        relationshipRecords: records,
      }),
    [records, selectedCreatorIds],
  );

  return {
    ...preview,
    loading: loading || hasNextPage || pageInfo?.hasNextPage === true,
    isPreviewUnavailable:
      selectedCreatorIds.length > 0 &&
      (!hasReadPermission || error !== undefined || hasPaginationError),
    refetch,
  };
};
