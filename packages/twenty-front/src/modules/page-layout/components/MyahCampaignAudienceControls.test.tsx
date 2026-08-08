import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyahCampaignAudienceControls } from './MyahCampaignAudienceControls';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockPicker = jest.fn();
const mockUseFindManyRecords = jest.fn();
const mockAttach = jest.fn();
const mockAddDirect = jest.fn();
const mockDetach = jest.fn();

type SnapshotData = {
  campaignInfluencerSnapshot: {
    campaignCreatorLists: Array<{ id: string; creatorListId: string }>;
  };
};

type ImpactData = {
  campaignCreatorListRemovalImpact: {
    affectedCreatorIds: string[];
    requiresConfirmation: boolean;
    confirmationToken: string;
  };
};

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
  ModalStatefulWrapper: ({
    children,
    onClose,
  }: {
    children: ReactNode;
    onClose?: () => void;
  }) => (
    <div role="dialog">
      {children}
      <button onClick={onClose}>Close picker</button>
    </div>
  ),
}));
jest.mock(
  '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker',
  () => ({
    SingleRecordPicker: (props: {
      onMorphItemSelected: (item: { recordId: string }) => void;
    }) => {
      mockPicker(props);
      return (
        <button
          onClick={() =>
            props.onMorphItemSelected({ recordId: 'list-selected' })
          }
        >
          Select native record
        </button>
      );
    },
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

describe('MyahCampaignAudienceControls', () => {
  const snapshot = (creatorListIds: string[] = []) => ({
    campaignInfluencerSnapshot: {
      campaignCreatorLists: creatorListIds.map((creatorListId, index) => ({
        id: `join-${index + 1}`,
        creatorListId,
      })),
    },
  });
  const impact = (affectedCreatorIds: string[], confirmationToken: string) => ({
    campaignCreatorListRemovalImpact: {
      affectedCreatorIds,
      requiresConfirmation: affectedCreatorIds.length > 0,
      confirmationToken,
    },
  });
  const mockCreatorLists = (
    records: Array<{ id: string; name: string }> = [],
    creators: Array<{ id: string; name?: string }> = [],
  ) => {
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => ({
        records:
          objectNameSingular === 'creatorList'
            ? records
            : objectNameSingular === 'creator'
              ? creators
              : [],
        refetch: jest.fn().mockResolvedValue(undefined),
      }),
    );
  };
  const mockApolloQueries = ({
    snapshotData = snapshot(),
    impactData,
    refetchImpact = jest.fn().mockResolvedValue({ data: impactData }),
  }: {
    snapshotData?: SnapshotData;
    impactData?: ImpactData;
    refetchImpact?: jest.Mock;
  } = {}) => {
    const refetchSnapshot = jest.fn().mockResolvedValue(undefined);

    mockUseQuery.mockImplementation((query: string) =>
      query.includes('CampaignInfluencerSnapshot')
        ? { data: snapshotData, refetch: refetchSnapshot }
        : { data: impactData, refetch: refetchImpact },
    );

    return { refetchSnapshot, refetchImpact };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApolloQueries();
    mockUseMutation.mockImplementation((mutation: string) => {
      if (mutation.includes('AttachCampaignCreatorLists')) {
        return [mockAttach];
      }
      if (mutation.includes('AddDirectCampaignCreators')) {
        return [mockAddDirect];
      }
      if (mutation.includes('DetachCampaignCreatorList')) {
        return [mockDetach];
      }

      throw new Error(`Unexpected mutation: ${mutation}`);
    });
    mockCreatorLists();
  });

  it('uses the native picker record id as the attach intent input', async () => {
    mockAttach.mockResolvedValue(undefined);
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Attach Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select native record' }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Attach selected Creator List',
      }),
    );

    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith({
        variables: {
          input: {
            campaignId: 'campaign-1',
            creatorListIds: ['list-selected'],
          },
        },
      }),
    );
    expect(mockOpenModal).toHaveBeenCalledWith('campaign-list-picker');
  });

  it('forwards the removal impact confirmation token unchanged', async () => {
    const displayedImpact = impact(['creator-1'], 'token-1');
    const { refetchSnapshot } = mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      impactData: displayedImpact,
      refetchImpact: jest.fn().mockResolvedValue({ data: displayedImpact }),
    });
    mockCreatorLists([{ id: 'list-1', name: 'VIP Creators' }]);
    mockDetach.mockResolvedValue(undefined);
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    expect(screen.getByText('VIP Creators')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Confirm removal of final-source creators',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm Creator List removal',
      }),
    );

    await waitFor(() =>
      expect(mockDetach).toHaveBeenCalledWith({
        variables: {
          input: {
            campaignId: 'campaign-1',
            creatorListId: 'list-1',
            confirmedCreatorIds: ['creator-1'],
            confirmationToken: 'token-1',
          },
        },
      }),
    );

    expect(refetchSnapshot).toHaveBeenCalled();
  });
  it('renders all affected Creator labels in sorted order with a safe fallback', () => {
    const displayedImpact = impact(
      ['creator-missing', 'creator-z', 'creator-a'],
      'token-labels',
    );
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      impactData: displayedImpact,
    });
    mockCreatorLists(
      [{ id: 'list-1', name: 'VIP Creators' }],
      [
        { id: 'creator-z', name: 'Zoe' },
        { id: 'creator-a', name: 'Ada' },
      ],
    );
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Creator List' }),
    );

    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Ada', 'Creator (unavailable)', 'Zoe']);
    expect(screen.queryByText('creator-missing')).not.toBeInTheDocument();
    expect(screen.queryByText('creator-z')).not.toBeInTheDocument();
    expect(screen.queryByText('creator-a')).not.toBeInTheDocument();
  });

  it('cancels removal without mutation when no creators lose their final source', () => {
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      impactData: impact([], 'token-0'),
    });
    mockCreatorLists([{ id: 'list-1', name: 'VIP Creators' }]);
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Creator List' }),
    );
    expect(
      screen.getByText('No creators lose their final source.'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancel Creator List removal',
      }),
    );

    expect(mockDetach).not.toHaveBeenCalled();
  });

  it('shows broadened impact and requires confirmation again before removal', async () => {
    const displayedImpact = impact(['creator-1'], 'token-a');
    const latestImpact = impact(['creator-1', 'creator-2'], 'token-b');

    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      impactData: displayedImpact,
      refetchImpact: jest.fn().mockResolvedValue({ data: latestImpact }),
    });
    mockCreatorLists([{ id: 'list-1', name: 'VIP Creators' }]);
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Confirm removal of final-source creators',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm Creator List removal',
      }),
    );

    expect(
      await screen.findByText('2 creators lose their final source.'),
    ).toBeInTheDocument();
    expect(mockDetach).not.toHaveBeenCalled();
    expect(
      screen.getByRole('checkbox', {
        name: 'Confirm removal of final-source creators',
      }),
    ).not.toBeChecked();
  });

  it('clears confirmation when selecting a different Creator List', () => {
    mockApolloQueries({
      snapshotData: snapshot(['list-1', 'list-2']),
      impactData: impact(['creator-1'], 'token-a'),
    });
    mockCreatorLists([
      { id: 'list-1', name: 'VIP Creators' },
      { id: 'list-2', name: 'Partner Creators' },
    ]);
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove Creator List',
    });

    fireEvent.click(removeButtons[0]);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Confirm removal of final-source creators',
      }),
    );
    fireEvent.click(removeButtons[1]);

    expect(
      screen.getByRole('checkbox', {
        name: 'Confirm removal of final-source creators',
      }),
    ).not.toBeChecked();
  });
});
