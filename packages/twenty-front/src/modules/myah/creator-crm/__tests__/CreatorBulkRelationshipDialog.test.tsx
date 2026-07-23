import { act, fireEvent, render, screen } from '@testing-library/react';

import { CreatorBulkRelationshipDialog } from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';

const mockUseCreatorBulkRelationshipPreview = jest.fn();
const mockApplyCreatorBulkRelationship = jest.fn();
const mockCloseModal = jest.fn();
const mockOpenModal = jest.fn();

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
  useModal: () => ({
    closeModal: mockCloseModal,
    openModal: mockOpenModal,
  }),
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

jest.mock('twenty-ui/layout', () => ({
  Section: ({ children }: { children: string | { message: string } }) => (
    <div>{typeof children === 'string' ? children : children.message}</div>
  ),
  SectionAlignment: { Center: 'center' },
  SectionFontColor: { Primary: 'primary' },
}));

jest.mock('twenty-ui/typography', () => ({
  H1Title: ({ title }: { title: string | { message: string } }) => (
    <h1>{typeof title === 'string' ? title : title.message}</h1>
  ),
  H1TitleFontColor: { Primary: 'primary' },
}));

jest.mock('@lingui/react', () => ({
  useLingui: () => ({ i18n: { _: (message: string) => message } }),
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

const loadingPreview = {
  selectedCreatorIds: ['creator-a'],
  creatorIdsToAdd: ['creator-a'],
  alreadyLinkedCreatorIds: [],
  loading: true,
};

const readyPreview = {
  selectedCreatorIds: ['creator-a', 'creator-b'],
  creatorIdsToAdd: ['creator-a', 'creator-b'],
  alreadyLinkedCreatorIds: [],
  loading: false,
};

describe('CreatorBulkRelationshipDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not dismiss or mutate when Enter is pressed while confirmation is disabled', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(loadingPreview);

    render(
      <CreatorBulkRelationshipDialog
        target={creatorListTarget}
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
        target={creatorListTarget}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add to list' })).toBeDisabled();
  });

  it('keeps the confirmation open and disabled until an async mutation succeeds', async () => {
    let resolveMutation: (() => void) | undefined;
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    mockApplyCreatorBulkRelationship.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );

    render(
      <CreatorBulkRelationshipDialog
        target={creatorListTarget}
        selectedCreatorIds={['creator-a', 'creator-b']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledTimes(1);
    expect(mockCloseModal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add to list' })).toBeDisabled();

    await act(async () => {
      resolveMutation?.();
    });

    expect(mockCloseModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-creator-list-list-a',
    );
  });

  it('keeps a failed confirmation available for retry', async () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);
    mockApplyCreatorBulkRelationship
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);

    render(
      <CreatorBulkRelationshipDialog
        target={creatorListTarget}
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
      'creator-bulk-relationship-creator-list-list-a',
    );
  });

  it('presents the count summary, Cancel, and brand confirmation', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue(readyPreview);

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
    expect(screen.getByRole('button', { name: 'Add to list' })).toHaveAttribute(
      'data-accent',
      'brand',
    );
  });

  it('reports an all-existing selection without mutating', () => {
    mockUseCreatorBulkRelationshipPreview.mockReturnValue({
      selectedCreatorIds: ['creator-a', 'creator-b'],
      creatorIdsToAdd: [],
      alreadyLinkedCreatorIds: ['creator-a', 'creator-b'],
      loading: false,
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
});
