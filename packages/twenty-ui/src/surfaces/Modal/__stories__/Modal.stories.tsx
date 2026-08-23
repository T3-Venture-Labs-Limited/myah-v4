import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { IconX } from '@ui/icon';
import { H1Title, H1TitleFontColor, H2Title } from '@ui/typography';
import { Button, IconButton } from '@ui/input';
import { Section, SectionAlignment, SectionFontColor } from '@ui/layout';
import { A11Y_DEFER_COLOR_CONTRAST, ComponentDecorator } from '@ui/testing';

import { Modal } from '@ui/surfaces/Modal/Modal';
import { type ModalProps } from '@ui/surfaces/Modal/types/ModalProps';
import { ModalContent } from '@ui/surfaces/ModalContent/ModalContent';
import { ModalFooter } from '@ui/surfaces/ModalFooter/ModalFooter';
import { ModalHeader } from '@ui/surfaces/ModalHeader/ModalHeader';

import styles from './Modal.stories.module.scss';

const meta: Meta<typeof Modal> = {
  title: 'UI/Surfaces/Modal',
  component: Modal,
  decorators: [ComponentDecorator],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large', 'extraLarge'],
    },
    padding: {
      control: 'select',
      options: ['none', 'small', 'medium', 'large'],
    },
    overlay: {
      control: 'select',
      options: ['light', 'dark', 'transparent'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

const modalOpenChangeMock = fn();

const AccessibleModal = ({
  onOpenChange,
  useExplicitFocus = true,
}: {
  onOpenChange?: ModalProps['onOpenChange'];
  useExplicitFocus?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button title="Background action" variant="secondary" />
      <Button
        ref={openerRef}
        title="Open accessible modal"
        variant="primary"
        accent="brand"
        onClick={() => setIsOpen(true)}
      />
      <Modal
        isOpen={isOpen}
        modal
        ariaLabelledBy="accessible-modal-title"
        ariaDescribedBy="accessible-modal-description"
        initialFocus={useExplicitFocus ? cancelButtonRef : undefined}
        finalFocus={useExplicitFocus ? openerRef : undefined}
        onOpenChange={(open, eventDetails) => {
          onOpenChange?.(open, eventDetails);
          setIsOpen(open);
        }}
      >
        <h2 id="accessible-modal-title">Accessible modal title</h2>
        <p id="accessible-modal-description">Accessible modal description</p>
        <Button
          ref={cancelButtonRef}
          title="Cancel accessible modal"
          variant="secondary"
        />
        <Button
          title="Confirm accessible modal"
          variant="primary"
          accent="brand"
        />
      </Modal>
    </>
  );
};

export const Default: Story = {
  parameters: { a11y: A11Y_DEFER_COLOR_CONTRAST },
  args: {
    isOpen: true,
    size: 'medium',
    padding: 'none',
    overlay: 'dark',
  },
  render: ({ isOpen, size, padding, overlay }) => (
    <Modal
      isOpen={isOpen}
      size={size}
      padding={padding}
      overlay={overlay}
      ariaLabel="Edit workspace"
    >
      <ModalHeader>
        <H2Title
          title="Edit workspace"
          description="Update your workspace settings"
        />
      </ModalHeader>
      <ModalContent>
        <Section>
          Workspace name and subdomain can be changed from the settings panel.
          These changes will be reflected across all members.
        </Section>
      </ModalContent>
      <ModalFooter>
        <Button title="Cancel" variant="secondary" />
        <Button title="Save" variant="primary" accent="brand" />
      </ModalFooter>
    </Modal>
  ),
};

export const Confirmation: Story = {
  args: {
    isOpen: true,
    padding: 'large',
    overlay: 'dark',
    smallBorderRadius: true,
    narrowWidth: true,
    autoHeight: true,
    gap: 2,
  },
  render: ({
    isOpen,
    padding,
    overlay,
    smallBorderRadius,
    narrowWidth,
    autoHeight,
    gap,
  }) => (
    <Modal
      isOpen={isOpen}
      padding={padding}
      overlay={overlay}
      ariaLabel="Delete record?"
      smallBorderRadius={smallBorderRadius}
      narrowWidth={narrowWidth}
      autoHeight={autoHeight}
      gap={gap}
    >
      <div className={styles.centeredTitle}>
        <H1Title title="Delete record?" fontColor={H1TitleFontColor.Primary} />
      </div>
      <div className={styles.sectionContainer}>
        <Section
          alignment={SectionAlignment.Center}
          fontColor={SectionFontColor.Primary}
        >
          This action cannot be undone. The record and all of its data will be
          permanently removed.
        </Section>
      </div>
      <Button title="Cancel" variant="secondary" fullWidth justify="center" />
      <Button
        title="Delete"
        variant="secondary"
        accent="danger"
        fullWidth
        justify="center"
      />
    </Modal>
  ),
};

export const Small: Story = {
  args: {
    isOpen: true,
    size: 'small',
    padding: 'none',
    overlay: 'dark',
  },
  render: ({ isOpen, size, padding, overlay }) => (
    <Modal
      isOpen={isOpen}
      size={size}
      padding={padding}
      overlay={overlay}
      ariaLabel="Archive item"
    >
      <ModalHeader>
        <H2Title title="Archive item" />
      </ModalHeader>
      <ModalContent>
        <Section>Are you sure you want to archive this item?</Section>
      </ModalContent>
      <ModalFooter>
        <Button title="No" variant="secondary" />
        <Button title="Yes, archive" variant="primary" accent="brand" />
      </ModalFooter>
    </Modal>
  ),
};

export const ExtraLarge: Story = {
  parameters: { a11y: A11Y_DEFER_COLOR_CONTRAST },
  args: {
    isOpen: true,
    size: 'extraLarge',
    padding: 'none',
    overlay: 'dark',
  },
  render: ({ isOpen, size, padding, overlay }) => (
    <Modal
      isOpen={isOpen}
      size={size}
      padding={padding}
      overlay={overlay}
      ariaLabel="Import contacts"
    >
      <ModalHeader>
        <H2Title
          title="Import contacts"
          description="Upload a CSV file to import your contacts"
        />
      </ModalHeader>
      <ModalContent>
        <Section>
          The file should include columns for name, email, phone, and company.
          Drag and drop your CSV file here, or click to browse.
        </Section>
      </ModalContent>
      <ModalFooter>
        <Button title="Cancel" variant="secondary" />
        <Button title="Upload & import" variant="primary" accent="brand" />
      </ModalFooter>
    </Modal>
  ),
};

export const Closed: Story = {
  args: {
    isOpen: false,
    size: 'medium',
    padding: 'medium',
    overlay: 'dark',
  },
  render: ({ isOpen, size, padding, overlay }) => (
    <Modal isOpen={isOpen} size={size} padding={padding} overlay={overlay}>
      <ModalContent>This should not be visible.</ModalContent>
    </Modal>
  ),
};

const InteractiveModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        title="Open Modal"
        variant="primary"
        accent="brand"
        onClick={() => setIsOpen(true)}
      />
      <Modal
        isOpen={isOpen}
        size="medium"
        padding="none"
        overlay="dark"
        onBackdropMouseDown={() => setIsOpen(false)}
      >
        <ModalHeader>
          <H2Title title="Create record" />
          <IconButton
            Icon={IconX}
            variant="tertiary"
            size="small"
            onClick={() => setIsOpen(false)}
          />
        </ModalHeader>
        <ModalContent>
          <Section>
            Fill in the details below to create a new record. All fields are
            optional.
          </Section>
        </ModalContent>
        <ModalFooter>
          <Button
            title="Cancel"
            variant="secondary"
            onClick={() => setIsOpen(false)}
          />
          <Button
            title="Create"
            variant="primary"
            accent="brand"
            onClick={() => setIsOpen(false)}
          />
        </ModalFooter>
      </Modal>
    </>
  );
};

export const Interactive: Story = {
  render: () => <InteractiveModal />,
};

export const AccessibleModalSemantics: Story = {
  args: {
    onOpenChange: modalOpenChangeMock,
  },
  render: ({ onOpenChange }) => <AccessibleModal onOpenChange={onOpenChange} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const opener = body.getByRole('button', {
      name: 'Open accessible modal',
    });

    await userEvent.click(opener);

    const dialog = await body.findByRole('dialog', {
      name: 'Accessible modal title',
    });
    const cancelButton = body.getByRole('button', {
      name: 'Cancel accessible modal',
    });
    const confirmButton = body.getByRole('button', {
      name: 'Confirm accessible modal',
    });
    const backgroundAction = body.getByRole('button', {
      name: 'Background action',
      hidden: true,
    });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'accessible-modal-title');
    expect(dialog).toHaveAttribute(
      'aria-describedby',
      'accessible-modal-description',
    );
    expect(dialog).toHaveAccessibleDescription('Accessible modal description');
    await waitFor(() => {
      expect(backgroundAction.closest('[aria-hidden="true"]')).not.toBeNull();
    });

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

    modalOpenChangeMock.mockClear();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(modalOpenChangeMock).toHaveBeenCalledTimes(1);
      expect(
        body.queryByRole('dialog', { name: 'Accessible modal title' }),
      ).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });

    await userEvent.click(opener);

    const reopenedCancelButton = await body.findByRole('button', {
      name: 'Cancel accessible modal',
    });

    await waitFor(() => {
      expect(reopenedCancelButton).toHaveFocus();
    });
    modalOpenChangeMock.mockClear();

    const backdrop = await body.findByTestId('modal-backdrop');

    await userEvent.click(backdrop);

    await waitFor(() => {
      expect(modalOpenChangeMock).toHaveBeenCalledTimes(1);
      expect(
        body.queryByRole('dialog', { name: 'Accessible modal title' }),
      ).not.toBeInTheDocument();
    });
  },
};

export const AccessibleModalDefaultFocus: Story = {
  render: () => <AccessibleModal useExplicitFocus={false} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const opener = body.getByRole('button', {
      name: 'Open accessible modal',
    });

    await userEvent.click(opener);

    const dialog = await body.findByRole('dialog', {
      name: 'Accessible modal title',
    });
    const cancelButton = body.getByRole('button', {
      name: 'Cancel accessible modal',
    });
    const confirmButton = body.getByRole('button', {
      name: 'Confirm accessible modal',
    });

    await waitFor(() => {
      expect(dialog).toContainElement(cancelButton);
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

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        body.queryByRole('dialog', { name: 'Accessible modal title' }),
      ).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
  },
};
