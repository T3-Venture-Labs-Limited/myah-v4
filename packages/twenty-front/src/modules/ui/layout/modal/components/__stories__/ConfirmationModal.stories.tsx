import {
  type Decorator,
  type Meta,
  type StoryObj,
} from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { focusStackState } from '@/ui/utilities/focus/states/focusStackState';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { Button } from 'twenty-ui/input';
import { ComponentDecorator } from 'twenty-ui/testing';
import { RootDecorator } from '~/testing/decorators/RootDecorator';
const JotaiInitDecorator: Decorator = (Story, context) => {
  const isModalInitiallyOpen = context.parameters.modalInitiallyOpen !== false;

  jotaiStore.set(
    isModalOpenedComponentState.atomFamily({
      instanceId: 'confirmation-modal',
    }),
    isModalInitiallyOpen,
  );
  jotaiStore.set(
    focusStackState.atom,
    isModalInitiallyOpen
      ? [
          {
            focusId: 'confirmation-modal',
            componentInstance: {
              componentType: FocusComponentType.MODAL,
              componentInstanceId: 'confirmation-modal',
            },
            globalHotkeysConfig: {
              enableGlobalHotkeysWithModifiers: true,
              enableGlobalHotkeysConflictingWithKeyboard: true,
            },
          },
        ]
      : [],
  );
  return <Story />;
};

const meta: Meta<typeof ConfirmationModal> = {
  title: 'UI/Layout/Modal/ConfirmationModal',
  component: ConfirmationModal,
  decorators: [JotaiInitDecorator, RootDecorator, ComponentDecorator],
  parameters: {
    disableHotkeyInitialization: true,
  },
};
export default meta;

type Story = StoryObj<typeof ConfirmationModal>;

const closeMock = fn();
const confirmMock = fn();
const canceledDismissalMock = fn();

const CancellableStatefulModal = () => (
  <ModalStatefulWrapper
    modalInstanceId="confirmation-modal"
    modal
    ariaLabel="Cancellable dialog"
    initialFocus
    isClosable
    onClose={closeMock}
    onOpenChange={(_open, eventDetails) => {
      canceledDismissalMock();
      eventDetails.cancel();
    }}
  >
    <Button title="Keep dialog open" variant="secondary" />
  </ModalStatefulWrapper>
);

const ConfirmationModalWithCurrentOpener = () => {
  const { openModal } = useModal();

  return (
    <>
      <Button
        title="Open confirmation from current opener"
        variant="primary"
        accent="brand"
        onClick={() => openModal('confirmation-modal')}
      />
      <ConfirmationModal
        modalInstanceId="confirmation-modal"
        title="Current opener confirmation"
        subtitle="Closing this dialog should restore the opener."
        confirmButtonText="Confirm current opener"
        onConfirmClick={() => undefined}
      />
    </>
  );
};

const ConfirmationModalWithFallbackFocus = () => {
  const { openModal } = useModal();
  const [isOpenerVisible, setIsOpenerVisible] = useState(true);
  const openerRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {isOpenerVisible && (
        <Button
          ref={openerRef}
          title="Open removable confirmation"
          variant="primary"
          accent="brand"
          onClick={() => openModal('confirmation-modal')}
        />
      )}
      <Button
        ref={fallbackRef}
        title="Persistent fallback action"
        variant="secondary"
      />
      <ConfirmationModal
        modalInstanceId="confirmation-modal"
        title="Removable opener confirmation"
        subtitle="Confirming removes the opener."
        confirmButtonText="Delete opener"
        onConfirmClick={() => setIsOpenerVisible(false)}
        finalFocus={() =>
          openerRef.current?.isConnected
            ? openerRef.current
            : fallbackRef.current
        }
      />
    </>
  );
};

export const Default: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Pariatur labore.',
    subtitle: 'Velit dolore aliquip laborum occaecat fugiat.',
    confirmButtonText: 'Delete',
    onConfirmClick: fn(),
  },
};

export const InputConfirmation: Story = {
  args: {
    confirmationValue: 'email@test.dev',
    confirmationPlaceholder: 'email@test.dev',
    ...Default.args,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const confirmationInput = await body.findByTestId(
      'confirmation-modal-input',
    );

    await waitFor(() => {
      expect(confirmationInput).toHaveFocus();
    });
  },
};

export const AccessibleSemantics: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Accessible confirmation dialog',
    subtitle: 'This dialog describes a destructive action.',
    confirmButtonText: 'Delete',
    onConfirmClick: fn(),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', {
      name: 'Accessible confirmation dialog',
    });
    const cancelButton = body.getByRole('button', { name: 'Cancel' });
    const confirmButton = body.getByRole('button', { name: 'Delete' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute(
      'aria-labelledby',
      'confirmation-modal-title',
    );
    expect(dialog).toHaveAttribute(
      'aria-describedby',
      'confirmation-modal-description',
    );
    expect(dialog).toHaveAccessibleDescription(
      'This dialog describes a destructive action.',
    );

    await waitFor(() => {
      expect(cancelButton).toHaveFocus();
    });

    await userEvent.tab();
    expect(confirmButton).toHaveFocus();

    await userEvent.tab();
    await waitFor(() => {
      expect(cancelButton).toHaveFocus();
    });

    await userEvent.tab({ shift: true });
    await waitFor(() => {
      expect(confirmButton).toHaveFocus();
    });
  },
};

export const CloseOnEscape: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Escape Key Test',
    subtitle: 'This modal should close when pressing the Escape key.',
    confirmButtonText: 'Confirm',
    onClose: closeMock,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await body.findByText('Escape Key Test');

    closeMock.mockClear();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(body.queryByText('Escape Key Test')).not.toBeInTheDocument();
    });
  },
};

export const CloseOnClickOutside: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Click Outside Test',
    subtitle: 'This modal should close when clicking outside of it.',
    confirmButtonText: 'Confirm',
    onClose: closeMock,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await body.findByText('Click Outside Test');

    closeMock.mockClear();

    const backdrop = await body.findByTestId('modal-backdrop');

    await userEvent.click(backdrop);

    await waitFor(() => {
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(body.queryByText('Click Outside Test')).not.toBeInTheDocument();
    });
  },
};

export const ConfirmWithEnterKey: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Enter Key Test',
    subtitle: 'This modal should confirm when pressing the Enter key.',
    confirmButtonText: 'Confirm',
    onConfirmClick: confirmMock,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await body.findByText('Enter Key Test');
    confirmMock.mockClear();

    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
    });
  },
};

export const CancelButtonClick: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Cancel Button Test',
    subtitle: 'Clicking the cancel button should close the modal',
    confirmButtonText: 'Confirm',
    onClose: closeMock,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await body.findByText('Cancel Button Test');
    closeMock.mockClear();

    const cancelButton = await body.findByRole('button', {
      name: /Cancel/,
    });
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(closeMock).toHaveBeenCalledTimes(1);
    });
  },
};

export const ConfirmButtonClick: Story = {
  args: {
    modalInstanceId: 'confirmation-modal',
    title: 'Confirm Button Test',
    subtitle: 'Clicking the confirm button should trigger the confirm action',
    confirmButtonText: 'Confirm',
    onConfirmClick: confirmMock,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await body.findByText('Confirm Button Test');
    confirmMock.mockClear();

    const confirmButton = await body.findByRole('button', {
      name: /Confirm/,
    });

    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
    });
  },
};

export const RestoresCurrentOpenerAfterCancelAndEscape: Story = {
  parameters: {
    modalInitiallyOpen: false,
  },
  render: () => <ConfirmationModalWithCurrentOpener />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const opener = body.getByRole('button', {
      name: 'Open confirmation from current opener',
    });

    await userEvent.click(opener);

    const cancelButton = await body.findByRole('button', { name: 'Cancel' });

    await waitFor(() => {
      expect(cancelButton).toHaveFocus();
    });

    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(
        body.queryByRole('dialog', { name: 'Current opener confirmation' }),
      ).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });

    await userEvent.click(opener);

    const reopenedCancelButton = await body.findByRole('button', {
      name: 'Cancel',
    });

    await waitFor(() => {
      expect(reopenedCancelButton).toHaveFocus();
    });

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        body.queryByRole('dialog', { name: 'Current opener confirmation' }),
      ).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });

    await userEvent.click(opener);

    const confirmButton = await body.findByRole('button', {
      name: 'Confirm current opener',
    });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(
        body.queryByRole('dialog', { name: 'Current opener confirmation' }),
      ).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
  },
};

export const RestoresPersistentFallbackWhenOpenerUnmounts: Story = {
  parameters: {
    modalInitiallyOpen: false,
  },
  render: () => <ConfirmationModalWithFallbackFocus />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const opener = body.getByRole('button', {
      name: 'Open removable confirmation',
    });
    const fallback = body.getByRole('button', {
      name: 'Persistent fallback action',
    });

    await userEvent.click(opener);

    const confirmButton = await body.findByRole('button', {
      name: 'Delete opener',
    });

    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(
        body.queryByRole('button', { name: 'Open removable confirmation' }),
      ).not.toBeInTheDocument();
      expect(fallback).toHaveFocus();
    });
  },
};

export const RespectsCanceledDismissal: Story = {
  render: () => <CancellableStatefulModal />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await body.findByRole('dialog', { name: 'Cancellable dialog' });
    closeMock.mockClear();
    canceledDismissalMock.mockClear();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(canceledDismissalMock).toHaveBeenCalledTimes(1);
      expect(closeMock).not.toHaveBeenCalled();
      expect(
        body.getByRole('dialog', { name: 'Cancellable dialog' }),
      ).toBeInTheDocument();
    });

    const backdrop = await body.findByTestId('modal-backdrop');
    await userEvent.click(backdrop);

    await waitFor(() => {
      expect(canceledDismissalMock).toHaveBeenCalledTimes(2);
      expect(closeMock).not.toHaveBeenCalled();
      expect(
        body.getByRole('dialog', { name: 'Cancellable dialog' }),
      ).toBeInTheDocument();
    });
  },
};
