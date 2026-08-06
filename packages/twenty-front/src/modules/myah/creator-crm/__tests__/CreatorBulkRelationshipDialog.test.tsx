import { act, fireEvent, render, screen } from '@testing-library/react';

import { CreatorBulkRelationshipDialog } from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';

const mockUseCreatorBulkRelationshipPreview = jest.fn();
const mockApplyCreatorBulkRelationship = jest.fn();
const mockRemoveCreatorListMembers = jest.fn();
const mockCloseModal = jest.fn();
const mockUseQuery = jest.fn();

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
      screen.getByText('Unable to verify existing relationships. Try again.'),
    ).toBeVisible();
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

  it('assigns a mailbox to campaign members that already exist', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      linkedCreatorIds: ['creator-a', 'creator-b'],
      unlinkedCreatorIds: [],
      relationshipRecordIds: ['campaign-creator-a', 'campaign-creator-b'],
    });
    mockUseQuery.mockReturnValue({
      loading: false,
      data: {
        managedEmailMailboxes: [
          {
            id: 'eligible-mailbox',
            address: 'maya@creator-network.com',
            personaDisplayName: 'Maya Chen',
            campaignEligibility: 'ELIGIBLE',
            warmupState: 'MAINTENANCE',
            safeFailureCode: null,
          },
        ],
      },
    });

    render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Maya Chen — maya@creator-network.com',
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to campaign' }));
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: campaignAction.target,
      creatorIdsToAdd: [],
      campaignCreatorIdsToUpdate: ['campaign-creator-a', 'campaign-creator-b'],
      assignedManagedMailboxId: 'eligible-mailbox',
    });
  });

  it('can clear assignments from existing campaign members', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      selectedCreatorIds: ['creator-a'],
      linkedCreatorIds: ['creator-a'],
      unlinkedCreatorIds: [],
      relationshipRecordIds: ['campaign-creator-a'],
    });

    render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a']}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear mailbox assignment' }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to campaign' }));
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: campaignAction.target,
      creatorIdsToAdd: [],
      campaignCreatorIdsToUpdate: ['campaign-creator-a'],
      assignedManagedMailboxId: null,
    });
  });

  it('requires an eligible managed mailbox and keeps blocked choices customer-safe', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    mockUseQuery.mockReturnValue({
      loading: false,
      data: {
        managedEmailMailboxes: [
          {
            id: 'eligible-mailbox',
            address: 'maya@creator-network.com',
            personaDisplayName: 'Maya Chen',
            campaignEligibility: 'ELIGIBLE',
            warmupState: 'MAINTENANCE',
            safeFailureCode: null,
          },
          {
            id: 'warming-mailbox',
            address: 'alex@creator-network.com',
            personaDisplayName: 'Alex Smith',
            campaignEligibility: 'NEW_THREADS_BLOCKED',
            warmupState: 'WARMING',
            safeFailureCode: 'INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER',
          },
        ],
      },
    });

    render(
      <CreatorBulkRelationshipDialog
        action={campaignAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Add to campaign' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Alex Smith — alex@creator-network.com: Warming — not ready for new threads',
      }),
    ).toBeDisabled();
    expect(
      screen.queryByText('INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Maya Chen — maya@creator-network.com',
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to campaign' }));
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: campaignAction.target,
      creatorIdsToAdd: ['creator-a', 'creator-b'],
      assignedManagedMailboxId: 'eligible-mailbox',
    });
  });
});
