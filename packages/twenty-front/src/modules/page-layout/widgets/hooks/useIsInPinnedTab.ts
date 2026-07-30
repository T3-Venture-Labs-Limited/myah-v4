import { usePageLayoutContentContext } from '@/page-layout/contexts/PageLayoutContentContext';
import { useCurrentPageLayoutOrThrow } from '@/page-layout/hooks/useCurrentPageLayoutOrThrow';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { usePageLayoutHiddenWidgetTypes } from '@/page-layout/hooks/usePageLayoutHiddenWidgetTypes';
import { getTabsByDisplayMode } from '@/page-layout/utils/getTabsByDisplayMode';
import { getTabsWithVisibleWidgets } from '@/page-layout/utils/getTabsWithVisibleWidgets';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { isDefined } from 'twenty-shared/utils';
import { useIsMobile } from 'twenty-ui/utilities';

export const useIsInPinnedTab = () => {
  const isMobile = useIsMobile();

  const { tabId } = usePageLayoutContentContext();
  const { isInSidePanel } = useLayoutRenderingContext();
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();

  const isPageLayoutInEditMode = useIsPageLayoutInEditMode();
  const hiddenWidgetTypes = usePageLayoutHiddenWidgetTypes();

  const tabsWithVisibleWidgets = getTabsWithVisibleWidgets({
    tabs: currentPageLayout.tabs,
    isMobile,
    isInSidePanel,
    isEditMode: isPageLayoutInEditMode,
    hiddenWidgetTypes,
  });

  const { pinnedLeftTab } = getTabsByDisplayMode({
    tabs: tabsWithVisibleWidgets,
    pageLayoutType: currentPageLayout.type,
    isMobile,
    isInSidePanel,
  });

  return {
    isInPinnedTab: isDefined(pinnedLeftTab) && pinnedLeftTab.id === tabId,
  };
};
