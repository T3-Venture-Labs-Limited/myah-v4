import { useOpenDropdown } from '@/ui/layout/dropdown/hooks/useOpenDropdown';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { type View } from '@/views/types/View';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { useViewPickerMode } from '@/views/view-picker/hooks/useViewPickerMode';
import { viewPickerReferenceViewIdComponentState } from '@/views/view-picker/states/viewPickerReferenceViewIdComponentState';

import { isDefined } from 'twenty-shared/utils';

export const useOpenCreateViewDropdown = (viewBardId?: string) => {
  const { viewPickerDropdownId } = useViewBarControlIds();
  const setViewPickerReferenceViewId = useSetAtomComponentState(
    viewPickerReferenceViewIdComponentState,
    viewBardId,
  );

  const { setViewPickerMode } = useViewPickerMode(viewBardId);

  const { openDropdown } = useOpenDropdown();

  const openCreateViewDropdown = (referenceView: View | undefined) => {
    if (isDefined(referenceView?.id)) {
      setViewPickerReferenceViewId(referenceView.id);
      setViewPickerMode('create-empty');
      openDropdown({
        dropdownComponentInstanceIdFromProps: viewPickerDropdownId,
      });
    }
  };

  return { openCreateViewDropdown };
};
