import { styled } from '@linaria/react';
import { forwardRef, type ReactNode, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';

import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';
import { Button, type ButtonAccent } from 'twenty-ui/input';
import { Section, SectionAlignment, SectionFontColor } from 'twenty-ui/layout';
import { type ModalOverlay, type ModalProps } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export type ConfirmationModalProps = {
  modalInstanceId: string;
  title: string;
  loading?: boolean;
  subtitle: ReactNode;
  onClose?: () => void;
  onConfirmClick: () => void;
  cancelButtonText?: string;
  confirmButtonText?: string;
  confirmationPlaceholder?: string;
  confirmationValue?: string;
  confirmButtonAccent?: ButtonAccent;
  AdditionalButtons?: React.ReactNode;
  overlay?: ModalOverlay;
  finalFocus?: ModalProps['finalFocus'];
};

const StyledCenteredButtonContainer = styled.div`
  box-sizing: border-box;
  margin-top: ${themeCssVariables.spacing[2]};
`;

export const StyledCenteredButton = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>((props, ref) => (
  <StyledCenteredButtonContainer>
    {/* oxlint-disable-next-line react/jsx-props-no-spreading */}
    <Button ref={ref} {...props} />
  </StyledCenteredButtonContainer>
));
StyledCenteredButton.displayName = 'StyledCenteredButton';

const StyledCenteredTitle = styled.div`
  text-align: center;
`;

const StyledSectionContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[6]};
`;

const StyledConfirmationButtonContainer = styled.div`
  box-sizing: border-box;
  margin-top: ${themeCssVariables.spacing[2]};
  > button {
    border-color: ${themeCssVariables.border.color.danger};
    box-shadow: none;
    color: ${themeCssVariables.color.red};
    font-size: ${themeCssVariables.font.size.md};
    line-height: ${themeCssVariables.text.lineHeight.lg};
    &:hover {
      background-color: ${themeCssVariables.color.red3};
    }
  }
`;

export const StyledConfirmationButton = (
  props: React.ComponentProps<typeof Button>,
) => (
  <StyledConfirmationButtonContainer>
    {/* oxlint-disable-next-line react/jsx-props-no-spreading */}
    <Button {...props} />
  </StyledConfirmationButtonContainer>
);

const defaultConfirmButtonText = msg`Confirm`;

export const ConfirmationModal = ({
  modalInstanceId,
  title,
  loading,
  subtitle,
  onConfirmClick,
  onClose,
  cancelButtonText,
  confirmButtonText,
  confirmationValue,
  confirmationPlaceholder,
  confirmButtonAccent = 'danger',
  AdditionalButtons,
  overlay = 'dark',
  finalFocus,
}: ConfirmationModalProps) => {
  const { i18n, t } = useLingui();
  const translatedConfirmButtonText =
    confirmButtonText ?? i18n._(defaultConfirmButtonText);
  const [inputConfirmationValue, setInputConfirmationValue] =
    useState<string>('');
  const [isValidValue, setIsValidValue] = useState(!confirmationValue);

  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationInputContainerRef = useRef<HTMLDivElement>(null);
  const titleId = `${modalInstanceId}-title`;
  const descriptionId = `${modalInstanceId}-description`;

  const handleInputConfimrationValueChange = (value: string) => {
    setInputConfirmationValue(value);
    isValueMatchingInput(confirmationValue, value);
  };

  const isValueMatchingInput = useDebouncedCallback(
    (value?: string, inputValue?: string) => {
      setIsValidValue(Boolean(value && inputValue && value === inputValue));
    },
    250,
  );

  const { closeModal } = useModal();

  const handleConfirmClick = () => {
    onConfirmClick();
    closeModal(modalInstanceId);
  };

  const handleCancelClick = () => {
    closeModal(modalInstanceId);
    onClose?.();
  };

  const handleEnter = () => {
    if (isValidValue) {
      handleConfirmClick();
    }
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={modalInstanceId}
      modal
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      initialFocus={
        confirmationValue
          ? () =>
              confirmationInputContainerRef.current?.querySelector<HTMLInputElement>(
                'input',
              ) ??
              cancelButtonRef.current ??
              false
          : cancelButtonRef
      }
      finalFocus={finalFocus}
      onClose={() => {
        onClose?.();
      }}
      onEnter={confirmationValue ? handleEnter : undefined}
      isClosable={true}
      padding="large"
      overlay={overlay}
      dataGloballyPreventClickOutside
      renderInDocumentBody
      smallBorderRadius
      narrowWidth
      autoHeight
    >
      <StyledCenteredTitle id={titleId}>
        <H1Title title={title} fontColor={H1TitleFontColor.Primary} />
      </StyledCenteredTitle>
      <StyledSectionContainer id={descriptionId}>
        <Section
          alignment={SectionAlignment.Center}
          fontColor={SectionFontColor.Primary}
        >
          {subtitle}
        </Section>
      </StyledSectionContainer>
      {confirmationValue && (
        <Section>
          <div ref={confirmationInputContainerRef}>
            <SettingsTextInput
              instanceId="confirmation-modal-input"
              dataTestId="confirmation-modal-input"
              value={inputConfirmationValue}
              onChange={handleInputConfimrationValueChange}
              placeholder={confirmationPlaceholder}
              fullWidth
              disableHotkeys
              key={'input-' + confirmationValue}
            />
          </div>
        </Section>
      )}
      <StyledCenteredButton
        ref={cancelButtonRef}
        onClick={handleCancelClick}
        variant="secondary"
        title={cancelButtonText ?? t`Cancel`}
        fullWidth
        justify="center"
        dataTestId="confirmation-modal-cancel-button"
      />

      {AdditionalButtons}

      <StyledCenteredButton
        onClick={handleConfirmClick}
        variant="primary"
        accent={confirmButtonAccent}
        title={translatedConfirmButtonText}
        disabled={!isValidValue || loading}
        fullWidth
        justify="center"
        dataTestId="confirmation-modal-confirm-button"
      />
    </ModalStatefulWrapper>
  );
};
