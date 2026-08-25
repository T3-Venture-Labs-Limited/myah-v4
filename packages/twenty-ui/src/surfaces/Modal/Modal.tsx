import { Dialog } from '@base-ui/react/dialog';
import { clsx } from 'clsx';
import { useRef } from 'react';
import { useThemeContainer } from '@ui/theme-constants';
import { isDefined } from '@ui/utilities/utils/isDefined';

import { type ModalOverlay } from '@ui/surfaces/Modal/types/ModalOverlay';
import { type ModalPadding } from '@ui/surfaces/Modal/types/ModalPadding';
import { type ModalProps } from '@ui/surfaces/Modal/types/ModalProps';

import styles from './Modal.module.scss';
import { ModalBackdrop } from '@ui/surfaces/ModalBackdrop/ModalBackdrop';

const DEFAULT_MODAL_Z_INDEX = 40;
const DEFAULT_BACKDROP_Z_INDEX = 39;

// Base UI's Dialog.Popup stops the propagation of these keydown events, but
// the deprecated Modal let them bubble up to global hotkey listeners.
const KEYDOWN_EVENTS_TO_PROPAGATE = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

const PADDING_CLASS_NAMES: Record<ModalPadding, string> = {
  none: styles.paddingNone,
  small: styles.paddingSmall,
  medium: styles.paddingMedium,
  large: styles.paddingLarge,
};

// The 'light' overlay is the base style of the modal, so it needs no class
const OVERLAY_CLASS_NAMES: Record<ModalOverlay, string | undefined> = {
  dark: styles.overlayDark,
  light: undefined,
  transparent: styles.overlayTransparent,
};

export const Modal = ({
  isOpen,
  modal = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaModal,
  onOpenChange,
  initialFocus,
  finalFocus,
  children,
  size = 'medium',
  padding = 'medium',
  overlay = 'dark',
  isMobile = false,
  isInContainer = false,
  container,
  gap,
  smallBorderRadius,
  narrowWidth,
  autoHeight,
  width,
  modalZIndex = DEFAULT_MODAL_Z_INDEX,
  backdropZIndex = DEFAULT_BACKDROP_Z_INDEX,
  backdropTestId = 'modal-backdrop',
  backdropClickOutsideId,
  preventClickOutside,
  onBackdropMouseDown,
  modalRef: externalRef,
}: ModalProps) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const resolvedRef = externalRef ?? internalRef;

  const themeContainer = useThemeContainer();
  const resolvedContainer = isDefined(container)
    ? container
    : (themeContainer ?? undefined);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBackdropMouseDown?.(e);
  };

  const isModal = modal !== false;

  // Default to the deprecated controlled behavior. Callers opt into Base UI's
  // modal dismissal and focus management with the modal/focus props.
  return (
    <Dialog.Root
      open={isOpen}
      modal={modal}
      disablePointerDismissal={!isModal}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal container={resolvedContainer}>
        <ModalBackdrop
          data-testid={backdropTestId}
          data-click-outside-id={backdropClickOutsideId}
          onMouseDown={handleBackdropMouseDown}
          overlay={overlay}
          backdropZIndex={backdropZIndex}
          isInContainer={isInContainer}
        >
          <Dialog.Popup
            aria-label={ariaLabelledBy === undefined ? ariaLabel : undefined}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-modal={modal === true ? true : ariaModal}
            initialFocus={isModal ? initialFocus : false}
            finalFocus={isModal ? finalFocus : false}
            onKeyDown={(event) => {
              if (KEYDOWN_EVENTS_TO_PROPAGATE.has(event.key)) {
                event.preventBaseUIHandler();
              }
            }}
            render={
              <div
                ref={resolvedRef}
                className={clsx(
                  styles.modal,
                  styles[size],
                  PADDING_CLASS_NAMES[padding],
                  OVERLAY_CLASS_NAMES[overlay],
                  isMobile && styles.mobile,
                  smallBorderRadius && styles.smallBorderRadius,
                  narrowWidth && styles.narrowWidth,
                  autoHeight && styles.autoHeight,
                )}
                style={
                  {
                    '--modal-z-index': modalZIndex,
                    width: isMobile ? undefined : width,
                    gap:
                      gap !== undefined ? `var(--t-spacing-${gap})` : undefined,
                  } as React.CSSProperties
                }
                data-globally-prevent-click-outside={preventClickOutside}
              />
            }
          >
            {children}
          </Dialog.Popup>
        </ModalBackdrop>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
