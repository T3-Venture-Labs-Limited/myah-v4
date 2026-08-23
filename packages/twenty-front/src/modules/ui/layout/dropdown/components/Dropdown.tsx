import { DropdownOnToggleEffect } from '@/ui/layout/dropdown/components/DropdownOnToggleEffect';
import {
  DropdownInternalContainer,
  type DropdownContainerType,
} from '@/ui/layout/dropdown/components/internal/DropdownInternalContainer';
import { DROPDOWN_BOUNDARY_BOTTOM_PADDING_DESKTOP } from '@/ui/layout/dropdown/constants/DropdownBoundaryBottomPaddingDesktop';
import { DROPDOWN_BOUNDARY_BOTTOM_PADDING_MOBILE } from '@/ui/layout/dropdown/constants/DropdownBoundaryBottomPaddingMobile';
import { DROPDOWN_BOUNDARY_HORIZONTAL_PADDING } from '@/ui/layout/dropdown/constants/DropdownBoundaryHorizontalPadding';
import { DROPDOWN_RESIZE_MIN_HEIGHT } from '@/ui/layout/dropdown/constants/DropdownResizeMinHeight';
import { DROPDOWN_RESIZE_MIN_WIDTH } from '@/ui/layout/dropdown/constants/DropdownResizeMinWidth';
import { DropdownComponentInstanceContext } from '@/ui/layout/dropdown/contexts/DropdownComponentInstanceContext';
import { useToggleDropdown } from '@/ui/layout/dropdown/hooks/useToggleDropdown';
import { dropdownMaxHeightComponentState } from '@/ui/layout/dropdown/states/internal/dropdownMaxHeightComponentState';
import { dropdownMaxWidthComponentState } from '@/ui/layout/dropdown/states/internal/dropdownMaxWidthComponentState';
import { dropdownYPositionComponentState } from '@/ui/layout/dropdown/states/internal/dropdownYPositionComponentState';
import { isDropdownOpenComponentState } from '@/ui/layout/dropdown/states/isDropdownOpenComponentState';
import { type DropdownOffset } from '@/ui/layout/dropdown/types/DropdownOffset';
import { type GlobalHotkeysConfig } from '@/ui/utilities/hotkey/types/GlobalHotkeysConfig';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import {
  type Placement,
  autoUpdate,
  flip,
  offset,
  size,
  useFloating,
} from '@floating-ui/react';
import { styled } from '@linaria/react';
import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { flushSync } from 'react-dom';
import { type Keys } from 'react-hotkeys-hook';
import { isDefined } from 'twenty-shared/utils';
import { useIsMobile } from 'twenty-ui/utilities';

type Width = `${string}px` | `${number}%` | 'auto' | number;

type ClickableComponentProps = Pick<
  ComponentPropsWithRef<'button'>,
  'aria-controls' | 'aria-expanded' | 'aria-haspopup' | 'onClick' | 'ref'
>;
const StyledDropdownFallbackAnchor = styled.div`
  left: 0;
  position: fixed;
  top: 0;
`;

const StyledClickableComponent = styled.div<{
  width?: Width;
}>`
  height: fit-content;
  width: ${({ width }) => width ?? 'auto'};
`;

export type DropdownProps = {
  clickableComponent?: ReactNode;
  clickableComponentWidth?: Width;
  containerType?: DropdownContainerType;
  renderClickableComponentAsChild?: boolean;
  dropdownComponents: ReactNode;
  hotkey?: {
    key: Keys;
  };
  globalHotkeysConfig?: Partial<GlobalHotkeysConfig>;
  dropdownId: string;
  dropdownPlacement?: Placement;
  dropdownOffset?: DropdownOffset;
  dropdownStrategy?: 'fixed' | 'absolute';
  dropdownRole?: 'dialog' | 'listbox';
  dropdownAriaLabel?: string;
  clickableComponentAriaLabel?: string;
  isClickableComponentKeyboardAccessible?: boolean;
  autoFocusClickableComponent?: boolean;
  onClickableComponentRef?: (element: HTMLDivElement | null) => void;
  onClickOutside?: () => void;
  onClose?: () => void;
  onOpen?: () => void;
  excludedClickOutsideIds?: string[];
  isDropdownInModal?: boolean;
  disableClickForClickableComponent?: boolean;
  middlewareBoundaryPadding?: {
    right?: number;
    left?: number;
    bottomDesktop?: number;
    bottomMobile?: number;
  };
};

export const Dropdown = ({
  clickableComponent,
  dropdownComponents,
  hotkey,
  dropdownId,
  globalHotkeysConfig,
  dropdownPlacement = 'bottom-end',
  dropdownStrategy = 'absolute',
  dropdownOffset,
  dropdownRole = 'listbox',
  dropdownAriaLabel,
  clickableComponentAriaLabel,
  isClickableComponentKeyboardAccessible = false,
  autoFocusClickableComponent = false,
  onClickableComponentRef,
  onClickOutside,
  onClose,
  onOpen,
  clickableComponentWidth = 'auto',
  containerType = 'listbox',
  renderClickableComponentAsChild = false,
  excludedClickOutsideIds,
  isDropdownInModal = false,
  disableClickForClickableComponent = false,
  middlewareBoundaryPadding = {},
}: DropdownProps) => {
  const isDropdownOpen = useAtomComponentStateValue(
    isDropdownOpenComponentState,
    dropdownId,
  );

  const { toggleDropdown } = useToggleDropdown();

  const isUsingOffset =
    isDefined(dropdownOffset?.x) || isDefined(dropdownOffset?.y);

  const offsetMiddleware = isUsingOffset
    ? [
        offset({
          crossAxis: dropdownOffset?.x ?? 0,
          mainAxis: dropdownOffset?.y ?? 0,
        }),
      ]
    : [];

  const setDropdownMaxHeight = useSetAtomComponentState(
    dropdownMaxHeightComponentState,
    dropdownId,
  );

  const setDropdownMaxWidth = useSetAtomComponentState(
    dropdownMaxWidthComponentState,
    dropdownId,
  );

  const setDropdownYPosition = useSetAtomComponentState(
    dropdownYPositionComponentState,
    dropdownId,
  );

  const isMobile = useIsMobile();
  const bottomAutoresizePadding = isMobile
    ? (middlewareBoundaryPadding.bottomMobile ??
      DROPDOWN_BOUNDARY_BOTTOM_PADDING_MOBILE)
    : (middlewareBoundaryPadding.bottomDesktop ??
      DROPDOWN_BOUNDARY_BOTTOM_PADDING_DESKTOP);

  const boundaryOptions = {
    boundary: document.querySelector('#root') ?? undefined,
    padding: {
      right:
        middlewareBoundaryPadding.right ?? DROPDOWN_BOUNDARY_HORIZONTAL_PADDING,
      left:
        middlewareBoundaryPadding.left ?? DROPDOWN_BOUNDARY_HORIZONTAL_PADDING,
      bottom: bottomAutoresizePadding,
    },
  };

  const { refs, floatingStyles, placement } = useFloating({
    placement: dropdownPlacement,
    middleware: [
      ...offsetMiddleware,
      flip({
        ...boundaryOptions,
      }),
      size({
        apply: ({ availableHeight, availableWidth, y: floatingY }) => {
          flushSync(() => {
            const maxHeightToApply =
              availableHeight < DROPDOWN_RESIZE_MIN_HEIGHT
                ? DROPDOWN_RESIZE_MIN_HEIGHT
                : availableHeight;

            const maxWidthToApply =
              availableWidth < DROPDOWN_RESIZE_MIN_WIDTH
                ? DROPDOWN_RESIZE_MIN_WIDTH
                : availableWidth;

            setDropdownMaxHeight(maxHeightToApply);
            setDropdownMaxWidth(maxWidthToApply);
            setDropdownYPosition(floatingY);
          });
        },
        ...boundaryOptions,
      }),
    ],
    whileElementsMounted: autoUpdate,
    strategy: dropdownStrategy,
  });

  const clickableComponentElement =
    renderClickableComponentAsChild &&
    isValidElement<ClickableComponentProps>(clickableComponent)
      ? clickableComponent
      : null;
  const clickableComponentRef = useRef<HTMLElement>(null);

  const setClickableComponentReference = useCallback(
    (node: HTMLButtonElement | HTMLDivElement | null) => {
      clickableComponentRef.current = node;
      refs.setReference(node);

      if (clickableComponentElement === null) {
        onClickableComponentRef?.(node as HTMLDivElement | null);
      }

      const forwardedRef = clickableComponentElement?.props.ref;

      if (typeof forwardedRef === 'function') {
        const cleanup = forwardedRef(node as HTMLButtonElement | null);

        if (typeof cleanup === 'function') {
          return cleanup;
        }
      } else if (forwardedRef) {
        forwardedRef.current = node as HTMLButtonElement | null;
      }
    },
    [clickableComponentElement, onClickableComponentRef, refs],
  );

  useEffect(() => {
    if (autoFocusClickableComponent) {
      clickableComponentRef.current?.focus();
    }
  }, [autoFocusClickableComponent]);

  const handleClickableComponentToggle = useCallback(
    (event: MouseEvent | KeyboardEvent) => {
      if (disableClickForClickableComponent) return;
      event.stopPropagation();
      event.preventDefault();

      toggleDropdown({
        dropdownComponentInstanceIdFromProps: dropdownId,
        globalHotkeysConfig,
      });
    },
    [
      globalHotkeysConfig,
      toggleDropdown,
      dropdownId,
      disableClickForClickableComponent,
    ],
  );

  const handleClickableComponentClick = useCallback(
    (event: MouseEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('a') !== null
      ) {
        return;
      }

      handleClickableComponentToggle(event);
    },
    [handleClickableComponentToggle],
  );

  const handleClickableComponentKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('a') !== null
      ) {
        return;
      }

      if (
        isClickableComponentKeyboardAccessible &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        handleClickableComponentToggle(event);
      }
    },
    [handleClickableComponentToggle, isClickableComponentKeyboardAccessible],
  );

  const handleClickableComponentAsChildClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      clickableComponentElement?.props.onClick?.(event);

      if (!event.defaultPrevented) {
        handleClickableComponentClick(event);
      }
    },
    [clickableComponentElement, handleClickableComponentClick],
  );

  return (
    <DropdownComponentInstanceContext.Provider
      value={{ instanceId: dropdownId }}
    >
      {clickableComponentElement ? (
        cloneElement(clickableComponentElement, {
          ref: setClickableComponentReference,
          onClick: handleClickableComponentAsChildClick,
          'aria-controls': `${dropdownId}-options`,
          'aria-expanded': isDropdownOpen,
          'aria-haspopup': containerType === 'listbox' ? 'listbox' : undefined,
        })
      ) : isDefined(clickableComponent) ? (
        <StyledClickableComponent
          ref={setClickableComponentReference}
          onClick={handleClickableComponentClick}
          onKeyDown={handleClickableComponentKeyDown}
          aria-controls={`${dropdownId}-options`}
          aria-expanded={isDropdownOpen}
          aria-haspopup={
            containerType === 'listbox'
              ? 'listbox'
              : dropdownRole === 'dialog'
                ? 'dialog'
                : true
          }
          aria-label={clickableComponentAriaLabel}
          role="button"
          tabIndex={isClickableComponentKeyboardAccessible ? 0 : undefined}
          width={clickableComponentWidth}
        >
          {clickableComponent}
        </StyledClickableComponent>
      ) : (
        <StyledDropdownFallbackAnchor ref={refs.setReference} />
      )}
      {isDropdownOpen && (
        <DropdownInternalContainer
          dropdownRole={dropdownRole}
          dropdownAriaLabel={dropdownAriaLabel}
          floatingStyles={floatingStyles}
          dropdownComponents={dropdownComponents}
          dropdownId={dropdownId}
          containerType={containerType}
          dropdownPlacement={placement}
          floatingUiRefs={refs}
          hotkey={hotkey}
          onClickOutside={onClickOutside}
          onHotkeyTriggered={onOpen}
          excludedClickOutsideIds={excludedClickOutsideIds}
          isDropdownInModal={isDropdownInModal}
        />
      )}
      <DropdownOnToggleEffect
        onDropdownClose={onClose}
        onDropdownOpen={onOpen}
      />
    </DropdownComponentInstanceContext.Provider>
  );
};
