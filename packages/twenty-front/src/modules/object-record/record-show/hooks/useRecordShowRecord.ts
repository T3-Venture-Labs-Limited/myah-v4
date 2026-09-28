import {
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { buildFindOneRecordForShowPageOperationSignature } from '@/object-record/record-show/graphql/operations/factories/findOneRecordForShowPageOperationSignatureFactory';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useStore } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

export const useRecordShowRecord = ({
  objectNameSingular,
  recordId,
}: {
  objectNameSingular: string;
  recordId: string;
}) => {
  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });
  const { objectMetadataItems } = useObjectMetadataItems();

  const FIND_ONE_RECORD_FOR_SHOW_PAGE_OPERATION_SIGNATURE =
    buildFindOneRecordForShowPageOperationSignature({
      objectMetadataItem,
      objectMetadataItems,
    });

  const store = useStore();
  const isCampaign = objectNameSingular === 'campaign';
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id;
  const tokenPair = useAtomStateValue(tokenPairState);
  const tokenIdentity = isCampaign
    ? decodeCampaignCreationIdentity(
        tokenPair?.accessOrWorkspaceAgnosticToken.token,
      )
    : undefined;
  const campaignIdentityKey = tokenIdentity
    ? campaignCreationIdentityKey(tokenIdentity)
    : undefined;
  const campaignAuthorityValid =
    !!workspaceId && tokenIdentity?.workspaceId === workspaceId;
  const readableRecordKey = isCampaign
    ? `${workspaceId}:${campaignIdentityKey}:${recordId}`
    : recordId;
  const result = useFindOneRecord({
    objectRecordId: recordId,
    objectNameSingular,
    recordGqlFields: FIND_ONE_RECORD_FOR_SHOW_PAGE_OPERATION_SIGNATURE.fields,
    withSoftDeleted: true,
    skip: isCampaign && !campaignAuthorityValid,
    freshRead: isCampaign,
    ...(isCampaign &&
      workspaceId && {
        campaignRecordRead: {
          store,
          workspaceId,
          identityKey: campaignIdentityKey,
        },
      }),
  });
  const { loading, error } = result;
  const hasReadPermission =
    result.hasReadPermission && (!isCampaign || campaignAuthorityValid);
  const record =
    isCampaign && !campaignAuthorityValid ? undefined : result.record;
  const [lastReadableRecordId, setLastReadableRecordId] = useState<
    string | null
  >(null);

  const setRecordStore = useCallback(
    (newRecord: ObjectRecord | null) => {
      const previousRecordValue = store.get(
        recordStoreFamilyState.atomFamily(recordId),
      );

      if (JSON.stringify(previousRecordValue) !== JSON.stringify(newRecord)) {
        store.set(recordStoreFamilyState.atomFamily(recordId), newRecord);
      }
    },
    [recordId, store],
  );

  useEffect(() => {
    if (!isCampaign) {
      // Native record pages still render while a read is unavailable.
      if (!loading && record) setRecordStore(record);
      return;
    }

    if (
      !hasReadPermission ||
      (loading && lastReadableRecordId !== readableRecordKey)
    ) {
      setLastReadableRecordId(null);
      setRecordStore(null);
    } else if (!loading) {
      if (error || !record || record.id !== recordId) {
        setLastReadableRecordId(null);
        setRecordStore(null);
      } else {
        setLastReadableRecordId(readableRecordKey);
        setRecordStore(record);
      }
    }
  }, [
    isCampaign,
    record,
    recordId,
    setRecordStore,
    loading,
    error,
    hasReadPermission,
    lastReadableRecordId,
    readableRecordKey,
  ]);

  return {
    ...result,
    record,
    hasReadPermission,
    hasLoadedRecord:
      (hasReadPermission && lastReadableRecordId === readableRecordKey) ||
      (!loading && !error && hasReadPermission && record?.id === recordId),
  };
};
