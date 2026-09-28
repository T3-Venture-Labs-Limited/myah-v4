import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { PageLayoutTabsRenderer } from '@/page-layout/components/PageLayoutTabsRenderer';

jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({
    currentPageLayout: {
      id: 'layout-a',
      type: 'RECORD_PAGE',
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
      tabs: [
        {
          id: 'influencers-tab',
          title: 'Influencers',
          position: 1,
          universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        },
      ],
    },
  }),
}));
jest.mock('@/page-layout/hooks/useIsPageLayoutInEditMode', () => ({
  useIsPageLayoutInEditMode: () => false,
}));
jest.mock('@/page-layout/hooks/usePageLayoutAddTabStrategy', () => ({
  usePageLayoutAddTabStrategy: () => undefined,
}));
jest.mock('@/page-layout/hooks/usePageLayoutHiddenWidgetTypes', () => ({
  usePageLayoutHiddenWidgetTypes: () => [],
}));
jest.mock('@/page-layout/hooks/useReorderRecordPageLayoutTabs', () => ({
  useReorderRecordPageLayoutTabs: () => ({ reorderRecordPageTabs: jest.fn() }),
}));
jest.mock('@/page-layout/utils/getTabsWithVisibleWidgets', () => ({
  getTabsWithVisibleWidgets: ({ tabs }: { tabs: unknown[] }) => tabs,
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({
    layoutType: 'RECORD_PAGE',
    isInSidePanel: false,
    targetRecordIdentifier: {
      id: 'campaign-a',
      targetObjectNameSingular: 'campaign',
    },
  }),
  LayoutRenderingProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/ui/layout/side-panel/contexts/SidePanelContext', () => ({
  SidePanelProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => 'influencers-tab',
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue', () => ({
  useAtomFamilyStateValue: () => ({
    current: [
      { id: 'campaign-meta', nameSingular: 'campaign', isSystem: false },
    ],
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        id: 'membership-meta',
        nameSingular: 'campaignCreator',
        fields: [
          { id: 'campaign-field', name: 'campaign' },
          { id: 'creator-field', name: 'creator' },
          {
            id: 'stage-field',
            name: 'stage',
            options: [{ value: 'NEGOTIATING', label: 'Negotiating' }],
          },
        ],
      },
      {
        id: 'creator-meta',
        nameSingular: 'creator',
        fields: [
          'name',
          'email',
          'instagramUsername',
          'instagramBio',
          'instagramFollowerCount',
        ].map((name) => ({ id: `${name}-field`, name })),
      },
    ],
  }),
}));
jest.mock('@/page-layout/PageLayoutMainContent', () => ({
  PageLayoutMainContent: ({
    onOpenCampaignCreatorContext,
  }: {
    onOpenCampaignCreatorContext?: (request: {
      recordId: string;
      activationElement: HTMLElement;
    }) => void;
  }) => (
    <button
      onClick={(event) =>
        onOpenCampaignCreatorContext?.({
          recordId: 'membership-a',
          activationElement: event.currentTarget,
        })
      }
    >
      Inspect membership
    </button>
  ),
}));
jest.mock('@/page-layout/components/MyahCampaignWorkspaceHeader', () => ({
  MyahCampaignWorkspaceHeader: () => <div>Campaign header</div>,
}));
jest.mock('@/page-layout/components/MyahCampaignCreatorMessages', () => ({
  MyahCampaignCreatorMessages: () => null,
}));
jest.mock('@/page-layout/components/PageLayoutLeftPanel', () => ({
  PageLayoutLeftPanel: () => null,
}));
jest.mock('@/page-layout/components/PageLayoutTabList', () => ({
  PageLayoutTabList: () => null,
}));
jest.mock('@/page-layout/components/PageLayoutTabListEffect', () => ({
  PageLayoutTabListEffect: () => null,
}));
jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: ({ objectNameSingular }: { objectNameSingular: string }) =>
    objectNameSingular === 'campaignCreator'
      ? {
          record: {
            id: 'membership-a',
            campaignId: 'campaign-a',
            creatorId: 'creator-a',
            stage: 'NEGOTIATING',
          },
          loading: false,
          hasReadPermission: true,
        }
      : {
          record: {
            id: 'creator-a',
            name: 'Cached private Creator',
            email: 'creator@example.invalid',
          },
          loading: false,
          hasReadPermission: true,
        },
}));
jest.mock('@/activities/notes/components/NotesCard', () => ({
  NotesCard: () => <div>Native private Creator notes</div>,
}));
jest.mock('@/activities/timeline-activities/components/TimelineCard', () => ({
  TimelineCard: () => <div>Native Creator activity</div>,
}));

const permission = (objectMetadataId: string, canReadObjectRecords = true) => ({
  objectMetadataId,
  canReadObjectRecords,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
});
const readablePermissions = [
  permission('campaign-meta'),
  permission('membership-meta'),
  permission('creator-meta'),
];

it('closes a cached Creator panel on native Campaign read loss and requires a new selection on restore', async () => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
  store.set(currentUserWorkspaceState.atom, {
    permissionFlags: [],
    twoFactorAuthenticationMethodSummary: null,
    objectsPermissions: readablePermissions,
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <PageLayoutTabsRenderer />
      </MemoryRouter>
    </Provider>,
  );

  const invoker = screen.getByRole('button', { name: 'Inspect membership' });
  fireEvent.click(invoker);
  const panel = screen.getByRole('complementary', {
    name: 'Campaign creator context',
  });
  expect(panel).toHaveTextContent('Cached private Creator');
  expect(panel).toHaveTextContent('Recorded campaign stage: Negotiating');
  fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
  expect(screen.getByText('Native private Creator notes')).toBeVisible();

  act(() => {
    store.set(currentUserWorkspaceState.atom, {
      permissionFlags: [],
      twoFactorAuthenticationMethodSummary: null,
      objectsPermissions: [
        permission('campaign-meta', false),
        permission('membership-meta'),
        permission('creator-meta'),
      ],
    });
  });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(screen.queryByText('Cached private Creator')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Native private Creator notes'),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByTestId('campaign-main-region').closest('[tabindex="-1"]'),
    ).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Inspect membership' }));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

  act(() => {
    store.set(currentUserWorkspaceState.atom, {
      permissionFlags: [],
      twoFactorAuthenticationMethodSummary: null,
      objectsPermissions: readablePermissions,
    });
  });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect membership' }));
  expect(
    screen.getByRole('complementary', { name: 'Campaign creator context' }),
  ).toHaveTextContent('Cached private Creator');
});
