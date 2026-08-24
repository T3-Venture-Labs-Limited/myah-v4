import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useContext } from 'react';

import { CampaignInfluencerIndex } from '@/myah/creator-crm/components/CampaignInfluencerIndex';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordFilterValueDependenciesContext } from '@/object-record/record-filter/contexts/RecordFilterValueDependenciesContext';
import { multipleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchFilterComponentState';
import {
  FieldMetadataType,
  ViewFilterOperand,
  ViewType,
} from 'twenty-shared/types';
const campaignInfluencersViewId = 'campaign-influencers-view';
const campaignInfluencersUniversalIdentifier =
  'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b';

const mockApplyCreatorBulkRelationship = jest.fn();
let mockViews: Array<{
  id: string;
  universalIdentifier: string;
  objectMetadataId: string;
  type: ViewType;
  isActive: boolean;
}> = [];

let mockPickerItems: Array<{ isSelected: boolean; recordId: string }> = [];
const mockPickerItemSubscribers = new Set<() => void>();
const mockSetPickerItems = (
  pickerItems: Array<{ isSelected: boolean; recordId: string }>,
) => {
  mockPickerItems = pickerItems;
  mockPickerItemSubscribers.forEach((subscriber) => subscriber());
};

let mockPickerSearchFilter = '';
let mockPickerKeyboardSelection: string | null = null;
const mockSetPickerSearchFilter = (searchFilter: string) => {
  mockPickerSearchFilter = searchFilter;
  mockPickerItemSubscribers.forEach((subscriber) => subscriber());
};
const mockResetPickerKeyboardSelection = jest.fn(() => {
  mockPickerKeyboardSelection = null;
  mockPickerItemSubscribers.forEach((subscriber) => subscriber());
});

const createDeferred = () => {
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<void>((_, promiseReject) => {
    reject = promiseReject;
  });

  return { promise, reject };
};

const mockRecordIndexSurface = jest.fn(
  ({
    contextStoreInstanceId,
    currentRecordId,
    embeddedSurfaceOptions,
    initialQueryOnlyRecordFilters,
    onViewChange,
    viewId,
  }: {
    contextStoreInstanceId: string;
    currentRecordId?: string;
    embeddedSurfaceOptions?: {
      hideAddNew?: boolean;
      compactTable?: boolean;
      hidePageHeader?: boolean;
      hideQueryOnlyRecordFilters?: boolean;
      hideViewPicker?: boolean;
      hideCurrentRecordFilter?: {
        fieldMetadataId: string;
        relationTargetFieldMetadataId?: string | null;
        operand: ViewFilterOperand;
      };
      toolbarAction?: ReactNode;
    };
    hideEmptyStateSubtitle?: boolean;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onViewChange?: (viewId: string) => void;
    viewId: string;
  }) => (
    <div
      data-context-store-id={contextStoreInstanceId}
      data-testid="record-index-surface"
    >
      {embeddedSurfaceOptions?.toolbarAction}
      <output data-testid="current-record-id">
        {currentRecordId ?? 'none'}
      </output>
      {`Rows for ${initialQueryOnlyRecordFilters[0]?.value} in ${viewId}`}
      <button onClick={() => onViewChange?.('campaign-secondary-view')}>
        Switch Campaign view
      </button>
    </div>
  ),
);

let objectMetadataItems: Array<{
  id: string;
  nameSingular: string;
  fields: Array<{
    id: string;
    name: string;
    relation?: { targetObjectMetadata: { id: string } };
    type?: FieldMetadataType;
  }>;
}>;

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(),
}));

jest.mock(
  '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker',
  () => {
    const { useSyncExternalStore } = jest.requireActual('react');

    return {
      MultipleRecordPicker: ({
        onChange,
        onSubmit,
        shouldResetStateOnClose,
      }: {
        onChange?: (value: { isSelected: boolean; recordId: string }) => void;
        onSubmit?: () => void;
        shouldResetStateOnClose?: boolean;
      }) => {
        useSyncExternalStore(
          (subscriber: () => void) => {
            mockPickerItemSubscribers.add(subscriber);

            return () => mockPickerItemSubscribers.delete(subscriber);
          },
          () => mockPickerItems,
        );

        return (
          <>
            <output data-testid="picker-selection-count">
              {mockPickerItems.filter(({ isSelected }) => isSelected).length}
            </output>
            <output data-testid="picker-search-filter">
              {mockPickerSearchFilter}
            </output>
            <output data-testid="picker-keyboard-selection">
              {mockPickerKeyboardSelection ?? 'none'}
            </output>
            <button
              onClick={() => {
                const selectedPickerItems = [
                  { isSelected: true, recordId: 'creator-a' },
                  { isSelected: true, recordId: 'creator-b' },
                ];

                mockSetPickerItems(selectedPickerItems);
                mockSetPickerSearchFilter('creator');
                mockPickerKeyboardSelection = 'creator-a';
                onChange?.(selectedPickerItems[0]);
                onChange?.(selectedPickerItems[1]);
              }}
            >
              Select creators
            </button>
            <button
              onClick={() => {
                onSubmit?.();

                if (shouldResetStateOnClose !== false) {
                  mockSetPickerItems([]);
                  mockSetPickerSearchFilter('');
                  mockResetPickerKeyboardSelection();
                }
              }}
            >
              Submit picker
            </button>
          </>
        );
      },
    };
  },
);

jest.mock(
  '@/object-record/record-field/ui/form-types/hooks/useOpenFormMultiRecordPicker',
  () => ({
    useOpenFormMultiRecordPicker: () => ({
      openFormMultiRecordPicker: jest.fn(),
    }),
  }),
);

jest.mock('@/object-record/record-index/components/RecordIndexSurface', () => ({
  RecordIndexSurface: (props: {
    contextStoreInstanceId: string;
    embeddedSurfaceOptions?: {
      hideAddNew?: boolean;
      compactTable?: boolean;
      hidePageHeader?: boolean;
      hideQueryOnlyRecordFilters?: boolean;
      hideViewPicker?: boolean;
      hideCurrentRecordFilter?: {
        fieldMetadataId: string;
        relationTargetFieldMetadataId?: string | null;
        operand: ViewFilterOperand;
      };
      toolbarAction?: ReactNode;
    };
    hideEmptyStateSubtitle?: boolean;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onViewChange?: (viewId: string) => void;
    viewId: string;
  }) => {
    const { currentRecord } = useContext(RecordFilterValueDependenciesContext);

    return mockRecordIndexSurface({
      ...props,
      currentRecordId: currentRecord?.id,
    });
  },
}));

jest.mock('@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship', () => ({
  useApplyCreatorBulkRelationship: () => ({
    applyCreatorBulkRelationship: mockApplyCreatorBulkRelationship,
  }),
}));

const mockModalStatefulWrapper = jest.fn(
  ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
);

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: (props: { children: ReactNode }) =>
    mockModalStatefulWrapper(props),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: jest.fn(), openModal: jest.fn() }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => {
  const { useSyncExternalStore } = jest.requireActual('react');

  return {
    useAtomComponentStateValue: () =>
      useSyncExternalStore(
        (subscriber: () => void) => {
          mockPickerItemSubscribers.add(subscriber);

          return () => mockPickerItemSubscribers.delete(subscriber);
        },
        () => mockPickerItems,
      ),
  };
});

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockViews,
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: (atom: unknown) =>
    atom === multipleRecordPickerSearchFilterComponentState
      ? mockSetPickerSearchFilter
      : mockSetPickerItems,
}));

jest.mock('@/ui/layout/selectable-list/hooks/useSelectableList', () => ({
  useSelectableList: () => ({
    resetSelectedItem: mockResetPickerKeyboardSelection,
  }),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ariaLabel?: string;
    variant?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      data-variant={variant}
      onClick={onClick}
      // oxlint-disable-next-line react/jsx-props-no-spreading
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/StyledHeaderDropdownButton', () => ({
  StyledHeaderDropdownButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      data-toolbar-action="true"
      // oxlint-disable-next-line react/jsx-props-no-spreading
      {...props}
    >
      {children}
    </button>
  ),
}));
const setCampaignMetadata = () => {
  objectMetadataItems = [
    {
      id: 'campaign-creator-object',
      nameSingular: 'campaignCreator',
      fields: [
        {
          id: 'campaign-creator-campaign-field',
          name: 'campaign',
          type: FieldMetadataType.RELATION,
          relation: { targetObjectMetadata: { id: 'campaign-object' } },
        },
      ],
    },
    {
      id: 'campaign-object',
      nameSingular: 'campaign',
      fields: [{ id: 'campaign-id-field', name: 'id' }],
    },
  ];
};

describe('CampaignInfluencerIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetPickerItems([]);
    mockPickerSearchFilter = '';
    mockPickerKeyboardSelection = null;
    mockViews = [];
    setCampaignMetadata();
    mockApplyCreatorBulkRelationship.mockResolvedValue(undefined);
    (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
    });
  });

  it('uses native Campaign controls and keeps creator selection in one dialog', () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    const indexSurfaceProps = mockRecordIndexSurface.mock.calls.at(-1)?.[0];

    expect(indexSurfaceProps).toMatchObject({
      contextStoreInstanceId: 'campaign-influencers-campaign-a',
      objectNameSingular: 'campaignCreator',
      viewId: campaignInfluencersViewId,
      hideEmptyStateSubtitle: true,
      initialQueryOnlyRecordFilters: [
        {
          id: 'a03b0867-2a0d-49ee-afd3-8a91de66462e',
          fieldMetadataId: 'campaign-creator-campaign-field',
          relationTargetFieldMetadataId: 'campaign-id-field',
          type: 'RELATION',
          operand: ViewFilterOperand.IS,
          value: 'campaign-a',
          displayValue: '',
          label: 'Campaign influencers',
          subFieldName: null,
        },
      ],
      embeddedSurfaceOptions: {
        hideAddNew: true,
        compactTable: true,
        hidePageHeader: true,
        hideQueryOnlyRecordFilters: true,
        hideViewPicker: true,
        hideCurrentRecordFilter: {
          fieldMetadataId: 'campaign-creator-campaign-field',
          relationTargetFieldMetadataId: null,
          operand: ViewFilterOperand.IS,
        },
      },
    });
    expect(indexSurfaceProps).not.toHaveProperty('headerActionButton');
    expect(indexSurfaceProps).not.toHaveProperty('headerTitle');

    expect(
      screen.getByRole('button', { name: 'Add Influencers' }),
    ).toHaveAttribute('data-toolbar-action', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('provides the open Campaign to the source-controlled current-record filter', () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(screen.getByTestId('current-record-id')).toHaveTextContent(
      'campaign-a',
    );
  });

  it('changes only the scoped Campaign view when its native picker selects a view', () => {
    const parentUrl = window.location.href;

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0].onViewChange).toEqual(
      expect.any(Function),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch Campaign view' }),
    );
    const indexSurfaceProps = mockRecordIndexSurface.mock.calls.at(-1)?.[0];

    if (!indexSurfaceProps) {
      throw new Error('RecordIndexSurface was not rendered');
    }

    expect(indexSurfaceProps).toMatchObject({
      contextStoreInstanceId: 'campaign-influencers-campaign-a',
      viewId: 'campaign-secondary-view',
    });
    expect(indexSurfaceProps.indexIdentifierUrl).toEqual(expect.any(Function));
    expect(indexSurfaceProps.indexIdentifierUrl('campaign-creator-a')).toBe(
      '/object/campaignCreator/campaign-creator-a?viewId=campaign-secondary-view',
    );
    expect(window.location.href).toBe(parentUrl);
  });

  it('hides Direct addition when Campaign updates are forbidden', () => {
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (objectMetadataId: string) =>
        objectMetadataId === 'campaign-object'
          ? { canUpdateObjectRecords: false }
          : { canReadObjectRecords: true },
    );

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(screen.getByTestId('record-index-surface')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add Influencers' }),
    ).not.toBeInTheDocument();
  });

  it('resolves the source-controlled Campaign Influencers view when widget metadata is stale', () => {
    mockViews = [
      {
        id: 'campaign-influencers-runtime-view',
        universalIdentifier: campaignInfluencersUniversalIdentifier,
        objectMetadataId: 'campaign-creator-object',
        type: ViewType.TABLE_WIDGET,
        isActive: true,
      },
    ];

    render(<CampaignInfluencerIndex campaignId="campaign-a" viewId={null} />);

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      objectNameSingular: 'campaignCreator',
      viewId: 'campaign-influencers-runtime-view',
    });
    expect(
      screen.queryByText('Campaign Influencers are unavailable.'),
    ).not.toBeInTheDocument();
  });

  it('prefers a persisted widget view ID over the source-controlled fallback', () => {
    mockViews = [
      {
        id: 'campaign-influencers-runtime-view',
        universalIdentifier: campaignInfluencersUniversalIdentifier,
        objectMetadataId: 'campaign-creator-object',
        type: ViewType.TABLE_WIDGET,
        isActive: true,
      },
    ];

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      viewId: campaignInfluencersViewId,
    });
  });

  it('renders an unavailable state instead of mounting an index without a view ID', () => {
    render(<CampaignInfluencerIndex campaignId="campaign-a" viewId={null} />);

    expect(
      screen.getByText('Campaign Influencers are unavailable.'),
    ).toBeVisible();
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
    expect(mockRecordIndexSurface).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'CampaignCreator metadata is unavailable',
      setup: () => {
        objectMetadataItems = [];
      },
      message: 'Campaign Influencers are unavailable.',
    },
    {
      description: 'CampaignCreator records are not readable',
      setup: () => {
        (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
          canReadObjectRecords: false,
        });
      },
      message: 'You do not have permission to view Campaign Influencers.',
    },
  ])('renders a bounded state when $description', ({ setup, message }) => {
    setup();

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(screen.getByText(message)).toBeVisible();
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
  });

  it('creates Direct CampaignCreator rows from the native Creator multi-select', async () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
      creatorIdsToAdd: ['creator-a', 'creator-b'],
    });
  });

  it('resets picker state when explicit close is followed by reopen', () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('2');
    expect(screen.getByTestId('picker-search-filter')).toHaveTextContent(
      'creator',
    );
    expect(screen.getByTestId('picker-keyboard-selection')).toHaveTextContent(
      'creator-a',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit picker' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('0');
    expect(screen.getByTestId('picker-search-filter')).toBeEmptyDOMElement();
    expect(screen.getByTestId('picker-keyboard-selection')).toHaveTextContent(
      'none',
    );
  });

  it('keeps direct-add bounded and retryable when the guarded mutation fails', async () => {
    mockApplyCreatorBulkRelationship.mockRejectedValueOnce(
      new Error('direct add failed'),
    );

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });

    expect(screen.getByText('Unable to add influencers.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeVisible();
  });

  it('retains visible picker selection after a pending direct add fails', async () => {
    const deferredAdd = createDeferred();
    mockApplyCreatorBulkRelationship
      .mockImplementationOnce(() => deferredAdd.promise)
      .mockResolvedValueOnce(undefined);

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('2');
    expect(screen.getByTestId('picker-search-filter')).toHaveTextContent(
      'creator',
    );
    expect(screen.getByTestId('picker-keyboard-selection')).toHaveTextContent(
      'creator-a',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    );
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Submit picker' }));
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('2');
    expect(screen.getByTestId('picker-search-filter')).toHaveTextContent(
      'creator',
    );
    expect(screen.getByTestId('picker-keyboard-selection')).toHaveTextContent(
      'creator-a',
    );

    await act(async () => {
      deferredAdd.reject(new Error('direct add failed'));
      await deferredAdd.promise.catch(() => undefined);
    });

    expect(screen.getByText('Unable to add influencers.')).toBeVisible();
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('2');
    expect(screen.getByTestId('picker-search-filter')).toHaveTextContent(
      'creator',
    );
    expect(screen.getByTestId('picker-keyboard-selection')).toHaveTextContent(
      'creator-a',
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenLastCalledWith({
      target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
      creatorIdsToAdd: ['creator-a', 'creator-b'],
    });
  });
});
