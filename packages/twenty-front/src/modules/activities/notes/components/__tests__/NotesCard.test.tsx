import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { render, screen } from '@testing-library/react';

import { NotesCard } from '@/activities/notes/components/NotesCard';

const mockUseNotes = jest.fn();
const mockUseObjectPermissionsForObject = jest.fn();

jest.mock('@/activities/notes/hooks/useNotes', () => ({
  useNotes: (...args: unknown[]) => mockUseNotes(...args),
}));

jest.mock('@/activities/components/SkeletonLoader', () => ({
  SkeletonLoader: () => <div>Loading notes</div>,
}));

jest.mock('@/activities/notes/components/NoteList', () => ({
  NoteList: ({ notes }: { notes: Array<{ title: string }> }) => (
    <div>{notes.map(({ title }) => title).join(', ')}</div>
  ),
}));

jest.mock('@/activities/components/CustomResolverFetchMoreLoader', () => ({
  CustomResolverFetchMoreLoader: () => null,
}));

jest.mock('@/activities/hooks/useOpenCreateActivityDrawer', () => ({
  useOpenCreateActivityDrawer: () => jest.fn(),
}));

jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => ({
    id: 'creator-id',
    targetObjectNameSingular: 'creator',
  }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'creator-object-metadata-id' },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: (...args: unknown[]) =>
    mockUseObjectPermissionsForObject(...args),
}));

const defaultNotesResult = {
  notes: [],
  loading: false,
  totalCountNotes: 0,
  fetchMoreNotes: jest.fn(),
  hasNextPage: false,
  error: undefined,
  hasReadPermission: true,
};

describe('NotesCard', () => {
  beforeEach(() => {
    mockUseNotes.mockReturnValue(defaultNotesResult);
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the initial loading state', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      loading: true,
    });

    render(<NotesCard />);

    expect(screen.getByText('Loading notes')).toBeVisible();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it('shows linked notes', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      notes: [{ id: 'note-id', title: 'Creator note' }],
      totalCountNotes: 1,
    });

    render(<NotesCard />);

    expect(screen.getByText('Creator note')).toBeVisible();
  });

  it('shows the empty state after a successful zero-note response', () => {
    render(<NotesCard />);

    expect(screen.getByText('No notes')).toBeVisible();
  });

  it('does not call a forbidden note read an empty state', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      hasReadPermission: false,
    });

    render(<NotesCard />);

    expect(
      screen.getByText("You don't have permission to view notes"),
    ).toBeVisible();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it('hides cached notes after read permission is revoked', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      notes: [{ id: 'note-id', title: 'Previously visible note' }],
      totalCountNotes: 1,
      hasReadPermission: false,
    });

    render(<NotesCard />);

    expect(
      screen.getByText("You don't have permission to view notes"),
    ).toBeVisible();
    expect(
      screen.queryByText('Previously visible note'),
    ).not.toBeInTheDocument();
  });

  it('does not show the empty state when the initial read fails', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      error: new Error('Unable to load notes'),
    });

    render(<NotesCard />);

    expect(screen.getByText("Notes couldn't be loaded")).toBeVisible();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it('hides cached notes after target Creator read permission is revoked', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      notes: [{ id: 'note-id', title: 'Previously visible note' }],
      totalCountNotes: 1,
    });
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
    });

    render(<NotesCard />);

    expect(
      screen.getByText("You don't have permission to view notes"),
    ).toBeVisible();
    expect(
      screen.queryByText('Previously visible note'),
    ).not.toBeInTheDocument();
  });

  it.each(['FORBIDDEN', 'UNAUTHENTICATED'])(
    'hides cached notes when the server responds %s despite stale local permission',
    (code) => {
      mockUseNotes.mockReturnValue({
        ...defaultNotesResult,
        notes: [{ id: 'note-id', title: 'Previously visible note' }],
        totalCountNotes: 1,
        error: new CombinedGraphQLErrors({
          errors: [{ message: 'Access denied', extensions: { code } }],
          data: null,
        }),
      });

      render(<NotesCard />);

      expect(
        screen.getByText("You don't have permission to view notes"),
      ).toBeVisible();
      expect(
        screen.queryByText('Previously visible note'),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps cached notes visible when a later read fails', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      notes: [{ id: 'note-id', title: 'Cached creator note' }],
      totalCountNotes: 1,
      error: new Error('Unable to refresh notes'),
    });

    render(<NotesCard />);

    expect(screen.getByText('Cached creator note')).toBeVisible();
    expect(
      screen.queryByText("Notes couldn't be loaded"),
    ).not.toBeInTheDocument();
  });
});
