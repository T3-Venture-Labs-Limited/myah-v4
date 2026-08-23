import { type Dialog } from '@base-ui/react/dialog';
import type React from 'react';

import { type ModalOverlay } from '@ui/surfaces/Modal/types/ModalOverlay';
import { type ModalPadding } from '@ui/surfaces/Modal/types/ModalPadding';
import { type ModalSize } from '@ui/surfaces/Modal/types/ModalSize';

export type ModalOnOpenChange = Dialog.Root.Props['onOpenChange'];
export type ModalInitialFocus = Dialog.Popup.Props['initialFocus'];
export type ModalFinalFocus = Dialog.Popup.Props['finalFocus'];

export type ModalProps = React.PropsWithChildren & {
  isOpen: boolean;
  modal?: Dialog.Root.Props['modal'];
  ariaLabel?: string;
  ariaLabelledBy?: React.AriaAttributes['aria-labelledby'];
  ariaDescribedBy?: React.AriaAttributes['aria-describedby'];
  ariaModal?: React.AriaAttributes['aria-modal'];
  onOpenChange?: ModalOnOpenChange;
  initialFocus?: ModalInitialFocus;
  finalFocus?: ModalFinalFocus;
  size?: ModalSize;
  padding?: ModalPadding;
  overlay?: ModalOverlay;
  isMobile?: boolean;
  isInContainer?: boolean;
  container?: HTMLElement | null;
  gap?: number;
  smallBorderRadius?: boolean;
  narrowWidth?: boolean;
  autoHeight?: boolean;
  width?: React.CSSProperties['width'];
  modalZIndex?: number;
  backdropZIndex?: number;
  backdropTestId?: string;
  backdropClickOutsideId?: string;
  preventClickOutside?: boolean;
  onBackdropMouseDown?: (e: React.MouseEvent) => void;
  modalRef?: React.RefObject<HTMLDivElement | null>;
};
