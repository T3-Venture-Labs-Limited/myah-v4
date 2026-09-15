export const PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT =
  'page-layout-side-panel-tab-change';

type PageLayoutSidePanelTabChangeDetail = {
  currentTabId: string | null;
  nextTabId: string;
};

export function requestPageLayoutSidePanelTabChange(
  detail: PageLayoutSidePanelTabChangeDetail,
): boolean {
  return window.dispatchEvent(
    new CustomEvent<PageLayoutSidePanelTabChangeDetail>(
      PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT,
      {
        cancelable: true,
        detail,
      },
    ),
  );
}
