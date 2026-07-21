import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useBatchCreateManyRecords } from '@/object-record/hooks/useBatchCreateManyRecords';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { t } from '@lingui/core/macro';
import { useCallback } from 'react';

import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';

const CREATOR_BULK_RELATIONSHIP_QUERY_NAMES = [
  'FindManyCreators',
  'FindManyCreatorLists',
  'FindManyCampaigns',
  'FindManyCreatorListMembers',
  'FindManyCampaignCreators',
];

export const useApplyCreatorBulkRelationship = () => {
  const { batchCreateManyRecords: batchCreateCreatorListMembers } =
    useBatchCreateManyRecords({
      objectNameSingular: 'creatorListMember',
    });
  const { batchCreateManyRecords: batchCreateCampaignCreators } =
    useBatchCreateManyRecords({
      objectNameSingular: 'campaignCreator',
    });
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueErrorSnackBar } = useSnackBar();

  const applyCreatorBulkRelationship = useCallback(
    async ({
      target,
      creatorIdsToAdd,
    }: {
      target: CreatorBulkRelationshipTarget;
      creatorIdsToAdd: string[];
    }) => {
      if (creatorIdsToAdd.length === 0) {
        return;
      }

      try {
        const recordsToCreate = creatorIdsToAdd.map((creatorId) =>
          target.kind === 'creator-list'
            ? { name: '', creatorId, creatorListId: target.id }
            : { name: '', creatorId, campaignId: target.id },
        );

        if (target.kind === 'creator-list') {
          await batchCreateCreatorListMembers({ recordsToCreate });
        } else {
          await batchCreateCampaignCreators({ recordsToCreate });
        }

        await apolloCoreClient.refetchQueries({
          include: CREATOR_BULK_RELATIONSHIP_QUERY_NAMES,
        });
      } catch {
        enqueueErrorSnackBar({
          message: t`Failed to add creators to the selected relationship.`,
        });
        throw new Error('Creator bulk relationship creation failed');
      }
    },
    [
      apolloCoreClient,
      batchCreateCampaignCreators,
      batchCreateCreatorListMembers,
      enqueueErrorSnackBar,
    ],
  );

  return { applyCreatorBulkRelationship };
};
