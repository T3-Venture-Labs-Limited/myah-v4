import { render, screen } from '@testing-library/react';

import { NotesCard } from '@/activities/notes/components/NotesCard';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';

const mockUseObjectPermissionsForObject = jest.fn();
const mockUseFindManyRecords = jest.mocked(useFindManyRecords);

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [
    {
      id: 'note-metadata-id',
      nameSingular: 'note',
      namePlural: 'notes',
      fields: [],
    },
    {
      id: 'note-target-metadata-id',
      nameSingular: 'noteTarget',
      namePlural: 'noteTargets',
      fields: [],
    },
  ],
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomState', () => ({
  useAtomState: () => [{}, jest.fn()],
}));
jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => ({
    id: 'creator-id',
    targetObjectNameSingular: 'creator',
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem: { id: `${objectNameSingular}-metadata-id` },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: (...args: unknown[]) =>
    mockUseObjectPermissionsForObject(...args),
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

const noteTarget = {
  id: 'note-target-id',
  __typename: 'NoteTarget',
  note: {
    id: 'note-id',
    title: 'Creator relationship note',
    createdAt: '2026-09-22T12:00:00Z',
    updatedAt: '2026-09-22T12:00:00Z',
    __typename: 'Note',
  },
};

const setQueryResult = (
  records: Array<typeof noteTarget | { id: string; note: null }>,
) => {
  mockUseFindManyRecords.mockReturnValue({
    records,
    loading: false,
    totalCount: records.length,
    hasReadPermission: true,
    hasNextPage: false,
    fetchMoreRecords: jest.fn(),
  } as unknown as ReturnType<typeof useFindManyRecords>);
};

describe('NotesCard with the native note-target query mapping', () => {
  beforeEach(() => {
    mockUseObjectPermissionsForObject.mockImplementation(
      (metadataId: string) => ({
        canReadObjectRecords: metadataId !== 'note-metadata-id',
        canUpdateObjectRecords: false,
      }),
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('does not present a readable noteTarget with denied nested Note as an empty Creator history', () => {
    setQueryResult([{ id: 'note-target-id', note: null }]);

    render(<NotesCard />);

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'noteTarget',
        filter: { targetCreatorId: { eq: 'creator-id' } },
      }),
    );
    expect(screen.getByText('Notes are not available')).toBeVisible();
    expect(
      screen.getByText("You don't have permission to view notes."),
    ).toBeVisible();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it('shows No notes only when Note and noteTarget reads are allowed and there are no links', () => {
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });
    setQueryResult([]);

    render(<NotesCard />);

    expect(screen.getByText('No notes')).toBeVisible();
  });

  it('does not mistake an unreadable nested note for an empty history when local object permission is stale', () => {
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });
    setQueryResult([{ id: 'note-target-id', note: null }]);

    render(<NotesCard />);

    expect(screen.getByText('Notes are unavailable')).toBeVisible();
    expect(screen.queryByText('No notes')).not.toBeInTheDocument();
  });

  it('continues to show an authorized Creator-global note', () => {
    mockUseObjectPermissionsForObject.mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });
    setQueryResult([noteTarget]);

    render(<NotesCard />);

    expect(screen.getByText('Creator relationship note')).toBeVisible();
  });
});
