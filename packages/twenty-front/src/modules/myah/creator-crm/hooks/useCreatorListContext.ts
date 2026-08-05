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

export const useCreatorListContextFromIdWithLoading = (
  creatorListId: string | undefined,
) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const creatorObjectMetadataItem = objectMetadataItems.find(
    (item) => item.nameSingular === 'creator',
  );
  const { loading: isCreatorListLoading, record: creatorList } =
    useFindOneRecord({
      objectNameSingular: 'creatorList',
      objectRecordId: creatorListId ?? '',
      recordGqlFields: { id: true, name: true },
      skip: !creatorListId,
    });
  const creatorListName = creatorList?.name?.trim();

  const listMembershipsFieldMetadataItem =
    creatorObjectMetadataItem?.fields.find(
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

  const context = useMemo<CreatorListContext | undefined>(() => {
    if (
      !creatorListId ||
      !creatorListName ||
      !listMembershipsFieldMetadataItem?.relation ||
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
  ]);

  return { context, isLoading: Boolean(creatorListId) && isCreatorListLoading };
};

export const useCreatorListContextFromId = (
  creatorListId: string | undefined,
): CreatorListContext | undefined =>
  useCreatorListContextFromIdWithLoading(creatorListId).context;

export const useCreatorListContext = (
  skipLegacyRecordLookup = false,
): CreatorListContext | undefined => {
  const [searchParams] = useSearchParams();
  const { objectMetadataItem } = useRecordIndexIdFromCurrentContextStore();
  const hasCreatorListMembershipRelation = objectMetadataItem.fields.some(
    (fieldMetadataItem) =>
      fieldMetadataItem.name === 'listMemberships' &&
      fieldMetadataItem.relation !== undefined,
  );

  return useCreatorListContextFromId(
    !skipLegacyRecordLookup &&
      objectMetadataItem.nameSingular === 'creator' &&
      hasCreatorListMembershipRelation
      ? (searchParams.get('creatorListId') ?? undefined)
      : undefined,
  );
};
