import { act, fireEvent, render, screen } from '@testing-library/react';

import { CreatorBulkRelationshipDialog } from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';
import { type CreatorBulkRelationshipAction } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { useState } from 'react';

const mockUseCreatorBulkRelationshipPreview = jest.fn();
const mockApplyCreatorBulkRelationship = jest.fn();
const mockRemoveCreatorListMembers = jest.fn();
const mockCloseModal = jest.fn();
const mockUseQuery = jest.fn();
let mockCampaignRead = true;
let mockCampaignUpdate = true;

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [{ id: 'campaign-object', nameSingular: 'campaign' }],
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: mockCampaignRead,
    canUpdateObjectRecords: mockCampaignUpdate,
  }),
}));

jest.mock('@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview', () => ({
  useCreatorBulkRelationshipPreview: (...args: unknown[]) =>
    mockUseCreatorBulkRelationshipPreview(...args),
}));

jest.mock('@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship', () => ({
  useApplyCreatorBulkRelationship: () => ({
    applyCreatorBulkRelationship: mockApplyCreatorBulkRelationship,
    removeCreatorListMembers: mockRemoveCreatorListMembers,
  }),
}));

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: mockCloseModal }),
}));

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({
    children,
    onEnter,
  }: {
    children: React.ReactNode;
    onEnter?: () => void;
  }) => (
    <div role="dialog">
      <button onClick={onEnter}>Press Enter</button>
      {children}
    </div>
  ),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
    accent,
  }: {
    title: string | { message: string };
    onClick: () => void;
    disabled?: boolean;
    accent?: string;
  }) => (
    <button data-accent={accent} disabled={disabled} onClick={onClick}>
      {typeof title === 'string' ? title : title.message}
    </button>
  ),
}));

jest.mock('twenty-ui/typography', () => ({
  H1Title: ({ title }: { title: string | { message: string } }) => (
    <h1>{typeof title === 'string' ? title : title.message}</h1>
  ),
  H1TitleFontColor: { Primary: 'primary' },
}));

const creatorListAction = {
  operation: 'add' as const,
  target: {
    kind: 'creator-list' as const,
    id: 'list-a',
    label: 'Spring creators',
  },
};
const campaignAction = {
  operation: 'add' as const,
  target: {
    kind: 'campaign' as const,
    id: 'campaign-a',
    label: 'Spring campaign',
  },
};

const loadingPreview = {
  selectedCreatorIds: ['creator-a'],
  linkedCreatorIds: [],
  unlinkedCreatorIds: ['creator-a'],
  relationshipRecordIds: [],
  loading: true,
  isPreviewUnavailable: false,
};

const readyPreview = {
  selectedCreatorIds: ['creator-a', 'creator-b'],
  linkedCreatorIds: [],
  unlinkedCreatorIds: ['creator-a', 'creator-b'],
  relationshipRecordIds: [],
  loading: false,
  isPreviewUnavailable: false,
};

describe('CreatorBulkRelationshipDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCampaignRead = true;
    mockCampaignUpdate = true;
    mockUseQuery.mockReturnValue({ data: undefined, loading: false });
  });

  it('does not dismiss or mutate when Enter is pressed while confirmation is disabled', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(loadingPreview);

    render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Press Enter' }));

    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
    expect(mockCloseModal).not.toHaveBeenCalled();
  });

  it('does not create relationships when the duplicate preview is unavailable', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      isPreviewUnavailable: true,
    });

    render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add to list' })).toBeDisabled();
    expect(
      screen.getByText('Unable to verify existing relationships.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retry preview' }),
    ).not.toBeInTheDocument();
  });

  it('offers a read-only retry when the scoped preview failed before allowing an addition', () => {
    const retryPreview = jest.fn();
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      isPreviewUnavailable: true,
      canRetry: true,
      retryPreview,
    });
    const { rerender } = render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add to list' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(retryPreview).toHaveBeenCalledTimes(1);
    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    rerender(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add to list' })).toBeEnabled();
  });

  it('keeps the confirmation open and disabled until an async addition succeeds', async () => {
    let resolveMutation: (() => void) | undefined;
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    mockApplyCreatorBulkRelationship.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );

    render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: creatorListAction.target,
      creatorIdsToAdd: ['creator-a', 'creator-b'],
    });
    expect(mockCloseModal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Adding' })).toBeDisabled();

    await act(async () => {
      resolveMutation?.();
    });

    expect(mockCloseModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-add-creator-list-list-a',
    );
  });

  it('keeps a failed addition available for retry', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    mockApplyCreatorBulkRelationship
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);

    render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    });

    expect(mockCloseModal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add to list' })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledTimes(2);
    expect(mockCloseModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-add-creator-list-list-a',
    );
  });

  it('presents selected compact review rows and a brand addition confirmation', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);

    render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Confirm addition' }),
    ).toBeVisible();
    expect(screen.getByText('Target').parentElement).toHaveTextContent(
      'TargetSpring creators',
    );
    expect(screen.getByText('Selected').parentElement).toHaveTextContent(
      'Selected2 creators',
    );
    expect(screen.getByText('Will be added').parentElement).toHaveTextContent(
      'Will be added2 creators',
    );
    expect(screen.getByText('Already present').parentElement).toHaveTextContent(
      'Already present0 creators',
    );
    expect(screen.getByRole('button', { name: 'Add to list' })).toHaveAttribute(
      'data-accent',
      'brand',
    );
  });

  it('uses singular Creator copy for a one-Creator addition', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      selectedCreatorIds: ['creator-a'],
      unlinkedCreatorIds: ['creator-a'],
    });

    render(
      <CreatorBulkRelationshipDialog
        action={creatorListAction}
        selectedCreatorIds={['creator-a']}
      />,
    );

    expect(screen.getByText('Selected').parentElement).toHaveTextContent(
      /^Selected1 creator$/,
    );
    expect(screen.getByText('Will be added').parentElement).toHaveTextContent(
      /^Will be added1 creator$/,
    );
  });
  it('admits new campaign creators without mailbox assignment', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);

    render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.queryByText('Sending mailbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear mailbox assignment' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add to campaign' }),
    ).toBeEnabled();
  });

  it('describes existing list-sourced Campaign membership as direct-source promotion', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      selectedCreatorIds: ['creator-a'],
      linkedCreatorIds: [],
      unlinkedCreatorIds: ['creator-a'],
      relationshipRecordIds: ['campaign-creator-a'],
    });
    render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a']}
      />,
    );
    expect(
      screen.getByText('Will be directly added').parentElement,
    ).toHaveTextContent('Will be directly added1 creator');
    expect(
      screen.getByText('Already directly added').parentElement,
    ).toHaveTextContent('Already directly added0 creators');
    expect(
      screen.getByRole('button', { name: 'Add to campaign' }),
    ).toBeEnabled();
  });

  it.each([
    { access: 'read', canRead: false, canUpdate: true },
    { access: 'update', canRead: true, canUpdate: false },
  ])(
    'invalidates the open shared Campaign action when parent Campaign $access access is revoked',
    ({ canRead, canUpdate }) => {
      const onClose = jest.fn();
      mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
      const view = () => (
        <CreatorBulkRelationshipDialog
          action={campaignAction}
          selectedCreatorIds={['creator-a', 'creator-b']}
          onClose={onClose}
        />
      );
      const { rerender } = render(view());
      expect(
        screen.getByRole('button', { name: 'Add to campaign' }),
      ).toBeEnabled();

      const retryPreview = jest.fn();
      mockUseCreatorBulkRelationshipPreview.mockReturnValue({
        ...readyPreview,
        isPreviewUnavailable: true,
        canRetry: true,
        retryPreview,
      });
      mockCampaignRead = canRead;
      mockCampaignUpdate = canUpdate;
      rerender(view());
      expect(
        screen.getByRole('button', { name: 'Add to campaign' }),
      ).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Retry preview' }),
      ).not.toBeInTheDocument();
      expect(retryPreview).not.toHaveBeenCalled();
      expect(mockCloseModal).toHaveBeenCalledWith(
        'creator-bulk-relationship-add-campaign-campaign-a',
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Add to campaign' }));
      expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
    },
  );

  it.each([
    { next: 'list', open: 'Open list', add: 'Add to list', regrant: false },
    {
      next: 'same campaign',
      open: 'Open campaign',
      add: 'Add to campaign',
      regrant: true,
    },
  ])(
    'does not let a revoked Campaign addition close a newer $next action when it resolves',
    async ({ open, add, regrant }) => {
      let resolveMutation: (() => void) | undefined;
      mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
      mockApplyCreatorBulkRelationship.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
      );

      const ActionCycle = () => {
        const [action, setAction] = useState<
          CreatorBulkRelationshipAction | undefined
        >(campaignAction);
        const [selectedIds, setSelectedIds] = useState([
          'creator-a',
          'creator-b',
        ]);

        return (
          <>
            <button onClick={() => setAction(creatorListAction)}>
              Open list
            </button>
            <button onClick={() => setAction(campaignAction)}>
              Open campaign
            </button>
            <span data-testid="selected-creators">{selectedIds.join(',')}</span>
            {action && (
              <CreatorBulkRelationshipDialog
                action={action}
                selectedCreatorIds={selectedIds}
                onClose={() => setAction(undefined)}
                onSuccess={() => {
                  setSelectedIds([]);
                  setAction(undefined);
                }}
              />
            )}
          </>
        );
      };

      const { rerender } = render(<ActionCycle />);
      fireEvent.click(screen.getByRole('button', { name: 'Add to campaign' }));
      expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledTimes(1);
      mockCampaignRead = false;
      rerender(<ActionCycle />);
      expect(
        screen.queryByRole('button', { name: 'Add to campaign' }),
      ).not.toBeInTheDocument();
      if (regrant) {
        mockCampaignRead = true;
        rerender(<ActionCycle />);
      }
      fireEvent.click(screen.getByRole('button', { name: open }));
      expect(screen.getByRole('button', { name: add })).toBeEnabled();
      mockCloseModal.mockClear();

      await act(async () => {
        resolveMutation?.();
      });

      expect(screen.getByRole('button', { name: add })).toBeEnabled();
      expect(screen.getByTestId('selected-creators')).toHaveTextContent(
        'creator-a,creator-b',
      );
      expect(mockCloseModal).not.toHaveBeenCalled();
    },
  );

  it('disables campaign confirmation for an empty or unavailable preview', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      selectedCreatorIds: [],
      unlinkedCreatorIds: [],
    });

    const { rerender } = render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={[]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Add to campaign' }),
    ).toBeDisabled();

    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      isPreviewUnavailable: true,
    });
    rerender(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Add to campaign' }),
    ).toBeDisabled();
  });

  it('shows no changes and does not mutate repeat campaign selections', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      linkedCreatorIds: ['creator-a', 'creator-b'],
      unlinkedCreatorIds: [],
      relationshipRecordIds: ['campaign-creator-a', 'campaign-creator-b'],
    });

    render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.getByText('No changes will be made.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add to campaign' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add to campaign' }));

    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
  });
});
