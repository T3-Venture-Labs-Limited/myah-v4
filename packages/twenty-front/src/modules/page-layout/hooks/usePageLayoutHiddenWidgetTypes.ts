import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { WIDGET_TYPE_TO_RELATION_FIELD_NAME } from '@/page-layout/constants/WidgetTypeToRelationFieldName';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useMemo } from 'react';
import { type WidgetType } from '~/generated-metadata/graphql';
import { isDefined } from 'twenty-shared/utils';

export const usePageLayoutHiddenWidgetTypes = (): Set<WidgetType> => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const { targetRecordIdentifier } = useLayoutRenderingContext();

  return useMemo(() => {
    if (!isDefined(targetRecordIdentifier)) {
      return new Set<WidgetType>();
    }

    const objectMetadataItem = objectMetadataItems.find(
      (item) =>
        item.nameSingular === targetRecordIdentifier.targetObjectNameSingular,
    );

    if (!isDefined(objectMetadataItem)) {
      return new Set<WidgetType>();
    }

    return new Set<WidgetType>(
      Object.entries(WIDGET_TYPE_TO_RELATION_FIELD_NAME).flatMap(
        ([widgetType, relationFieldName]) =>
          objectMetadataItem.fields.some(
            (field) => field.name === relationFieldName && field.isActive,
          )
            ? []
            : [widgetType as WidgetType],
      ),
    );
  }, [objectMetadataItems, targetRecordIdentifier]);
};
