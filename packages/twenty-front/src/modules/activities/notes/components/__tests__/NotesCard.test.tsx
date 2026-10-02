import { render, screen } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { type ReactNode } from 'react';
import { messages as enMessages } from '~/locales/generated/en';

import { NotesCard } from '@/activities/notes/components/NotesCard';

const mockUseNotes = jest.fn();
let canReadCreator = true;

jest.mock('@/activities/notes/hooks/useNotes', () => ({
  useNotes: (...args: unknown[]) => mockUseNotes(...args),
}));

jest.mock('@/activities/components/SkeletonLoader', () => ({
  SkeletonLoader: () => <div>Loading notes</div>,
}));

jest.mock('@/activities/notes/components/NoteList', () => ({
  NoteList: ({
    notes,
    button,
  }: {
    notes: Array<{ title: string }>;
    button?: ReactNode;
  }) => (
    <div>
      {notes.map(({ title }) => title).join(', ')}
      {button}
    </div>
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
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: canReadCreator,
    canUpdateObjectRecords: true,
  }),
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
    canReadCreator = true;
    mockUseNotes.mockReturnValue(defaultNotesResult);
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

  it('does not show the empty state when the initial read fails', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      error: new Error('Unable to load notes'),
    });

    render(<NotesCard />);

    expect(screen.getByText("Notes couldn't be loaded")).toBeVisible();
    expect(screen.queryByText('Unable to load notes')).not.toBeInTheDocument();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it.each([
    { notes: [] },
    { notes: [{ id: 'note-id', title: 'Cached private note' }] },
  ])(
    'shows forbidden instead of empty or cached notes when NoteTarget read is denied',
    ({ notes }) => {
      mockUseNotes.mockReturnValue({
        ...defaultNotesResult,
        notes,
        hasReadPermission: false,
      });

      render(<NotesCard />);

      expect(screen.getByText('Notes are not available')).toBeVisible();
      expect(screen.queryByText('Cached private note')).not.toBeInTheDocument();
      expect(screen.queryByText('No notes')).not.toBeInTheDocument();
    },
  );

  it('renders readable English permission copy from the compiled catalog', () => {
    expect(enMessages['kHzQBZ']).toEqual(['Notes are not available']);
    expect(enMessages['tQBnDp']).toEqual([
      "You don't have permission to view notes.",
    ]);
    i18n.load('en', enMessages);
    i18n.activate('en');
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      hasReadPermission: false,
    });

    render(<NotesCard />);

    expect(screen.getByText('Notes are not available')).toBeVisible();
    expect(
      screen.getByText("You don't have permission to view notes."),
    ).toBeVisible();
    expect(screen.queryByText('kHzQBZ')).not.toBeInTheDocument();
    expect(screen.queryByText('tQBnDp')).not.toBeInTheDocument();
  });

  it.each(['FORBIDDEN', 'UNAUTHENTICATED'])(
    'hides cached notes and creation on a %s GraphQL response even when local read permission remains true',
    (code) => {
      mockUseNotes.mockReturnValue({
        ...defaultNotesResult,
        notes: [{ id: 'note-id', title: 'Cached private note' }],
        totalCountNotes: 1,
        error: new CombinedGraphQLErrors({
          errors: [{ message: 'Access denied', extensions: { code } }],
        }),
      });

      render(<NotesCard />);

      expect(screen.getByText('Notes are not available')).toBeVisible();
      expect(screen.queryByText('Cached private note')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add note' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('No notes')).not.toBeInTheDocument();
    },
  );

  it('hides cached notes and creation when the target Creator cannot be read', () => {
    canReadCreator = false;
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      notes: [{ id: 'note-id', title: 'Cached private note' }],
      totalCountNotes: 1,
    });

    render(<NotesCard />);

    expect(screen.getByText('Notes are not available')).toBeVisible();
    expect(screen.queryByText('Cached private note')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add note' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it('reports a failed refresh while retaining cached notes', () => {
    mockUseNotes.mockReturnValue({
      ...defaultNotesResult,
      notes: [{ id: 'note-id', title: 'Cached creator note' }],
      totalCountNotes: 1,
      error: new Error('Unable to refresh notes'),
    });

    render(<NotesCard />);

    expect(screen.getByText('Cached creator note')).toBeVisible();
    expect(screen.getByText("Notes couldn't be loaded")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeVisible();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });
});
