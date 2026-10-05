import { MYAH_HIDDEN_OBJECT_NAME_SINGULARS } from '@/myah/navigation/constants/MyahHiddenObjectNameSingulars';
import { useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useReadableObjectMetadataItems } from '@/object-metadata/hooks/useReadableObjectMetadataItems';
import { sidePanelShowHiddenObjectsState } from '@/side-panel/states/sidePanelShowHiddenObjectsState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type UseSearchableObjectNameSingularsParams = {
  selectedObjectNameSingular?: string | null;
};

export const useSearchableObjectNameSingulars = ({
  selectedObjectNameSingular = null,
}: UseSearchableObjectNameSingularsParams = {}) => {
  const { readableObjectMetadataItems } = useReadableObjectMetadataItems();
  const sidePanelShowHiddenObjects = useAtomStateValue(
    sidePanelShowHiddenObjectsState,
  );

  return useMemo(() => {
    if (isDefined(selectedObjectNameSingular)) {
      return [selectedObjectNameSingular];
    }

    return readableObjectMetadataItems
      .filter((item) => sidePanelShowHiddenObjects || item.isSearchable)
      .filter(
        (item) =>
          !MYAH_HIDDEN_OBJECT_NAME_SINGULARS.includes(item.nameSingular),
      )
      .map((item) => item.nameSingular);
  }, [
    readableObjectMetadataItems,
    selectedObjectNameSingular,
    sidePanelShowHiddenObjects,
  ]);
};
