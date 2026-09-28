import { render, screen } from '@testing-library/react';
import { WidgetContentRenderer } from '@/page-layout/widgets/components/WidgetContentRenderer';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { ViewType, WidgetType } from '~/generated-metadata/graphql';

let mockLayout: any;
let mockTabId: string;
let mockContext: any;
let mockViews: any[];
let mockEditMode = false;
let mockIsMobile = false;
let mockHiddenWidgetTypes = new Set<WidgetType>();
let mockForbiddenWidgetId: string | undefined;
let mockCanUpdate = true;
let mockRestrictedField: string | undefined;
const mockCampaignFields = [
  'campaignBrief',
  'additionalNotes',
  'communicationGuidelines',
  'replyRules',
  'escalationBoundaries',
].map((name) => ({ name, id: name }));

jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({ currentPageLayout: mockLayout }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        id: 'campaign-object',
        nameSingular: 'campaign',
        fields: mockCampaignFields,
      },
    ],
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: true,
    canUpdateObjectRecords: mockCanUpdate,
    restrictedFields: mockRestrictedField
      ? { [mockRestrictedField]: { canRead: false, canUpdate: false } }
      : {},
  }),
}));
jest.mock('@/page-layout/widgets/hooks/useWidgetPermissions', () => ({
  useWidgetPermissions: (candidate: PageLayoutWidget) => ({
    hasAccess: candidate.id !== mockForbiddenWidgetId,
  }),
}));
jest.mock('@/page-layout/hooks/usePageLayoutHiddenWidgetTypes', () => ({
  usePageLayoutHiddenWidgetTypes: () => mockHiddenWidgetTypes,
}));
jest.mock('twenty-ui/utilities', () => ({ useIsMobile: () => mockIsMobile }));
jest.mock('@/page-layout/hooks/useIsPageLayoutInEditMode', () => ({
  useIsPageLayoutInEditMode: () => mockEditMode,
}));
jest.mock('@/page-layout/contexts/PageLayoutContentContext', () => ({
  usePageLayoutContentContext: () => ({ tabId: mockTabId }),
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => mockContext,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockViews,
}));
jest.mock('@/page-layout/widgets/field/components/FieldWidget', () => ({
  FieldWidget: () => null,
}));
jest.mock(
  '@/page-layout/widgets/record-table/components/RecordTableWidgetRenderer',
  () => ({
    RecordTableWidgetRenderer: () => null,
  }),
);
jest.mock('@/page-layout/widgets/fields/components/FieldsWidget', () => ({
  FieldsWidget: ({ excludeFieldNames }: { excludeFieldNames?: string[] }) => (
    <div data-testid="fields">{excludeFieldNames?.join(',') ?? 'all'}</div>
  ),
}));

const homeId = '8482a6bc-bc2a-4f2d-8296-6d951f681c4f';
const agentId = '0d213a1a-e001-496c-970e-e692968cf17c';
const homeViewId = 'home-view-runtime';
const agentViewId = 'agent-view-runtime';
const homeWidget = {
  id: 'home-widget-runtime',
  isActive: true,
  type: WidgetType.FIELDS,
  configuration: { viewId: homeViewId },
} as PageLayoutWidget;
const agentWidget = {
  id: 'agent-widget-runtime',
  isActive: true,
  type: WidgetType.FIELDS,
  configuration: { viewId: agentViewId },
} as PageLayoutWidget;

beforeEach(() => {
  mockLayout = {
    universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
    tabs: [
      {
        id: 'home',
        isActive: true,
        universalIdentifier: homeId,
        widgets: [homeWidget],
      },
      {
        id: 'agent',
        isActive: true,
        universalIdentifier: agentId,
        widgets: [agentWidget],
      },
    ],
  };
  mockViews = [
    {
      id: homeViewId,
      universalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
      type: ViewType.FIELDS_WIDGET,
      isActive: true,
    },
    {
      id: agentViewId,
      universalIdentifier: 'eb4da94a-d3da-4354-bb39-7478ac12bd35',
      type: ViewType.FIELDS_WIDGET,
      isActive: true,
    },
  ];
  mockTabId = 'home';
  mockContext = {
    isInSidePanel: false,
    targetRecordIdentifier: { targetObjectNameSingular: 'campaign' },
  };
  mockEditMode = false;
  mockIsMobile = false;
  mockHiddenWidgetTypes = new Set();
  mockForbiddenWidgetId = undefined;
  mockCanUpdate = true;
  mockRestrictedField = undefined;
});

it('routes guidance away from native Campaign facts and keeps side-panel Agent facts out', () => {
  const view = render(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'communicationGuidelines,replyRules,escalationBoundaries,campaignBrief,additionalNotes',
  );
  mockTabId = 'agent';
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'campaignBrief,additionalNotes',
  );
  mockContext.isInSidePanel = true;
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'campaignBrief,additionalNotes',
  );
});

it('keeps guidance on Campaign when Agent is inactive, hidden or forbidden', () => {
  const view = render(<WidgetContentRenderer widget={homeWidget} />);
  for (const mutate of [
    () => {
      mockLayout.tabs[1].isActive = false;
    },
    () => {
      mockLayout.tabs[1].widgets = [{ ...agentWidget, isActive: false }];
    },
    () => {
      mockLayout.tabs[1].widgets = [
        { ...agentWidget, conditionalDisplay: { '==': [1, 2] } },
      ];
    },
    () => {
      mockForbiddenWidgetId = agentWidget.id;
    },
  ]) {
    mockLayout.tabs[1] = {
      id: 'agent',
      isActive: true,
      universalIdentifier: agentId,
      widgets: [agentWidget],
    };
    mockForbiddenWidgetId = undefined;
    mockCanUpdate = true;
    mockRestrictedField = undefined;
    mutate();
    view.rerender(<WidgetContentRenderer widget={homeWidget} />);
    expect(screen.getByTestId('fields')).toHaveTextContent(
      'campaignBrief,additionalNotes',
    );
  }
});

it('moves only individually readable fields for read-only and partially restricted users', () => {
  const view = render(<WidgetContentRenderer widget={homeWidget} />);
  mockCanUpdate = false;
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'communicationGuidelines,replyRules,escalationBoundaries',
  );
  mockTabId = 'agent';
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'campaignBrief,additionalNotes',
  );
  mockTabId = 'home';
  mockRestrictedField = 'replyRules';
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'communicationGuidelines,escalationBoundaries',
  );
  mockRestrictedField = 'campaignBrief';
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'communicationGuidelines,replyRules,escalationBoundaries',
  );
  mockTabId = 'agent';
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('additionalNotes');
});

it('retains Agent facts in side panel if Campaign destination is hidden or forbidden', () => {
  mockContext.isInSidePanel = true;
  mockTabId = 'agent';
  const view = render(<WidgetContentRenderer widget={agentWidget} />);
  mockLayout.tabs[0].isActive = false;
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockLayout.tabs[0].isActive = true;
  mockLayout.tabs[0].widgets = [
    { ...homeWidget, conditionalDisplay: { '==': [1, 2] } },
  ];
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockLayout.tabs[0].widgets = [homeWidget];
  mockForbiddenWidgetId = homeWidget.id;
  view.rerender(<WidgetContentRenderer widget={agentWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
});

it('preserves fields with absent or ambiguous runtime view, duplicate widgets, custom layouts and noncampaign objects', () => {
  const view = render(<WidgetContentRenderer widget={homeWidget} />);
  mockViews = mockViews.slice(1);
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockViews = [
    {
      id: homeViewId,
      universalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
      type: ViewType.FIELDS_WIDGET,
      isActive: true,
    },
    {
      id: homeViewId,
      universalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
      type: ViewType.FIELDS_WIDGET,
      isActive: true,
    },
    {
      id: agentViewId,
      universalIdentifier: 'eb4da94a-d3da-4354-bb39-7478ac12bd35',
      type: ViewType.FIELDS_WIDGET,
      isActive: true,
    },
  ];
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockViews = [mockViews[0], mockViews[2]];
  mockLayout.tabs[0].widgets.push({ ...homeWidget, id: 'custom-widget' });
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockLayout.tabs[0].widgets.pop();
  mockViews[1].isActive = false;
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent(
    'campaignBrief,additionalNotes',
  );
  mockViews[1].isActive = true;
  mockLayout.universalIdentifier = 'custom-layout';
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
  mockContext.targetRecordIdentifier.targetObjectNameSingular = 'creator';
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
  mockContext.targetRecordIdentifier.targetObjectNameSingular = 'campaign';
  mockEditMode = true;
  view.rerender(<WidgetContentRenderer widget={homeWidget} />);
  expect(screen.getByTestId('fields')).toHaveTextContent('all');
});
