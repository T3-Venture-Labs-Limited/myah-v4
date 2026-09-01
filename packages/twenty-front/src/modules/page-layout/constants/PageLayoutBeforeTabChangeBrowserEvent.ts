export const PAGE_LAYOUT_BEFORE_TAB_CHANGE_BROWSER_EVENT_NAME =
  'page-layout-before-tab-change';

export type PageLayoutBeforeTabChangeBrowserEventDetail = {
  isInSidePanel: boolean;
  tabListInstanceId: string;
  continueTabChange: () => void;
};
