import { type Meta, type StoryObj } from '@storybook/react-vite';
import { type ComponentProps } from 'react';
import { fn } from 'storybook/test';

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
      <CreatorBulkRelationshipDialogContent {...args} />
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
    action: {
      operation: 'add',
      target: {
        kind: 'creator-list',
        id: 'list-a',
        label: 'TEST12',
      },
    },
    preview: {
      selectedCount: 10,
      willChangeCount: 8,
      unchangedCount: 2,
      state: 'ready',
    },
    managedMailboxes: [],
    managedMailboxLoading: false,
    selectedManagedMailboxId: null,
    onSelectManagedMailbox: fn(),
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
    action: {
      operation: 'add',
      target: {
        kind: 'campaign',
        id: 'campaign-a',
        label: 'Summer creator launch campaign',
      },
    },
    preview: {
      selectedCount: 24,
      willChangeCount: 19,
      unchangedCount: 5,
      state: 'ready',
    },
  },
};

export const LoadingPreview: Story = {
  args: {
    preview: {
      selectedCount: 10,
      willChangeCount: 0,
      unchangedCount: 0,
      state: 'loading',
    },
    isConfirmationDisabled: true,
  },
};

export const PreviewUnavailable: Story = {
  args: {
    preview: {
      selectedCount: 10,
      willChangeCount: 0,
      unchangedCount: 0,
      state: 'unavailable',
    },
    isConfirmationDisabled: true,
  },
};

export const EveryoneAlreadyPresent: Story = {
  args: {
    preview: {
      selectedCount: 10,
      willChangeCount: 0,
      unchangedCount: 10,
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
    action: {
      operation: 'add',
      target: {
        kind: 'campaign',
        id: 'campaign-a',
        label: 'Summer creator launch campaign',
      },
    },
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export const RemoveFromList: Story = {
  args: {
    action: {
      operation: 'remove',
      target: { kind: 'creator-list', id: 'list-a', label: 'TEST12' },
    },
    preview: {
      selectedCount: 10,
      willChangeCount: 8,
      unchangedCount: 2,
      state: 'ready',
    },
  },
};

export const EveryoneAlreadyAbsent: Story = {
  args: {
    action: {
      operation: 'remove',
      target: { kind: 'creator-list', id: 'list-a', label: 'TEST12' },
    },
    preview: {
      selectedCount: 10,
      willChangeCount: 0,
      unchangedCount: 10,
      state: 'ready',
    },
    isConfirmationDisabled: true,
  },
};

export const MobileRemoveFromList: Story = {
  args: {
    action: {
      operation: 'remove',
      target: { kind: 'creator-list', id: 'list-a', label: 'TEST12' },
    },
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
