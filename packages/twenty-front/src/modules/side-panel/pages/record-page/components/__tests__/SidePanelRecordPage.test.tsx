import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';

import {
  SidePanelRecordPage,
  SidePanelRecordPageContent,
} from '@/side-panel/pages/record-page/components/SidePanelRecordPage';

const mockPageLayoutRecordPageRenderer = jest.fn();
const mockUseAtomComponentStateValue = jest.fn();
let mockCampaignRead: {
  record?: { id: string };
  loading: boolean;
  error?: Error;
  hasReadPermission: boolean;
};
const mockRefetch = jest.fn();

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
  useFindOneRecord: () => ({ ...mockCampaignRead, refetch: mockRefetch }),
}));

jest.mock(
  '@/object-record/components/RecordComponentInstanceContextsWrapper',
  () => ({
    RecordComponentInstanceContextsWrapper: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  }),
);

jest.mock(
  '@/object-record/record-show/components/PageLayoutRecordPageRenderer',
  () => ({
    PageLayoutRecordPageRenderer: (props: unknown) => {
      mockPageLayoutRecordPageRenderer(props);

      return (
        <>
          <button type="button">Record actions</button>
          <input aria-label="Unsaved draft" />
        </>
      );
    },
  }),
);

jest.mock('@/object-record/record-show/hooks/useRecordShowPage', () => ({
  useRecordShowPage: (objectNameSingular: string, objectRecordId: string) => ({
    objectNameSingular,
    objectRecordId,
  }),
}));

jest.mock(
  '@/object-record/record-store/states/selectors/recordStoreFamilySelector',
  () => ({
    recordStoreFamilySelector: {},
  }),
);

jest.mock(
  '@/side-panel/pages/record-page/states/viewableRecordIdComponentState',
  () => ({
    viewableRecordIdComponentState: {},
  }),
);

jest.mock(
  '@/side-panel/pages/record-page/states/viewableRecordNameSingularComponentState',
  () => ({
    viewableRecordNameSingularComponentState: {},
  }),
);

jest.mock(
  '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext',
  () => ({
    SidePanelPageComponentInstanceContext: {},
  }),
);

jest.mock(
  '@/command-menu/states/contexts/CommandMenuComponentInstanceContext',
  () => ({
    CommandMenuComponentInstanceContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  }),
);

jest.mock(
  '@/context-store/states/contexts/ContextStoreComponentInstanceContext',
  () => ({
    ContextStoreComponentInstanceContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  }),
);

jest.mock(
  '@/activities/timeline-activities/contexts/TimelineActivityContext',
  () => ({
    TimelineActivityContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  }),
);

jest.mock(
  '@/ui/utilities/state/component-state/hooks/useComponentInstanceStateContext',
  () => ({
    useComponentInstanceStateContext: () => ({ instanceId: 'side-panel-1' }),
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (...args: unknown[]) =>
      mockUseAtomComponentStateValue(...args),
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({
    useAtomFamilySelectorValue: () => null,
  }),
);

describe('SidePanelRecordPage', () => {
  beforeEach(() => {
    mockPageLayoutRecordPageRenderer.mockClear();
    mockUseAtomComponentStateValue.mockReset();
    mockCampaignRead = {
      record: { id: 'campaign-1' },
      loading: false,
      hasReadPermission: true,
    };
  });

  it('renders reusable native content in default-tab-only mode', () => {
    render(
      <SidePanelRecordPageContent
        objectNameSingular="creator"
        objectRecordId="creator-1"
        renderMode="default-tab-only"
      />,
    );

    expect(mockPageLayoutRecordPageRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRecordIdentifier: {
          id: 'creator-1',
          targetObjectNameSingular: 'creator',
        },
        isInSidePanel: true,
        renderMode: 'default-tab-only',
      }),
    );
  });

  it.each([
    ['missing', undefined],
    ['failed', new Error('Read denied')],
  ])(
    'gates Campaign drawer actions after a loaded → %s result',
    (_state, error) => {
      const store = createStore();
      store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
      store.set(tokenPairState.atom, {
        accessOrWorkspaceAgnosticToken: {
          token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-a', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
        },
      } as never);
      const view = () => (
        <Provider store={store}>
          <SidePanelRecordPageContent
            objectNameSingular="campaign"
            objectRecordId="campaign-1"
          />
        </Provider>
      );
      const { rerender } = render(view());
      expect(
        screen.getByRole('button', { name: 'Record actions' }),
      ).toBeVisible();
      fireEvent.change(screen.getByRole('textbox', { name: 'Unsaved draft' }), {
        target: { value: 'Unsubmitted edit' },
      });

      mockCampaignRead = {
        loading: true,
        hasReadPermission: true,
      };
      rerender(view());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Record actions' }),
      ).toBeVisible();
      expect(
        screen.getByRole('textbox', { name: 'Unsaved draft' }),
      ).toHaveValue('Unsubmitted edit');

      mockCampaignRead = { loading: false, error, hasReadPermission: true };
      rerender(view());
      expect(screen.getByRole('alert')).toHaveTextContent(
        error ? 'Unable to load campaign' : 'Campaign is unavailable',
      );
      expect(
        screen.queryByRole('button', { name: 'Record actions' }),
      ).not.toBeInTheDocument();

      mockCampaignRead = {
        record: { id: 'campaign-1' },
        loading: false,
        hasReadPermission: true,
      };
      rerender(view());
      expect(
        screen.getByRole('button', { name: 'Record actions' }),
      ).toBeVisible();
    },
  );

  it('treats a record-level FORBIDDEN read as denied without a generic retry', () => {
    const store = createStore();
    store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
    store.set(tokenPairState.atom, {
      accessOrWorkspaceAgnosticToken: {
        token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-a', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
      },
    } as never);
    const view = () => (
      <Provider store={store}>
        <SidePanelRecordPageContent
          objectNameSingular="campaign"
          objectRecordId="campaign-1"
        />
      </Provider>
    );
    const { rerender } = render(view());
    expect(
      screen.getByRole('button', { name: 'Record actions' }),
    ).toBeVisible();

    mockCampaignRead = {
      loading: false,
      record: { id: 'campaign-1' },
      hasReadPermission: true,
      error: new CombinedGraphQLErrors({
        errors: [
          { message: 'Access denied', extensions: { code: 'FORBIDDEN' } },
        ],
        data: null,
      }),
    };
    rerender(view());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have access to this campaign',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record actions' }),
    ).not.toBeInTheDocument();
  });

  it('invalidates the confirmed Campaign drawer on an in-place workspace switch', () => {
    const store = createStore();
    store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
    store.set(tokenPairState.atom, {
      accessOrWorkspaceAgnosticToken: {
        token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-a', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
      },
    } as never);
    const view = () => (
      <Provider store={store}>
        <SidePanelRecordPageContent
          objectNameSingular="campaign"
          objectRecordId="campaign-1"
        />
      </Provider>
    );
    const { rerender } = render(view());
    expect(
      screen.getByRole('button', { name: 'Record actions' }),
    ).toBeVisible();
    expect(store.get(recordStoreFamilyState.atomFamily('campaign-1'))?.id).toBe(
      'campaign-1',
    );
    mockCampaignRead = {
      record: { id: 'campaign-1' },
      loading: true,
      hasReadPermission: true,
    };
    rerender(view());
    expect(
      screen.getByRole('button', { name: 'Record actions' }),
    ).toBeVisible();
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
      screen.queryByRole('button', { name: 'Record actions' }),
    ).not.toBeInTheDocument();
    expect(
      store.get(recordStoreFamilyState.atomFamily('campaign-1')),
    ).toBeNull();
    mockCampaignRead = {
      record: { id: 'campaign-1' },
      loading: false,
      hasReadPermission: true,
    };
    rerender(view());
    expect(
      screen.getByRole('button', { name: 'Record actions' }),
    ).toBeVisible();
  });

  it('does not mount Campaign actions during initial loading', () => {
    mockCampaignRead = { loading: true, hasReadPermission: true };
    const store = createStore();
    store.set(currentWorkspaceState.atom, { id: 'workspace-a' } as never);
    store.set(tokenPairState.atom, {
      accessOrWorkspaceAgnosticToken: {
        token: `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-a', userId: 'test-user', userWorkspaceId: 'test-member' }))}.signature`,
      },
    } as never);
    render(
      <Provider store={store}>
        <SidePanelRecordPageContent
          objectNameSingular="campaign"
          objectRecordId="campaign-1"
        />
      </Provider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign');
    expect(
      screen.queryByRole('button', { name: 'Record actions' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the registered native record drawer in all-tabs mode', () => {
    mockUseAtomComponentStateValue
      .mockReturnValueOnce('creator')
      .mockReturnValueOnce('creator-1');

    render(<SidePanelRecordPage />);

    expect(mockPageLayoutRecordPageRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRecordIdentifier: {
          id: 'creator-1',
          targetObjectNameSingular: 'creator',
        },
        isInSidePanel: true,
        renderMode: undefined,
      }),
    );
  });
});
