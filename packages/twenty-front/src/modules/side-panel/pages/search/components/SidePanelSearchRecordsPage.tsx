import { useCloseCommandMenu } from '@/command-menu-item/hooks/useCloseCommandMenu';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { sidePanelSearchFocusRestoreElementState } from '@/side-panel/states/sidePanelSearchFocusRestoreElementState';
import { SidePanelGroup } from '@/side-panel/components/SidePanelGroup';
import { SidePanelList } from '@/side-panel/components/SidePanelList';
import {
  type SearchResultItem,
  useSidePanelSearchRecords,
} from '@/side-panel/pages/search/hooks/useSidePanelSearchRecords';
import { SidePanelSearchResultList } from '@/side-panel/pages/search/components/SidePanelSearchResultList';
import { useMemo } from 'react';
import { useStore } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { CoreObjectNameSingular, AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { useLingui } from '@lingui/react/macro';

export const SidePanelSearchRecordsPage = () => {
  const { t } = useLingui();
  const { searchResultItems, loading, noResults } = useSidePanelSearchRecords();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { closeCommandMenu } = useCloseCommandMenu();
  const navigate = useNavigate();
  const store = useStore();

  const selectableItemIds = useMemo(
    () => searchResultItems.map((item) => item.id),
    [searchResultItems],
  );

  const handleClick = (item: SearchResultItem) => {
    const isTaskOrNote = [
      CoreObjectNameSingular.Task,
      CoreObjectNameSingular.Note,
    ].includes(item.objectNameSingular as CoreObjectNameSingular);

    if (isTaskOrNote) {
      openRecordInSidePanel({
        recordId: item.recordId,
        objectNameSingular: item.objectNameSingular as CoreObjectNameSingular,
      });
    } else {
      store.set(sidePanelSearchFocusRestoreElementState.atom, null);
      closeCommandMenu();
      navigate(
        getAppPath(AppPath.RecordShowPage, {
          objectNameSingular: item.objectNameSingular,
          objectRecordId: item.recordId,
        }),
      );
    }
  };

  return (
    <SidePanelList
      selectableItemIds={selectableItemIds}
      loading={loading}
      noResults={noResults}
      role="listbox"
      ariaLabel={t`Search results`}
      status={
        loading
          ? t`Loading search results`
          : noResults
            ? t`No results found`
            : t`${searchResultItems.length} results found`
      }
    >
      {searchResultItems.length > 0 && (
        <SidePanelGroup heading={t`Results`}>
          <SidePanelSearchResultList
            items={searchResultItems}
            onActivate={handleClick}
          />
        </SidePanelGroup>
      )}
    </SidePanelList>
  );
};
