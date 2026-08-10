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

const removeFromListAction = {
  operation: 'remove' as const,
  target: {
    kind: 'creator-list' as const,
    id: 'list-a',
    label: 'Spring creators',
  },
};

const readyPreview = {
  selectedCreatorIds: ['creator-a', 'creator-b'],
  linkedCreatorIds: ['creator-a'],
  unlinkedCreatorIds: ['creator-b'],
  relationshipRecordIds: ['membership-a'],
  loading: false,
  isPreviewUnavailable: false,
};

describe('CreatorBulkRelationshipDialog removal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    mockUseQuery.mockReturnValue({ data: undefined, loading: false });
    mockRemoveCreatorListMembers.mockResolvedValue({
      removedCount: 1,
      wasPartial: false,
    });
  });

  it('renders removal-specific review copy and destroys only previewed memberships', async () => {
    render(
      <CreatorBulkRelationshipDialog
        action={removeFromListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Confirm removal' }),
    ).toBeVisible();
    expect(screen.getByText('Will be removed').parentElement).toHaveTextContent(
      'Will be removed1 creator',
    );
    expect(screen.getByText('Already absent').parentElement).toHaveTextContent(
      'Already absent1 creator',
    );
    expect(
      screen.getByRole('button', { name: 'Remove from list' }),
    ).toHaveAttribute('data-accent', 'danger');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    });

    expect(mockRemoveCreatorListMembers).toHaveBeenCalledWith({
      creatorIdsToRemove: ['creator-a'],
      creatorListId: 'list-a',
      creatorListMemberIdsToRemove: ['membership-a'],
    });
    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
    expect(mockCloseModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-remove-creator-list-list-a',
    );
  });

  it('disables removal and Enter when every selected Creator is already absent', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      linkedCreatorIds: [],
      unlinkedCreatorIds: ['creator-a', 'creator-b'],
      relationshipRecordIds: [],
    });

    render(
      <CreatorBulkRelationshipDialog
        action={removeFromListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.getByText('No changes will be made.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove from list' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Press Enter' }));
    expect(mockRemoveCreatorListMembers).not.toHaveBeenCalled();
  });

  it('keeps a failed removal open for retry', async () => {
    mockRemoveCreatorListMembers
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ removedCount: 1, wasPartial: false });

    render(
      <CreatorBulkRelationshipDialog
        action={removeFromListAction}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    });

    expect(mockCloseModal).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Remove from list' }),
    ).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    });

    expect(mockRemoveCreatorListMembers).toHaveBeenCalledTimes(2);
    expect(mockCloseModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-remove-creator-list-list-a',
    );
  });

  it('reviews exact Campaign impact and forwards confirmation after a fresh check', async () => {
    const refetchImpact = jest.fn().mockResolvedValue({
      data: {
        creatorListMembershipRemovalImpact: {
          affectedCampaignIds: ['campaign-a'],
          confirmationToken: 'token-a',
        },
      },
    });
    const refetch = jest.fn().mockResolvedValue(undefined);
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      ...readyPreview,
      refetchImpact,
      refetch,
      campaignImpact: {
        campaignIds: ['campaign-a'],
        campaigns: [{ id: 'campaign-a', label: 'Spring campaign' }],
        confirmationToken: 'token-a',
      },
    });

    render(
      <CreatorBulkRelationshipDialog
        action={removeFromListAction}
        selectedCreatorIds={['creator-a']}
      />,
    );

    expect(screen.getByText('Spring campaign')).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    });

    expect(mockRemoveCreatorListMembers).toHaveBeenCalledWith({
      creatorIdsToRemove: ['creator-a'],
      creatorListId: 'list-a',
      creatorListMemberIdsToRemove: ['membership-a'],
      confirmedCampaignIds: ['campaign-a'],
      confirmationToken: 'token-a',
    });
  });
  it('allows confirmation after rendering refreshed Campaign impact', async () => {
    const refetchImpact = jest.fn().mockResolvedValue({
      data: {
        creatorListMembershipRemovalImpact: {
          affectedCampaignIds: ['campaign-b'],
          confirmationToken: 'token-b',
        },
      },
    });
    const refetch = jest.fn().mockResolvedValue(undefined);
    let currentPreview = {
      ...readyPreview,
      refetchImpact,
      refetch,
      campaignImpact: {
        campaignIds: ['campaign-a'],
        campaigns: [{ id: 'campaign-a', label: 'Spring campaign' }],
        confirmationToken: 'token-a',
      },
    };
    mockUseCreatorBulkRelationshipPreview.mockImplementation(
      () => currentPreview,
    );
    const dialog = (
      <CreatorBulkRelationshipDialog
        action={removeFromListAction}
        selectedCreatorIds={['creator-a']}
      />
    );
    const { rerender } = render(dialog);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    });

    expect(mockRemoveCreatorListMembers).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);

    currentPreview = {
      ...currentPreview,
      campaignImpact: {
        campaignIds: ['campaign-b'],
        campaigns: [{ id: 'campaign-b', label: 'Autumn campaign' }],
        confirmationToken: 'token-b',
      },
    };
    rerender(
      <CreatorBulkRelationshipDialog
        action={removeFromListAction}
        selectedCreatorIds={['creator-a']}
      />,
    );

    expect(screen.getByText('Autumn campaign')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove from list' }),
    ).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    });

    expect(mockRemoveCreatorListMembers).toHaveBeenCalledWith({
      creatorIdsToRemove: ['creator-a'],
      creatorListId: 'list-a',
      creatorListMemberIdsToRemove: ['membership-a'],
      confirmedCampaignIds: ['campaign-b'],
      confirmationToken: 'token-b',
    });
  });
});
