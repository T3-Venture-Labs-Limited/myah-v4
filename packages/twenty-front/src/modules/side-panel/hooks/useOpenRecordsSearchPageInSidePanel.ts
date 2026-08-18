import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { sidePanelSearchFocusRestoreElementState } from '@/side-panel/states/sidePanelSearchFocusRestoreElementState';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { SidePanelPages } from 'twenty-shared/types';
import { IconSearch } from 'twenty-ui/icon';
import { useStore } from 'jotai';
import { v4 } from 'uuid';

export const useOpenRecordsSearchPageInSidePanel = () => {
  const { navigateSidePanelMenu } = useSidePanelMenu();
  const isSidePanelOpened = useAtomStateValue(isSidePanelOpenedState);
  const store = useStore();

  const openRecordsSearchPage = () => {
    const activeElement = document.activeElement;
    store.set(sidePanelSearchFocusRestoreElementState.atom, {
      restoreElement:
        activeElement instanceof HTMLElement ? activeElement : null,
    });

    navigateSidePanelMenu({
      page: SidePanelPages.SearchRecords,
      pageTitle: t`Search`,
      pageIcon: IconSearch,
      pageId: v4(),
      resetNavigationStack: isSidePanelOpened,
    });
  };

  return {
    openRecordsSearchPage,
  };
};
