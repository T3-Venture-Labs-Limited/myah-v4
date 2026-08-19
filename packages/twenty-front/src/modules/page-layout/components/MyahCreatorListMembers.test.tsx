import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyahCreatorListMembers } from './MyahCreatorListMembers';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockUseFindManyRecords = jest.fn();
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockAddMember = jest.fn();
const mockRemoveMember = jest.fn();
const refetchMembers = jest.fn().mockResolvedValue(undefined);
const fetchMoreMembers = jest.fn().mockResolvedValue(undefined);

jest.mock('@apollo/client', () => ({
  gql: (source: TemplateStringsArray) => source.join(''),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (...args: unknown[]) => mockUseFindManyRecords(...args),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal, closeModal: mockCloseModal }),
}));
jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}));
jest.mock(
  '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker',
  () => ({
    SingleRecordPicker: ({
      onMorphItemSelected,
    }: {
      onMorphItemSelected: (item: { recordId: string }) => void;
    }) => (
      <button
        onClick={() => onMorphItemSelected({ recordId: 'creator-selected' })}
      >
        Select native Creator
      </button>
    ),
  }),
);
jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
  }: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

describe('MyahCreatorListMembers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refetchMembers.mockResolvedValue(undefined);
    mockUseFindManyRecords.mockReturnValue({
      records: [
        {
          id: 'member-1',
          creatorId: 'creator-1',
          creator: { id: 'creator-1', name: 'Ada Creator' },
        },
      ],
      refetch: refetchMembers,
      fetchMoreRecords: fetchMoreMembers,
      hasNextPage: false,
    });
    mockUseMutation.mockImplementation((mutation: string) => {
      if (mutation.includes('AddCreatorListMemberIntent')) {
        return [mockAddMember];
      }
      if (mutation.includes('RemoveCreatorListMemberIntent')) {
        return [mockRemoveMember];
      }

      throw new Error(`Unexpected mutation: ${mutation}`);
    });
  });

  it('uses the current shared membership input type for removal', () => {
    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    expect(mockUseMutation.mock.calls[1][0]).toContain(
      '$input: CreatorListMembershipIntentInput!',
    );
  });

  it('loads additional members from the paginated membership query', async () => {
    mockUseFindManyRecords.mockReturnValue({
      records: [
        {
          id: 'member-1',
          creatorId: 'creator-1',
          creator: { id: 'creator-1', name: 'Ada Creator' },
        },
      ],
      refetch: refetchMembers,
      fetchMoreRecords: fetchMoreMembers,
      hasNextPage: true,
    });

    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    expect(screen.getByText('Ada Creator')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more Creators' }));

    await waitFor(() => expect(fetchMoreMembers).toHaveBeenCalledTimes(1));
  });

  it('adds the native picker Creator through the membership intent', async () => {
    mockAddMember.mockResolvedValue(undefined);
    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Creator' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Select native Creator' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add selected Creator' }),
    );

    await waitFor(() =>
      expect(mockAddMember).toHaveBeenCalledWith({
        variables: {
          input: {
            creatorListId: 'creator-list-1',
            creatorId: 'creator-selected',
          },
        },
      }),
    );
    expect(refetchMembers).toHaveBeenCalled();
    expect(mockOpenModal).toHaveBeenCalledWith('creator-list-member-picker');
  });

  it('removes only the List membership without querying Campaign impact', async () => {
    mockRemoveMember.mockResolvedValue(undefined);
    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Creator' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Creator removal' }),
    );

    await waitFor(() =>
      expect(mockRemoveMember).toHaveBeenCalledWith({
        variables: {
          input: {
            creatorListId: 'creator-list-1',
            creatorId: 'creator-1',
          },
        },
      }),
    );
    expect(mockUseQuery).not.toHaveBeenCalled();
    expect(refetchMembers).toHaveBeenCalled();
  });
});
