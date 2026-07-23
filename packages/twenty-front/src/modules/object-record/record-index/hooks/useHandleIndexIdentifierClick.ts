import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

export const useHandleIndexIdentifierClick = ({
  objectMetadataItem,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
}) => {
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
  );

  const indexIdentifierUrl = (recordId: string) => {
    if (objectMetadataItem.nameSingular === 'creatorList') {
      return getAppPath(
        AppPath.RecordIndexPage,
        { objectNamePlural: 'creators' },
        { creatorListId: recordId },
      );
    }

    return getAppPath(
      AppPath.RecordShowPage,
      {
        objectNameSingular: objectMetadataItem.nameSingular,
        objectRecordId: recordId,
      },
      {
        viewId: contextStoreCurrentViewId,
      },
    );
  };

  return { indexIdentifierUrl };
};
