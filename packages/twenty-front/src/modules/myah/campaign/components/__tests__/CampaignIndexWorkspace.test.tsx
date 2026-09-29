import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { useAggregateRecords } from '@/object-record/hooks/useAggregateRecords';
import { AggregateOperations } from '~/generated-metadata/graphql';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import {
  campaignCreationActorKey,
  campaignCreationAttemptKey,
} from '@/apollo/utils/campaignCreationOperation';
import { type CampaignCreationIdentity } from '@/object-record/record-index/types/CampaignCreationAttempt';
import {
  campaignCreationState,
  subscribeCampaignCreationSession,
} from '@/object-record/record-index/states/campaignCreationState';
import {
  CampaignIndexCreationAction,
  CampaignIndexSummary,
  CampaignIndexWorkspace,
} from '@/myah/campaign/components/CampaignIndexWorkspace';
import { RecordIndexContainerGater } from '@/object-record/record-index/components/RecordIndexContainerGater';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import {
  mockCurrentWorkspace,
  mockedUserData,
  mockedWorkspaceMemberData,
} from '~/testing/mock-data/users';

const createNewIndexRecord = jest.fn();
let canCreate = true;
let canRead = true;
let aggregateLoading = false;
let aggregateError: Error | undefined;
let aggregateCount: number | undefined = 4;
let participationCount: number | undefined = 7;
let canReadParticipation = true;
const identity: CampaignCreationIdentity = {
  workspaceId: 'workspace-a',
  userId: 'user-a',
  userWorkspaceId: 'user-workspace-a',
  isImpersonating: false,
};
let activeIdentity = identity;
const tokenFor = (value: CampaignCreationIdentity) =>
  `header.${btoa(JSON.stringify({ type: 'ACCESS', ...value }))}.signature`;

jest.mock('@/apollo/utils/getTokenPair', () => ({ getTokenPair: jest.fn() }));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem: {
      id:
        objectNameSingular === 'campaign'
          ? 'campaign-id'
          : 'campaign-creator-id',
    },
  }),
}));
jest.mock('@/object-record/hooks/useAggregateRecords', () => ({
  useAggregateRecords: jest.fn(
    ({ objectNameSingular }: { objectNameSingular: string }) => ({
      data: {
        id:
          (objectNameSingular === 'campaign'
            ? aggregateCount
            : participationCount) === undefined
            ? {}
            : {
                [AggregateOperations.COUNT]:
                  objectNameSingular === 'campaign'
                    ? aggregateCount
                    : participationCount,
              },
      },
      loading: aggregateLoading,
      error: aggregateError,
    }),
  ),
}));

const setAttempt = (
  store: ReturnType<typeof createStore>,
  name: string,
  phase: 'unconfirmed' | 'saved' = 'unconfirmed',
) => {
  const state = store.get(campaignCreationState.atom);
  store.set(campaignCreationState.atom, {
    ...state,
    actorKey: campaignCreationActorKey(activeIdentity),
    attempts: {
      ...state.attempts,
      [campaignCreationAttemptKey(activeIdentity)]: {
        identity: activeIdentity,
        objectMetadataId: 'campaign-id',
        recordId: 'campaign-attempt-a',
        inputJson: JSON.stringify({ id: 'campaign-attempt-a', name }),
        origin: {
          recordIndexId: 'campaign-view',
          contextStoreInstanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
          returnPath:
            window.location.pathname +
            window.location.search +
            window.location.hash,
        },
        phase,
        runId: null,
        uncertain: true,
        completionAttempted: false,
        warnings: [],
      } as never,
    },
  });
};
const subscribeTestSession = (store: ReturnType<typeof createStore>) => {
  store.set(currentUserState.atom, { ...mockedUserData, id: identity.userId });
  store.set(currentWorkspaceState.atom, {
    ...mockCurrentWorkspace,
    id: identity.workspaceId,
  });
  store.set(currentWorkspaceMemberState.atom, {
    ...mockedWorkspaceMemberData,
    userWorkspaceId: identity.userWorkspaceId,
  });
  store.set(
    currentUserWorkspaceState.atom,
    mockedUserData.currentUserWorkspace,
  );
  store.set(tokenPairState.atom, {
    accessOrWorkspaceAgnosticToken: {
      token: tokenFor(identity),
      expiresAt: '2099-01-01',
    },
    refreshToken: { token: 'fixture', expiresAt: '2099-01-01' },
  });
  return subscribeCampaignCreationSession(store);
};

const renderWorkspace = () => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, {
    ...mockCurrentWorkspace,
    id: identity.workspaceId,
  });
  store.set(currentUserState.atom, { ...mockedUserData, id: identity.userId });
  store.set(currentWorkspaceMemberState.atom, {
    ...mockedWorkspaceMemberData,
    userWorkspaceId: identity.userWorkspaceId,
  });
  const result = render(
    <Provider store={store}>
      <CampaignIndexSummary />
    </Provider>,
  );
  return {
    ...result,
    rerenderWorkspace: () =>
      result.rerender(
        <Provider store={store}>
          <CampaignIndexSummary />
        </Provider>,
      ),
  };
};

const renderCreation = (store = createStore()) => {
  if (!store.get(currentWorkspaceState.atom)) {
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: activeIdentity.workspaceId,
    });
  }
  if (!store.get(currentUserState.atom)) {
    store.set(currentUserState.atom, {
      ...mockedUserData,
      id: activeIdentity.userId,
    });
  }
  if (!store.get(currentWorkspaceMemberState.atom)) {
    store.set(currentWorkspaceMemberState.atom, {
      ...mockedWorkspaceMemberData,
      userWorkspaceId: activeIdentity.userWorkspaceId,
    });
  }
  return {
    store,
    ...render(
      <Provider store={store}>
        <CampaignIndexCreationAction />
      </Provider>,
    ),
  };
};

jest.mock(
  '@/object-record/record-index/components/RecordIndexContainerGater',
  () => ({
    RecordIndexContainerGater: jest.fn(() => (
      <div data-testid="native-index" />
    )),
  }),
);
jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectMetadataItem: { id: 'campaign-id', nameSingular: 'campaign' },
    recordIndexId: 'campaign-view',
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: (id: string) => ({
    canCreateObjectRecords: canCreate,
    canReadObjectRecords:
      id === 'campaign-creator-id' ? canReadParticipation : canRead,
  }),
}));
jest.mock(
  '@/object-record/utils/canCreateRecordsForObjectMetadataItem',
  () => ({
    canCreateRecordsForObjectMetadataItem: ({
      objectPermissions,
    }: {
      objectPermissions: { canCreateObjectRecords: boolean };
    }) => objectPermissions.canCreateObjectRecords,
  }),
);
jest.mock('@/object-record/record-table/hooks/useCreateNewIndexRecord', () => ({
  useCreateNewIndexRecord: jest.fn(() => ({ createNewIndexRecord })),
}));
jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: jest.fn(), closeModal: jest.fn() }),
}));
jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({
    children,
    modal,
    ariaLabel,
  }: {
    children: React.ReactNode;
    modal?: boolean;
    ariaLabel?: string;
  }) => (
    <div role="dialog" aria-label={ariaLabel} aria-modal={modal}>
      {children}
    </div>
  ),
}));

describe('CampaignIndexWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canCreate = true;
    canRead = true;
    aggregateLoading = false;
    aggregateError = undefined;
    aggregateCount = 4;
    participationCount = 7;
    canReadParticipation = true;
    activeIdentity = identity;
    jest.mocked(getTokenPair).mockImplementation(
      () =>
        ({
          accessOrWorkspaceAgnosticToken: { token: tokenFor(activeIdentity) },
        }) as never,
    );
  });

  it('shows the Campaign portfolio by default and keeps native table access and creation context', () => {
    render(<CampaignIndexWorkspace />);
    expect(screen.getByTestId('native-index')).toBeVisible();
    expect(
      screen.queryByText(/Your campaigns, from first draft/),
    ).not.toBeInTheDocument();
    expect(RecordIndexContainerGater).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignCreationAction: expect.anything(),
        campaignOverviewSummary: expect.anything(),
        campaignOverviewContent: expect.anything(),
      }),
      undefined,
    );
  });

  it('summarizes the permission-scoped all-campaign aggregate, not visible table rows or inferred partnership stages', () => {
    renderWorkspace();
    expect(screen.getByText('4')).toBeVisible();
    expect(
      screen.getByText('Accessible campaigns across all views'),
    ).toBeVisible();
    expect(useAggregateRecords).toHaveBeenCalledWith({
      objectNameSingular: 'campaign',
      recordGqlFieldsAggregate: { id: [AggregateOperations.COUNT] },
      skip: false,
    });
    expect(screen.getByText('7')).toBeVisible();
    expect(
      screen.getByText('Creator-campaign participations across all campaigns'),
    ).toBeVisible();
    expect(useAggregateRecords).toHaveBeenCalledWith({
      objectNameSingular: 'campaignCreator',
      recordGqlFieldsAggregate: { id: [AggregateOperations.COUNT] },
      skip: false,
    });
    expect(
      screen.queryByText(/Agreed|fulfillment|Next action/),
    ).not.toBeInTheDocument();
  });

  it('labels unsupported all-campaign outreach status as unavailable without inferring it from participations', () => {
    renderWorkspace();
    expect(screen.getByText('Outreach status across campaigns')).toBeVisible();
    expect(
      screen.getByText('Unavailable — no verified all-campaign breakdown'),
    ).toBeVisible();
    expect(screen.queryByText(/Outreach status.*7/)).not.toBeInTheDocument();
    expect(
      new Set(
        jest
          .mocked(useAggregateRecords)
          .mock.calls.map(([query]) => query.objectNameSingular),
      ),
    ).toEqual(new Set(['campaign', 'campaignCreator']));
  });

  it('does not expose participation totals without participation read permission', () => {
    canReadParticipation = false;
    renderWorkspace();
    expect(screen.getByText('4')).toBeVisible();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(
      screen.getByText('Participation summary requires read access.'),
    ).toBeVisible();
    expect(useAggregateRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'campaignCreator',
        skip: true,
      }),
    );
  });

  it('distinguishes loading, failure, denied access and authoritative zero from each other', () => {
    aggregateLoading = true;
    const view = renderWorkspace();
    expect(screen.getByText('Loading campaign summary…')).toBeVisible();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    aggregateLoading = false;
    aggregateError = new Error('network failed');
    view.rerenderWorkspace();
    expect(screen.getByText(/Campaign summary unavailable/)).toBeVisible();
    expect(screen.getByText(/Participation summary unavailable/)).toBeVisible();
    aggregateError = undefined;
    canRead = false;
    view.rerenderWorkspace();
    expect(
      screen.getByText('Campaign summary requires read access.'),
    ).toBeVisible();
    expect(
      screen.getByText('Outreach summary requires Campaign read access.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Unavailable — no verified all-campaign breakdown'),
    ).not.toBeInTheDocument();
    expect(useAggregateRecords).toHaveBeenCalledWith(
      expect.objectContaining({ objectNameSingular: 'campaign', skip: true }),
    );
    canRead = true;
    aggregateCount = 0;
    view.rerenderWorkspace();
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('No accessible campaigns yet.')).toBeVisible();
  });

  it('does not show a previous workspace aggregate during a token/workspace mismatch', () => {
    const store = createStore();
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: 'workspace-b',
    });
    render(
      <Provider store={store}>
        <CampaignIndexSummary />
      </Provider>,
    );
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    expect(
      screen.getByText('Outreach summary requires Campaign read access.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Unavailable — no verified all-campaign breakdown'),
    ).not.toBeInTheDocument();
    expect(useAggregateRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('cancel does not submit a valid named draft', () => {
    renderCreation();
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Draft that must not save' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it.each(['workspace', 'user', 'member', 'token'] as const)(
    'blocks fresh creation when the current %s no longer matches the token',
    (boundary) => {
      const store = createStore();
      if (boundary === 'workspace') {
        store.set(currentWorkspaceState.atom, {
          ...mockCurrentWorkspace,
          id: 'other-workspace',
        });
      } else if (boundary === 'user') {
        store.set(currentUserState.atom, {
          ...mockedUserData,
          id: 'other-user',
        });
      } else if (boundary === 'member') {
        store.set(currentWorkspaceMemberState.atom, {
          ...mockedWorkspaceMemberData,
          userWorkspaceId: 'other-membership',
        });
      } else {
        jest.mocked(getTokenPair).mockReturnValue(undefined);
      }
      renderCreation(store);
      fireEvent.change(screen.getByLabelText('Campaign name'), {
        target: { value: 'Do not create' },
      });
      expect(
        screen.getByRole('button', { name: 'New campaign' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Create draft' }),
      ).toBeDisabled();
      expect(createNewIndexRecord).not.toHaveBeenCalled();
    },
  );

  it('blocks recovery on a changed workspace even with a frozen attempt', () => {
    const store = createStore();
    setAttempt(store, 'Frozen campaign');
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: 'other-workspace',
    });
    renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Frozen campaign',
    );
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('rechecks the token at submission even before a React rerender', () => {
    renderCreation();
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Stale token draft' },
    });
    jest.mocked(getTokenPair).mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('does not publish a result after an identity boundary changes without a session notification', async () => {
    const store = createStore();
    let resolveCreate: (value: { id: string }) => void = () => {};
    createNewIndexRecord.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderCreation(store);
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Late response' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(createNewIndexRecord).toHaveBeenCalledTimes(1);
    act(() =>
      store.set(currentWorkspaceState.atom, {
        ...mockCurrentWorkspace,
        id: 'other-workspace',
      }),
    );
    await act(async () => resolveCreate({ id: 'late-campaign' }));
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'New campaign' })).toBeVisible();
  });

  it('submits a named draft once, and retries a lost response using the same hook', async () => {
    let resolveFirst: (value: undefined) => void = () => {};
    createNewIndexRecord
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ id: 'recovered-campaign' });
    const { store } = renderCreation();
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: '  Autumn creators  ' },
    });
    fireEvent.click(screen.getByText('Create draft'));
    fireEvent.click(screen.getByText('Checking…'));
    expect(createNewIndexRecord).toHaveBeenCalledTimes(1);
    act(() => setAttempt(store, 'Autumn creators'));
    resolveFirst(undefined);
    await screen.findByText('Retry creation');
    expect(screen.getByLabelText('Campaign name')).toBeDisabled();
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Autumn creators',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'check the same creation',
    );
    fireEvent.click(screen.getByText('Retry creation'));
    await waitFor(() => expect(createNewIndexRecord).toHaveBeenCalledTimes(2));
    expect(createNewIndexRecord).toHaveBeenNthCalledWith(1, {
      name: 'Autumn creators',
    });
    expect(createNewIndexRecord).toHaveBeenNthCalledWith(2, {
      name: 'Autumn creators',
    });
    expect(useCreateNewIndexRecord).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'campaign-view' }),
    );
  });

  it('allows a corrected name after a definite create rejection clears the attempt', async () => {
    const store = createStore();
    createNewIndexRecord
      .mockImplementationOnce(async () => {
        const state = store.get(campaignCreationState.atom);
        store.set(campaignCreationState.atom, {
          ...state,
          attempts: {},
        });
        return undefined;
      })
      .mockResolvedValueOnce({ id: 'corrected-campaign' });
    renderCreation(store);
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Invalid name' },
    });
    fireEvent.click(screen.getByText('Create draft'));
    await screen.findByText('Try again');
    const input = screen.getByLabelText('Campaign name');
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'Corrected name' } });
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(createNewIndexRecord).toHaveBeenCalledTimes(2));
    expect(createNewIndexRecord).toHaveBeenNthCalledWith(2, {
      name: 'Corrected name',
    });
  });

  it('restores the saved attempt name on remount and cannot substitute a new name', async () => {
    const store = createStore();
    setAttempt(store, 'Original campaign');
    const first = renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Original campaign',
    );
    expect(screen.getByLabelText('Campaign name')).toBeDisabled();
    first.unmount();
    createNewIndexRecord.mockResolvedValueOnce(undefined);
    renderCreation(store);
    fireEvent.click(screen.getByText('Create draft'));
    await waitFor(() =>
      expect(createNewIndexRecord).toHaveBeenCalledWith({
        name: 'Original campaign',
      }),
    );
  });

  it('does not reuse a previous workspace attempt after the identity changes', async () => {
    const store = createStore();
    setAttempt(store, 'Workspace A campaign');
    const { unmount } = renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Workspace A campaign',
    );
    unmount();
    activeIdentity = {
      ...identity,
      workspaceId: 'workspace-b',
      userWorkspaceId: 'user-workspace-b',
    };
    store.set(campaignCreationState.atom, {
      ...store.get(campaignCreationState.atom),
      actorKey: campaignCreationActorKey(activeIdentity),
      sessionGeneration: 1,
      attempts: {},
    });
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: activeIdentity.workspaceId,
    });
    store.set(currentWorkspaceMemberState.atom, {
      ...mockedWorkspaceMemberData,
      userWorkspaceId: activeIdentity.userWorkspaceId,
    });
    renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue('');
    expect(screen.getByLabelText('Campaign name')).toBeEnabled();
  });

  it('does not offer a new draft when an attempt belongs to another index view', () => {
    const store = createStore();
    setAttempt(store, 'Pending elsewhere');
    const state = store.get(campaignCreationState.atom);
    const key = campaignCreationAttemptKey(activeIdentity);
    store.set(campaignCreationState.atom, {
      ...state,
      attempts: {
        ...state.attempts,
        [key]: {
          ...state.attempts[key],
          origin: {
            ...state.attempts[key].origin,
            recordIndexId: 'other-view',
          },
        },
      },
    });
    renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Pending elsewhere',
    );
    expect(screen.getByLabelText('Campaign name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'original Campaign view',
    );
  });

  it('keeps the saved name but blocks retry outside the original route', () => {
    const store = createStore();
    setAttempt(store, 'Original route campaign');
    const state = store.get(campaignCreationState.atom);
    const key = campaignCreationAttemptKey(activeIdentity);
    store.set(campaignCreationState.atom, {
      ...state,
      attempts: {
        ...state.attempts,
        [key]: {
          ...state.attempts[key],
          origin: {
            ...state.attempts[key].origin,
            returnPath: '/different-route',
          },
        },
      },
    });
    renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Original route campaign',
    );
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
  });

  it('does not display an old attempt after membership identity changes in the same workspace', () => {
    const store = createStore();
    setAttempt(store, 'Previous member campaign');
    const { unmount } = renderCreation(store);
    unmount();
    activeIdentity = { ...identity, userWorkspaceId: 'new-member-id' };
    store.set(currentWorkspaceMemberState.atom, {
      ...mockedWorkspaceMemberData,
      userWorkspaceId: activeIdentity.userWorkspaceId,
    });
    renderCreation(store);
    expect(screen.getByLabelText('Campaign name')).toHaveValue('');
    expect(screen.getByLabelText('Campaign name')).toBeEnabled();
  });

  it('clears unsent input on the actual same-actor workspace boundary', async () => {
    const store = createStore();
    const unsubscribe = subscribeTestSession(store);
    try {
      const { unmount } = renderCreation(store);
      fireEvent.change(screen.getByLabelText('Campaign name'), {
        target: { value: 'Workspace A unsent name' },
      });
      const before = store.get(campaignCreationState.atom);
      act(() => {
        store.set(currentWorkspaceState.atom, {
          ...mockCurrentWorkspace,
          id: 'workspace-b',
        });
      });
      const after = store.get(campaignCreationState.atom);
      expect(after.sessionGeneration).toBe(before.sessionGeneration);
      expect(after.boundaryGeneration).toBeGreaterThan(
        before.boundaryGeneration,
      );
      await waitFor(() =>
        expect(screen.getByLabelText('Campaign name')).toHaveValue(''),
      );
      expect(
        screen.getByRole('button', { name: 'Create draft' }),
      ).toBeDisabled();
      unmount();
    } finally {
      unsubscribe();
    }
  });

  it('keeps the frozen attempt name on a same-actor permission boundary', () => {
    const store = createStore();
    const unsubscribe = subscribeTestSession(store);
    try {
      setAttempt(store, 'Frozen campaign');
      const { unmount } = renderCreation(store);
      const before = store.get(campaignCreationState.atom);
      act(() => {
        store.set(currentUserWorkspaceState.atom, {
          ...mockedUserData.currentUserWorkspace,
          objectsPermissions: [],
        });
      });
      expect(
        store.get(campaignCreationState.atom).boundaryGeneration,
      ).toBeGreaterThan(before.boundaryGeneration);
      expect(screen.getByLabelText('Campaign name')).toHaveValue(
        'Frozen campaign',
      );
      expect(screen.getByLabelText('Campaign name')).toBeDisabled();
      unmount();
    } finally {
      unsubscribe();
    }
  });

  it('provides modal semantics and an accessible dialog name', () => {
    renderCreation();
    expect(
      screen.getByRole('dialog', { name: 'New campaign' }),
    ).toHaveAttribute('aria-modal', 'true');
  });

  it.each(['unconfirmed', 'saved'] as const)(
    'allows read confirmation of a %s attempt when create permission was revoked',
    async (phase) => {
      canCreate = false;
      const store = createStore();
      setAttempt(store, 'Recoverable campaign', phase);
      createNewIndexRecord.mockResolvedValueOnce(undefined);
      renderCreation(store);
      expect(
        screen.getByRole('button', { name: 'New campaign' }),
      ).toBeEnabled();
      expect(screen.getByLabelText('Campaign name')).toHaveValue(
        'Recoverable campaign',
      );
      expect(screen.getByLabelText('Campaign name')).toBeDisabled();
      expect(screen.queryByText('current access')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check campaign' }));
      await waitFor(() =>
        expect(createNewIndexRecord).toHaveBeenCalledWith({
          name: 'Recoverable campaign',
        }),
      );
      expect(createNewIndexRecord).toHaveBeenCalledTimes(1);
    },
  );

  it('disables fresh creation when create is allowed but read is denied', () => {
    canRead = false;
    renderCreation();
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('does not offer recovery when read permission was revoked', () => {
    canCreate = false;
    canRead = false;
    const store = createStore();
    setAttempt(store, 'Unreadable campaign');
    renderCreation(store);
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('current access');
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('does not offer recovery when create remains allowed but read permission is revoked', () => {
    canRead = false;
    const store = createStore();
    setAttempt(store, 'Unreadable existing campaign');
    renderCreation(store);
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Campaign recovery is unavailable',
    );
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('stops confirmation after read permission is revoked while the attempt is visible', () => {
    canCreate = false;
    const store = createStore();
    setAttempt(store, 'Previously readable campaign');
    const view = renderCreation(store);
    expect(
      screen.getByRole('button', { name: 'Check campaign' }),
    ).toBeEnabled();
    canRead = false;
    view.rerender(
      <Provider store={store}>
        <CampaignIndexCreationAction />
      </Provider>,
    );
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('does not allow an old workspace attempt to bypass revoked create access', () => {
    canCreate = false;
    const store = createStore();
    setAttempt(store, 'Other workspace campaign');
    activeIdentity = {
      ...identity,
      workspaceId: 'workspace-b',
      userWorkspaceId: 'user-workspace-b',
    };
    renderCreation(store);
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    expect(createNewIndexRecord).not.toHaveBeenCalled();
  });

  it('prevents creation when write access is absent', () => {
    canCreate = false;
    renderCreation();
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('current access');
  });
});
