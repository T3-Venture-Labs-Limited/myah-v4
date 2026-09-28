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
  isDirectlyAdded?: boolean;
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
          targetKind !== 'campaign' || isDirectlyAdded === true,
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
  const scope = `${target.kind}:${target.id}:${selectedCreatorIds.join(',')}`;
  const [paginationErrorScope, setPaginationErrorScope] = useState<
    string | null
  >(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const hasPaginationError = paginationErrorScope === scope;

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
  const hasUnverifiableRecords = records.some(
    ({ id, creatorId, isDirectlyAdded }) =>
      !id ||
      !creatorId ||
      (target.kind === 'campaign' && typeof isDirectlyAdded !== 'boolean'),
  );
  const preview = useMemo(
    () =>
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds,
        relationshipRecords: records,
        targetKind: target.kind,
      }),
    [records, selectedCreatorIds, target.kind],
  );

  useEffect(() => {
    if (
      selectedCreatorIds.length === 0 ||
      !hasReadPermission ||
      hasUnverifiableRecords ||
      loading ||
      error !== undefined ||
      pageInfo?.hasNextPage !== true ||
      !hasNextPage ||
      isFetchingMoreRecords ||
      hasPaginationError
    ) {
      return;
    }

    let isMounted = true;

    void fetchMoreRecords().then((fetchMoreResult) => {
      if (isMounted && fetchMoreResult?.error) {
        setPaginationErrorScope(scope);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    fetchMoreRecords,
    hasNextPage,
    hasPaginationError,
    hasReadPermission,
    hasUnverifiableRecords,
    isFetchingMoreRecords,
    loading,
    error,
    pageInfo?.hasNextPage,
    records,
    scope,
    selectedCreatorIds.length,
  ]);

  const retryPreview = async () => {
    if (
      selectedCreatorIds.length === 0 ||
      !hasReadPermission ||
      hasUnverifiableRecords ||
      (error === undefined && !hasPaginationError) ||
      isRetrying
    ) {
      return;
    }

    setIsRetrying(true);
    try {
      const result = await refetch();
      if (!result.error) {
        setPaginationErrorScope((current) =>
          current === scope ? null : current,
        );
      }
    } catch {
      // Keep the preview unavailable until an authoritative read succeeds.
    } finally {
      setIsRetrying(false);
    }
  };

  return {
    ...preview,
    loading:
      loading || hasNextPage || pageInfo?.hasNextPage === true || isRetrying,
    isPreviewUnavailable:
      selectedCreatorIds.length > 0 &&
      (!hasReadPermission ||
        error !== undefined ||
        hasPaginationError ||
        hasUnverifiableRecords),
    canRetry:
      selectedCreatorIds.length > 0 &&
      hasReadPermission &&
      !hasUnverifiableRecords &&
      (error !== undefined || hasPaginationError),
    isRetrying,
    retryPreview,
    refetch,
  };
};
