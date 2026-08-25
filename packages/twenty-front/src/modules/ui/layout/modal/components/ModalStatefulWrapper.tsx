import { ModalHotkeysAndClickOutsideEffect } from '@/ui/layout/modal/components/ModalHotkeysAndClickOutsideEffect';
import { MODAL_BACKDROP_CLICK_OUTSIDE_ID } from '@/ui/layout/modal/constants/ModalBackdropClickOutsideId';
import { MODAL_CLICK_OUTSIDE_LISTENER_EXCLUDED_ID } from '@/ui/layout/modal/constants/ModalClickOutsideListenerExcludedClassName';
import { RootStackingContextZIndices } from '@/ui/layout/constants/RootStackingContextZIndices';
import { ModalComponentInstanceContext } from '@/ui/layout/modal/contexts/ModalComponentInstanceContext';
import { useModalContainer } from '@/ui/layout/modal/contexts/ModalContainerContext';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { type ModalStatefulWrapperProps } from '@/ui/layout/modal/types/ModalStatefulWrapperProps';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { ClickOutsideListenerContext } from '@/ui/utilities/pointer-event/contexts/ClickOutsideListenerContext';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useLayoutEffect, useRef } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Modal } from 'twenty-ui/surfaces';
import { Key } from 'ts-key-enum';

const ModalEnterHotkeyEffect = ({
  modalInstanceId,
  onEnter,
}: {
  modalInstanceId: string;
  onEnter?: () => void;
}) => {
  useHotkeysOnFocusedElement({
    keys: [Key.Enter],
    callback: () => {
      onEnter?.();
    },
    focusId: modalInstanceId,
    dependencies: [onEnter],
  });

  return null;
};

export const ModalStatefulWrapper = ({
  modalInstanceId,
  children,
  modal,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaModal,
  onOpenChange,
  initialFocus,
  finalFocus,
  size = 'medium',
  padding = 'medium',
  onEnter,
  isClosable = false,
  onClose,
  overlay = 'dark',
  dataGloballyPreventClickOutside = false,
  shouldCloseModalOnClickOutsideOrEscape = true,
  renderInDocumentBody = false,
  gap,
  smallBorderRadius,
  narrowWidth,
  autoHeight,
  width,
}: ModalStatefulWrapperProps) => {
  const isMobile = useIsMobile();
  const modalRef = useRef<HTMLDivElement>(null);
  // Capture the imperative DOM return target synchronously before React opens the modal.
  // oxlint-disable-next-line twenty/no-state-useref
  const openerRef = useRef<HTMLElement | null>(null);
  const { container } = useModalContainer();

  const effectiveContainer = renderInDocumentBody ? document.body : container;
  const isInContainer = isDefined(container) && !renderInDocumentBody;

  const isModalOpened = useAtomComponentStateValue(
    isModalOpenedComponentState,
    modalInstanceId,
  );

  const isModal = modal === true || modal === 'trap-focus';

  useLayoutEffect(() => {
    if (isModalOpened || typeof document === 'undefined') {
      return;
    }

    const captureOpener = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        (modalRef.current?.contains(activeElement) ||
          activeElement.hasAttribute('data-base-ui-focus-guard'))
      ) {
        return;
      }

      openerRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
    };

    captureOpener();
    document.addEventListener('focusin', captureOpener);

    return () => {
      captureOpener();
      document.removeEventListener('focusin', captureOpener);
    };
  }, [isModalOpened]);

  const { closeModal } = useModal();

  const handleClose = () => {
    onClose?.();
    if (shouldCloseModalOnClickOutsideOrEscape) {
      closeModal(modalInstanceId);
    }
  };

  const resolvedFinalFocus =
    isModal && finalFocus === undefined
      ? () => {
          const opener = openerRef.current;

          return opener?.isConnected ? opener : false;
        }
      : finalFocus;

  return (
    <ModalComponentInstanceContext.Provider
      value={{ instanceId: modalInstanceId }}
    >
      <ClickOutsideListenerContext.Provider
        value={{
          excludedClickOutsideId: MODAL_CLICK_OUTSIDE_LISTENER_EXCLUDED_ID,
        }}
      >
        {isModalOpened &&
          (isModal ? (
            onEnter ? (
              <ModalEnterHotkeyEffect
                modalInstanceId={modalInstanceId}
                onEnter={onEnter}
              />
            ) : null
          ) : (
            <ModalHotkeysAndClickOutsideEffect
              modalInstanceId={modalInstanceId}
              modalRef={modalRef}
              onEnter={onEnter}
              isClosable={isClosable}
              onClose={handleClose}
            />
          ))}
        <Modal
          isOpen={isModalOpened}
          modal={modal}
          ariaLabel={ariaLabel}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
          ariaModal={ariaModal}
          onOpenChange={
            isModal
              ? (open, eventDetails) => {
                  onOpenChange?.(open, eventDetails);

                  if (!open && isClosable && !eventDetails.isCanceled) {
                    handleClose();
                  }
                }
              : onOpenChange
          }
          initialFocus={initialFocus}
          finalFocus={resolvedFinalFocus}
          size={size}
          padding={padding}
          overlay={isInContainer ? 'light' : overlay}
          isMobile={isMobile}
          isInContainer={isInContainer}
          container={effectiveContainer}
          gap={gap}
          smallBorderRadius={smallBorderRadius}
          narrowWidth={narrowWidth}
          autoHeight={autoHeight}
          width={width}
          modalZIndex={RootStackingContextZIndices.RootModal}
          backdropZIndex={RootStackingContextZIndices.RootModalBackDrop}
          backdropClickOutsideId={MODAL_BACKDROP_CLICK_OUTSIDE_ID}
          preventClickOutside={dataGloballyPreventClickOutside}
          modalRef={modalRef}
        >
          {children}
        </Modal>
      </ClickOutsideListenerContext.Provider>
    </ModalComponentInstanceContext.Provider>
  );
};
