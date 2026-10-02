// History traversal requires imperative navigation in this route test.
/* oxlint-disable twenty/no-navigate-prefer-link */
import { fireEvent, render, screen } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { RecordShowPageRoute } from '~/pages/object-record/RecordShowPageRoute';

jest.mock('~/pages/object-record/RecordShowPage', () => ({
  RecordShowPage: () => <div>Generic Creator</div>,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [
    {
      universalIdentifier: 'campaign-layout',
      deletedAt: null,
      tabs: [
        {
          id: 'agent-tab-id',
          universalIdentifier: 'agent-tab',
          isActive: true,
        },
        {
          id: 'tasks-tab-id',
          universalIdentifier: '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0',
          isActive: true,
        },
        {
          id: 'notes-tab-id',
          universalIdentifier: 'cd78ad8c-883a-4ce1-9b74-526adadb751d',
          isActive: true,
        },
      ],
    },
  ],
}));
jest.mock(
  '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier',
  () => ({
    MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER: 'campaign-layout',
  }),
);
jest.mock(
  '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier',
  () => ({
    MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER: 'agent-tab',
  }),
);

const CampaignDestination = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div>{`${location.pathname}${location.search}${location.hash}`}</div>
      <div data-testid="creation-state">{JSON.stringify(location.state)}</div>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
};

const Previous = () => {
  const navigate = useNavigate();
  return (
    <>
      <div>Previous</div>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
};

const renderRoute = (path: string) =>
  render(
    <MemoryRouter initialEntries={['/previous', path]} initialIndex={1}>
      <Routes>
        <Route path="/previous" element={<Previous />} />
        <Route
          path={AppPath.RecordShowPage}
          element={<RecordShowPageRoute />}
        />
        <Route
          path="/myah/campaigns/:campaignId"
          element={<CampaignDestination />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe('Campaign generic record URL compatibility', () => {
  it('replaces the old URL, keeps identity/query and maps the legacy guidance tab', () => {
    renderRoute('/object/campaign/campaign-id?viewId=old-view#agent-tab-id');
    expect(
      screen.getByText(
        '/myah/campaigns/campaign-id?viewId=old-view&section=agent',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Previous')).toBeVisible();
  });

  it('preserves an explicit section and history traversal', () => {
    renderRoute('/object/campaign/campaign-id?section=outreach');
    expect(
      screen.getByText('/myah/campaigns/campaign-id?section=outreach'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Previous')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(
      screen.getByText('/myah/campaigns/campaign-id?section=outreach'),
    ).toBeVisible();
  });

  it.each([
    ['tasks-tab-id', 'tasks'],
    ['notes-tab-id', 'notes'],
  ])(
    'restores the active legacy %s tab as its dedicated section',
    (tabId, section) => {
      renderRoute(`/object/campaign/campaign-id#${tabId}`);
      expect(
        screen.getByText(`/myah/campaigns/campaign-id?section=${section}`),
      ).toBeVisible();
    },
  );

  it.each(['#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba', '#operations'])(
    'routes a layout-independent OAuth callback marker %s to Operations',
    (hash) => {
      renderRoute(
        `/object/campaign/campaign-id?linkConnectedAccount=1&connectedAccountId=123e4567-e89b-42d3-a456-426614174000${hash}`,
      );
      expect(
        screen.getByText(
          '/myah/campaigns/campaign-id?linkConnectedAccount=1&connectedAccountId=123e4567-e89b-42d3-a456-426614174000&section=operations',
        ),
      ).toBeVisible();
    },
  );

  it('keeps an unknown hash intact without pretending it is a section', () => {
    renderRoute('/object/campaign/campaign-id?viewId=old#unknown-tab');
    expect(
      screen.getByText('/myah/campaigns/campaign-id?viewId=old#unknown-tab'),
    ).toBeVisible();
  });

  it('preserves creation result identity and title-editing navigation state', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/object/campaign/campaign-id',
            state: {
              isNewRecord: true,
              objectRecordId: 'campaign-id',
              labelIdentifierFieldName: 'name',
            },
          },
        ]}
      >
        <Routes>
          <Route
            path={AppPath.RecordShowPage}
            element={<RecordShowPageRoute />}
          />
          <Route
            path="/myah/campaigns/:campaignId"
            element={<CampaignDestination />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('/myah/campaigns/campaign-id')).toBeVisible();
    expect(screen.getByTestId('creation-state')).toHaveTextContent(
      '"isNewRecord":true',
    );
    expect(screen.getByTestId('creation-state')).toHaveTextContent(
      '"labelIdentifierFieldName":"name"',
    );
  });

  it('keeps non-Campaign records on the generic page', () => {
    renderRoute('/object/creator/creator-id');
    expect(screen.getByText('Generic Creator')).toBeVisible();
  });
});
