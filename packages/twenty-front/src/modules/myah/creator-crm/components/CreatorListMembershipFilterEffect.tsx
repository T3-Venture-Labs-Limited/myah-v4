import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { recordIndexContextualViewNameComponentState } from '@/object-record/record-index/states/recordIndexContextualViewNameComponentState';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
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
  const setQueryOnlyRecordFilters = useSetAtomComponentState(
    queryOnlyRecordFiltersComponentState,
    recordIndexId,
  );
  const setRecordIndexContextualViewName = useSetAtomComponentState(
    recordIndexContextualViewNameComponentState,
    recordIndexId,
  );
  const { record: creatorList } = useFindOneRecord({
    objectNameSingular: 'creatorList',
    objectRecordId: creatorListId ?? '',
    recordGqlFields: { id: true, name: true },
    skip: !creatorListId || objectMetadataItem.nameSingular !== 'creator',
  });
  const creatorListName = creatorList?.name?.trim();

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
      !creatorListName ||
      !listMembershipsFieldMetadataItem ||
      !creatorListFieldMetadataItem ||
      creatorListFieldMetadataItem.type !== FieldMetadataType.RELATION
    ) {
      setRecordIndexContextualViewName(undefined);
      return;
    }

    setRecordIndexContextualViewName(`List: ${creatorListName}`);

    return () => {
      setRecordIndexContextualViewName(undefined);
    };
  }, [
    creatorListFieldMetadataItem,
    creatorListId,
    creatorListName,
    listMembershipsFieldMetadataItem,
    objectMetadataItem.nameSingular,
    setRecordIndexContextualViewName,
  ]);

  useEffect(() => {
    if (
      objectMetadataItem.nameSingular !== 'creator' ||
      !creatorListId ||
      !listMembershipsFieldMetadataItem ||
      !creatorListFieldMetadataItem ||
      creatorListFieldMetadataItem.type !== FieldMetadataType.RELATION
    ) {
      setQueryOnlyRecordFilters((recordFilters) =>
        recordFilters.filter(
          (recordFilter) =>
            recordFilter.id !== CREATOR_LIST_MEMBERSHIP_FILTER_ID,
        ),
      );
      return;
    }

    setQueryOnlyRecordFilters((recordFilters) => [
      ...recordFilters.filter(
        (recordFilter) => recordFilter.id !== CREATOR_LIST_MEMBERSHIP_FILTER_ID,
      ),
      {
        id: CREATOR_LIST_MEMBERSHIP_FILTER_ID,
        fieldMetadataId: listMembershipsFieldMetadataItem.id,
        relationTargetFieldMetadataId: creatorListFieldMetadataItem.id,
        type: 'RELATION',
        operand: ViewFilterOperand.IS,
        value: creatorListId,
        displayValue: '',
        label: creatorListName
          ? `List: ${creatorListName}`
          : `${listMembershipsFieldMetadataItem.label} → ${creatorListFieldMetadataItem.label}`,
        subFieldName: null,
      },
    ]);

    return () => {
      setQueryOnlyRecordFilters((recordFilters) =>
        recordFilters.filter(
          (recordFilter) =>
            recordFilter.id !== CREATOR_LIST_MEMBERSHIP_FILTER_ID,
        ),
      );
    };
  }, [
    creatorListFieldMetadataItem,
    creatorListId,
    listMembershipsFieldMetadataItem,
    objectMetadataItem.nameSingular,
    setQueryOnlyRecordFilters,
    creatorListName,
  ]);

  return null;
};
