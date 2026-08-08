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
  const impact = {
    creatorListMembershipRemovalImpact: {
      affectedCampaignIds: ['campaign-1'],
      requiresConfirmation: true,
      confirmationToken: 'membership-token-1',
    },
  };
  const refetchImpact = jest.fn().mockResolvedValue({ data: impact });

  beforeEach(() => {
    jest.clearAllMocks();
    refetchMembers.mockResolvedValue(undefined);
    refetchImpact.mockResolvedValue({ data: impact });
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => {
        if (objectNameSingular === 'creatorListMember') {
          return {
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
          };
        }

        if (objectNameSingular === 'campaign') {
          return {
            records: [{ id: 'campaign-1', name: 'Campaign One' }],
          };
        }

        throw new Error(`Unexpected object query: ${objectNameSingular}`);
      },
    );
    mockUseQuery.mockReturnValue({ data: impact, refetch: refetchImpact });
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

  it('loads additional members from the paginated membership query', async () => {
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => {
        if (objectNameSingular === 'creatorListMember') {
          return {
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
          };
        }

        if (objectNameSingular === 'campaign') {
          return { records: [] };
        }

        throw new Error(`Unexpected object query: ${objectNameSingular}`);
      },
    );

    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    expect(screen.getByText('Ada Creator')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more Creators' }));

    await waitFor(() => expect(fetchMoreMembers).toHaveBeenCalledTimes(1));
    expect(mockUseFindManyRecords).not.toHaveBeenCalledWith(
      expect.objectContaining({ objectNameSingular: 'creator' }),
    );
  });

  it('adds the native picker Creator through the membership intent', async () => {
    mockAddMember.mockResolvedValue(undefined);
    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    expect(screen.getByText('Ada Creator')).toBeVisible();
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

  it('forwards reviewed Campaign impact when removing a member', async () => {
    mockRemoveMember.mockResolvedValue(undefined);
    render(<MyahCreatorListMembers creatorListId="creator-list-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Creator' }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Confirm removal from affected Campaigns',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Creator removal' }),
    );

    await waitFor(() =>
      expect(mockRemoveMember).toHaveBeenCalledWith({
        variables: {
          input: {
            creatorListId: 'creator-list-1',
            creatorId: 'creator-1',
            confirmedCampaignIds: ['campaign-1'],
            confirmationToken: 'membership-token-1',
          },
        },
      }),
    );
    expect(refetchMembers).toHaveBeenCalled();
  });
});
