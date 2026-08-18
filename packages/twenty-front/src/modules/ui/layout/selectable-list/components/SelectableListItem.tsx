import {
  type FocusEventHandler,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { SelectableListItemHotkeyEffect } from '@/ui/layout/selectable-list/components/SelectableListItemHotkeyEffect';
import { isSelectedItemIdComponentFamilyState } from '@/ui/layout/selectable-list/states/isSelectedItemIdComponentFamilyState';
import { useAtomComponentFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateValue';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';

const StyledListItemContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

export type SelectableListItemProps = {
  itemId: string;
  children: ReactNode;
  onEnter?: () => void;
  className?: string;
  role?: 'option';
  ariaLabel?: string;
  isRoving?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  itemRef?: Ref<HTMLDivElement>;
};

export const SelectableListItem = ({
  itemId,
  children,
  onEnter,
  className,
  role,
  ariaLabel,
  isRoving,
  onKeyDown,
  onFocus,
  onBlur,
  itemRef,
}: SelectableListItemProps) => {
  const isSelectedItemId = useAtomComponentFamilyStateValue(
    isSelectedItemIdComponentFamilyState,
    itemId,
  );

  const listItemRef = useRef<HTMLDivElement>(null);

  const setListItemRef = useCallback(
    (node: HTMLDivElement | null) => {
      listItemRef.current = node;

      if (typeof itemRef === 'function') {
        itemRef(node);
      } else if (isDefined(itemRef)) {
        itemRef.current = node;
      }
    },
    [itemRef],
  );

  useEffect(() => {
    if (!isSelectedItemId || !listItemRef.current) {
      return;
    }

    listItemRef.current.scrollIntoView?.({
      behavior: 'auto',
      block: 'nearest',
    });
  }, [isSelectedItemId]);

  return (
    <>
      {isSelectedItemId && isDefined(onEnter) && (
        <SelectableListItemHotkeyEffect itemId={itemId} onEnter={onEnter} />
      )}
      <StyledListItemContainer
        ref={setListItemRef}
        className={className}
        role={role}
        aria-label={ariaLabel}
        tabIndex={isRoving ? (isSelectedItemId ? 0 : -1) : undefined}
        aria-selected={isRoving ? isSelectedItemId : undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {children}
      </StyledListItemContainer>
    </>
  );
};
