import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useMemo } from 'react';

import {
  type CreatorBulkRelationshipPreview,
  type CreatorBulkRelationshipTarget,
} from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';

export const buildCreatorBulkRelationshipPreview = ({
  selectedCreatorIds,
  existingCreatorIds,
}: {
  selectedCreatorIds: string[];
  existingCreatorIds: ReadonlySet<string>;
}): CreatorBulkRelationshipPreview => ({
  selectedCreatorIds,
  creatorIdsToAdd: selectedCreatorIds.filter(
    (creatorId) => !existingCreatorIds.has(creatorId),
  ),
  alreadyLinkedCreatorIds: selectedCreatorIds.filter((creatorId) =>
    existingCreatorIds.has(creatorId),
  ),
});

export const useCreatorBulkRelationshipPreview = ({
  target,
  selectedCreatorIds,
}: {
  target: CreatorBulkRelationshipTarget;
  selectedCreatorIds: string[];
}) => {
  const objectNameSingular =
    target.kind === 'creator-list' ? 'creatorListMember' : 'campaignCreator';
  const targetFieldName =
    target.kind === 'creator-list' ? 'creatorListId' : 'campaignId';

  const { records, loading, refetch } = useFindManyRecords<{
    id: string;
    __typename: string;
    creatorId: string;
  }>(
    {
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
    },
  );

  const preview = useMemo(
    () =>
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds,
        existingCreatorIds: new Set(records.map(({ creatorId }) => creatorId)),
      }),
    [records, selectedCreatorIds],
  );

  return { ...preview, loading, refetch };
};
