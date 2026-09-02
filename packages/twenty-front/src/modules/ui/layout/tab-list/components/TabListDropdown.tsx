import { t } from '@lingui/core/macro';
import {
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { TabAvatar } from '@/ui/layout/tab-list/components/TabAvatar';
import { TabMoreButton } from '@/ui/layout/tab-list/components/TabMoreButton';
import { type SingleTabProps } from '@/ui/layout/tab-list/types/SingleTabProps';
import { MenuItemSelectAvatar } from 'twenty-ui/navigation';

type TabListDropdownProps = {
  dropdownId: string;
  onClose: () => void;
  overflow: {
    hiddenTabsCount: number;
    isActiveTabHidden: boolean;
  };
  hiddenTabs: SingleTabProps[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  loading?: boolean;
};

export const TabListDropdown = ({
  dropdownId,
  onClose,
  overflow,
  hiddenTabs,
  activeTabId,
  onTabSelect,
  loading,
}: TabListDropdownProps) => {
  const triggerRef = useRef<HTMLElement>(null);
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);

  const enabledTabs = useMemo(
    () => hiddenTabs.filter((tab) => !(tab.disabled ?? loading)),
    [hiddenTabs, loading],
  );

  const getOptionId = useCallback(
    (tabId: string) => `${dropdownId}-option-${tabId}`,
    [dropdownId],
  );

  const focusTab = useCallback(
    (tabId: string) => {
      setFocusedTabId(tabId);
      document.getElementById(getOptionId(tabId))?.focus();
    },
    [getOptionId],
  );

  const focusInitialTab = useCallback(() => {
    const initialTab =
      enabledTabs.find((tab) => tab.id === activeTabId) ?? enabledTabs[0];

    if (initialTab !== undefined) {
      window.requestAnimationFrame(() => focusTab(initialTab.id));
    }
  }, [activeTabId, enabledTabs, focusTab]);

  const closeAndRestoreFocus = useCallback(() => {
    onClose();
    triggerRef.current?.focus();
  }, [onClose]);

  const selectTab = useCallback(
    (tabId: string) => {
      onTabSelect(tabId);
      closeAndRestoreFocus();
    },
    [closeAndRestoreFocus, onTabSelect],
  );

  const handleOptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, tabId: string) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreFocus();
        return;
      }

      const currentIndex = enabledTabs.findIndex((tab) => tab.id === tabId);

      if (currentIndex === -1) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        selectTab(tabId);
        return;
      }

      let nextIndex: number | undefined;

      switch (event.key) {
        case 'ArrowDown':
          nextIndex = (currentIndex + 1) % enabledTabs.length;
          break;
        case 'ArrowUp':
          nextIndex =
            (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = enabledTabs.length - 1;
          break;
      }

      if (nextIndex !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        focusTab(enabledTabs[nextIndex].id);
      }
    },
    [closeAndRestoreFocus, enabledTabs, focusTab, selectTab],
  );

  return (
    <Dropdown
      dropdownId={dropdownId}
      dropdownPlacement="bottom-end"
      dropdownAriaLabel={t`More`}
      onClickOutside={onClose}
      dropdownOffset={{ x: 0, y: 8 }}
      onOpen={focusInitialTab}
      renderClickableComponentAsChild
      clickableComponent={
        <TabMoreButton
          ref={triggerRef}
          hiddenTabsCount={overflow.hiddenTabsCount}
          active={overflow.isActiveTabHidden}
        />
      }
      dropdownComponents={
        <DropdownContent>
          <DropdownMenuItemsContainer>
            {hiddenTabs.map((tab) => {
              const isDisabled = tab.disabled ?? loading;

              return (
                <MenuItemSelectAvatar
                  id={getOptionId(tab.id)}
                  tabIndex={-1}
                  key={tab.id}
                  text={tab.title}
                  avatar={<TabAvatar tab={tab} />}
                  selected={tab.id === activeTabId}
                  focused={tab.id === focusedTabId}
                  onFocus={() => setFocusedTabId(tab.id)}
                  onKeyDown={(event) => handleOptionKeyDown(event, tab.id)}
                  onClick={isDisabled ? undefined : () => selectTab(tab.id)}
                  disabled={isDisabled}
                />
              );
            })}
          </DropdownMenuItemsContainer>
        </DropdownContent>
      }
    />
  );
};
