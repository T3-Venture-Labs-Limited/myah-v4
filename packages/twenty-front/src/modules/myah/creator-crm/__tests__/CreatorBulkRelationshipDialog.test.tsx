import { act, fireEvent, render, screen } from '@testing-library/react';

import { CreatorBulkRelationshipDialog } from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';

const mockUseCreatorBulkRelationshipPreview = jest.fn();
const mockApplyCreatorBulkRelationship = jest.fn();

jest.mock('@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview', () => ({
  useCreatorBulkRelationshipPreview: (...args: unknown[]) =>
    mockUseCreatorBulkRelationshipPreview(...args),
}));

jest.mock('@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship', () => ({
  useApplyCreatorBulkRelationship: () => ({
    applyCreatorBulkRelationship: mockApplyCreatorBulkRelationship,
  }),
}));

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: jest.fn() }),
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

  it('previews selected, added, and already-present creators before adding only missing links', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      selectedCreatorIds: ['creator-a', 'creator-b', 'creator-c'],
      creatorIdsToAdd: ['creator-a', 'creator-c'],
      alreadyLinkedCreatorIds: ['creator-b'],
    });
    mockApplyCreatorBulkRelationship.mockResolvedValue(undefined);

    render(
      <CreatorBulkRelationshipDialog
        target={creatorListTarget}
        selectedCreatorIds={['creator-a', 'creator-b', 'creator-c']}
      />,
    );

    expect(screen.getByText('Spring creators')).toBeVisible();
    expect(screen.getByText('3 selected')).toBeVisible();
    expect(screen.getByText('2 will be added')).toBeVisible();
    expect(screen.getByText('1 already present')).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Add to list/ }));
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: creatorListTarget,
      creatorIdsToAdd: ['creator-a', 'creator-c'],
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

    expect(screen.getByText('No changes will be made.')).toBeVisible();
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

      expect(screen.queryByText(/outreach|automation|email/i)).not.toBeInTheDocument();
    },
  );
});
