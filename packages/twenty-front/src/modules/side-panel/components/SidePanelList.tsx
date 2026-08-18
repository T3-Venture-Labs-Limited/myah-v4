import { SidePanelDefaultSelectionEffect } from '@/side-panel/components/SidePanelDefaultSelectionEffect';
import { SIDE_PANEL_SELECTABLE_LIST_ID } from '@/side-panel/constants/SidePanelSelectableListId';
import { SIDE_PANEL_TOP_BAR_HEIGHT } from '@/side-panel/constants/SidePanelTopBarHeight';
import { SIDE_PANEL_LIST_PADDING } from '@/side-panel/constants/SidePanelListPadding';
import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { hasUserSelectedSidePanelListItemState } from '@/side-panel/states/hasUserSelectedSidePanelListItemState';
import { SelectableList } from '@/ui/layout/selectable-list/components/SelectableList';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { ScrollWrapper } from '@/ui/utilities/scroll/components/ScrollWrapper';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

export type SidePanelListProps = {
  selectableItemIds: string[];
  children: React.ReactNode;
  loading?: boolean;
  noResults?: boolean;
  noResultsText?: string;
  role?: 'listbox';
  ariaLabel?: string;
  status?: string;
};

const StyledInnerList = styled.div`
  max-height: calc(
    100dvh - ${SIDE_PANEL_TOP_BAR_HEIGHT}px - ${SIDE_PANEL_LIST_PADDING * 2}px
  );
  padding-left: ${themeCssVariables.spacing[2]};
  padding-right: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[2]};
  width: 100%;

  @media (min-width: ${MOBILE_VIEWPORT}px) {
    max-height: calc(
      100dvh - ${SIDE_PANEL_TOP_BAR_HEIGHT}px - ${SIDE_PANEL_LIST_PADDING * 2}px
    );
  }
`;

const StyledEmpty = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.light};
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  height: 64px;
  justify-content: center;
  white-space: pre-wrap;
`;

const StyledStatus = styled.div`
  border: 0;
  clip: rect(0 0 0 0);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
`;

export const SidePanelList = ({
  selectableItemIds,
  children,
  loading = false,
  noResults = false,
  noResultsText,
  role,
  ariaLabel,
  status,
}: SidePanelListProps) => {
  const setHasUserSelectedSidePanelListItem = useSetAtomState(
    hasUserSelectedSidePanelListItemState,
  );

  return (
    <>
      <SidePanelDefaultSelectionEffect selectableItemIds={selectableItemIds} />
      <ScrollWrapper componentInstanceId={`scroll-wrapper-side-panel`}>
        <StyledInnerList role={role} aria-label={ariaLabel}>
          <SelectableList
            selectableListInstanceId={SIDE_PANEL_SELECTABLE_LIST_ID}
            focusId={SIDE_PANEL_FOCUS_ID}
            selectableItemIdArray={selectableItemIds}
            onSelect={() => {
              setHasUserSelectedSidePanelListItem(true);
            }}
          >
            {children}
            {noResults && !loading && (
              <StyledEmpty>{noResultsText ?? t`No results found`}</StyledEmpty>
            )}
          </SelectableList>
        </StyledInnerList>
        {status !== undefined && (
          <StyledStatus role="status" aria-live="polite">
            {status}
          </StyledStatus>
        )}
      </ScrollWrapper>
    </>
  );
};
