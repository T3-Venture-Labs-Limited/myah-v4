import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { FieldMetadataType } from 'twenty-shared/types';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type CreatorListContext = {
  target: Extract<CreatorBulkRelationshipTarget, { kind: 'creator-list' }>;
  filter: {
    fieldMetadataId: string;
    relationTargetFieldMetadataId: string;
  };
};

export const useCreatorListContext = (): CreatorListContext | undefined => {
  const [searchParams] = useSearchParams();
  const creatorListId = searchParams.get('creatorListId');
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectMetadataItem } = useRecordIndexIdFromCurrentContextStore();
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

  return useMemo(() => {
    if (
      objectMetadataItem.nameSingular !== 'creator' ||
      !creatorListId ||
      !creatorListName ||
      !listMembershipsFieldMetadataItem ||
      creatorListFieldMetadataItem?.type !== FieldMetadataType.RELATION
    ) {
      return undefined;
    }

    return {
      target: {
        kind: 'creator-list',
        id: creatorListId,
        label: creatorListName,
      },
      filter: {
        fieldMetadataId: listMembershipsFieldMetadataItem.id,
        relationTargetFieldMetadataId: creatorListFieldMetadataItem.id,
      },
    };
  }, [
    creatorListFieldMetadataItem,
    creatorListId,
    creatorListName,
    listMembershipsFieldMetadataItem,
    objectMetadataItem.nameSingular,
  ]);
};
