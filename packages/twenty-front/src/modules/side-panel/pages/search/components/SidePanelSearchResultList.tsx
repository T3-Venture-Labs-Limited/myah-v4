import { CommandMenuItem } from '@/command-menu/components/CommandMenuItem';
import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { SIDE_PANEL_SELECTABLE_LIST_ID } from '@/side-panel/constants/SidePanelSelectableListId';
import { useHandleSidePanelEscape } from '@/side-panel/hooks/useHandleSidePanelEscape';
import { hasUserSelectedSidePanelListItemState } from '@/side-panel/states/hasUserSelectedSidePanelListItemState';
import { type SearchResultItem } from '@/side-panel/pages/search/hooks/useSidePanelSearchRecords';
import { SelectableListItem } from '@/ui/layout/selectable-list/components/SelectableListItem';
import { useSelectableList } from '@/ui/layout/selectable-list/hooks/useSelectableList';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';
import { type KeyboardEvent, useLayoutEffect, useState } from 'react';
import { Avatar } from 'twenty-ui/data-display';

export type SidePanelSearchResultListProps = {
  items: SearchResultItem[];
  onActivate: (item: SearchResultItem) => void;
};

export const SidePanelSearchResultList = ({
  items,
  onActivate,
}: SidePanelSearchResultListProps) => {
  const { setSelectedItemId } = useSelectableList(
    SIDE_PANEL_SELECTABLE_LIST_ID,
  );
  const setHasUserSelectedSidePanelListItem = useSetAtomState(
    hasUserSelectedSidePanelListItemState,
  );
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [pendingFocusItemId, setPendingFocusItemId] = useState<string | null>(
    null,
  );
  const handleSidePanelEscape = useHandleSidePanelEscape();

  useLayoutEffect(() => {
    if (
      focusedItemId === null ||
      items.some((item) => item.id === focusedItemId)
    ) {
      return;
    }

    const firstReplacementItem = items[0];

    if (firstReplacementItem !== undefined) {
      setSelectedItemId(firstReplacementItem.id);
      setPendingFocusItemId(firstReplacementItem.id);
      return;
    }

    setFocusedItemId(null);
    document.getElementById(SIDE_PANEL_FOCUS_ID)?.focus();
  }, [focusedItemId, items, setSelectedItemId]);

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    index: number,
  ) => {
    const item = items[index];

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      handleSidePanelEscape();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(item);
      return;
    }

    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, items.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : index;

    if (nextIndex !== index) {
      event.preventDefault();
      setHasUserSelectedSidePanelListItem(true);
      setSelectedItemId(items[nextIndex].id);
      setPendingFocusItemId(items[nextIndex].id);
    }
  };

  return items.map((item, index) => (
    <SelectableListItem
      key={item.id}
      itemId={item.id}
      role="option"
      ariaLabel={`${item.label}, ${item.objectLabel}`}
      isRoving
      itemRef={(element) => {
        if (element === null || pendingFocusItemId !== item.id) {
          return;
        }

        element.focus();
        setPendingFocusItemId(null);
      }}
      onKeyDown={(event) => handleRowKeyDown(event, index)}
      onEnter={() => onActivate(item)}
      onFocus={() => {
        setFocusedItemId(item.id);
      }}
      onBlur={() => {
        setFocusedItemId(null);
      }}
    >
      <CommandMenuItem
        id={item.id}
        label={item.label}
        description={item.objectLabel}
        onClick={() => onActivate(item)}
        LeftComponent={
          <Avatar
            type={item.avatarType}
            avatarUrl={getAbsoluteImageUrl(item.imageUrl)}
            placeholderColorSeed={item.recordId}
            placeholder={item.label}
          />
        }
      />
    </SelectableListItem>
  ));
};
