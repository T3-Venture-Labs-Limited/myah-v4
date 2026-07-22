import { act, fireEvent, render, screen } from '@testing-library/react';

import { CreatorBulkRelationshipDialog } from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';

const mockUseCreatorBulkRelationshipPreview = jest.fn();
const mockApplyCreatorBulkRelationship = jest.fn();
const mockCloseModal = jest.fn();

jest.mock('@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview', () => ({
  useCreatorBulkRelationshipPreview: (...args: unknown[]) =>
    mockUseCreatorBulkRelationshipPreview(...args),
}));

jest.mock('@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship', () => ({
  useApplyCreatorBulkRelationship: () => ({
    applyCreatorBulkRelationship: mockApplyCreatorBulkRelationship,
  }),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: mockCloseModal }),
}));

jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    title,
    subtitle,
    loading,
    onClose,
    onConfirmClick,
    confirmButtonText,
    confirmButtonAccent,
  }: {
    title: string;
    subtitle: React.ReactNode;
    loading?: boolean;
    onClose?: () => void;
    onConfirmClick: () => void;
    confirmButtonText: string;
    confirmButtonAccent: string;
  }) => (
    <div role="dialog" aria-label={title}>
      <div>{subtitle}</div>
      <button onClick={onClose}>Cancel</button>
      <button
        data-accent={confirmButtonAccent}
        disabled={loading}
        onClick={onConfirmClick}
      >
        {confirmButtonText}
      </button>
    </div>
  ),
}));

const creatorListTarget = {
  kind: 'creator-list' as const,
  id: 'list-a',
  label: 'Spring creators',
};
const campaignTarget = {
  kind: 'campaign' as const,
  id: 'campaign-a',
  label: 'Spring campaign',
};

describe('CreatorBulkRelationshipDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables confirmation for an empty selection', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      selectedCreatorIds: [],
      creatorIdsToAdd: [],
      alreadyLinkedCreatorIds: [],
    });

    render(
      <CreatorBulkRelationshipDialog
        target={creatorListTarget}
        selectedCreatorIds={[]}
      />,
    );

    expect(
      screen.getByRole('button', { name: /^Add to list/ }),
    ).toBeDisabled();
  });

  it('presents a padded confirmation with the relationship counts', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      selectedCreatorIds: ['creator-a', 'creator-b'],
      creatorIdsToAdd: ['creator-a', 'creator-b'],
      alreadyLinkedCreatorIds: [],
    });
    mockApplyCreatorBulkRelationship.mockResolvedValue(undefined);

    render(
      <CreatorBulkRelationshipDialog
        target={creatorListTarget}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.getByText(/2 selected/)).toBeVisible();
    expect(screen.getByText(/2 will be added/)).toBeVisible();
    expect(screen.getByText(/0 already present/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add to list' }),
    ).toHaveAttribute('data-accent', 'brand');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: creatorListTarget,
      creatorIdsToAdd: ['creator-a', 'creator-b'],
    });
  });

  it('reports an all-existing selection without mutating', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      selectedCreatorIds: ['creator-a', 'creator-b'],
      creatorIdsToAdd: [],
      alreadyLinkedCreatorIds: ['creator-a', 'creator-b'],
    });

    render(
      <CreatorBulkRelationshipDialog
        target={campaignTarget}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.getByText(/No changes will be made/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Add to campaign/ }),
    ).toBeDisabled();
    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
  });

  it.each([creatorListTarget, campaignTarget])(
    'offers no outreach action for $kind mode',
    (target) => {
      mockUseCreatorBulkRelationshipPreview.mockReturnValue({
        selectedCreatorIds: ['creator-a'],
        creatorIdsToAdd: ['creator-a'],
        alreadyLinkedCreatorIds: [],
      });

      render(
        <CreatorBulkRelationshipDialog
          target={target}
          selectedCreatorIds={['creator-a']}
        />,
      );

      expect(
        screen.queryByText(/outreach|automation|email/i),
      ).not.toBeInTheDocument();
    },
  );
});
