import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { RecordShowPage } from '~/pages/object-record/RecordShowPage';

let objectNameSingular = 'campaign';
let showQuery: {
  record?: { id: string; name: string };
  loading: boolean;
  error?: Error;
  hasReadPermission: boolean;
};
const refetch = jest.fn();

jest.mock('@/object-record/record-show/hooks/useRecordShowPage', () => ({
  useRecordShowPage: () => ({ objectNameSingular, objectRecordId: 'record-1' }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-meta' },
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));
jest.mock(
  '@/object-record/record-show/graphql/operations/factories/findOneRecordForShowPageOperationSignatureFactory',
  () => ({
    buildFindOneRecordForShowPageOperationSignature: () => ({
      fields: { name: true },
    }),
  }),
);
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({ ...showQuery, refetch }),
}));
jest.mock(
  '@/object-record/components/RecordComponentInstanceContextsWrapper',
  () => ({
    RecordComponentInstanceContextsWrapper: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,
  }),
);
jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({
    header,
    children,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {header}
      <main>{children}</main>
    </div>
  ),
}));
jest.mock('~/pages/object-record/RecordShowPageHeader', () => ({
  RecordShowPageHeader: ({
    children,
    isRecordAvailable,
  }: {
    children?: React.ReactNode;
    isRecordAvailable?: boolean;
  }) => (
    <header>
      <button type="button">Back to Campaigns</button>
      {isRecordAvailable ? (
        <span>Record breadcrumb</span>
      ) : (
        <span>Campaign</span>
      )}
      {children}
    </header>
  ),
}));
jest.mock('~/pages/object-record/RecordShowPageTitle', () => ({
  RecordShowPageTitle: () => null,
}));
jest.mock(
  '@/object-record/record-show/components/PageLayoutRecordPageRenderer',
  () => ({
    PageLayoutRecordPageRenderer: () => (
      <>
        <button type="button">Edit campaign tab</button>
        <input aria-label="Unsaved draft" />
      </>
    ),
  }),
);
jest.mock(
  '@/object-record/record-show/components/RecordShowPageSSESubscribeEffect',
  () => ({
    RecordShowPageSSESubscribeEffect: () => (
      <span>Record SSE subscription</span>
    ),
  }),
);
jest.mock('@/page-layout/components/MyahCampaignExecutionControls', () => ({
  MyahCampaignExecutionControls: () => (
    <button type="button">Start campaign</button>
  ),
}));
jest.mock('@/command-menu-item/components/RecordShowCommandMenu', () => ({
  RecordShowCommandMenu: () => <button type="button">Record actions</button>,
}));
jest.mock('@/side-panel/components/SidePanelToggleButton', () => ({
  SidePanelToggleButton: () => <button type="button">Open side panel</button>,
}));

const renderPage = () => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
  store.set(tokenPairState.atom, {
    accessOrWorkspaceAgnosticToken: {
      token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-a', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
    },
  } as never);
  const rendered = render(
    <Provider store={store}>
      <MemoryRouter>
        <RecordShowPage />
      </MemoryRouter>
    </Provider>,
  );
  return {
    ...rendered,
    store,
    rerender: (children: React.ReactNode) =>
      rendered.rerender(<Provider store={store}>{children}</Provider>),
  };
};

describe('Campaign record page availability boundary', () => {
  beforeEach(() => {
    objectNameSingular = 'campaign';
    showQuery = {
      record: { id: 'record-1', name: 'Private campaign' },
      loading: false,
      hasReadPermission: true,
    };
    refetch.mockClear();
  });

  it.each([
    ['missing', undefined],
    ['failed', new Error('Read denied')],
  ])(
    'removes record-dependent actions after loaded → %s read, retaining safe index navigation',
    (_state, error) => {
      const { rerender } = renderPage();
      expect(
        screen.getByRole('button', { name: 'Start campaign' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Edit campaign tab' }),
      ).toBeVisible();
      fireEvent.change(screen.getByRole('textbox', { name: 'Unsaved draft' }), {
        target: { value: 'Unsubmitted edit' },
      });

      showQuery = { loading: true, hasReadPermission: true };
      rerender(
        <MemoryRouter>
          <RecordShowPage />
        </MemoryRouter>,
      );
      // A transient refetch must not unmount edited tabs or lose unsaved state.
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Start campaign' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Edit campaign tab' }),
      ).toBeVisible();
      expect(
        screen.getByRole('textbox', { name: 'Unsaved draft' }),
      ).toHaveValue('Unsubmitted edit');
      expect(
        screen.getByRole('button', { name: 'Back to Campaigns' }),
      ).toBeVisible();

      showQuery = { loading: false, error, hasReadPermission: true };
      rerender(
        <MemoryRouter>
          <RecordShowPage />
        </MemoryRouter>,
      );
      expect(
        screen.queryByRole('button', { name: 'Start campaign' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Record actions' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Edit campaign tab' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Record SSE subscription'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Back to Campaigns' }),
      ).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent(
        error ? 'Unable to load campaign' : 'Campaign is unavailable',
      );
      if (error) {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(refetch).toHaveBeenCalledTimes(1);
      } else {
        expect(
          screen.queryByRole('button', { name: 'Retry' }),
        ).not.toBeInTheDocument();
      }

      showQuery = { loading: true, hasReadPermission: true };
      rerender(
        <MemoryRouter>
          <RecordShowPage />
        </MemoryRouter>,
      );
      expect(screen.getByRole('status')).toHaveTextContent('Loading campaign');
      expect(
        screen.queryByRole('button', { name: 'Start campaign' }),
      ).not.toBeInTheDocument();

      showQuery = {
        record: { id: 'record-1', name: 'Recovered' },
        loading: false,
        hasReadPermission: true,
      };
      rerender(
        <MemoryRouter>
          <RecordShowPage />
        </MemoryRouter>,
      );
      expect(
        screen.getByRole('button', { name: 'Start campaign' }),
      ).toBeVisible();
    },
  );

  it('treats a record-level FORBIDDEN read as denied without a generic retry', () => {
    const { rerender } = renderPage();
    expect(
      screen.getByRole('button', { name: 'Start campaign' }),
    ).toBeVisible();

    showQuery = {
      loading: false,
      record: { id: 'record-1', name: 'Private campaign' },
      hasReadPermission: true,
      error: new CombinedGraphQLErrors({
        errors: [
          { message: 'Access denied', extensions: { code: 'FORBIDDEN' } },
        ],
        data: null,
      }),
    };
    rerender(
      <MemoryRouter>
        <RecordShowPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have access to this campaign',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start campaign' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Record SSE subscription'),
    ).not.toBeInTheDocument();
  });

  it('invalidates a confirmed Campaign when workspace changes while the new read is pending', () => {
    const { store, rerender } = renderPage();
    expect(
      screen.getByRole('button', { name: 'Start campaign' }),
    ).toBeVisible();
    expect(store.get(recordStoreFamilyState.atomFamily('record-1'))?.name).toBe(
      'Private campaign',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Unsaved draft' }), {
      target: { value: 'Workspace A edit' },
    });
    showQuery = {
      record: { id: 'record-1', name: 'Private campaign' },
      loading: true,
      hasReadPermission: true,
    };
    rerender(
      <MemoryRouter>
        <RecordShowPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('textbox', { name: 'Unsaved draft' })).toHaveValue(
      'Workspace A edit',
    );

    act(() =>
      store.set(currentWorkspaceState.atom, { id: 'workspace-b' } as never),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have access',
    );
    act(() =>
      store.set(tokenPairState.atom, {
        accessOrWorkspaceAgnosticToken: {
          token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-b', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
        },
      } as never),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign');
    expect(
      screen.queryByRole('button', { name: 'Start campaign' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit campaign tab' }),
    ).not.toBeInTheDocument();
    expect(store.get(recordStoreFamilyState.atomFamily('record-1'))).toBeNull();

    showQuery = {
      record: { id: 'record-1', name: 'Workspace B campaign' },
      loading: false,
      hasReadPermission: true,
    };
    rerender(
      <MemoryRouter>
        <RecordShowPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('button', { name: 'Start campaign' }),
    ).toBeVisible();
    expect(store.get(recordStoreFamilyState.atomFamily('record-1'))?.name).toBe(
      'Workspace B campaign',
    );
  });

  it('distinguishes initial loading from a previously confirmed record', () => {
    showQuery = { loading: true, hasReadPermission: true };
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign');
    expect(
      screen.queryByRole('button', { name: 'Start campaign' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Back to Campaigns' }),
    ).toBeVisible();
  });

  it('keeps an object-level denial separate from loading and leaves non-Campaign routes unchanged', () => {
    showQuery = { loading: false, hasReadPermission: false };
    const { rerender } = renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
    expect(
      screen.queryByRole('button', { name: 'Start campaign' }),
    ).not.toBeInTheDocument();
    objectNameSingular = 'company';
    rerender(
      <MemoryRouter>
        <RecordShowPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('button', { name: 'Record actions' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Edit campaign tab' }),
    ).toBeVisible();
  });
});
