import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
} from '@testing-library/react';
import { type ReactNode, useContext } from 'react';
import { createStore, Provider } from 'jotai';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { focusStackState } from '@/ui/utilities/focus/states/focusStackState';

import { CampaignInfluencerIndex } from '@/myah/creator-crm/components/CampaignInfluencerIndex';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordFilterValueDependenciesContext } from '@/object-record/record-filter/contexts/RecordFilterValueDependenciesContext';
import { multipleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchFilterComponentState';
import {
  FieldMetadataType,
  ViewFilterOperand,
  ViewType,
} from 'twenty-shared/types';
// Existing scenarios exercise the unchanged native table; new scenarios exercise the default.
const render = (ui: ReactNode) => {
  const result = rtlRender(ui);
  const advanced = screen.queryByRole('button', { name: 'Advanced table' });
  if (advanced) fireEvent.click(advanced);
  return result;
};

jest.mock(
  '@/myah/creator-crm/components/CampaignInfluencerReferenceList',
  () => ({
    CampaignInfluencerReferenceList: ({
      campaignId,
    }: {
      campaignId: string;
    }) => (
      <div data-testid="reference-list">
        Reference audience for {campaignId}
      </div>
    ),
  }),
);

const campaignInfluencersViewId = 'campaign-influencers-view';
const campaignInfluencersUniversalIdentifier =
  'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b';

const mockApplyCreatorBulkRelationship = jest.fn();
let mockPreviewOverrides: {
  linkedCreatorIds?: string[];
  unlinkedCreatorIds?: string[];
  loading?: boolean;
  isPreviewUnavailable?: boolean;
  canRetry?: boolean;
} = {};
const mockRetryPreview = jest.fn();
const mockUseCreatorBulkRelationshipPreview = jest.fn(
  ({ selectedCreatorIds }: { selectedCreatorIds: string[] }) => ({
    selectedCreatorIds,
    linkedCreatorIds: mockPreviewOverrides.linkedCreatorIds ?? [],
    unlinkedCreatorIds:
      mockPreviewOverrides.unlinkedCreatorIds ?? selectedCreatorIds,
    loading: mockPreviewOverrides.loading ?? false,
    isPreviewUnavailable: mockPreviewOverrides.isPreviewUnavailable ?? false,
    canRetry: mockPreviewOverrides.canRetry ?? false,
    retryPreview: mockRetryPreview,
  }),
);
let mockUseRealModalHook = false;
let mockIsMobile = false;
let mockIsInSidePanel = false;

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({ isInSidePanel: mockIsInSidePanel }),
}));

jest.mock('twenty-ui/utilities', () => ({
  useIsMobile: () => mockIsMobile,
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
jest.mock('@/page-layout/components/MyahCampaignAudienceControls', () => ({
  MyahCampaignAudienceControls: ({
    campaignId,
    canManage,
    canAttach,
  }: {
    campaignId: string;
    canManage: boolean;
    canAttach: boolean;
  }) => (
    <div data-testid="mobile-saved-lists">
      Saved lists for {campaignId} · {canManage ? 'editable' : 'read-only'} ·{' '}
      {canAttach ? 'attachable' : 'not attachable'}
    </div>
  ),
}));
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
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const mockRecordIndexSurface = jest.fn(
  ({
    contextStoreInstanceId,
    currentRecordId,
    embeddedSurfaceOptions,
    initialQueryOnlyRecordFilters,
    onViewChange,
    onOpenRecordFromIndexView,
    viewId,
  }: {
    onOpenRecordFromIndexView?: (request: {
      recordId: string;
      source: 'table-identifier-action';
      activationElement?: HTMLElement;
    }) => void;
    shouldPreserveParentViewStateOnOpen?: boolean;
    openFirstColumnRelationInIndex?: boolean;
    contextStoreInstanceId: string;
    currentRecordId?: string;
    embeddedSurfaceOptions?: {
      hideAddNew?: boolean;
      compactTable?: boolean;
      hidePageHeader?: boolean;
      showInformationBanner?: boolean;
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
      <button
        onClick={(event) =>
          onOpenRecordFromIndexView?.({
            recordId: 'membership-a',
            source: 'table-identifier-action',
            activationElement: event.currentTarget,
          })
        }
      >
        Open membership
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
    onOpenRecordFromIndexView?: (request: {
      recordId: string;
      source: 'table-identifier-action';
      activationElement?: HTMLElement;
    }) => void;
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
jest.mock('@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview', () => ({
  useCreatorBulkRelationshipPreview: (options: {
    target: { kind: string; id: string; label: string };
    selectedCreatorIds: string[];
  }) => mockUseCreatorBulkRelationshipPreview(options),
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
  useModal: () =>
    mockUseRealModalHook
      ? jest.requireActual('@/ui/layout/modal/hooks/useModal').useModal()
      : { closeModal: jest.fn(), openModal: jest.fn() },
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
    { id: 'creator-list-object', nameSingular: 'creatorList', fields: [] },
  ];
};

describe('CampaignInfluencerIndex', () => {
  it('defaults to the reference list and retains the complete native table behind the toggle', () => {
    const view = rtlRender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getByTestId('reference-list')).toHaveTextContent(
      'campaign-a',
    );
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
    const referenceNode = screen.getByTestId('reference-list');
    fireEvent.click(screen.getByRole('button', { name: 'Advanced table' }));
    const advancedNode = screen.getByTestId('record-index-surface');
    expect(advancedNode).toBeVisible();
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      viewId: campaignInfluencersViewId,
      initialQueryOnlyRecordFilters: [
        expect.objectContaining({ value: 'campaign-a' }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reference list' }));
    expect(screen.getByTestId('reference-list')).toBe(referenceNode);
    expect(referenceNode).toBeVisible();
    expect(screen.getByTestId('record-index-surface')).toBe(advancedNode);
    expect(advancedNode).not.toBeVisible();
    view.unmount();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetPickerItems([]);
    mockPickerSearchFilter = '';
    mockPickerKeyboardSelection = null;
    mockViews = [];
    mockIsMobile = false;
    mockIsInSidePanel = false;
    mockUseRealModalHook = false;
    mockPreviewOverrides = {};
    setCampaignMetadata();
    mockApplyCreatorBulkRelationship.mockResolvedValue(undefined);
    (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
    });
  });

  it('offers one saved-list control on desktop, mobile and side panel when writable', () => {
    const { rerender } = render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getAllByTestId('mobile-saved-lists')).toHaveLength(1);
    expect(screen.getByTestId('mobile-saved-lists')).toHaveTextContent(
      'editable · attachable',
    );
    mockIsInSidePanel = true;
    rerender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getAllByTestId('mobile-saved-lists')).toHaveLength(1);
    mockIsInSidePanel = false;
    mockIsMobile = true;
    rerender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getByTestId('mobile-saved-lists')).toHaveTextContent(
      'campaign-a',
    );
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (objectMetadataId: string) =>
        objectMetadataId === 'campaign-object'
          ? { canReadObjectRecords: true, canUpdateObjectRecords: false }
          : { canReadObjectRecords: true },
    );
    rerender(
      <CampaignInfluencerIndex
        key="campaign-b"
        campaignId="campaign-b"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getByTestId('mobile-saved-lists')).toHaveTextContent(
      'campaign-b · read-only',
    );
    expect(
      screen.queryByRole('button', { name: 'Add Influencers' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer attaching a List without Creator List update permission, while keeping other audience actions', () => {
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (objectMetadataId: string) => ({
        canReadObjectRecords: true,
        canUpdateObjectRecords: objectMetadataId !== 'creator-list-object',
      }),
    );
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getByTestId('mobile-saved-lists')).toHaveTextContent(
      'editable · not attachable',
    );
    expect(
      screen.getByRole('button', { name: 'Add Influencers' }),
    ).toBeInTheDocument();
  });

  it('links from membership stage to the existing separately paged campaign activity tab without reading activity into rows', () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
        activityTabId="home-tab-a"
      />,
    );
    expect(
      screen.getByRole('link', { name: 'View Creator activity' }),
    ).toHaveAttribute('href', '/object/campaign/campaign-a#home-tab-a');
    expect(screen.getByText(/Recorded stage is not outreach/)).toBeVisible();
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      objectNameSingular: 'campaignCreator',
      initialQueryOnlyRecordFilters: [
        expect.objectContaining({ value: 'campaign-a' }),
      ],
    });
  });

  it('does not offer an activity link when the native destination is unavailable or campaign read is denied', () => {
    const { rerender } = render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(
      screen.queryByRole('link', { name: 'View Creator activity' }),
    ).not.toBeInTheDocument();
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (id: string) => ({
        canReadObjectRecords: id !== 'campaign-object',
        canUpdateObjectRecords: true,
      }),
    );
    rerender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
        activityTabId="home-tab-a"
      />,
    );
    expect(
      screen.queryByRole('link', { name: 'View Creator activity' }),
    ).not.toBeInTheDocument();
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
        showInformationBanner: false,
        hideQueryOnlyRecordFilters: true,
        hideViewPicker: true,
        hideCurrentRecordFilter: {
          fieldMetadataId: 'campaign-creator-campaign-field',
          relationTargetFieldMetadataId: null,
          operand: ViewFilterOperand.IS,
        },
      },
    });
    expect(indexSurfaceProps).not.toHaveProperty('headerTitle');

    expect(
      screen.getByRole('button', { name: 'Add Influencers' }),
    ).toHaveAttribute('data-toolbar-action', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Selecting an existing list-sourced member marks them as directly added, so they remain after the list is detached.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('hands membership opens to the campaign host without replacing the native list', () => {
    const onOpenCreatorContext = jest.fn();
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
        onOpenCreatorContext={onOpenCreatorContext}
      />,
    );
    const invoker = screen.getByRole('button', { name: 'Open membership' });
    fireEvent.click(invoker);
    expect(onOpenCreatorContext).toHaveBeenCalledWith({
      recordId: 'membership-a',
      source: 'table-identifier-action',
      activationElement: invoker,
    });
    expect(
      mockRecordIndexSurface.mock.calls.at(-1)?.[0]
        .openFirstColumnRelationInIndex,
    ).toBe(true);
    expect(
      mockRecordIndexSurface.mock.calls.at(-1)?.[0]
        .shouldPreserveParentViewStateOnOpen,
    ).toBeUndefined();
    expect(screen.getByTestId('record-index-surface')).toBe(
      invoker.parentElement,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
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

  it('uses native modal Escape and focus handling for the inline picker', () => {
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));

    const modalProps = mockModalStatefulWrapper.mock.calls.at(-1)?.[0] as
      | { modal?: boolean; finalFocus?: () => HTMLElement | false }
      | undefined;
    expect(modalProps).toMatchObject({
      modal: true,
      isClosable: true,
      shouldCloseModalOnClickOutsideOrEscape: true,
    });
    expect(modalProps?.finalFocus?.()).toBe(
      screen.getByRole('button', { name: 'Add Influencers' }),
    );
    const cancel = screen.getByRole('button', { name: 'Cancel addition' });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps attached source inspection when Campaign update is forbidden but hides Direct addition', () => {
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (objectMetadataId: string) =>
        objectMetadataId === 'campaign-object'
          ? { canReadObjectRecords: true, canUpdateObjectRecords: false }
          : { canReadObjectRecords: true },
    );

    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    expect(screen.getByTestId('record-index-surface')).toBeVisible();
    expect(screen.getByTestId('mobile-saved-lists')).toHaveTextContent(
      'read-only',
    );
    expect(
      screen.queryByRole('button', { name: 'Add Influencers' }),
    ).not.toBeInTheDocument();
  });

  it('hides the cached Campaign audience and closes its native add modal when parent read access is revoked', () => {
    mockUseRealModalHook = true;
    const store = createStore();
    const { rerender } = render(
      <Provider store={store}>
        <CampaignInfluencerIndex
          campaignId="campaign-a"
          viewId={campaignInfluencersViewId}
        />
      </Provider>,
    );
    expect(screen.getByTestId('record-index-surface')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    const modalId = 'campaign-influencers-add-campaign-a';
    expect(
      store.get(
        isModalOpenedComponentState.atomFamily({ instanceId: modalId }),
      ),
    ).toBe(true);

    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (objectMetadataId: string) =>
        objectMetadataId === 'campaign-object'
          ? { canReadObjectRecords: false, canUpdateObjectRecords: true }
          : { canReadObjectRecords: true, canUpdateObjectRecords: true },
    );
    rerender(
      <Provider store={store}>
        <CampaignInfluencerIndex
          campaignId="campaign-a"
          viewId={campaignInfluencersViewId}
        />
      </Provider>,
    );
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Influencers' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'You do not have permission to view Campaign Influencers.',
      ),
    ).toBeVisible();
    expect(screen.queryByTestId('mobile-saved-lists')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      store.get(
        isModalOpenedComponentState.atomFamily({ instanceId: modalId }),
      ),
    ).toBe(false);
    expect(
      store
        .get(focusStackState.atom)
        .some(({ focusId }) => focusId === modalId),
    ).toBe(false);
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
    expect(screen.getAllByTestId('mobile-saved-lists')).toHaveLength(1);
  });

  it('omits saved-list controls when Creator List metadata or read access is absent', () => {
    objectMetadataItems = objectMetadataItems.filter(
      (item) => item.nameSingular !== 'creatorList',
    );
    const view = render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.queryByTestId('mobile-saved-lists')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-index-surface')).toBeInTheDocument();
    setCampaignMetadata();
    (useObjectPermissionsForObject as jest.Mock).mockImplementation(
      (id: string) =>
        id === 'creator-list-object'
          ? { canReadObjectRecords: false }
          : { canReadObjectRecords: true, canUpdateObjectRecords: true },
    );
    view.rerender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.queryByTestId('mobile-saved-lists')).not.toBeInTheDocument();
  });

  it('keeps saved-list controls when table relation metadata is missing', () => {
    setCampaignMetadata();
    objectMetadataItems[0].fields = [];
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(
      screen.getByText('Campaign Influencers are unavailable.'),
    ).toBeVisible();
    expect(screen.getAllByTestId('mobile-saved-lists')).toHaveLength(1);
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();
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

  it('cleans an open direct-add modal, selection and focus on A-B-A navigation', () => {
    mockUseRealModalHook = true;
    const store = createStore();
    const renderIndex = (campaignId: string) => (
      <Provider store={store}>
        <CampaignInfluencerIndex
          key={campaignId}
          campaignId={campaignId}
          viewId={campaignInfluencersViewId}
        />
      </Provider>
    );
    const { rerender } = render(renderIndex('campaign-a'));
    const modalA = 'campaign-influencers-add-campaign-a';
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    expect(
      store.get(isModalOpenedComponentState.atomFamily({ instanceId: modalA })),
    ).toBe(true);
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('2');
    rerender(renderIndex('campaign-b'));
    expect(
      store.get(isModalOpenedComponentState.atomFamily({ instanceId: modalA })),
    ).toBe(false);
    expect(
      store.get(focusStackState.atom).some(({ focusId }) => focusId === modalA),
    ).toBe(false);
    rerender(renderIndex('campaign-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    expect(screen.getByTestId('picker-selection-count')).toHaveTextContent('0');
  });

  it('does not close a new A picker when an old A direct addition settles', async () => {
    mockUseRealModalHook = true;
    const deferred = createDeferred();
    mockApplyCreatorBulkRelationship.mockImplementationOnce(
      () => deferred.promise,
    );
    const store = createStore();
    const renderIndex = (campaignId: string) => (
      <Provider store={store}>
        <CampaignInfluencerIndex
          key={campaignId}
          campaignId={campaignId}
          viewId={campaignInfluencersViewId}
        />
      </Provider>
    );
    const { rerender } = render(renderIndex('campaign-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    );
    rerender(renderIndex('campaign-b'));
    rerender(renderIndex('campaign-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    await act(async () => {
      deferred.resolve();
    });
    expect(
      store.get(
        isModalOpenedComponentState.atomFamily({
          instanceId: 'campaign-influencers-add-campaign-a',
        }),
      ),
    ).toBe(true);
    expect(screen.getByRole('dialog')).toBeVisible();
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

  it('shows authoritative existing-membership feedback and adds only unlinked Creators', async () => {
    mockPreviewOverrides = {
      linkedCreatorIds: ['creator-a'],
      unlinkedCreatorIds: ['creator-b'],
    };
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    expect(mockUseCreatorBulkRelationshipPreview).toHaveBeenCalledWith({
      target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
      selectedCreatorIds: ['creator-a', 'creator-b'],
    });
    expect(
      screen.getByRole('status', { name: 'Membership review' }),
    ).toHaveTextContent('1 already directly added · 1 will be directly added');
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });
    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
      creatorIdsToAdd: ['creator-b'],
    });
  });

  it('explains that an existing list-sourced membership can be directly added', async () => {
    mockPreviewOverrides = {
      linkedCreatorIds: [],
      unlinkedCreatorIds: ['creator-b'],
    };
    render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    act(() =>
      mockSetPickerItems([{ isSelected: true, recordId: 'creator-b' }]),
    );

    expect(
      screen.getByRole('status', { name: 'Membership review' }),
    ).toHaveTextContent('0 already directly added · 1 will be directly added');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Selecting an existing list-sourced member marks them as directly added',
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Add selected influencers' }),
      );
    });
    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
      creatorIdsToAdd: ['creator-b'],
    });
  });

  it('does not repeat an already-direct Creator addition or guess through an unavailable preview', () => {
    mockPreviewOverrides = {
      linkedCreatorIds: ['creator-a', 'creator-b'],
      unlinkedCreatorIds: [],
    };
    const { rerender } = render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));

    expect(
      screen.getByRole('status', { name: 'Membership review' }),
    ).toHaveTextContent('2 already directly added · No changes will be made.');
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeDisabled();
    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();

    mockPreviewOverrides = { isPreviewUnavailable: true };
    rerender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(
      screen.getByRole('status', { name: 'Membership review' }),
    ).toHaveTextContent('Unable to verify existing memberships.');
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeDisabled();
    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
  });

  it('lets an unavailable membership preview be retried without adding or leaving the Campaign', () => {
    mockPreviewOverrides = { isPreviewUnavailable: true, canRetry: true };
    const { rerender } = render(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit picker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Influencers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select creators' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(mockRetryPreview).toHaveBeenCalledTimes(1);
    expect(mockApplyCreatorBulkRelationship).not.toHaveBeenCalled();
    mockPreviewOverrides = {};
    rerender(
      <CampaignInfluencerIndex
        campaignId="campaign-a"
        viewId={campaignInfluencersViewId}
      />,
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add selected influencers' }),
    ).toBeEnabled();
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
