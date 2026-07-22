import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useRemoveRecordFilter } from '@/object-record/record-filter/hooks/useRemoveRecordFilter';
import { useUpsertRecordFilter } from '@/object-record/record-filter/hooks/useUpsertRecordFilter';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FieldMetadataType, ViewFilterOperand } from 'twenty-shared/types';

const CREATOR_LIST_MEMBERSHIP_FILTER_ID =
  'a5b456b7-7e58-4bf8-9ab2-87a689ac5e24';

export const CreatorListMembershipFilterEffect = () => {
  const [searchParams] = useSearchParams();
  const creatorListId = searchParams.get('creatorListId');
  const { objectMetadataItems } = useObjectMetadataItems();
  const { recordIndexId, objectMetadataItem } =
    useRecordIndexIdFromCurrentContextStore();
  const { upsertRecordFilter } = useUpsertRecordFilter(recordIndexId);
  const { removeRecordFilter } = useRemoveRecordFilter(recordIndexId);

  const listMembershipsFieldMetadataItem = objectMetadataItem.fields.find(
    (fieldMetadataItem) => fieldMetadataItem.name === 'listMemberships',
  );
  const creatorListMemberObjectMetadataItem = objectMetadataItems.find(
    (item) =>
      item.id ===
      listMembershipsFieldMetadataItem?.relation?.targetObjectMetadata.id,
  );
  const creatorListFieldMetadataItem =
    creatorListMemberObjectMetadataItem?.fields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'creatorList',
    );

  useEffect(() => {
    if (
      objectMetadataItem.nameSingular !== 'creator' ||
      !creatorListId ||
      !listMembershipsFieldMetadataItem ||
      !creatorListFieldMetadataItem ||
      creatorListFieldMetadataItem.type !== FieldMetadataType.RELATION
    ) {
      removeRecordFilter({
        recordFilterId: CREATOR_LIST_MEMBERSHIP_FILTER_ID,
      });
      return;
    }

    upsertRecordFilter({
      id: CREATOR_LIST_MEMBERSHIP_FILTER_ID,
      fieldMetadataId: listMembershipsFieldMetadataItem.id,
      relationTargetFieldMetadataId: creatorListFieldMetadataItem.id,
      type: 'RELATION',
      operand: ViewFilterOperand.IS,
      value: creatorListId,
      displayValue: '',
      label: `${listMembershipsFieldMetadataItem.label} → ${creatorListFieldMetadataItem.label}`,
      subFieldName: null,
    });

    return () => {
      removeRecordFilter({
        recordFilterId: CREATOR_LIST_MEMBERSHIP_FILTER_ID,
      });
    };

  }, [
    creatorListFieldMetadataItem,
    creatorListId,
    listMembershipsFieldMetadataItem,
    objectMetadataItem.nameSingular,
    removeRecordFilter,
    upsertRecordFilter,
  ]);

  return null;
};
