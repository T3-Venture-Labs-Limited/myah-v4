import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider, useAtomValue, useStore } from 'jotai';
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import gql from 'graphql-tag';
import { useState, useSyncExternalStore } from 'react';
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';

import { MyahCampaignPageContent } from '@/myah/campaign/components/MyahCampaignPageContent';
import { MyahCampaignPage } from '@/myah/campaign/components/MyahCampaignPage';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreTargetedRecordsRuleComponentState } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { SidePanelForDesktop } from '@/side-panel/components/SidePanelForDesktop';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { useIsInSidePanelOrThrow } from '@/ui/layout/side-panel/contexts/SidePanelContext';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';

const mockPermission = jest.fn();
const mockCollapseNavigation = jest.fn();
let mockIsMobile = false;
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomState', () => ({
  useSetAtomState: () => mockCollapseNavigation,
}));
const mockUpdateOneRecord = jest.fn();
let mockUseRealAgent = false;
let mockConfirmationOpen: (() => void) | undefined;
let mockConfirmationClose: (() => void) | undefined;
const guidanceFieldNames = [
  'campaignBrief',
  'communicationGuidelines',
  'replyRules',
  'escalationBoundaries',
  'additionalNotes',
];
const campaignMetadata = {
  id: 'metadata',
  nameSingular: 'campaign',
  fields: guidanceFieldNames.map((name) => ({
    id: name,
    name,
    label: name,
    description: '',
    isUIEditable: true,
  })),
};
const mockFieldsViewId = jest.fn();
const mockOpenSidePanelMenu = jest.fn();
const campaignQuery = gql`
  query CampaignRecord($objectRecordId: ID!) {
    campaign(id: $objectRecordId) {
      id
      __typename
      name
    }
  }
`;
let mockApolloClient: ApolloClient | undefined;
let mockUseApolloRecord = false;
const mockRecordSubscribers = new Set<() => void>();
const mockActiveSubscriptions = new Set<string>();
const mockChangeQueryIdListenState = jest.fn(
  (shouldListen: boolean, queryId: string) => {
    if (shouldListen) mockActiveSubscriptions.add(queryId);
    else mockActiveSubscriptions.delete(queryId);
  },
);
const mockServerRecords = new Map<
  string,
  { id: string; __typename: string; name: string; [key: string]: unknown }
>();
const mockPublishCampaignChange = (campaignId: string, name: string) => {
  if (!mockActiveSubscriptions.has(`record-show-campaign-${campaignId}`))
    throw new Error(`No Campaign subscription for ${campaignId}`);
  mockServerRecords.set(campaignId, {
    id: campaignId,
    __typename: 'Campaign',
    name,
  });
  if (mockUseApolloRecord) {
    mockApolloClient?.writeQuery({
      query: campaignQuery,
      variables: { objectRecordId: campaignId },
      data: { campaign: mockServerRecords.get(campaignId) },
    });
  } else {
    mockRecordSubscribers.forEach((subscriber) => subscriber());
  }
};
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});
afterEach(() => {
  mockUseApolloRecord = false;
  mockApolloClient = undefined;
  mockUseRealAgent = false;
  mockIsMobile = false;
  mockCollapseNavigation.mockClear();
});
let mockViews: Array<{
  id: string;
  universalIdentifier: string;
  objectMetadataId: string;
  type: string;
  isActive: boolean;
}> = [];
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (atom: { atom?: unknown }) => {
    const isOpened = useAtomValue(isSidePanelOpenedState.atom);
    return atom === viewsSelector
      ? mockViews
      : atom === sidePanelNavigationStackState
        ? []
        : atom === isSidePanelOpenedState
          ? isOpened
          : false;
  },
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem:
      objectNameSingular === 'attachment'
        ? { id: 'attachment', fields: [] }
        : campaignMetadata,
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => mockPermission(),
}));
jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({
    header,
    children,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {header}
      {children}
    </>
  ),
}));
jest.mock('~/pages/object-record/RecordShowPageHeader', () => ({
  RecordShowPageHeader: ({
    children,
    compactOnMobile,
  }: {
    children: React.ReactNode;
    compactOnMobile?: boolean;
  }) => (
    <header data-testid="record-header" data-compact={compactOnMobile}>
      {children}
    </header>
  ),
}));
jest.mock('~/pages/object-record/RecordShowPageTitle', () => ({
  RecordShowPageTitle: () => null,
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloClient,
}));
jest.mock('@/object-record/hooks/useFindOneRecordQuery', () => ({
  useFindOneRecordQuery: () => ({ findOneRecordQuery: campaignQuery }),
}));
jest.mock(
  '@/object-record/graphql/record-gql-fields/hooks/useGenerateDepthRecordGqlFieldsFromObject',
  () => ({
    useGenerateDepthRecordGqlFieldsFromObject: () => ({
      recordGqlFields: { id: true, name: true },
    }),
  }),
);
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (options: { objectRecordId: string }) => {
    const record = useSyncExternalStore(
      (subscriber: () => void) => {
        mockRecordSubscribers.add(subscriber);
        return () => {
          mockRecordSubscribers.delete(subscriber);
        };
      },
      () => mockServerRecords.get(options.objectRecordId),
    );
    return mockUseApolloRecord
      ? jest
          .requireActual('@/object-record/hooks/useFindOneRecord')
          .useFindOneRecord(options)
      : { record, loading: false };
  },
}));
jest.mock(
  '@/object-record/record-show/graphql/operations/factories/findOneRecordForShowPageOperationSignatureFactory',
  () => ({
    buildFindOneRecordForShowPageOperationSignature: () => ({
      fields: { id: true, name: true },
    }),
  }),
);
jest.mock('@/sse-db-event/hooks/useChangeQueryListenState', () => ({
  useChangeQueryListenState: () => ({
    changeQueryIdListenState: mockChangeQueryIdListenState,
  }),
}));
jest.mock('@/object-record/record-show/components/SummaryCard', () => ({
  SummaryCard: ({ objectRecordId }: { objectRecordId: string }) => {
    const record = useAtomValue(
      recordStoreFamilyState.atomFamily(objectRecordId),
    );
    return (
      <div>
        Campaign summary{' '}
        <span data-testid="live-campaign-name">
          {record?.name as string | undefined}
        </span>
      </div>
    );
  },
}));
jest.mock('@/command-menu-item/components/RecordShowCommandMenu', () => ({
  RecordShowCommandMenu: () => null,
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => {
    const store = useStore();
    return {
      openSidePanelMenu: () => {
        mockOpenSidePanelMenu();
        store.set(isSidePanelOpenedState.atom, true);
      },
      closeSidePanelMenu: jest.fn(),
    };
  },
}));
jest.mock('@/navigation/hooks/useNavigationDrawerExpanded', () => ({
  useNavigationDrawerExpanded: () => false,
}));
jest.mock('@/side-panel/components/SidePanelWidthEffect', () => ({
  SidePanelWidthEffect: () => null,
}));
jest.mock('@/ui/layout/resizable-panel/components/ResizablePanelGap', () => ({
  ResizablePanelGap: () => null,
}));
jest.mock(
  '@/side-panel/hooks/useSidePanelCloseAnimationCompleteCleanup',
  () => ({
    useSidePanelCloseAnimationCompleteCleanup: () => ({
      sidePanelCloseAnimationCompleteCleanup: jest.fn(),
    }),
  }),
);
jest.mock('@/side-panel/components/SidePanelRouter', () => ({
  SidePanelRouter: () => (
    <div data-testid="side-panel-router">Command menu host</div>
  ),
}));
jest.mock('@/page-layout/components/MyahCampaignExecutionControls', () => ({
  MyahCampaignExecutionControls: () => <button>Start Campaign</button>,
}));
jest.mock('@/page-layout/components/MyahCampaignHome', () => ({
  MyahCampaignHome: () => <div>Readiness and activity</div>,
}));
jest.mock('@/page-layout/components/MyahCampaignAudienceControls', () => ({
  MyahCampaignAudienceControls: () => <div>Audience controls</div>,
}));
jest.mock('@/myah/creator-crm/components/CampaignInfluencerIndex', () => ({
  CampaignInfluencerIndex: () => <div>Campaign influencers</div>,
}));
jest.mock('@/myah-outreach/components/CampaignOutreachTab', () => ({
  CampaignOutreachTab: () => <div>Shipping workflow editor</div>,
}));
jest.mock('@/page-layout/components/MyahCampaignAgent', () => ({
  MyahCampaignAgent: (props: { campaignId: string; title: string }) => {
    if (!mockUseRealAgent) return <div>Agent guidance</div>;
    const Agent = jest.requireActual(
      '@/page-layout/components/MyahCampaignAgent',
    ).MyahCampaignAgent;
    return <Agent campaignId={props.campaignId} title={props.title} />;
  },
}));
jest.mock('@/page-layout/components/MyahCampaignOperations', () => ({
  MyahCampaignOperations: ({ dedicatedPage }: { dedicatedPage?: boolean }) => (
    <div data-dedicated-page={dedicatedPage}>Accounts and signature</div>
  ),
}));
jest.mock('@/activities/tasks/components/TaskGroups', () => ({
  TaskGroups: ({
    targetableObject,
  }: {
    targetableObject: { id: string; targetObjectNameSingular: string };
  }) => {
    const { isInSidePanel } = useIsInSidePanelOrThrow();

    return (
      <div>{`Tasks for ${targetableObject.targetObjectNameSingular}:${targetableObject.id} (${isInSidePanel ? 'panel' : 'page'})`}</div>
    );
  },
}));
jest.mock('@/activities/notes/hooks/useNotes', () => ({
  useNotes: () => ({ notes: [], loading: false, hasNextPage: false }),
}));
jest.mock('@/activities/hooks/useOpenCreateActivityDrawer', () => ({
  useOpenCreateActivityDrawer: () => jest.fn(),
}));
jest.mock(
  '@/page-layout/widgets/fields/hooks/useFieldsWidgetGroupsForDisplay',
  () => ({
    useFieldsWidgetGroupsForDisplay: ({
      viewId,
    }: {
      viewId: string | null;
    }) => ({
      viewId: mockFieldsViewId(viewId),
      groups: [
        {
          id: 'details',
          name: 'Campaign details',
          fields: [
            {
              fieldMetadataItem: { name: 'objective', id: 'objective-id' },
              globalIndex: 0,
            },
          ],
        },
      ],
      displayMode: 'inline',
    }),
  }),
);
jest.mock(
  '@/page-layout/widgets/fields/hooks/useFieldsWidgetHiddenFieldsForDisplay',
  () => ({
    useFieldsWidgetHiddenFieldsForDisplay: () => ({ hiddenFields: [] }),
  }),
);
jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({
    objectPermissionsByObjectMetadataId: {
      metadata: {
        objectMetadataId: 'metadata',
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        restrictedFields: { campaignBrief: { canUpdate: false } },
      },
    },
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [campaignMetadata] }),
}));
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerActions',
  () => ({
    useRecordShowContainerActions: () => ({
      useUpdateOneObjectRecordMutation: jest.fn(),
    }),
  }),
);
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerData',
  () => ({
    useRecordShowContainerData: () => ({ recordLoading: false }),
  }),
);
jest.mock('@/object-record/read-only/hooks/useIsRecordReadOnly', () => ({
  useIsRecordReadOnly: () => false,
}));
jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetFieldItem',
  () => ({
    FieldsWidgetFieldItem: ({
      fieldMetadataItem,
      recordId,
    }: {
      fieldMetadataItem: { name: string };
      recordId: string;
    }) => {
      const isInEditMode = useIsPageLayoutInEditMode();

      return (
        <div>{`${fieldMetadataItem.name} for ${recordId} (${isInEditMode ? 'editing' : 'viewing'})`}</div>
      );
    },
  }),
);
jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetCellHoveredPortal',
  () => ({
    FieldsWidgetCellHoveredPortal: () => null,
  }),
);
jest.mock(
  '@/page-layout/widgets/fields/components/FieldsWidgetCellEditModePortal',
  () => ({
    FieldsWidgetCellEditModePortal: () => null,
  }),
);

// Keep the real rich-text editor and field permission hook; only the heavyweight
// BlockNote renderer and external data providers are replaced with local doubles.
jest.mock('@/object-metadata/hooks/useObjectMetadataItemById', () => ({
  useObjectMetadataItemById: () => ({ objectMetadataItem: campaignMetadata }),
}));
jest.mock(
  '@/object-metadata/hooks/useGetIsMetadataItemFromStandardApplication',
  () => ({
    useGetIsMetadataItemFromStandardApplication: () => () => false,
  }),
);
jest.mock(
  '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition',
  () => ({
    formatFieldMetadataItemAsFieldDefinition: () => undefined,
  }),
);
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({ records: [] }),
}));
jest.mock('@/blocknote-editor/blocks/Schema', () => ({ BLOCK_SCHEMA: {} }));
jest.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => ({
    document: [{ content: 'draft', type: 'paragraph' }],
    domElement: { blur: jest.fn() },
  }),
}));
jest.mock('@/blocknote-editor/components/BlockEditor', () => ({
  BlockEditor: ({
    onChange,
    readonly,
  }: {
    onChange: () => void;
    readonly: boolean;
  }) => (
    <button type="button" disabled={readonly} onClick={onChange}>
      {readonly ? 'Restricted guidance' : 'Edit guidance'}
    </button>
  ),
}));
jest.mock('@/blocknote-editor/hooks/useAttachmentSync', () => ({
  useAttachmentSync: () => ({ syncAttachments: jest.fn() }),
}));
jest.mock('@/blocknote-editor/hooks/useReplaceBlockEditorContent', () => ({
  useReplaceBlockEditorContent: () => ({
    replaceBlockEditorContent: jest.fn(),
  }),
}));
jest.mock('@/blocknote-editor/utils/parseInitialBlocknote', () => ({
  parseInitialBlocknote: () => undefined,
}));
jest.mock('@/activities/files/hooks/useUploadAttachmentFile', () => ({
  useUploadAttachmentFile: () => ({ uploadAttachmentFile: jest.fn() }),
}));
jest.mock('@/activities/utils/getActivityTargetObjectFieldIdName', () => ({
  doesActivityTargetObjectSupportAttachments: () => false,
  getActivityTargetObjectFieldIdName: () => 'campaignId',
}));
jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: jest.fn(),
  }),
}));
jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: jest.fn(),
    }),
  }),
);
jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: jest.fn(),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: jest.fn(),
    enqueueErrorSnackBar: jest.fn(),
  }),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({
    openModal: () => mockConfirmationOpen?.(),
    closeModal: () => mockConfirmationClose?.(),
  }),
}));
jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    onClose,
    onConfirmClick,
  }: {
    onClose: () => void;
    onConfirmClick: () => void;
  }) => {
    const [opened, setOpened] = useState(false);
    mockConfirmationOpen = () => setOpened(true);
    mockConfirmationClose = () => setOpened(false);
    return opened ? (
      <div role="dialog" aria-label="Unsaved guidance">
        <button onClick={onClose}>Keep editing</button>
        <button onClick={onConfirmClick}>Discard changes</button>
      </div>
    ) : null;
  },
}));

it('renders shipping sections by location without metadata layout and never invokes lifecycle on navigation', () => {
  mockPermission.mockReturnValue({ canUpdateObjectRecords: true });
  render(
    <MemoryRouter initialEntries={['/myah/campaigns/c1']}>
      <MyahCampaignPageContent campaignId="c1" />
    </MemoryRouter>,
  );
  expect(screen.getByText('Campaign summary')).toBeInTheDocument();
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
    block: 'nearest',
    inline: 'nearest',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Command Menu' }));
  expect(mockOpenSidePanelMenu).toHaveBeenCalledTimes(1);
  expect(mockChangeQueryIdListenState).toHaveBeenCalledWith(
    true,
    'record-show-campaign-c1',
    {
      objectNameSingular: 'campaign',
      variables: { filter: { id: { eq: 'c1' } }, limit: 1 },
    },
  );
  expect(screen.getByText('Readiness and activity')).toBeInTheDocument();
  expect(screen.getByText('Audience controls')).toBeInTheDocument();
  expect(screen.getByText('objective for c1 (viewing)')).toBeInTheDocument();
  expect(mockFieldsViewId).toHaveBeenCalledWith(null);
  for (const [tab, content] of [
    ['Influencers', 'Campaign influencers'],
    ['Outreach', 'Shipping workflow editor'],
    ['Campaign Agent', 'Agent guidance'],
    ['Operations', 'Accounts and signature'],
    ['Tasks', 'Tasks for campaign:c1 (page)'],
    ['Notes', 'No notes'],
  ]) {
    fireEvent.click(screen.getByRole('link', { name: tab }));
    expect(screen.getByText(content)).toBeInTheDocument();
    if (tab === 'Operations') {
      expect(screen.getByText(content)).toHaveAttribute(
        'data-dedicated-page',
        'true',
      );
    }
    expect(screen.getByRole('link', { name: tab })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  expect(
    screen.getByRole('button', { name: 'Start Campaign' }),
  ).toBeInTheDocument();
});

it.each(['outreach', 'operations'])(
  'keeps the native record header and actions on mobile %s',
  (section) => {
    mockPermission.mockReturnValue({ canUpdateObjectRecords: true });
    mockIsMobile = true;
    render(
      <MemoryRouter
        initialEntries={[`/myah/campaigns/c1?viewId=chosen&section=${section}`]}
      >
        <MyahCampaignPageContent campaignId="c1" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('record-header')).toHaveAttribute(
      'data-compact',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Start Campaign' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Command Menu' })).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: section === 'outreach' ? 'Outreach' : 'Operations',
      }),
    ).toHaveAttribute('aria-current', 'page');
    const nextSection = section === 'outreach' ? 'operations' : 'outreach';
    const nextLink = screen.getByRole('link', {
      name: nextSection === 'outreach' ? 'Outreach' : 'Operations',
    });
    expect(nextLink).toHaveAttribute(
      'href',
      `/myah/campaigns/c1?viewId=chosen&section=${nextSection}`,
    );
    fireEvent.click(nextLink);
    expect(screen.getByTestId('record-header')).toHaveAttribute(
      'data-compact',
      'true',
    );
  },
);

it('closes the mobile navigation drawer on Campaign entry without changing desktop navigation', () => {
  mockPermission.mockReturnValue({ canUpdateObjectRecords: false });
  mockIsMobile = true;
  const { unmount } = render(
    <MemoryRouter>
      <MyahCampaignPageContent campaignId="c1" />
    </MemoryRouter>,
  );
  expect(mockCollapseNavigation).toHaveBeenCalledWith(false);
  unmount();
  mockCollapseNavigation.mockClear();
  mockIsMobile = false;
  render(
    <MemoryRouter>
      <MyahCampaignPageContent campaignId="c1" />
    </MemoryRouter>,
  );
  expect(mockCollapseNavigation).not.toHaveBeenCalled();
  expect(screen.getByTestId('record-header')).toHaveAttribute(
    'data-compact',
    'false',
  );
});

it('hides audience mutation controls without update permission', () => {
  mockPermission.mockReturnValue({ canUpdateObjectRecords: false });
  render(
    <MemoryRouter>
      <MyahCampaignPageContent campaignId="c1" />
    </MemoryRouter>,
  );
  expect(screen.getByText('Readiness and activity')).toBeInTheDocument();
  expect(screen.queryByText('Audience controls')).not.toBeInTheDocument();
});

it('uses an active standard Campaign fields view without requiring a layout widget', () => {
  mockPermission.mockReturnValue({ canUpdateObjectRecords: false });
  mockViews = [
    {
      id: 'runtime-home-view',
      universalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
      objectMetadataId: 'metadata',
      type: 'FIELDS_WIDGET',
      isActive: true,
    },
  ];
  render(
    <MemoryRouter>
      <MyahCampaignPageContent campaignId="c1" />
    </MemoryRouter>,
  );
  expect(mockFieldsViewId).toHaveBeenCalledWith('runtime-home-view');
  mockViews = [];
});

it('provides the Campaign target to shared record components, including activity cards', () => {
  mockPermission.mockReturnValue({ canUpdateObjectRecords: true });
  render(
    <MemoryRouter initialEntries={['/myah/campaigns/c1?section=tasks']}>
      <MyahCampaignPageContent campaignId="c1" />
    </MemoryRouter>,
  );
  expect(screen.getByText('Tasks for campaign:c1 (page)')).toBeInTheDocument();
});

it('reflects Apollo cache changes through the actual Campaign query and record effect without crossing IDs', async () => {
  mockUseApolloRecord = true;
  mockApolloClient = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const id = operation.variables.objectRecordId as string;
          observer.next({ data: { campaign: mockServerRecords.get(id) } });
          observer.complete();
        }),
    ),
  });
  mockPermission.mockReturnValue({
    canReadObjectRecords: true,
    canUpdateObjectRecords: false,
  });
  mockServerRecords.set('c1', {
    id: 'c1',
    __typename: 'Campaign',
    name: 'First',
  });
  mockServerRecords.set('c2', {
    id: 'c2',
    __typename: 'Campaign',
    name: 'Second',
  });
  const store = resetJotaiStore();
  const view = (id: string) => (
    <Provider store={store}>
      <ApolloProvider client={mockApolloClient!}>
        <MemoryRouter>
          <MyahCampaignPageContent key={id} campaignId={id} />
        </MemoryRouter>
      </ApolloProvider>
    </Provider>
  );
  const { rerender } = render(view('c1'));
  await waitFor(() =>
    expect(screen.getByTestId('live-campaign-name')).toHaveTextContent('First'),
  );
  expect(mockChangeQueryIdListenState).toHaveBeenCalledWith(
    true,
    'record-show-campaign-c1',
    {
      objectNameSingular: 'campaign',
      variables: { filter: { id: { eq: 'c1' } }, limit: 1 },
    },
  );
  act(() => mockPublishCampaignChange('c1', 'First updated'));
  await waitFor(() =>
    expect(screen.getByTestId('live-campaign-name')).toHaveTextContent(
      'First updated',
    ),
  );
  rerender(view('c2'));
  await waitFor(() =>
    expect(screen.getByTestId('live-campaign-name')).toHaveTextContent(
      'Second',
    ),
  );
  expect(mockActiveSubscriptions.has('record-show-campaign-c1')).toBe(false);
  expect(mockActiveSubscriptions.has('record-show-campaign-c2')).toBe(true);
  expect(() => mockPublishCampaignChange('c1', 'Stale')).toThrow(
    'No Campaign subscription for c1',
  );
  act(() => mockPublishCampaignChange('c2', 'Second updated'));
  await waitFor(() =>
    expect(screen.getByTestId('live-campaign-name')).toHaveTextContent(
      'Second updated',
    ),
  );
  expect(store.get(recordStoreFamilyState.atomFamily('c1'))?.name).toBe(
    'First updated',
  );
  expect(store.get(recordStoreFamilyState.atomFamily('c2'))?.name).toBe(
    'Second updated',
  );
});

it('mounts the dedicated Campaign route with real field permission and blocks section/ID navigation for dirty guidance', async () => {
  mockUseRealAgent = true;
  mockPermission.mockReturnValue({
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
  });
  const store = resetJotaiStore();
  for (const id of ['c1', 'c2']) {
    mockServerRecords.set(id, {
      id,
      __typename: 'Campaign',
      name: id,
      ...Object.fromEntries(
        guidanceFieldNames.map((field) => [
          field,
          { blocknote: `${id}-${field}`, markdown: null },
        ]),
      ),
    });
  }
  globalThis.TextDecoder = jest.requireActual('node:util').TextDecoder;
  globalThis.TextEncoder = jest.requireActual('node:util').TextEncoder;
  globalThis.ReadableStream =
    jest.requireActual('node:stream/web').ReadableStream;
  globalThis.MessagePort = jest.requireActual(
    'node:worker_threads',
  ).MessagePort;
  globalThis.Request = jest.requireActual('undici').Request;
  const router = createMemoryRouter(
    [
      {
        path: '/campaigns/:campaignId',
        element: (
          <>
            <Link to="/campaigns/c2?section=agent">Next Campaign</Link>
            <MyahCampaignPage />
            <SidePanelForDesktop />
          </>
        ),
      },
    ],
    { initialEntries: ['/campaigns/c1?section=agent'] },
  );
  try {
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Restricted guidance' }),
      ).toHaveLength(1),
    );
    expect(
      store.get(
        contextStoreTargetedRecordsRuleComponentState.atomFamily({
          instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
        }),
      ),
    ).toEqual({ mode: 'selection', selectedRecordIds: ['c1'] });
    fireEvent.click(screen.getByRole('button', { name: 'Command Menu' }));
    expect(screen.getByTestId('side-panel-router')).toHaveTextContent(
      'Command menu host',
    );
    expect(
      screen.getByRole('button', { name: 'Restricted guidance' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restricted guidance' }),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getAllByRole('button', { name: 'Edit guidance' }),
    ).toHaveLength(4);
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit guidance' })[0],
    );
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(router.state.location.search).toBe('?section=agent');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.search).toBe('?section=agent');
    fireEvent.click(screen.getByRole('link', { name: 'Next Campaign' }));
    expect(router.state.location.pathname).toBe('/campaigns/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/campaigns/c2'),
    );
    expect(
      screen.getAllByRole('button', { name: 'Restricted guidance' }),
    ).toHaveLength(1);
    expect(
      store.get(recordStoreFamilyState.atomFamily('c1'))?.campaignBrief,
    ).toEqual({ blocknote: 'c1-campaignBrief', markdown: null });
    expect(
      store.get(
        contextStoreTargetedRecordsRuleComponentState.atomFamily({
          instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
        }),
      ),
    ).toEqual({ mode: 'selection', selectedRecordIds: ['c2'] });
    expect(
      store.get(recordStoreFamilyState.atomFamily('c2'))?.campaignBrief,
    ).toEqual({ blocknote: 'c2-campaignBrief', markdown: null });
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
  } finally {
    mockUseRealAgent = false;
  }
});
