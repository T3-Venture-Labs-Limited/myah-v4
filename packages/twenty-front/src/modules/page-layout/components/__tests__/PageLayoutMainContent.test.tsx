import { fireEvent, render, screen } from '@testing-library/react';

import { PageLayoutMainContent } from '@/page-layout/PageLayoutMainContent';
import { ViewType, WidgetType } from '~/generated-metadata/graphql';

const mockGetWidgetConfigurationViewId = jest.fn();

const canonicalCampaignAgentWidget = {
  id: 'agent-fields-widget',
  title: 'Campaign agent',
  type: WidgetType.FIELDS,
  configuration: { viewId: 'agent-fields-view' },
};
const canonicalCampaignAgentView = {
  id: 'agent-fields-view',
  universalIdentifier: 'eb4da94a-d3da-4354-bb39-7478ac12bd35',
  type: ViewType.FIELDS_WIDGET,
  isActive: true,
};
let mockAgentWidgetHasAccess = true;
let mockIsEditMode = false;
let mockCanUpdateCampaign = true;

const canonicalCampaignOperationsWidget = {
  id: 'operations-fields-widget',
  title: 'Campaign operations',
  type: WidgetType.FIELDS,
  configuration: { viewId: 'operations-fields-view' },
};

const canonicalCampaignOperationsView = {
  id: 'operations-fields-view',
  universalIdentifier: '9c4f90c5-2a03-436b-8130-93d50a4d0e3e',
  type: ViewType.FIELDS_WIDGET,
  isActive: true,
};

jest.mock('@/myah/creator-crm/components/CampaignInfluencerIndex', () => ({
  CampaignInfluencerIndex: ({
    campaignId,
    viewId,
    onOpenCreatorContext,
    activityTabId,
  }: {
    campaignId: string;
    activityTabId?: string;
    viewId: string | null;
    onOpenCreatorContext?: (request: {
      recordId: string;
      source: 'table-identifier-action';
    }) => void;
  }) => (
    <>
      <div>{`Campaign Influencers integration:${campaignId}:${viewId ?? 'default'}`}</div>
      <output data-testid="activity-tab-destination">
        {activityTabId ?? 'unavailable'}
      </output>
      <button
        onClick={() =>
          onOpenCreatorContext?.({
            recordId: 'membership-a',
            source: 'table-identifier-action',
          })
        }
      >
        Open from list
      </button>
    </>
  ),
}));
let currentPageLayout: {
  type: string;
  universalIdentifier: string;
  tabs: Array<{ id: string; universalIdentifier: string; isActive: boolean }>;
};
let activeTab: {
  isActive?: boolean;
  layout: string;
  title: string;
  universalIdentifier: string;
  widgets?: Array<{
    id?: string;
    title?: string;
    type?: WidgetType;
    configuration?: { viewId?: string };
  }>;
};
let isInSidePanel = false;
let targetRecordIdentifier:
  | { id: string; targetObjectNameSingular: string }
  | undefined;

let runtimeViews: Array<{
  id: string;
  universalIdentifier: string;
  type: ViewType;
  isActive: boolean;
}>;

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        id: 'campaign-object',
        nameSingular: 'campaign',
        fields: [
          'communicationGuidelines',
          'replyRules',
          'escalationBoundaries',
        ].map((name) => ({ name, id: name })),
      },
    ],
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: true,
    canUpdateObjectRecords: mockCanUpdateCampaign,
    restrictedFields: {},
  }),
}));
jest.mock('@/page-layout/hooks/useIsPageLayoutInEditMode', () => ({
  useIsPageLayoutInEditMode: () => mockIsEditMode,
}));
jest.mock('@/page-layout/widgets/hooks/useWidgetPermissions', () => ({
  useWidgetPermissions: () => ({ hasAccess: mockAgentWidgetHasAccess }),
}));
jest.mock('@/page-layout/components/PageLayoutContent', () => ({
  PageLayoutContent: () => <div>Native page layout content</div>,
}));

jest.mock('@/page-layout/components/MyahCampaignHome', () => ({
  MyahCampaignHome: ({ campaignId }: { campaignId: string }) => (
    <div>{`Campaign home integration:${campaignId}`}</div>
  ),
}));

jest.mock('@/page-layout/components/MyahCampaignAgent', () => ({
  MyahCampaignAgent: ({
    campaignId,
    title,
  }: {
    campaignId: string;
    title: string;
  }) => <div>{`Campaign agent integration:${campaignId}:${title}`}</div>,
}));

jest.mock('@/page-layout/components/MyahCampaignOperations', () => ({
  MyahCampaignOperations: ({
    campaignId,
    title,
    fieldsWidget,
  }: {
    campaignId: string;
    title: string;
    fieldsWidget: { id: string };
  }) => (
    <div>
      Campaign operations integration:{campaignId}:{title}:{fieldsWidget.id}
    </div>
  ),
}));

jest.mock('@/myah-outreach/components/CampaignOutreachTab', () => ({
  CampaignOutreachTab: ({ campaignId }: { campaignId: string }) => (
    <div data-testid="campaign-outreach-tab">{campaignId}</div>
  ),
}));

jest.mock('@/page-layout/components/MyahCreatorListMembers', () => ({
  MyahCreatorListMembers: ({ creatorListId }: { creatorListId: string }) => (
    <div>{`Creator List members integration:${creatorListId}`}</div>
  ),
}));

jest.mock('@/page-layout/contexts/PageLayoutContentContext', () => ({
  PageLayoutContentProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({ currentPageLayout }),
}));

jest.mock(
  '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow',
  () => ({
    usePageLayoutTabWithVisibleWidgetsOrThrow: () => activeTab,
  }),
);

jest.mock('@/views/states/selectors/viewsSelector', () => ({
  viewsSelector: {},
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => runtimeViews,
}));

jest.mock('@/page-layout/utils/getTabLayoutMode', () => ({
  getTabLayoutMode: () => 'VERTICAL_LIST',
}));

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({
    isInSidePanel,
    targetRecordIdentifier,
  }),
}));
jest.mock('@/page-layout/utils/getWidgetConfigurationViewId', () => ({
  getWidgetConfigurationViewId: (...args: unknown[]) =>
    mockGetWidgetConfigurationViewId(...args),
}));

describe('PageLayoutMainContent', () => {
  beforeEach(() => {
    currentPageLayout = {
      type: 'RECORD_PAGE',
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
      tabs: [
        {
          id: 'home-tab-id',
          universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
          isActive: true,
        },
      ],
    };
    isInSidePanel = false;
    activeTab = {
      layout: 'VERTICAL_LIST',
      title: 'Home',
      universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
    };
    targetRecordIdentifier = {
      id: 'campaign-1',
      targetObjectNameSingular: 'campaign',
    };
    mockGetWidgetConfigurationViewId.mockImplementation(
      (configuration: unknown) =>
        typeof configuration === 'object' &&
        configuration !== null &&
        'viewId' in configuration &&
        typeof configuration.viewId === 'string'
          ? configuration.viewId
          : 'campaign-influencers-view',
    );
    mockGetWidgetConfigurationViewId.mockClear();
    runtimeViews = [
      canonicalCampaignOperationsView,
      canonicalCampaignAgentView,
    ];
    mockAgentWidgetHasAccess = true;
    mockCanUpdateCampaign = true;
    mockIsEditMode = false;
    activeTab = { ...activeTab, isActive: true, widgets: [] };
  });

  it('mounts Campaign Home with native page layout content', () => {
    render(<PageLayoutMainContent tabId="home-tab-id" />);

    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(
      screen.getByText('Campaign home integration:campaign-1'),
    ).toBeVisible();
  });

  it('explains linked tasks only on the standard Campaign Tasks tab without replacing native content', () => {
    activeTab = {
      ...activeTab,
      title: 'Tasks',
      universalIdentifier: '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0',
      widgets: [
        {
          id: 'tasks-widget',
          type: WidgetType.TASKS,
        },
      ],
    };

    const view = render(<PageLayoutMainContent tabId="tasks-tab-id" />);
    const note = screen.getByText(/existing tasks linked to this campaign/i);

    expect(note).toHaveTextContent(
      /not evidence of fulfillment or commercial completion/i,
    );
    expect(screen.getByText('Native page layout content')).toBeVisible();

    currentPageLayout = {
      ...currentPageLayout,
      universalIdentifier: 'custom-layout',
    };
    view.rerender(<PageLayoutMainContent tabId="tasks-tab-id" />);
    expect(
      screen.queryByText(/existing tasks linked to this campaign/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Native page layout content')).toBeVisible();

    currentPageLayout = {
      ...currentPageLayout,
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
    };
    targetRecordIdentifier = {
      id: 'person-1',
      targetObjectNameSingular: 'person',
    };
    view.rerender(<PageLayoutMainContent tabId="tasks-tab-id" />);
    expect(
      screen.queryByText(/existing tasks linked to this campaign/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Native page layout content')).toBeVisible();
  });

  it('mounts the native Campaign Influencers index only on its tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };

    const onOpenCampaignCreatorContext = jest.fn();
    render(
      <PageLayoutMainContent
        tabId="influencers-tab-id"
        activityTabId="home-tab-id"
        onOpenCampaignCreatorContext={onOpenCampaignCreatorContext}
      />,
    );
    expect(screen.getByTestId('activity-tab-destination')).toHaveTextContent(
      'home-tab-id',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open from list' }));
    expect(onOpenCampaignCreatorContext).toHaveBeenCalledWith({
      recordId: 'membership-a',
      source: 'table-identifier-action',
    });

    expect(
      screen.getByText(
        'Campaign Influencers integration:campaign-1:campaign-influencers-view',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('does not advertise a Home tab absent from selectable tab props as an activity destination', () => {
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };
    render(<PageLayoutMainContent tabId="influencers-tab-id" />);
    expect(screen.getByTestId('activity-tab-destination')).toHaveTextContent(
      'unavailable',
    );
  });

  it('does not fall through to generic content when Influencers has no view ID', () => {
    mockGetWidgetConfigurationViewId.mockReturnValueOnce(null);
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };

    render(<PageLayoutMainContent tabId="influencers-tab-id" />);

    expect(
      screen.getByText('Campaign Influencers integration:campaign-1:default'),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('does not select an arbitrary Influencers widget view', () => {
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}, {}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };

    render(<PageLayoutMainContent tabId="influencers-tab-id" />);

    expect(
      screen.getByText('Campaign Influencers integration:campaign-1:default'),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('mounts Creator List membership controls on the Creator List Home tab', () => {
    currentPageLayout = {
      type: 'RECORD_PAGE',
      universalIdentifier: 'c8952254-5bf9-43a5-baab-98666f9b444d',
      tabs: [],
    };
    activeTab = {
      layout: 'VERTICAL_LIST',
      title: 'Home',
      universalIdentifier: '5dbb537f-2d8b-49ec-91bb-f74b0ab072d2',
    };
    targetRecordIdentifier = {
      id: 'creator-list-1',
      targetObjectNameSingular: 'creatorList',
    };

    render(<PageLayoutMainContent tabId="creator-list-home-tab-id" />);

    expect(
      screen.getByText('Creator List members integration:creator-list-1'),
    ).toBeVisible();
  });

  it('renders Campaign Outreach only for the Campaign Outreach tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Outreach',
      universalIdentifier: '8d749a63-24d8-481b-9a10-d98d9b959db1',
    };

    render(<PageLayoutMainContent tabId="outreach-tab-id" />);

    expect(screen.getByTestId('campaign-outreach-tab')).toHaveTextContent(
      'campaign-1',
    );
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('mounts the guided editor only on the canonical Campaign Agent tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Agent',
      universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
      widgets: [canonicalCampaignAgentWidget],
    };

    render(<PageLayoutMainContent tabId="agent-tab-id" />);

    expect(
      screen.getByText('Campaign agent integration:campaign-1:Campaign agent'),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('falls back to native Agent content when its widget is forbidden, hidden, inactive or update permission is lost', () => {
    activeTab = {
      ...activeTab,
      title: 'Agent',
      universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
      widgets: [canonicalCampaignAgentWidget],
    };
    const view = render(<PageLayoutMainContent tabId="agent-tab-id" />);
    mockAgentWidgetHasAccess = false;
    view.rerender(<PageLayoutMainContent tabId="agent-tab-id" />);
    expect(screen.getByText('Native page layout content')).toBeVisible();
    mockAgentWidgetHasAccess = true;
    activeTab.widgets = [];
    view.rerender(<PageLayoutMainContent tabId="agent-tab-id" />);
    expect(screen.getByText('Native page layout content')).toBeVisible();
    activeTab.widgets = [canonicalCampaignAgentWidget];
    activeTab.isActive = false;
    view.rerender(<PageLayoutMainContent tabId="agent-tab-id" />);
    expect(screen.getByText('Native page layout content')).toBeVisible();
    activeTab.isActive = true;
    mockCanUpdateCampaign = false;
    view.rerender(<PageLayoutMainContent tabId="agent-tab-id" />);
    expect(screen.getByText('Native page layout content')).toBeVisible();
    mockCanUpdateCampaign = true;
    mockIsEditMode = true;
    view.rerender(<PageLayoutMainContent tabId="agent-tab-id" />);
    expect(screen.getByText('Native page layout content')).toBeVisible();
  });

  it('mounts the editor only on the canonical Campaign Operations tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Operations',
      universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
      widgets: [canonicalCampaignOperationsWidget],
    };

    render(<PageLayoutMainContent tabId="operations-tab-id" />);

    expect(
      screen.getByText(
        'Campaign operations integration:campaign-1:Campaign operations:operations-fields-widget',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      'side panel',
      () => {
        isInSidePanel = true;
      },
    ],
    [
      'different layout',
      () => {
        currentPageLayout = {
          ...currentPageLayout,
          universalIdentifier: 'different-layout',
        };
      },
    ],
    [
      'non-Campaign object',
      () => {
        targetRecordIdentifier = {
          id: 'record-1',
          targetObjectNameSingular: 'person',
        };
      },
    ],
    [
      'different tab',
      () => {
        activeTab = {
          ...activeTab,
          title: 'Tasks',
          universalIdentifier: 'a2ad78b4-249f-45d4-85b5-ee9ea3c30fda',
        };
      },
    ],
    [
      'missing widget',
      () => {
        activeTab = { ...activeTab, widgets: [] };
      },
    ],
    [
      'multiple widgets',
      () => {
        activeTab = {
          ...activeTab,
          widgets: [
            canonicalCampaignOperationsWidget,
            canonicalCampaignOperationsWidget,
          ],
        };
      },
    ],
    [
      'wrong widget type',
      () => {
        activeTab = {
          ...activeTab,
          widgets: [
            {
              ...canonicalCampaignOperationsWidget,
              type: WidgetType.FIELD,
            },
          ],
        };
      },
    ],
    [
      'wrong view ID',
      () => {
        activeTab = {
          ...activeTab,
          widgets: [
            {
              ...canonicalCampaignOperationsWidget,
              configuration: { viewId: 'wrong-operations-fields-view' },
            },
          ],
        };
      },
    ],
    [
      'wrong view universal identifier',
      () => {
        runtimeViews = [
          {
            ...canonicalCampaignOperationsView,
            universalIdentifier: 'wrong-view-universal-identifier',
          },
        ];
      },
    ],
    [
      'wrong view type',
      () => {
        runtimeViews = [
          {
            ...canonicalCampaignOperationsView,
            type: ViewType.TABLE_WIDGET,
          },
        ];
      },
    ],
    [
      'inactive view',
      () => {
        runtimeViews = [
          {
            ...canonicalCampaignOperationsView,
            isActive: false,
          },
        ];
      },
    ],
  ])('keeps native content for Operations with %s', (_description, setup) => {
    activeTab = {
      ...activeTab,
      title: 'Operations',
      universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
      widgets: [canonicalCampaignOperationsWidget],
    };
    setup();

    render(<PageLayoutMainContent tabId="operations-tab-id" />);

    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(
      screen.queryByText(/Campaign operations integration:/),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['a different layout', 'different-layout', 'campaign'],
    ['a non-Campaign record', 'ad261155-3c89-436d-8898-3e52d8b37632', 'person'],
  ])(
    'keeps native content for the Agent identifier on %s',
    (_description, layoutUniversalIdentifier, objectNameSingular) => {
      currentPageLayout = {
        ...currentPageLayout,
        universalIdentifier: layoutUniversalIdentifier,
      };
      targetRecordIdentifier = {
        id: 'record-1',
        targetObjectNameSingular: objectNameSingular,
      };
      activeTab = {
        ...activeTab,
        title: 'Agent',
        universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
        widgets: [{ title: 'Campaign agent' }],
      };

      render(<PageLayoutMainContent tabId="agent-tab-id" />);

      expect(screen.getByText('Native page layout content')).toBeVisible();
      expect(
        screen.queryByText(/Campaign agent integration:/),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps native Agent content in a side panel', () => {
    isInSidePanel = true;
    activeTab = {
      ...activeTab,
      title: 'Agent',
      universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
      widgets: [{ title: 'Campaign agent' }],
    };

    render(<PageLayoutMainContent tabId="agent-tab-id" />);

    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(
      screen.queryByText(/Campaign agent integration:/),
    ).not.toBeInTheDocument();
  });
  it.each([
    {
      description: 'the Campaign Tasks tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Tasks',
          universalIdentifier: 'a2ad78b4-249f-45d4-85b5-ee9ea3c30fda',
        };
      },
    },
    {
      description: 'the Campaign Notes tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Notes',
          universalIdentifier: 'cbea3c1e-e0c2-43d9-a44a-f65f295d0a54',
        };
      },
    },
    {
      description: 'the Campaign Agent tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Agent',
          universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
        };
      },
    },
    {
      description: 'the Campaign Operations tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Operations',
          universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        };
      },
    },
    {
      description: 'a different layout',
      setup: () => {
        currentPageLayout = {
          ...currentPageLayout,
          universalIdentifier: 'different-layout',
        };
      },
    },
    {
      description: 'a non-Campaign record',
      setup: () => {
        targetRecordIdentifier = {
          id: 'campaign-1',
          targetObjectNameSingular: 'person',
        };
      },
    },
  ])('does not mount Campaign Home on $description', ({ setup }) => {
    setup();

    render(<PageLayoutMainContent tabId="other-tab-id" />);

    expect(
      screen.queryByText(/Campaign home integration:/),
    ).not.toBeInTheDocument();
  });
});
