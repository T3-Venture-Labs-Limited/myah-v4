import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { MyahCampaignCreatorContextPanel } from '@/page-layout/components/MyahCampaignCreatorContextPanel';
import { isCampaignCreatorInboxReturnTarget } from '@/myah/inbox/types/CampaignCreatorInboxReturnTarget';
import { MyahCampaignWorkspaceHeader } from '@/page-layout/components/MyahCampaignWorkspaceHeader';
import { type FlatObjectMetadataItem } from '@/metadata-store/types/FlatObjectMetadataItem';
import { PageLayoutLeftPanel } from '@/page-layout/components/PageLayoutLeftPanel';
import { PageLayoutTabList } from '@/page-layout/components/PageLayoutTabList';
import { PageLayoutTabListEffect } from '@/page-layout/components/PageLayoutTabListEffect';
import { DEFAULT_RECORD_PAGE_LAYOUT_ID } from '@/page-layout/constants/DefaultRecordPageLayoutId';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { PAGE_LAYOUT_LEFT_PANEL_CONTAINER_WIDTH } from '@/page-layout/constants/PageLayoutLeftPanelContainerWidth';
import { useCurrentPageLayoutOrThrow } from '@/page-layout/hooks/useCurrentPageLayoutOrThrow';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { usePageLayoutHiddenWidgetTypes } from '@/page-layout/hooks/usePageLayoutHiddenWidgetTypes';
import { usePageLayoutAddTabStrategy } from '@/page-layout/hooks/usePageLayoutAddTabStrategy';
import { useReorderRecordPageLayoutTabs } from '@/page-layout/hooks/useReorderRecordPageLayoutTabs';
import { PageLayoutMainContent } from '@/page-layout/PageLayoutMainContent';
import { getScrollWrapperInstanceIdFromPageLayoutId } from '@/page-layout/utils/getScrollWrapperInstanceIdFromPageLayoutId';
import { getPageLayoutTabListInitialActiveTabId } from '@/page-layout/utils/getPageLayoutTabListInitialActiveTabId';
import { getTabListInstanceIdFromPageLayoutAndRecord } from '@/page-layout/utils/getTabListInstanceIdFromPageLayoutAndRecord';
import { getTabsByDisplayMode } from '@/page-layout/utils/getTabsByDisplayMode';
import { getTabsWithVisibleWidgets } from '@/page-layout/utils/getTabsWithVisibleWidgets';
import { shouldEnableTabEditingFeatures } from '@/page-layout/utils/shouldEnableTabEditingFeatures';
import { sortTabsByPosition } from '@/page-layout/utils/sortTabsByPosition';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { activeTabIdComponentState } from '@/ui/layout/tab-list/states/activeTabIdComponentState';
import { ScrollWrapper } from '@/ui/utilities/scroll/components/ScrollWrapper';
import { useScrollWrapperHTMLElement } from '@/ui/utilities/scroll/hooks/useScrollWrapperHTMLElement';
import { useScrollToPosition } from '@/ui/utilities/scroll/hooks/useScrollToPosition';
import { scrollWrapperScrollTopComponentState } from '@/ui/utilities/scroll/states/scrollWrapperScrollTopComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isDefined, getAppPath } from 'twenty-shared/utils';
import { useIsMobile } from 'twenty-ui/utilities';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

const StyledContainer = styled.div<{ hasPinnedTab: boolean }>`
  container-type: inline-size;
  display: grid;
  grid-template-columns: ${({ hasPinnedTab }) =>
    hasPinnedTab ? `${PAGE_LAYOUT_LEFT_PANEL_CONTAINER_WIDTH}px 1fr` : '1fr'};
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  width: 100%;

  @media print {
    display: block;
    height: auto;
    width: 100%;
  }
`;

const StyledCampaignRegion = styled.div<{
  hasPanel: boolean;
  overlay: boolean;
}>`
  display: grid;
  grid-template-columns: ${({ hasPanel, overlay }) =>
    hasPanel && !overlay ? 'minmax(0, 1fr) 426px' : 'minmax(0, 1fr)'};
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
  min-width: 0;
  position: relative;

  > aside[aria-label='Campaign creator context'] {
    position: relative;
  }

  @container (max-width: 850px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledTabsAndDashboardContainer = styled.div<{
  hasPanel: boolean;
  overlay: boolean;
}>`
  display: ${({ hasPanel, overlay }) =>
    hasPanel && overlay ? 'none' : 'flex'};
  flex-direction: column;
  min-width: 0;
  overflow: hidden;

  @container (max-width: 850px) {
    display: ${({ hasPanel }) => (hasPanel ? 'none' : 'flex')};
  }

  @media print {
    display: block;
    overflow: visible;

    .page-layout-tab-list-print-hidden {
      display: none;
    }
  }
`;

const StyledScrollWrapperContainer = styled.div<{ hidden?: boolean }>`
  display: ${({ hidden }) => (hidden ? 'none' : 'block')};
  flex: 1;
  min-height: 0;

  @media print {
    min-height: auto;

    .page-layout-scroll-wrapper {
      height: auto;
      overflow: visible;
    }
  }
`;

// Only a validated Inbox return requests restoration; ordinary campaign navigation
// retains the native ScrollWrapper behavior.
const CampaignListReturnScrollEffect = ({
  position,
  active,
  onRestored,
}: {
  position?: number;
  active: boolean;
  onRestored: () => void;
}) => {
  const { scrollWrapperHTMLElement } = useScrollWrapperHTMLElement();
  const { scrollToPosition } = useScrollToPosition();
  useEffect(() => {
    if (!active || position === undefined || !scrollWrapperHTMLElement) return;
    const restore = () => {
      if (
        scrollWrapperHTMLElement.scrollHeight -
          scrollWrapperHTMLElement.clientHeight >=
        position
      ) {
        scrollToPosition(position);
        observer.disconnect();
        onRestored();
      }
    };
    const observer = new MutationObserver(restore);
    observer.observe(scrollWrapperHTMLElement, {
      childList: true,
      subtree: true,
    });
    restore();
    return () => observer.disconnect();
  }, [
    active,
    onRestored,
    position,
    scrollToPosition,
    scrollWrapperHTMLElement,
  ]);
  return null;
};

export type PageLayoutTabsRendererRenderMode = 'all-tabs' | 'default-tab-only';

type PageLayoutTabsRendererProps = {
  renderMode?: PageLayoutTabsRendererRenderMode;
};

export const PageLayoutTabsRenderer = ({
  renderMode = 'all-tabs',
}: PageLayoutTabsRendererProps) => {
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const location = useLocation();
  const navigate = useNavigate();
  const [consumedReturnKey, setConsumedReturnKey] = useState<string | null>(
    null,
  );
  const regionRef = useRef<HTMLDivElement>(null);
  const [isNarrowRegion, setIsNarrowRegion] = useState(false);
  const [returnScroll, setReturnScroll] = useState<{
    workspaceId: string;
    campaignId: string;
    position: number;
  }>();
  const [selection, setSelection] = useState<{
    campaignId: string;
    workspaceId: string;
    membershipId: string;
    invoker?: HTMLElement;
    rowIndex?: number;
  }>();

  const { isInSidePanel, layoutType, targetRecordIdentifier } =
    useLayoutRenderingContext();

  const isPageLayoutInEditMode = useIsPageLayoutInEditMode();

  const activeTabId = useAtomComponentStateValue(activeTabIdComponentState);
  const scrollWrapperInstanceId = getScrollWrapperInstanceIdFromPageLayoutId(
    currentPageLayout.id,
  );
  const scrollWrapperScrollTop = useAtomComponentStateValue(
    scrollWrapperScrollTopComponentState,
    scrollWrapperInstanceId,
  );
  // oxlint-disable-next-line twenty/matching-state-variable -- This second scoped scroll position belongs to the preserved Influencers tab, not the main tab.
  const influencerScrollTop = useAtomComponentStateValue(
    scrollWrapperScrollTopComponentState,
    `${scrollWrapperInstanceId}-influencers-${targetRecordIdentifier?.id}`,
  );

  const tabListInstanceId = getTabListInstanceIdFromPageLayoutAndRecord({
    pageLayoutId: currentPageLayout.id,
    layoutType,
    targetRecordIdentifier,
  });

  const addTabStrategy = usePageLayoutAddTabStrategy({
    pageLayoutId: currentPageLayout.id,
    tabListInstanceId,
  });

  const { reorderRecordPageTabs } = useReorderRecordPageLayoutTabs(
    currentPageLayout.id,
  );

  const hiddenWidgetTypes = usePageLayoutHiddenWidgetTypes();

  const isMobile = useIsMobile();

  const metadataStore = useAtomFamilyStateValue(
    metadataStoreState,
    'objectMetadataItems',
  );

  const isSystemObject =
    (metadataStore.current as FlatObjectMetadataItem[]).find(
      (item) =>
        item.nameSingular === targetRecordIdentifier?.targetObjectNameSingular,
    )?.isSystem ?? false;
  const campaignMetadataId = (
    metadataStore.current as FlatObjectMetadataItem[]
  ).find((item) => item.nameSingular === 'campaign')?.id;
  const { canReadObjectRecords } = useObjectPermissionsForObject(
    campaignMetadataId ?? '',
  );
  const canReadCampaign = !!campaignMetadataId && canReadObjectRecords;

  const canEnableTabEditing =
    isPageLayoutInEditMode &&
    shouldEnableTabEditingFeatures(currentPageLayout.type);

  const tabsWithVisibleWidgets = getTabsWithVisibleWidgets({
    tabs: currentPageLayout.tabs,
    isMobile,
    isInSidePanel,
    isEditMode: isPageLayoutInEditMode,
    hiddenWidgetTypes,
  });

  const SYSTEM_OBJECT_TABS = ['Home', 'Timeline', 'Overview', 'Flow'];

  const isUsingDefaultRecordPageLayout =
    currentPageLayout.id === DEFAULT_RECORD_PAGE_LAYOUT_ID;

  const tabsForCurrentObject =
    isSystemObject && isUsingDefaultRecordPageLayout
      ? tabsWithVisibleWidgets.filter((tab) =>
          SYSTEM_OBJECT_TABS.includes(tab.title),
        )
      : tabsWithVisibleWidgets;

  const isStandardCampaign =
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER;
  const influencerTab = isStandardCampaign
    ? tabsForCurrentObject.find(
        (tab) =>
          tab.universalIdentifier === '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
      )
    : undefined;
  // Only the standard campaign workspace opts out of the desktop pinned column.
  const { tabsToRenderInTabList, pinnedLeftTab } = isStandardCampaign
    ? { tabsToRenderInTabList: tabsForCurrentObject, pinnedLeftTab: undefined }
    : getTabsByDisplayMode({
        tabs: tabsForCurrentObject,
        pageLayoutType: currentPageLayout.type,
        isMobile,
        isInSidePanel,
      });

  const positionSortedTabs = sortTabsByPosition(tabsToRenderInTabList);
  const campaignTabOrder = [
    '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596', // Influencers
    '8d749a63-24d8-481b-9a10-d98d9b959db1', // Outreach
    '8482a6bc-bc2a-4f2d-8296-6d951f681c4f', // Campaign
    '0d213a1a-e001-496c-970e-e692968cf17c', // Agent
    '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0', // Tasks
    'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba', // Settings
    'cd78ad8c-883a-4ce1-9b74-526adadb751d', // Notes
  ];
  const sortedActiveTabs =
    isStandardCampaign && !isPageLayoutInEditMode
      ? [...positionSortedTabs].sort((a, b) => {
          const rank = (identifier: string | undefined) => {
            const index = campaignTabOrder.indexOf(identifier ?? '');
            return index === -1 ? campaignTabOrder.length : index;
          };
          return rank(a.universalIdentifier) - rank(b.universalIdentifier);
        })
      : positionSortedTabs;
  const activityTabId = sortedActiveTabs.find(
    (tab) => tab.universalIdentifier === '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
  )?.id;
  const defaultTabId =
    influencerTab?.id ??
    currentPageLayout.defaultTabToFocusOnMobileAndSidePanelId ??
    undefined;

  const tabIdToRender =
    renderMode === 'default-tab-only'
      ? getPageLayoutTabListInitialActiveTabId({
          activeTabId: null,
          tabs: sortedActiveTabs,
          defaultTabToFocusOnMobileAndSidePanelId: defaultTabId,
          isMobile,
          isInSidePanel,
        })
      : activeTabId;

  const isCreatorTab = influencerTab?.id === tabIdToRender;
  const campaignId = isStandardCampaign
    ? targetRecordIdentifier?.id
    : undefined;
  const [visitedInfluencers, setVisitedInfluencers] = useState<string>();
  const campaignVisitKey = `${currentWorkspace?.id}/${campaignId}/${currentPageLayout.id}`;
  useEffect(() => {
    if (isCreatorTab && canReadCampaign && campaignId) {
      setVisitedInfluencers(campaignVisitKey);
    }
  }, [isCreatorTab, canReadCampaign, campaignId, campaignVisitKey]);
  const preserveInfluencers =
    renderMode === 'all-tabs' &&
    isStandardCampaign &&
    !!influencerTab &&
    canReadCampaign &&
    (isCreatorTab || visitedInfluencers === campaignVisitKey);
  const creatorReturnTarget = location.state?.campaignCreatorInboxReturnTarget;
  useEffect(() => {
    if (
      consumedReturnKey === location.key ||
      !currentWorkspace?.id ||
      !isCampaignCreatorInboxReturnTarget(
        creatorReturnTarget,
        currentWorkspace.id,
      ) ||
      !isStandardCampaign ||
      !canReadCampaign ||
      !influencerTab ||
      creatorReturnTarget.influencerTabId !== influencerTab.id ||
      creatorReturnTarget.campaignId !== campaignId ||
      location.pathname !== creatorReturnTarget.pathname ||
      location.hash !== `#${influencerTab.id}`
    )
      return;
    // The native hash/tab effect selects Influencers; only restore the panel
    // after that tab is active and the current campaign remains readable.
    if (!isCreatorTab || isPageLayoutInEditMode) return;
    setConsumedReturnKey(location.key);
    if (creatorReturnTarget.scrollTop !== undefined) {
      setReturnScroll({
        workspaceId: currentWorkspace.id,
        campaignId,
        position: creatorReturnTarget.scrollTop,
      });
    }
    setSelection({
      workspaceId: currentWorkspace.id,
      campaignId,
      membershipId: creatorReturnTarget.membershipId,
    });
    // Consume the one-shot return in the history entry, not only in this
    // component instance: Back must not reopen a closed panel.
    const nextState = { ...location.state };
    delete nextState.campaignCreatorInboxReturnTarget;
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: Object.keys(nextState).length ? nextState : null,
      },
    );
  }, [
    location.key,
    consumedReturnKey,
    location.pathname,
    location.hash,
    location.search,
    location.state,
    navigate,
    creatorReturnTarget,
    currentWorkspace?.id,
    isStandardCampaign,
    canReadCampaign,
    influencerTab,
    campaignId,
    isCreatorTab,
    isPageLayoutInEditMode,
  ]);
  useEffect(() => {
    if (
      returnScroll &&
      (returnScroll.workspaceId !== currentWorkspace?.id ||
        returnScroll.campaignId !== campaignId)
    ) {
      setReturnScroll(undefined);
    }
  }, [returnScroll, currentWorkspace?.id, campaignId]);
  const visibleSelection =
    selection?.campaignId === campaignId &&
    selection?.workspaceId === currentWorkspace?.id &&
    isCreatorTab &&
    canReadCampaign &&
    !isPageLayoutInEditMode
      ? selection
      : undefined;
  const clearReturnScroll = useCallback(() => setReturnScroll(undefined), []);
  const closeCreatorContext = useCallback(() => {
    const invoker = selection?.invoker;
    const rowIndex = selection?.rowIndex;
    setSelection(undefined);
    requestAnimationFrame(() => {
      const region = regionRef.current;
      const list = region?.querySelector<HTMLElement>(
        '[data-testid="campaign-list-content"]',
      );
      const interactive =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [role="button"], [tabindex="0"]';
      const rows = list?.querySelectorAll<HTMLElement>('[data-selectable-id]');
      const selectedRow = Array.from(rows ?? []).find(
        (row) =>
          row.getAttribute('data-selectable-id') === selection?.membershipId,
      );
      const nearbyRow = rows?.[Math.min(rowIndex ?? 0, rows.length - 1)];
      const target =
        invoker?.isConnected && list?.contains(invoker)
          ? invoker
          : (selectedRow?.querySelector<HTMLElement>(interactive) ??
            nearbyRow?.querySelector<HTMLElement>(interactive) ??
            list?.querySelector<HTMLElement>(interactive));
      target?.focus({ preventScroll: true });
    });
  }, [selection]);
  const openCreatorContext = useCallback(
    (request: RecordIndexOpenRequest) => {
      if (
        !campaignId ||
        !currentWorkspace?.id ||
        !isCreatorTab ||
        !canReadCampaign
      )
        return;
      const invoker =
        request.activationElement ??
        (document.activeElement instanceof HTMLElement &&
        regionRef.current?.contains(document.activeElement)
          ? document.activeElement
          : undefined);
      const rows = regionRef.current?.querySelectorAll(
        '[data-testid="campaign-list-content"] [data-selectable-id]',
      );
      const row = invoker?.closest('[data-selectable-id]');
      const rowIndex = row && rows ? Array.from(rows).indexOf(row) : -1;
      setSelection({
        campaignId,
        workspaceId: currentWorkspace.id,
        membershipId: request.recordId,
        invoker,
        rowIndex: rowIndex >= 0 ? rowIndex : undefined,
      });
    },
    [campaignId, currentWorkspace?.id, isCreatorTab, canReadCampaign],
  );
  useEffect(() => {
    if (selection && !visibleSelection) {
      setSelection(undefined);
      if (!canReadCampaign && selection.campaignId === campaignId) {
        regionRef.current?.focus({ preventScroll: true });
      }
    }
  }, [selection, visibleSelection, canReadCampaign, campaignId]);
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrowRegion(entry.contentRect.width <= 850);
    });
    observer.observe(region);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const region = regionRef.current;
    if (!visibleSelection || !region) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        document.querySelector('dialog[open], [role="dialog"]')
      )
        return;
      event.preventDefault();
      closeCreatorContext();
    };
    region.addEventListener('keydown', handleEscape, true);
    return () => region.removeEventListener('keydown', handleEscape, true);
  }, [visibleSelection, closeCreatorContext]);
  const tabToRenderExistsInCurrentPageLayout = currentPageLayout.tabs.some(
    (tab) => tab.id === tabIdToRender,
  );

  return (
    <StyledContainer hasPinnedTab={isDefined(pinnedLeftTab)}>
      {isDefined(pinnedLeftTab) && (
        <PageLayoutLeftPanel pinnedLeftTabId={pinnedLeftTab.id} />
      )}

      <StyledCampaignRegion
        ref={regionRef}
        tabIndex={-1}
        hasPanel={!!visibleSelection}
        overlay={isInSidePanel || isMobile}
      >
        <StyledTabsAndDashboardContainer
          data-testid="campaign-main-region"
          hasPanel={!!visibleSelection}
          overlay={isInSidePanel || isMobile}
          inert={
            !!visibleSelection && (isInSidePanel || isMobile || isNarrowRegion)
          }
        >
          {isStandardCampaign && campaignId && (
            <MyahCampaignWorkspaceHeader campaignId={campaignId} />
          )}
          {renderMode === 'all-tabs' && (
            <>
              <PageLayoutTabListEffect
                tabs={sortedActiveTabs}
                componentInstanceId={tabListInstanceId}
                defaultTabToFocusOnMobileAndSidePanelId={defaultTabId}
              />
              {(sortedActiveTabs.length > 1 || isPageLayoutInEditMode) && (
                <PageLayoutTabList
                  className="page-layout-tab-list-print-hidden"
                  tabs={sortedActiveTabs}
                  behaveAsLinks={!isInSidePanel && !isPageLayoutInEditMode}
                  isInSidePanel={isInSidePanel}
                  componentInstanceId={tabListInstanceId}
                  addTabStrategy={addTabStrategy}
                  isReorderEnabled={canEnableTabEditing}
                  onReorder={
                    canEnableTabEditing
                      ? (result, provided) =>
                          reorderRecordPageTabs(
                            result,
                            provided,
                            isDefined(pinnedLeftTab),
                          )
                      : undefined
                  }
                  pageLayoutType={currentPageLayout.type}
                />
              )}
            </>
          )}

          {preserveInfluencers ? (
            <StyledScrollWrapperContainer
              data-testid={isCreatorTab ? 'campaign-list-content' : undefined}
              hidden={!isCreatorTab}
              aria-hidden={!isCreatorTab}
              inert={!isCreatorTab}
            >
              <ScrollWrapper
                className="page-layout-scroll-wrapper"
                componentInstanceId={`${scrollWrapperInstanceId}-influencers-${campaignId}`}
                defaultEnableXScroll={false}
              >
                {returnScroll &&
                returnScroll.workspaceId === currentWorkspace?.id &&
                returnScroll.campaignId === campaignId &&
                isCreatorTab ? (
                  <CampaignListReturnScrollEffect
                    position={returnScroll.position}
                    active={!visibleSelection}
                    onRestored={clearReturnScroll}
                  />
                ) : null}
                <PageLayoutMainContent
                  key={campaignVisitKey}
                  tabId={influencerTab.id}
                  activityTabId={activityTabId}
                  onOpenCampaignCreatorContext={
                    isCreatorTab ? openCreatorContext : undefined
                  }
                />
              </ScrollWrapper>
            </StyledScrollWrapperContainer>
          ) : null}
          <StyledScrollWrapperContainer
            data-testid={
              preserveInfluencers ? undefined : 'campaign-list-content'
            }
            hidden={preserveInfluencers && isCreatorTab}
            aria-hidden={preserveInfluencers && isCreatorTab}
            inert={preserveInfluencers && isCreatorTab}
          >
            <ScrollWrapper
              className="page-layout-scroll-wrapper"
              componentInstanceId={scrollWrapperInstanceId}
              defaultEnableXScroll={false}
            >
              {!preserveInfluencers &&
              returnScroll?.workspaceId === currentWorkspace?.id &&
              returnScroll?.campaignId === campaignId &&
              isCreatorTab ? (
                <CampaignListReturnScrollEffect
                  position={returnScroll?.position}
                  active={!visibleSelection}
                  onRestored={clearReturnScroll}
                />
              ) : null}
              {isDefined(tabIdToRender) &&
                tabToRenderExistsInCurrentPageLayout &&
                (!preserveInfluencers || !isCreatorTab) && (
                  <PageLayoutMainContent
                    tabId={tabIdToRender}
                    activityTabId={
                      isStandardCampaign ? activityTabId : undefined
                    }
                    onOpenCampaignCreatorContext={
                      isStandardCampaign && isCreatorTab
                        ? openCreatorContext
                        : undefined
                    }
                  />
                )}
            </ScrollWrapper>
          </StyledScrollWrapperContainer>
        </StyledTabsAndDashboardContainer>
        {visibleSelection ? (
          <MyahCampaignCreatorContextPanel
            key={`${visibleSelection.workspaceId}-${visibleSelection.campaignId}-${visibleSelection.membershipId}`}
            campaignId={visibleSelection.campaignId}
            membershipId={visibleSelection.membershipId}
            onClose={closeCreatorContext}
            initialTab="messages"
            returnTarget={{
              workspaceId: visibleSelection.workspaceId,
              campaignId: visibleSelection.campaignId,
              membershipId: visibleSelection.membershipId,
              influencerTabId: influencerTab!.id,
              pathname: getAppPath(AppPath.RecordShowPage, {
                objectNameSingular: 'campaign',
                objectRecordId: visibleSelection.campaignId,
              }),
              search: location.search,
              scrollTop: preserveInfluencers
                ? influencerScrollTop
                : scrollWrapperScrollTop,
            }}
          />
        ) : null}
      </StyledCampaignRegion>
    </StyledContainer>
  );
};
