import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useBatchCreateManyRecords } from '@/object-record/hooks/useBatchCreateManyRecords';
import { useDestroyManyRecords } from '@/object-record/hooks/useDestroyManyRecords';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { t } from '@lingui/core/macro';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';

type CreatorQueryFilter = {
  listMemberships?: {
    creatorListId?: {
      in?: string[];
    };
  };
  and?: CreatorQueryFilter[];
};

type CreatorQueryArguments = {
  filter?: CreatorQueryFilter;
};

const getCreatorListIdsFromFilter = (
  filter: CreatorQueryFilter | undefined,
): string[] => {
  const creatorListIds = filter?.listMemberships?.creatorListId?.in ?? [];

  if (creatorListIds.length > 0) {
    return creatorListIds;
  }

  return filter?.and?.flatMap(getCreatorListIdsFromFilter) ?? [];
};

const getCreatorListIdsFromStoreFieldName = (storeFieldName: string) => {
  const argumentsStartIndex = storeFieldName.indexOf('(');

  if (argumentsStartIndex === -1) {
    return [];
  }

  try {
    const argumentsJson = storeFieldName.slice(argumentsStartIndex + 1, -1);
    const creatorQueryArguments = JSON.parse(
      argumentsJson,
    ) as CreatorQueryArguments;

    return getCreatorListIdsFromFilter(creatorQueryArguments.filter);
  } catch {
    return [];
  }
};

export const useApplyCreatorBulkRelationship = () => {
  const { batchCreateManyRecords: batchCreateCreatorListMembers } =
    useBatchCreateManyRecords({
      objectNameSingular: 'creatorListMember',
    });
  const { batchCreateManyRecords: batchCreateCampaignCreators } =
    useBatchCreateManyRecords({
      objectNameSingular: 'campaignCreator',
    });
  const { destroyManyRecords: destroyCreatorListMembers } =
    useDestroyManyRecords({
      objectNameSingular: 'creatorListMember',
    });
  const { objectMetadataItem: creatorObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: 'creator',
    });
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueErrorSnackBar, enqueueWarningSnackBar } = useSnackBar();

  const refetchCreatorRelationships = useCallback(
    async (targetKind: CreatorBulkRelationshipTarget['kind']) => {
      const relationshipObjectNamePlural =
        targetKind === 'creator-list'
          ? 'creatorListMembers'
          : 'campaignCreators';
      const relationshipFindManyQueryName =
        targetKind === 'creator-list'
          ? 'FindManyCreatorListMembers'
          : 'FindManyCampaignCreators';

      try {
        await apolloCoreClient.refetchQueries({
          include: ['FindManyCreators', relationshipFindManyQueryName],
          updateCache: (cache) => {
            cache.evict({ fieldName: 'creators' });
            cache.evict({ fieldName: relationshipObjectNamePlural });
          },
        });

        return true;
      } catch {
        enqueueErrorSnackBar({
          message: t`Failed to refresh creator relationships.`,
        });

        return false;
      }
    },
    [apolloCoreClient, enqueueErrorSnackBar],
  );

  const notifyCreatorListMembershipsChanged = useCallback(
    (creatorIds: string[]) => {
      if (!isDefined(creatorObjectMetadataItem) || creatorIds.length === 0) {
        return;
      }

      dispatchObjectRecordOperationBrowserEvent({
        objectMetadataItem: creatorObjectMetadataItem,
        operation: {
          type: 'update-many',
          result: {
            updateInputs: creatorIds.map((creatorId) => ({
              recordId: creatorId,
              updatedFields: [{ listMemberships: null }],
            })),
          },
        },
      });
    },
    [creatorObjectMetadataItem],
  );

  const removeCreatorListMembersFromCache = useCallback(
    ({
      creatorListId,
      creatorIdsToRemove,
    }: {
      creatorListId: string;
      creatorIdsToRemove: string[];
    }) => {
      if (creatorIdsToRemove.length === 0) {
        return;
      }

      const creatorIdsToRemoveSet = new Set(creatorIdsToRemove);

      apolloCoreClient.cache.modify({
        fields: {
          creators(existingCreatorConnection, { readField, storeFieldName }) {
            const creatorListIds =
              getCreatorListIdsFromStoreFieldName(storeFieldName);

            if (
              !isDefined(existingCreatorConnection) ||
              !Array.isArray(existingCreatorConnection.edges) ||
              !creatorListIds.includes(creatorListId)
            ) {
              return existingCreatorConnection;
            }

            return {
              ...existingCreatorConnection,
              edges: existingCreatorConnection.edges.filter(
                ({ node }: { node: Parameters<typeof readField>[1] }) => {
                  const creatorId = readField<string>('id', node);

                  return (
                    !isDefined(creatorId) ||
                    !creatorIdsToRemoveSet.has(creatorId)
                  );
                },
              ),
            };
          },
        },
      });
    },
    [apolloCoreClient],
  );

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

      const recordsToCreate = creatorIdsToAdd.map((creatorId) =>
        target.kind === 'creator-list'
          ? { name: '', creatorId, creatorListId: target.id }
          : { name: '', creatorId, campaignId: target.id },
      );

      try {
        if (target.kind === 'creator-list') {
          await batchCreateCreatorListMembers({ recordsToCreate });
        } else {
          await batchCreateCampaignCreators({ recordsToCreate });
        }
      } catch {
        enqueueErrorSnackBar({
          message: t`Failed to add creators to the selected relationship.`,
        });
        throw new Error('Creator bulk relationship creation failed');
      }

      await refetchCreatorRelationships(target.kind);
    },
    [
      batchCreateCampaignCreators,
      batchCreateCreatorListMembers,
      enqueueErrorSnackBar,
      refetchCreatorRelationships,
    ],
  );

  const removeCreatorListMembers = useCallback(
    async ({
      creatorListId,
      creatorListMemberIdsToRemove,
      creatorIdsToRemove,
    }: {
      creatorListId: string;
      creatorListMemberIdsToRemove: string[];
      creatorIdsToRemove: string[];
    }) => {
      if (creatorListMemberIdsToRemove.length === 0) {
        return { removedCount: 0, wasPartial: false };
      }

      const destroyedCreatorListMembers = await destroyCreatorListMembers({
        recordIdsToDestroy: creatorListMemberIdsToRemove,
        skipOptimisticEffect: true,
      }).catch(() => {
        enqueueErrorSnackBar({
          message: t`Failed to remove creators from this list.`,
        });
        throw new Error('Creator List membership removal failed');
      });
      const wasPartial =
        destroyedCreatorListMembers.length !==
        creatorListMemberIdsToRemove.length;

      removeCreatorListMembersFromCache({
        creatorListId,
        creatorIdsToRemove,
      });

      const didRefreshCreatorRelationships =
        await refetchCreatorRelationships('creator-list');

      if (!didRefreshCreatorRelationships) {
        throw new Error('Creator List membership refresh failed');
      }

      notifyCreatorListMembershipsChanged(creatorIdsToRemove);

      if (wasPartial) {
        enqueueWarningSnackBar({
          message: t`Some creators were already absent from this list.`,
        });
      }

      return {
        removedCount: destroyedCreatorListMembers.length,
        wasPartial,
      };
    },
    [
      destroyCreatorListMembers,
      enqueueErrorSnackBar,
      enqueueWarningSnackBar,
      notifyCreatorListMembershipsChanged,
      refetchCreatorRelationships,
      removeCreatorListMembersFromCache,
    ],
  );

  return { applyCreatorBulkRelationship, removeCreatorListMembers };
};
