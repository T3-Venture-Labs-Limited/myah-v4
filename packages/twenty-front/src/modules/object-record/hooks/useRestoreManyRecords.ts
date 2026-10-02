import { useApolloClient } from '@apollo/client/react';
import { triggerUpdateRecordOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerUpdateRecordOptimisticEffect';
import {
  RESTORE_SOCIAL_PROFILE,
  toCanonicalSocialProfileRecord,
} from '@/myah/creator-crm/socialProfileOperations';
import { apiConfigState } from '@/client-config/states/apiConfigState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useGetRecordFromCache } from '@/object-record/cache/hooks/useGetRecordFromCache';
import { getObjectTypename } from '@/object-record/cache/utils/getObjectTypename';
import { getRecordNodeFromRecord } from '@/object-record/cache/utils/getRecordNodeFromRecord';
import { updateRecordFromCache } from '@/object-record/cache/utils/updateRecordFromCache';
import { DEFAULT_MUTATION_BATCH_SIZE } from '@/object-record/constants/DefaultMutationBatchSize';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useRestoreManyRecordsMutation } from '@/object-record/hooks/useRestoreManyRecordsMutation';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { getRestoreManyRecordsMutationResponseField } from '@/object-record/utils/getRestoreManyRecordsMutationResponseField';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { capitalize, isDefined } from 'twenty-shared/utils';
import { sleep } from '~/utils/sleep';

type useRestoreManyRecordProps = {
  objectNameSingular: string;
  refetchFindManyQuery?: boolean;
};

type RestoreManyRecordsProps = {
  idsToRestore: string[];
  skipOptimisticEffect?: boolean;
  delayInMsBetweenRequests?: number;
};

export const useRestoreManyRecords = ({
  objectNameSingular,
}: useRestoreManyRecordProps) => {
  const { upsertRecordsInStore } = useUpsertRecordsInStore();

  const apiConfig = useAtomStateValue(apiConfigState);

  const mutationPageSize =
    apiConfig?.mutationMaximumAffectedRecords ?? DEFAULT_MUTATION_BATCH_SIZE;

  const apolloCoreClient = useApolloCoreClient();
  const apolloMetadataClient = useApolloClient();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const getRecordFromCache = useGetRecordFromCache({
    objectNameSingular,
  });

  const { restoreManyRecordsMutation } = useRestoreManyRecordsMutation({
    objectNameSingular,
  });

  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const isManagedSocialProfile = objectNameSingular === 'socialProfile';
  const mutationResponseField = isManagedSocialProfile
    ? 'restoreSocialProfile'
    : getRestoreManyRecordsMutationResponseField(objectMetadataItem.namePlural);

  const restoreManyRecords = async ({
    idsToRestore,
    delayInMsBetweenRequests,
    skipOptimisticEffect = false,
  }: RestoreManyRecordsProps) => {
    const effectiveMutationPageSize = isManagedSocialProfile
      ? 1
      : mutationPageSize;
    const numberOfBatches = Math.ceil(
      idsToRestore.length / effectiveMutationPageSize,
    );

    const restoredRecords = [];

    for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
      const batchedIdsToRestore = idsToRestore.slice(
        batchIndex * effectiveMutationPageSize,
        (batchIndex + 1) * effectiveMutationPageSize,
      );

      const cachedRecords = batchedIdsToRestore
        .map((idToRestore) =>
          getRecordFromCache(idToRestore, apolloCoreClient.cache),
        )
        .filter(isDefined);

      if (!skipOptimisticEffect) {
        cachedRecords.forEach((cachedRecord) => {
          const cachedRecordWithConnection =
            getRecordNodeFromRecord<ObjectRecord>({
              record: cachedRecord,
              objectMetadataItem,
              objectMetadataItems,
              computeReferences: true,
            });
          const computedOptimisticRecord = {
            ...cachedRecord,
            deletedAt: null,
            __typename: getObjectTypename(objectMetadataItem.nameSingular),
          };
          const optimisticRecordWithConnection =
            getRecordNodeFromRecord<ObjectRecord>({
              record: computedOptimisticRecord,
              objectMetadataItem,
              objectMetadataItems,
              computeReferences: true,
            });

          if (
            isDefined(optimisticRecordWithConnection) &&
            isDefined(cachedRecordWithConnection)
          ) {
            const recordGqlFields = {
              deletedAt: true,
            };
            updateRecordFromCache({
              objectMetadataItems,
              objectMetadataItem,
              cache: apolloCoreClient.cache,
              record: computedOptimisticRecord,
              recordGqlFields,
              objectPermissionsByObjectMetadataId,
            });
            triggerUpdateRecordOptimisticEffect({
              cache: apolloCoreClient.cache,
              objectMetadataItem,
              currentRecord: cachedRecordWithConnection,
              updatedRecord: optimisticRecordWithConnection,
              objectMetadataItems,
              objectPermissionsByObjectMetadataId,
              upsertRecordsInStore,
            });
          }
        });
      }

      const restoredRecordsResponse = await (
        isManagedSocialProfile ? apolloMetadataClient : apolloCoreClient
      )
        .mutate({
          mutation: isManagedSocialProfile
            ? RESTORE_SOCIAL_PROFILE
            : restoreManyRecordsMutation,
          fetchPolicy: isManagedSocialProfile ? 'no-cache' : undefined,
          variables: isManagedSocialProfile
            ? { input: { id: batchedIdsToRestore[0] } }
            : { filter: { id: { in: batchedIdsToRestore } } },
        })
        .catch((error: Error) => {
          if (skipOptimisticEffect) {
            throw error;
          }
          cachedRecords.forEach((cachedRecord) => {
            const cachedRecordWithConnection =
              getRecordNodeFromRecord<ObjectRecord>({
                record: cachedRecord,
                objectMetadataItem,
                objectMetadataItems,
                computeReferences: true,
              });

            const computedOptimisticRecord = {
              ...cachedRecord,
              ...{ id: cachedRecord.id, deletedAt: null },
              ...{ __typename: capitalize(objectMetadataItem.nameSingular) },
            };
            const optimisticRecordWithConnection =
              getRecordNodeFromRecord<ObjectRecord>({
                record: computedOptimisticRecord,
                objectMetadataItem,
                objectMetadataItems,
                computeReferences: true,
              });

            if (
              isDefined(optimisticRecordWithConnection) &&
              isDefined(cachedRecordWithConnection)
            ) {
              const recordGqlFields = {
                deletedAt: true,
              };
              updateRecordFromCache({
                objectMetadataItems,
                objectMetadataItem,
                cache: apolloCoreClient.cache,
                record: cachedRecord,
                recordGqlFields,
                objectPermissionsByObjectMetadataId,
              });

              triggerUpdateRecordOptimisticEffect({
                cache: apolloCoreClient.cache,
                objectMetadataItem,
                currentRecord: optimisticRecordWithConnection,
                updatedRecord: cachedRecordWithConnection,
                objectMetadataItems,
                objectPermissionsByObjectMetadataId,
                upsertRecordsInStore,
              });
            }
          });

          throw error;
        });

      const restoredRecordsForThisBatch = isManagedSocialProfile
        ? [
            (
              restoredRecordsResponse.data as Record<
                string,
                ObjectRecord | undefined
              >
            )?.[mutationResponseField],
          ]
            .filter(isDefined)
            .map((record) =>
              toCanonicalSocialProfileRecord({ ...record, deletedAt: null }),
            )
        : ((
            restoredRecordsResponse.data as Record<
              string,
              ObjectRecord[] | undefined
            >
          )?.[mutationResponseField] ?? []);

      if (isManagedSocialProfile) {
        restoredRecordsForThisBatch.forEach((restoredRecord) => {
          updateRecordFromCache({
            objectMetadataItems,
            objectMetadataItem,
            cache: apolloCoreClient.cache,
            record: restoredRecord,
            recordGqlFields: { deletedAt: true },
            objectPermissionsByObjectMetadataId,
          });
          upsertRecordsInStore({ partialRecords: [restoredRecord] });

          const cachedRecord = cachedRecords.find(
            (record) => record.id === restoredRecord.id,
          );
          const currentRecord = getRecordNodeFromRecord<ObjectRecord>({
            record: cachedRecord ?? restoredRecord,
            objectMetadataItem,
            objectMetadataItems,
            computeReferences: true,
          });
          const updatedRecord = getRecordNodeFromRecord<ObjectRecord>({
            record: restoredRecord,
            objectMetadataItem,
            objectMetadataItems,
            computeReferences: true,
          });

          if (isDefined(currentRecord) && isDefined(updatedRecord)) {
            triggerUpdateRecordOptimisticEffect({
              cache: apolloCoreClient.cache,
              objectMetadataItem,
              currentRecord,
              updatedRecord,
              objectMetadataItems,
              objectPermissionsByObjectMetadataId,
              upsertRecordsInStore,
            });
          }
        });
      }

      restoredRecords.push(...restoredRecordsForThisBatch);

      dispatchObjectRecordOperationBrowserEvent({
        objectMetadataItem,
        operation: {
          type: 'restore-many',
          restoredRecords: restoredRecordsForThisBatch,
        },
      });

      if (isDefined(delayInMsBetweenRequests)) {
        await sleep(delayInMsBetweenRequests);
      }
    }

    return restoredRecords;
  };

  return { restoreManyRecords };
};
