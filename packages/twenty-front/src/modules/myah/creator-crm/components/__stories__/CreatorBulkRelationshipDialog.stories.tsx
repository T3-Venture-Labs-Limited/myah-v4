import { type Meta, type StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { type ComponentProps } from 'react';

import { CreatorBulkRelationshipDialogContent } from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { Modal } from 'twenty-ui/surfaces';
import { ComponentDecorator } from 'twenty-ui/testing';
import { RootDecorator } from '~/testing/decorators/RootDecorator';

type CreatorBulkRelationshipDialogStoryProps = {
  args: ComponentProps<typeof CreatorBulkRelationshipDialogContent>;
};

const CreatorBulkRelationshipDialogStory = ({
  args,
}: CreatorBulkRelationshipDialogStoryProps) => {
  const {
    target,
    preview,
    isApplying,
    isConfirmationDisabled,
    onCancel,
    onConfirm,
  } = args;
  const isMobile = useIsMobile();

  return (
    <Modal
      ariaLabel="Creator relationship confirmation"
      isOpen
      padding="large"
      overlay="dark"
      narrowWidth
      autoHeight
      isMobile={isMobile}
    >
      <CreatorBulkRelationshipDialogContent
        {...{
          target,
          preview,
          isApplying,
          isConfirmationDisabled,
          onCancel,
          onConfirm,
        }}
      />
    </Modal>
  );
};

const meta: Meta<typeof CreatorBulkRelationshipDialogContent> = {
  title: 'Myah/Creator CRM/Creator Bulk Relationship Dialog',
  component: CreatorBulkRelationshipDialogContent,
  decorators: [RootDecorator, ComponentDecorator],
  parameters: {
    disableHotkeyInitialization: true,
    layout: 'fullscreen',
  },
  render: (args) => <CreatorBulkRelationshipDialogStory args={args} />,
  args: {
    target: {
      kind: 'creator-list',
      id: 'list-a',
      label: 'TEST12',
    },
    preview: {
      selectedCount: 10,
      willAddCount: 8,
      alreadyPresentCount: 2,
      state: 'ready',
    },
    isApplying: false,
    isConfirmationDisabled: false,
    onCancel: fn(),
    onConfirm: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof CreatorBulkRelationshipDialogContent>;

export const List: Story = {};

export const CampaignWithLongName: Story = {
  args: {
    target: {
      kind: 'campaign',
      id: 'campaign-a',
      label: 'Summer creator launch campaign',
    },
    preview: {
      selectedCount: 24,
      willAddCount: 19,
      alreadyPresentCount: 5,
      state: 'ready',
    },
  },
};

export const LoadingPreview: Story = {
  args: {
    preview: {
      selectedCount: 10,
      willAddCount: 0,
      alreadyPresentCount: 0,
      state: 'loading',
    },
    isConfirmationDisabled: true,
  },
};

export const PreviewUnavailable: Story = {
  args: {
    preview: {
      selectedCount: 10,
      willAddCount: 0,
      alreadyPresentCount: 0,
      state: 'unavailable',
    },
    isConfirmationDisabled: true,
  },
};

export const EveryoneAlreadyPresent: Story = {
  args: {
    preview: {
      selectedCount: 10,
      willAddCount: 0,
      alreadyPresentCount: 10,
      state: 'ready',
    },
    isConfirmationDisabled: true,
  },
};

export const Applying: Story = {
  args: {
    isApplying: true,
    isConfirmationDisabled: true,
  },
};

export const MobileCampaign: Story = {
  args: {
    target: {
      kind: 'campaign',
      id: 'campaign-a',
      label: 'Summer creator launch campaign',
    },
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
