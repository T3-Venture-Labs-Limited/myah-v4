import type { ReactNode } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MyahCampaignAudienceControls } from './MyahCampaignAudienceControls';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockPicker = jest.fn();
const mockUseFindManyRecords = jest.fn();
const mockUseObjectMetadataItem = jest.fn();
const mockOpenMultipleRecordPicker = jest.fn();
const mockMultipleRecordPickerPerformSearch = jest.fn();
const mockSetMultipleRecordPickerState = jest.fn();
const mockCloseDropdown = jest.fn();
const mockAttach = jest.fn();
const mockApprove = jest.fn();
const mockDetach = jest.fn();
const mockRefetchQueries = jest.fn();

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
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({
    cache: { evict: jest.fn() },
    refetchQueries: mockRefetchQueries,
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: (...args: unknown[]) =>
    mockUseObjectMetadataItem(...args),
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
  '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker',
  () => ({
    MultipleRecordPicker: (props: {
      onChange: (item: {
        recordId: string;
        objectMetadataId: string;
        isSelected: boolean;
        isMatchingSearchFilter: boolean;
      }) => void;
    }) => {
      mockPicker(props);
      return (
        <button
          onClick={() =>
            props.onChange({
              recordId: 'list-selected',
              objectMetadataId: 'creator-list-metadata-id',
              isMatchingSearchFilter: true,
              isSelected: true,
            })
          }
        >
          Select creator list
        </button>
      );
    },
  }),
);
jest.mock(
  '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerOpen',
  () => ({
    useMultipleRecordPickerOpen: () => ({
      openMultipleRecordPicker: mockOpenMultipleRecordPicker,
    }),
  }),
);
jest.mock(
  '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch',
  () => ({
    useMultipleRecordPickerPerformSearch: () => ({
      performSearch: mockMultipleRecordPickerPerformSearch,
    }),
  }),
);
jest.mock(
  '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState',
  () => ({ multipleRecordPickerPickableMorphItemsComponentState: {} }),
);
jest.mock(
  '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchFilterComponentState',
  () => ({ multipleRecordPickerSearchFilterComponentState: {} }),
);
jest.mock(
  '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchableObjectMetadataItemsComponentState',
  () => ({ multipleRecordPickerSearchableObjectMetadataItemsComponentState: {} }),
);
jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    children,
    clickableComponent,
    dropdownComponents,
    onOpen,
  }: {
    children?: ReactNode;
    clickableComponent: ReactNode;
    dropdownComponents: ReactNode;
    onOpen?: () => void;
  }) => (
    <>
      <div onClick={onOpen}>{clickableComponent}</div>
      {dropdownComponents}
      {children}
    </>
  ),
}));
jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: mockCloseDropdown }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetMultipleRecordPickerState,
}));
jest.mock(
  '@/object-record/record-field-list/record-detail-section/components/RecordDetailSectionContainer',
  () => ({
    RecordDetailSectionContainer: ({
      children,
      dataTestId,
      link,
      rightAdornment,
      title,
    }: {
      children: ReactNode;
      dataTestId?: string;
      link?: { label: string; to: string };
      rightAdornment?: ReactNode;
      title: string;
    }) => (
      <section data-testid={dataTestId}>
        <header>
          <span>{title}</span>
          {link ? <a href={link.to}>{link.label}</a> : null}
          {rightAdornment}
        </header>
        {children}
      </section>
    ),
  }),
);
jest.mock('twenty-ui/icon', () => ({ IconPlus: () => null }));
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
  Checkbox: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
    'aria-label': string;
  }) => (
    <input
      aria-label={ariaLabel}
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      type="checkbox"
    />
  ),
  LightIconButton: ({
    'aria-label': ariaLabel,
  }: {
    'aria-label': string;
  }) => (
    <button
      aria-label={ariaLabel}
      data-testid="creator-list-picker-open"
      type="button"
    />
  ),
}));
type CampaignInfluencerSnapshotData = {
  campaignInfluencerSnapshot: { campaignCreatorLists: CampaignCreatorList[] };
};
type CampaignCreatorListAdditionCandidatesData = {
  campaignCreatorListAdditionCandidates: { creatorIds: string[] };
};

type CampaignCreatorList = { id: string; creatorListId: string };

const snapshot = (
  creatorListIds: string[] = [],
): CampaignInfluencerSnapshotData => ({
  campaignInfluencerSnapshot: {
    campaignCreatorLists: creatorListIds.map((creatorListId, index) => ({
      id: `join-${index + 1}`,
      creatorListId,
    })),
  },
});

const candidates = (
  creatorIds: string[] = [],
): CampaignCreatorListAdditionCandidatesData => ({
  campaignCreatorListAdditionCandidates: { creatorIds },
});

describe('MyahCampaignAudienceControls', () => {
  const mockApolloQueries = ({
    snapshotData = snapshot(),
    candidatesData = candidates(),
    refetchCandidates = jest.fn().mockResolvedValue({ data: candidatesData }),
  }: {
    snapshotData?: CampaignInfluencerSnapshotData;
    candidatesData?: CampaignCreatorListAdditionCandidatesData;
    refetchCandidates?: jest.Mock;
  } = {}) => {
    const refetchSnapshot = jest.fn().mockResolvedValue(undefined);

    mockUseQuery.mockImplementation((query: string) => {
      if (query.includes('CampaignInfluencerSnapshot')) {
        return { data: snapshotData, refetch: refetchSnapshot };
      }

      if (query.includes('CampaignCreatorListAdditionCandidates')) {
        return { data: candidatesData, refetch: refetchCandidates };
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    return { refetchCandidates, refetchSnapshot };
  };

  const mockRecords = ({
    creatorLists = [],
    creators = [],
  }: {
    creatorLists?: Array<{ id: string; name: string }>;
    creators?: Array<{ id: string; name: string }>;
  } = {}) => {
    const refetchCampaignCreatorLists = jest.fn().mockResolvedValue(undefined);

    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => ({
        records:
          objectNameSingular === 'creatorList'
            ? creatorLists
            : objectNameSingular === 'creator'
              ? creators
              : [],
        refetch:
          objectNameSingular === 'campaignCreatorList'
            ? refetchCampaignCreatorLists
            : jest.fn().mockResolvedValue(undefined),
      }),
    );

    return { refetchCampaignCreatorLists };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetchQueries.mockResolvedValue(undefined);
    mockApolloQueries();
    mockRecords();
    mockUseObjectMetadataItem.mockReturnValue({
      objectMetadataItem: {
        id: 'creator-list-metadata-id',
        nameSingular: 'creatorList',
      },
    });
    mockUseMutation.mockImplementation((mutation: string) => {
      if (mutation.includes('AttachCampaignCreatorLists')) {
        return [mockAttach];
      }
      if (mutation.includes('ApproveCampaignCreatorListAdditions')) {
        return [mockApprove];
      }
      if (mutation.includes('DetachCampaignCreatorList')) {
        return [mockDetach];
      }

      throw new Error(`Unexpected mutation: ${mutation}`);
    });
  });

  it('uses the Creator Lists picker to attach through the guarded mutation', async () => {
    mockAttach.mockResolvedValue(undefined);
    mockApolloQueries({ snapshotData: snapshot(['list-1']) });
    mockRecords({
      creatorLists: [{ id: 'list-1', name: 'VIP Creators' }],
    });

    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    const section = screen.getByTestId('creator-lists-section');
    expect(within(section).getByText('VIP Creators')).toBeVisible();
    expect(
      within(section).queryByRole('button', { name: 'Attach Creator List' }),
    ).not.toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Add Creator List' }),
    ).toBeVisible();
    fireEvent.click(screen.getByTestId('creator-list-picker-open'));
    expect(mockOpenMultipleRecordPicker).toHaveBeenCalledWith(
      'campaign-creator-lists-picker-campaign-1',
    );
    expect(mockMultipleRecordPickerPerformSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        forceSearchableObjectMetadataItems: [
          expect.objectContaining({ nameSingular: 'creatorList' }),
        ],
      }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select creator list' }),
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
    await waitFor(() =>
      expect(mockRefetchQueries).toHaveBeenCalledWith({
        include: ['active', 'inactive', 'FindManyCampaignCreators'],
        updateCache: expect.any(Function),
      }),
    );
  });

  it('does not offer a direct Creator-add control', () => {
    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    expect(
      screen.queryByRole('button', { name: /Direct Creator/i }),
    ).not.toBeInTheDocument();
  });

  it('reviews readable additions, approves only selected ids, and refreshes', async () => {
    const { refetchSnapshot } = mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      candidatesData: candidates(['creator-1', 'creator-2']),
    });
    const { refetchCampaignCreatorLists } = mockRecords({
      creatorLists: [{ id: 'list-1', name: 'VIP Creators' }],
      creators: [
        { id: 'creator-1', name: 'Ada' },
        { id: 'creator-2', name: 'Zoe' },
      ],
    });
    mockApprove.mockResolvedValue(undefined);

    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    const creatorListsSection = screen.getByTestId('creator-lists-section');
    fireEvent.click(
      within(creatorListsSection).getByRole('button', {
        name: 'Review 2 additions',
      }),
    );
    expect(screen.getByRole('checkbox', { name: 'Zoe' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zoe' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    );

    await waitFor(() =>
      expect(mockApprove).toHaveBeenCalledWith({
        variables: {
          input: {
            campaignId: 'campaign-1',
            creatorListId: 'list-1',
            creatorIds: ['creator-1'],
          },
        },
      }),
    );
    expect(refetchSnapshot).toHaveBeenCalled();
    expect(refetchCampaignCreatorLists).toHaveBeenCalled();
    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: ['active', 'inactive', 'FindManyCampaignCreators'],
      updateCache: expect.any(Function),
    });
  });

  it('approves more than 500 selected additions in bounded batches', async () => {
    const creatorIds = Array.from(
      { length: 501 },
      (_, index) => `creator-${index + 1}`,
    );
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      candidatesData: candidates(creatorIds),
    });
    mockRecords({
      creatorLists: [{ id: 'list-1', name: 'VIP Creators' }],
    });
    mockApprove.mockResolvedValue(undefined);

    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Review 501 additions' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    );

    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(2));
    expect(mockApprove).toHaveBeenNthCalledWith(1, {
      variables: {
        input: {
          campaignId: 'campaign-1',
          creatorListId: 'list-1',
          creatorIds: creatorIds.slice(0, 500),
        },
      },
    });
    expect(mockApprove).toHaveBeenNthCalledWith(2, {
      variables: {
        input: {
          campaignId: 'campaign-1',
          creatorListId: 'list-1',
          creatorIds: creatorIds.slice(500),
        },
      },
    });
  });

  it('loads every candidate label before enabling review', async () => {
    const creatorIds = Array.from(
      { length: 61 },
      (_, index) => `creator-${index + 1}`,
    );
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      candidatesData: candidates(creatorIds),
    });
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => ({
        records:
          objectNameSingular === 'creatorList'
            ? [{ id: 'list-1', name: 'VIP Creators' }]
            : [],
        loading: objectNameSingular === 'creator',
        refetch: jest.fn().mockResolvedValue(undefined),
      }),
    );

    const { rerender } = render(
      <MyahCampaignAudienceControls campaignId="campaign-1" />,
    );

    expect(
      screen.getByRole('button', { name: 'Review 61 additions' }),
    ).toBeDisabled();
    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: creatorIds.length,
        objectNameSingular: 'creator',
      }),
    );

    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => ({
        records:
          objectNameSingular === 'creatorList'
            ? [{ id: 'list-1', name: 'VIP Creators' }]
            : creatorIds.map((id) => ({ id, name: id })),
        loading: false,
        refetch: jest.fn().mockResolvedValue(undefined),
      }),
    );
    rerender(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    expect(
      screen.getByRole('button', { name: 'Review 61 additions' }),
    ).toBeEnabled();
  });

  it('prevents approval while a refreshed candidate label query is loading', () => {
    let areCreatorLabelsLoading = false;
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      candidatesData: candidates(['creator-1']),
    });
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => ({
        records:
          objectNameSingular === 'creatorList'
            ? [{ id: 'list-1', name: 'VIP Creators' }]
            : [{ id: 'creator-1', name: 'Ada' }],
        loading: objectNameSingular === 'creator' && areCreatorLabelsLoading,
        refetch: jest.fn().mockResolvedValue(undefined),
      }),
    );

    const { rerender } = render(
      <MyahCampaignAudienceControls campaignId="campaign-1" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 addition' }));
    expect(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    ).toBeEnabled();

    areCreatorLabelsLoading = true;
    rerender(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    expect(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    ).toBeDisabled();
  });

  it('keeps review open and reloads candidates when approval becomes stale', async () => {
    const refetchCandidates = jest.fn().mockResolvedValue({
      data: candidates(['creator-2']),
    });
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      candidatesData: candidates(['creator-1']),
      refetchCandidates,
    });
    mockRecords({
      creatorLists: [{ id: 'list-1', name: 'VIP Creators' }],
      creators: [{ id: 'creator-1', name: 'Ada' }],
    });
    mockApprove.mockRejectedValue(new Error('stale candidate'));

    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 addition' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    );

    await waitFor(() => expect(refetchCandidates).toHaveBeenCalled());
    expect(
      screen.getByText('The additions changed. Review the current candidates.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    ).toBeVisible();
  });
  it('keeps approval closed when a committed approval refresh fails', async () => {
    const refetchCandidates = jest
      .fn()
      .mockRejectedValueOnce(new Error('refresh failed'));
    mockApolloQueries({
      snapshotData: snapshot(['list-1']),
      candidatesData: candidates(['creator-1']),
      refetchCandidates,
    });
    mockRecords({
      creatorLists: [{ id: 'list-1', name: 'VIP Creators' }],
      creators: [{ id: 'creator-1', name: 'Ada' }],
    });
    mockApprove.mockResolvedValue(undefined);

    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 addition' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve selected additions' }),
    );

    await waitFor(() => expect(refetchCandidates).toHaveBeenCalled());
    expect(
      screen.getByText(
        'Approved additions were saved, but the view could not refresh.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve selected additions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'The additions changed. Review the current candidates.',
      ),
    ).not.toBeInTheDocument();
  });

  it('confirms only the attachment before detaching a Creator List', async () => {
    mockApolloQueries({ snapshotData: snapshot(['list-1']) });
    mockRecords({
      creatorLists: [{ id: 'list-1', name: 'VIP Creators' }],
    });
    mockDetach.mockResolvedValue(undefined);

    render(<MyahCampaignAudienceControls campaignId="campaign-1" />);

    const creatorListsSection = screen.getByTestId('creator-lists-section');
    fireEvent.click(
      within(creatorListsSection).getByRole('button', {
        name: 'Remove Creator List',
      }),
    );

    expect(screen.getByText('Detach VIP Creators?')).toBeVisible();
    expect(
      screen.getByText(
        'This only detaches the List. Existing Campaign influencers remain unchanged.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/final-source|lose their final source/i),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Creator List detach' }),
    );

    await waitFor(() =>
      expect(mockDetach).toHaveBeenCalledWith({
        variables: {
          input: { campaignId: 'campaign-1', creatorListId: 'list-1' },
        },
      }),
    );
    await waitFor(() =>
      expect(mockRefetchQueries).toHaveBeenCalledWith({
        include: ['active', 'inactive', 'FindManyCampaignCreators'],
        updateCache: expect.any(Function),
      }),
    );
  });
});
