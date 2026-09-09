import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { NAVIGATION_DRAWER_COLLAPSED_WIDTH } from '@/ui/layout/resizable-panel/constants/NavigationDrawerCollapsedWidth';
import {
  NAVIGATION_DRAWER_WIDTH_VAR,
  navigationDrawerWidthState,
} from '@/ui/navigation/states/navigationDrawerWidthState';
import { SidePanelPages } from 'twenty-shared/types';
import { useScreenSize } from 'twenty-ui/utilities';
import { tableWidthResizeIsActiveState } from '@/object-record/record-table/states/tableWidthResizeIsActivedState';
import { SidePanelRouter } from '@/side-panel/components/SidePanelRouter';
import { SidePanelWidthEffect } from '@/side-panel/components/SidePanelWidthEffect';
import { SIDE_PANEL_CLICK_OUTSIDE_ID } from '@/side-panel/constants/SidePanelClickOutsideId';
import { SIDE_PANEL_CONSTRAINTS } from '@/side-panel/constants/SidePanelConstraints';
import { useSidePanelCloseAnimationCompleteCleanup } from '@/side-panel/hooks/useSidePanelCloseAnimationCompleteCleanup';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { isSidePanelClosingState } from '@/side-panel/states/isSidePanelClosingState';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import {
  SIDE_PANEL_WIDTH_VAR,
  sidePanelWidthState,
} from '@/side-panel/states/sidePanelWidthState';
import { ModalContainerContext } from '@/ui/layout/modal/contexts/ModalContainerContext';
import { ResizablePanelGap } from '@/ui/layout/resizable-panel/components/ResizablePanelGap';
import { ParentClickOutsideIdContext } from '@/ui/utilities/pointer-event/contexts/ParentClickOutsideIdContext';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { styled } from '@linaria/react';
import { useCallback, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

// The Inbox's existing 3:9 grid gets 145px for its list and 435px for the
// conversation at this budget. Native min320 takes precedence on narrow views.
const MYAH_INBOX_MIN_CONTENT_WIDTH = 580;

const StyledSidePanelWrapper = styled.div<{
  isOpen: boolean;
  isResizing: boolean;
}>`
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
  transition: ${({ isResizing }) =>
    isResizing
      ? 'none'
      : `width calc(${themeCssVariables.animation.duration.normal} * 1s)`};
  width: ${({ isOpen }) => (isOpen ? `var(${SIDE_PANEL_WIDTH_VAR})` : '0px')};
`;

const StyledSidePanel = styled.aside`
  background: ${themeCssVariables.background.primary};
  border-left: 1px solid ${themeCssVariables.border.color.medium};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;
`;

const StyledModalContainer = styled.div`
  height: 100%;
  left: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  width: 100%;
  z-index: 1;
`;

export const SidePanelForDesktop = () => {
  const isSidePanelOpened = useAtomStateValue(isSidePanelOpenedState);
  const isSidePanelClosing = useAtomStateValue(isSidePanelClosingState);
  const [sidePanelWidth, setSidePanelWidth] = useAtomState(sidePanelWidthState);
  const sidePanelPage = useAtomStateValue(sidePanelPageState);
  const { width: screenWidth } = useScreenSize();
  const isNavigationDrawerExpanded = useNavigationDrawerExpanded();
  const navigationDrawerWidth = useAtomStateValue(navigationDrawerWidthState);
  const isInboxContext = sidePanelPage === SidePanelPages.MyahInboxContext;
  const occupiedNavigationWidth = isNavigationDrawerExpanded
    ? navigationDrawerWidth
    : NAVIGATION_DRAWER_COLLAPSED_WIDTH;
  const constraints = isInboxContext
    ? {
        ...SIDE_PANEL_CONSTRAINTS,
        max: Math.max(
          SIDE_PANEL_CONSTRAINTS.min,
          Math.min(
            SIDE_PANEL_CONSTRAINTS.max,
            screenWidth -
              occupiedNavigationWidth -
              MYAH_INBOX_MIN_CONTENT_WIDTH,
          ),
        ),
      }
    : SIDE_PANEL_CONSTRAINTS;
  const currentWidth = isInboxContext
    ? Math.max(constraints.min, Math.min(sidePanelWidth, constraints.max))
    : sidePanelWidth;
  // CSS follows live native nav drag as well as viewport changes. The stored
  // width stays untouched until the user deliberately completes a panel drag.
  const navigationWidthCss = isNavigationDrawerExpanded
    ? `var(${NAVIGATION_DRAWER_WIDTH_VAR})`
    : `${NAVIGATION_DRAWER_COLLAPSED_WIDTH}px`;
  const { closeSidePanelMenu } = useSidePanelMenu();
  const { sidePanelCloseAnimationCompleteCleanup } =
    useSidePanelCloseAnimationCompleteCleanup();

  const [modalContainer, setModalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [isResizing, setIsResizing] = useState(false);
  const [shouldRenderContent, setShouldRenderContent] =
    useState(isSidePanelOpened);

  const setTableWidthResizeIsActive = useSetAtomState(
    tableWidthResizeIsActiveState,
  );

  const shouldShowContent = isSidePanelOpened || shouldRenderContent;

  const handleTransitionEnd = () => {
    if (isSidePanelOpened) {
      // Open animation completed - ensure content persists for close animation
      setShouldRenderContent(true);
    } else {
      // Close animation completed
      setShouldRenderContent(false);
      if (isSidePanelClosing) {
        sidePanelCloseAnimationCompleteCleanup();
      }
    }
  };

  const handleModalContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      setModalContainer(element);
    },
    [],
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      if (isInboxContext) {
        // A changed cap can finish at the already-persisted width, so the
        // width effect will not rerun to replace the last pointer-move CSS.
        document.documentElement.style.setProperty(
          SIDE_PANEL_WIDTH_VAR,
          `${width}px`,
        );
      }
      setSidePanelWidth(width);
      setIsResizing(false);
      setTableWidthResizeIsActive(true);
    },
    [isInboxContext, setSidePanelWidth, setTableWidthResizeIsActive],
  );

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
    setTableWidthResizeIsActive(false);
  }, [setTableWidthResizeIsActive]);

  const handleCollapse = useCallback(() => {
    closeSidePanelMenu();
    setIsResizing(false);
    setTableWidthResizeIsActive(true);
  }, [closeSidePanelMenu, setTableWidthResizeIsActive]);

  return (
    <>
      <SidePanelWidthEffect />
      <ResizablePanelGap
        side="left"
        constraints={constraints}
        currentWidth={currentWidth}
        onWidthChange={handleWidthChange}
        onCollapse={handleCollapse}
        gapWidth={0}
        cssVariableName={SIDE_PANEL_WIDTH_VAR}
        onResizeStart={handleResizeStart}
      />

      <StyledSidePanelWrapper
        isOpen={isSidePanelOpened}
        isResizing={isResizing}
        style={
          isInboxContext
            ? {
                minWidth: isSidePanelOpened ? constraints.min : 0,
                maxWidth: `clamp(${constraints.min}px, calc(100vw - ${navigationWidthCss} - ${MYAH_INBOX_MIN_CONTENT_WIDTH}px), ${SIDE_PANEL_CONSTRAINTS.max}px)`,
              }
            : undefined
        }
        onTransitionEnd={handleTransitionEnd}
        data-side-panel=""
        data-click-outside-id={SIDE_PANEL_CLICK_OUTSIDE_ID}
      >
        <StyledSidePanel>
          <StyledModalContainer ref={handleModalContainerRef} />
          <ModalContainerContext.Provider value={{ container: modalContainer }}>
            <ParentClickOutsideIdContext.Provider
              value={SIDE_PANEL_CLICK_OUTSIDE_ID}
            >
              {shouldShowContent && <SidePanelRouter />}
            </ParentClickOutsideIdContext.Provider>
          </ModalContainerContext.Provider>
        </StyledSidePanel>
      </StyledSidePanelWrapper>
    </>
  );
};
