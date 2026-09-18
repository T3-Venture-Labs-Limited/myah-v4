import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';
import {
  MyahInboxDraftAutosaveProvider,
  useMyahInboxDraftAutosaveController,
} from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import { myahInboxPreserveSelectionOnUnmountState } from '@/myah/inbox/states/myahInboxSelectionState';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { type MyahInboxDraftAutosaveEntry } from '@/myah/inbox/types/MyahInboxDraftAutosave';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

let mockClient: ApolloClient;
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: jest.fn(),
    enqueueWarningSnackBar: jest.fn(),
    enqueueInfoSnackBar: jest.fn(),
    enqueueErrorSnackBar: jest.fn(),
  }),
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    ariaLabel,
    disabled,
    onClick,
    'aria-disabled': ariaDisabled,
    'aria-describedby': ariaDescribedBy,
  }: {
    title: string;
    ariaLabel?: string;
    disabled?: boolean;
    onClick?: () => void;
    'aria-disabled'?: boolean;
    'aria-describedby'?: string;
  }) => (
    <button
      aria-disabled={ariaDisabled}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  ),
}));
jest.mock('twenty-ui/layout', () => ({
  AnimatedCircleLoading: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/myah/inbox/components/MyahInboxDraftEditor', () => ({
  MyahInboxDraftEditor: ({
    entry,
    disabled,
    onDraftChange,
    actions,
    presentation,
    subject,
    initialIsEditing,
    onEditingChange,
    onOpenAiGuidance,
    guidanceUnavailableReason,
  }: {
    entry: MyahInboxDraftAutosaveEntry;
    disabled: boolean;
    onDraftChange: (body: { markdown: string; blocknote: null }) => void;
    actions: ReactNode;
    presentation?: 'default' | 'main';
    subject?: string;
    initialIsEditing?: boolean;
    onEditingChange?: (isEditing: boolean) => void;
    onOpenAiGuidance?: () => void;
    guidanceUnavailableReason?: string;
  }) => (
    <div
      data-presentation={presentation}
      data-initial-is-editing={initialIsEditing}
      data-testid="draft-editor"
    >
      <input
        aria-label="Real shared draft"
        value={entry.localBody.markdown}
        disabled={disabled}
        onChange={(event) =>
          onDraftChange({ markdown: event.target.value, blocknote: null })
        }
      />
      {subject && <output data-testid="draft-subject">{subject}</output>}
      <button onClick={() => onEditingChange?.(true)}>
        Mock start editing
      </button>
      <button onClick={() => onEditingChange?.(false)}>
        Mock stop editing
      </button>
      <button
        aria-label="Open AI guidance"
        disabled={!onOpenAiGuidance}
        onClick={onOpenAiGuidance}
        title={guidanceUnavailableReason}
      >
        Open AI guidance
      </button>
      {actions}
    </div>
  ),
}));

const key = { workspaceId: 'workspace-1', threadId: 'thread-1' };
const thread = { id: key.threadId } as MyahInboxThread;
const body = { markdown: 'server draft', blocknote: null };
const linkedCampaign = { id: 'campaign-1', name: 'Campaign One' };
const runtimeAgentTabId = 'runtime-agent-tab-1';
const setCampaignAgentMetadata = (
  store: ReturnType<typeof createStore>,
  {
    includeLayout = true,
    layoutActive = true,
    includeTab = true,
    tabActive = true,
    tabId = runtimeAgentTabId,
  }: {
    includeLayout?: boolean;
    layoutActive?: boolean;
    includeTab?: boolean;
    tabActive?: boolean;
    tabId?: string;
  } = {},
) => {
  store.set(metadataStoreState.atomFamily('pageLayouts'), {
    current: includeLayout
      ? [
          {
            id: 'campaign-layout-1',
            deletedAt: layoutActive ? null : '2026-09-15T00:00:00.000Z',
            universalIdentifier:
              MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
          },
        ]
      : [],
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('pageLayoutTabs'), {
    current: includeTab
      ? [
          {
            id: tabId,
            isActive: tabActive,
            pageLayoutId: 'campaign-layout-1',
            universalIdentifier: MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
          },
        ]
      : [],
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('pageLayoutWidgets'), {
    current: [],
    draft: [],
    status: 'up-to-date',
  });
};
type Request = {
  name: string;
  variables: Record<string, unknown>;
  resolve: (
    data: Record<string, unknown>,
    errors?: { message: string }[],
  ) => void;
  reject: () => void;
};
let requests: Request[];
const take = (name: string) => {
  const request = requests.find((request) => request.name === name);
  if (!request)
    throw new Error(
      `Missing ${name}; got ${requests.map((request) => request.name)}`,
    );
  requests.splice(requests.indexOf(request), 1);
  return request;
};
const completeRead = async (draftBody = body, draftKey = key) => {
  await act(async () =>
    take('MyahInboxEmailDraft').resolve({
      myahInboxEmailDraft: { ...draftKey, revision: 2, body: draftBody },
    }),
  );
  const readiness = requests.find(
    ({ name }) => name === 'MyahInboxReplySendReadiness',
  );
  if (readiness) {
    await act(async () =>
      take('MyahInboxReplySendReadiness').resolve({
        myahInboxReplySendReadiness: { status: 'READY', reason: null },
      }),
    );
  }
};
const Harness = ({ children }: { children: ReactNode }) => {
  const controller = useMyahInboxDraftAutosaveController();
  return (
    <MyahInboxDraftAutosaveProvider controller={controller}>
      {children}
    </MyahInboxDraftAutosaveProvider>
  );
};
const setup = (
  duplicateEditor = false,
  presentation: 'default' | 'main' = 'default',
  subject: string | null = 'Re: First subject',
  campaign: MyahInboxThread['campaign'] = null,
  store = createStore(),
  threadId = key.threadId,
) => {
  const draftKey = { workspaceId: key.workspaceId, threadId };
  store.set(currentWorkspaceMemberState.atom, { id: 'member-1' } as never);
  store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never);
  const view = render(
    <Provider store={store}>
      <Harness>
        <MyahInboxReplyWorkspace
          thread={{ ...thread, id: threadId, subject, campaign }}
          scopeGeneration="1"
          targetAvailable
          presentation={presentation}
        />
        {duplicateEditor && (
          <MyahInboxReplyWorkspace
            thread={{ ...thread, id: threadId, subject, campaign }}
            scopeGeneration="1"
            targetAvailable
            presentation={presentation}
          />
        )}
      </Harness>
    </Provider>,
  );
  return {
    ...view,
    store,
    entry: () =>
      store.get(myahInboxDraftAutosaveFamilyState.atomFamily(draftKey)),
    refresh: (generation: string, available = true) =>
      view.rerender(
        <Provider store={store}>
          <Harness>
            <MyahInboxReplyWorkspace
              thread={{ ...thread, id: threadId, subject, campaign }}
              scopeGeneration={generation}
              targetAvailable={available}
              presentation={presentation}
            />
          </Harness>
        </Provider>,
      ),
  };
};

describe('MyahInboxReplyWorkspace exact-key authority integration', () => {
  it('preserves the floating main card with its animated border and reduced-motion fallback', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'packages/twenty-front/src/modules/myah/inbox/components/MyahInboxReplyWorkspace.tsx',
      ),
      'utf8',
    );

    const mainStyles = source.match(
      /const StyledMainReplyWorkspace = styled\(StyledReplyWorkspace\)`([\s\S]*?)`;/,
    )?.[1];
    expect(mainStyles).toBeDefined();
    expect(mainStyles).toContain(
      'animation: myahReplyCardBorder 12s ease-in-out infinite alternate;',
    );
    expect(mainStyles).toContain('linear-gradient(');
    expect(mainStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(mainStyles).not.toContain('border: 0');
    expect(source).toContain(
      'const MYAH_REPLY_CARD_SURFACE = themeCssVariables.background.primary;',
    );
    expect(source).toContain(
      'border: 1px solid ${themeCssVariables.border.color.light}',
    );
    expect(source).toContain("{presentation !== 'main' && (");
  });

  it('removes the main-only composer heading while preserving the default heading', async () => {
    const main = setup(false, 'main');
    await completeRead();
    expect(screen.queryByText('Reply draft')).not.toBeInTheDocument();

    main.unmount();
    setup();
    await completeRead();
    expect(screen.getByText('Reply draft')).toBeVisible();
  });

  it.each([
    ['Re: RE: September update', 'September update'],
    ['Re: Project Re: status', 'Project Re: status'],
    [null, 'No subject'],
    [FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED, 'Restricted subject'],
  ])(
    'passes the safe presentation-only main subject %p only after authorization',
    async (subject, expectedSubject) => {
      setup(false, 'main', subject);
      expect(screen.queryByTestId('draft-subject')).not.toBeInTheDocument();

      await completeRead();

      expect(screen.getByTestId('draft-subject')).toHaveTextContent(
        expectedSubject,
      );
    },
  );

  beforeEach(() => {
    jest.useFakeTimers();
    requests = [];
    mockNavigate.mockClear();
    mockClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        (operation) =>
          new Observable((observer) => {
            requests.push({
              name: operation.operationName ?? '',
              variables: operation.variables,
              resolve: (data, errors) => {
                observer.next({ data, errors });
                observer.complete();
              },
              reject: () => observer.error(new Error('Forbidden')),
            });
          }),
      ),
    });
  });
  afterEach(() => {
    mockClient.stop();
    jest.useRealTimers();
  });

  it('uses Send reply as the only main action for a populated Campaign draft', async () => {
    setup(false, 'main', 'Re: First subject', linkedCampaign);
    await completeRead();

    expect(
      screen.getByLabelText('Real shared draft').parentElement,
    ).toHaveAttribute('data-presentation', 'main');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Generate reply' }),
    ).not.toBeInTheDocument();
  });

  it.each(['', '   \n'])(
    'uses Generate reply as the only main action for an empty Campaign draft %p',
    async (markdown) => {
      setup(false, 'main', 'Re: First subject', linkedCampaign);
      await completeRead({ markdown, blocknote: null });

      expect(
        screen.getByRole('button', { name: 'Generate reply' }),
      ).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: 'Send reply' }),
      ).not.toBeInTheDocument();
      expect(
        requests.some(({ name }) => name === 'MyahInboxReplySendReadiness'),
      ).toBe(false);
    },
  );

  it('explains unavailable empty-main generation to keyboard users', async () => {
    setup(false, 'main');
    await completeRead({ markdown: '', blocknote: null });

    const generate = screen.getByRole('button', { name: 'Generate reply' });
    expect(generate).not.toBeDisabled();
    expect(generate).toHaveAttribute('aria-disabled', 'true');
    expect(generate).toHaveAccessibleDescription(
      'Link an exact readable Campaign to generate a reply or open AI guidance.',
    );
    generate.focus();
    expect(generate).toHaveFocus();
    fireEvent.click(generate);
    expect(
      requests.some(({ name }) => name === 'GenerateMyahInboxReplyProposal'),
    ).toBe(false);
    expect(
      screen.queryByRole('button', { name: 'Send reply' }),
    ).not.toBeInTheDocument();
  });

  it('restores edit mode for the same draft key and isolates another thread', async () => {
    const first = setup(false, 'main', 'Re: First subject', linkedCampaign);
    await completeRead();
    expect(screen.getByTestId('draft-editor')).toHaveAttribute(
      'data-initial-is-editing',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mock start editing' }));
    first.unmount();

    const restored = setup(
      false,
      'main',
      'Re: First subject',
      linkedCampaign,
      first.store,
    );
    await completeRead();
    expect(screen.getByTestId('draft-editor')).toHaveAttribute(
      'data-initial-is-editing',
      'true',
    );
    restored.unmount();

    const otherKey = { ...key, threadId: 'thread-2' };
    setup(
      false,
      'main',
      'Re: Other subject',
      linkedCampaign,
      first.store,
      otherKey.threadId,
    );
    await completeRead(body, otherKey);
    expect(screen.getByTestId('draft-editor')).toHaveAttribute(
      'data-initial-is-editing',
      'false',
    );
  });

  it('pushes the exact Campaign route with the runtime Agent tab after a clean flush', async () => {
    const store = createStore();
    setCampaignAgentMetadata(store);
    setup(false, 'main', 'Re: First subject', linkedCampaign, store);
    await completeRead();

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Open AI guidance' })),
    );

    const expectedPath = `${getAppPath(AppPath.RecordShowPage, {
      objectNameSingular: 'campaign',
      objectRecordId: linkedCampaign.id,
    })}#${runtimeAgentTabId}`;
    expect(expectedPath).not.toContain(
      MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
    );
    expect(mockNavigate).toHaveBeenCalledWith(expectedPath, {
      state: {
        myahCampaignAgentGuidanceFocusCampaignId: linkedCampaign.id,
      },
    });
  });

  it('rolls back selection preservation if Campaign navigation throws', async () => {
    const store = createStore();
    setCampaignAgentMetadata(store);
    setup(false, 'main', 'Re: First subject', linkedCampaign, store);
    await completeRead();
    mockNavigate.mockImplementationOnce(() => {
      throw new Error('Navigation failed');
    });

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Open AI guidance' })),
    );

    expect(store.get(myahInboxPreserveSelectionOnUnmountState.atom)).toBe(
      false,
    );
  });

  it.each(['CONFLICT', 'ERROR'] as const)(
    'does not navigate when a pending guidance flush ends in %s',
    async (outcome) => {
      const store = createStore();
      setCampaignAgentMetadata(store);
      setup(false, 'main', 'Re: First subject', linkedCampaign, store);
      await completeRead();
      fireEvent.change(screen.getByLabelText('Real shared draft'), {
        target: { value: 'pending guidance edit' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Open AI guidance' }));
      const save = take('SaveMyahInboxDraft');
      expect(mockNavigate).not.toHaveBeenCalled();

      if (outcome === 'CONFLICT') {
        await act(async () =>
          save.resolve({
            saveMyahInboxDraft: {
              status: 'CONFLICT',
              revision: 3,
              body,
            },
          }),
        );
      } else {
        await act(async () => save.reject());
      }

      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it.each(['removed', 'inactive', 'replaced'] as const)(
    'does not navigate when the Agent tab is %s during a pending flush',
    async (change) => {
      const store = createStore();
      setCampaignAgentMetadata(store);
      setup(false, 'main', 'Re: First subject', linkedCampaign, store);
      await completeRead();
      fireEvent.change(screen.getByLabelText('Real shared draft'), {
        target: { value: 'pending guidance edit' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Open AI guidance' }));
      const save = take('SaveMyahInboxDraft');

      act(() => {
        setCampaignAgentMetadata(
          store,
          change === 'removed'
            ? { includeTab: false }
            : change === 'inactive'
              ? { tabActive: false }
              : { tabId: 'runtime-agent-tab-2' },
        );
      });
      await act(async () =>
        save.resolve({
          saveMyahInboxDraft: {
            status: 'SAVED',
            revision: 3,
            body: { markdown: 'pending guidance edit', blocknote: null },
          },
        }),
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it('does not navigate after target loss during a pending flush', async () => {
    const store = createStore();
    setCampaignAgentMetadata(store);
    const view = setup(
      false,
      'main',
      'Re: First subject',
      linkedCampaign,
      store,
    );
    await completeRead();
    fireEvent.change(screen.getByLabelText('Real shared draft'), {
      target: { value: 'pending guidance edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open AI guidance' }));
    const save = take('SaveMyahInboxDraft');
    view.refresh('2', false);
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'pending guidance edit', blocknote: null },
        },
      }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('blocks duplicate guidance history entries while the flush is pending', async () => {
    const store = createStore();
    setCampaignAgentMetadata(store);
    setup(false, 'main', 'Re: First subject', linkedCampaign, store);
    await completeRead();
    fireEvent.change(screen.getByLabelText('Real shared draft'), {
      target: { value: 'pending guidance edit' },
    });
    const guidance = screen.getByRole('button', { name: 'Open AI guidance' });
    fireEvent.click(guidance);
    fireEvent.click(guidance);

    expect(
      requests.filter(({ name }) => name === 'SaveMyahInboxDraft'),
    ).toHaveLength(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    const save = take('SaveMyahInboxDraft');
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'pending guidance edit', blocknote: null },
        },
      }),
    );

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing layout', { includeLayout: false }],
    ['inactive layout', { layoutActive: false }],
    ['missing tab', { includeTab: false }],
    ['inactive tab', { tabActive: false }],
  ] as const)(
    'keeps guidance unavailable for %s without a fallback',
    async (_label, metadata) => {
      const store = createStore();
      setCampaignAgentMetadata(store, metadata);
      setup(false, 'main', 'Re: First subject', linkedCampaign, store);
      await completeRead();

      expect(
        screen.getByRole('button', { name: 'Open AI guidance' }),
      ).toBeDisabled();
      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it('renders only one editor and send authority when two surfaces mount the same key', async () => {
    setup(true);
    expect(
      requests.filter(({ name }) => name === 'MyahInboxEmailDraft'),
    ).toHaveLength(1);
    await completeRead();
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1);
    expect(
      screen.getByText('This draft is open in another editor.'),
    ).toBeVisible();
  });

  it('does not resurrect an older authorized read over a newer denied generation', async () => {
    const view = setup();
    const oldRead = take('MyahInboxEmailDraft');
    view.refresh('2');
    await act(async () => take('MyahInboxEmailDraft').reject());
    await act(async () =>
      oldRead.resolve({ myahInboxEmailDraft: { ...key, revision: 2, body } }),
    );
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(view.entry()?.confirmedBody).toBeNull();
  });

  it('rejects partial GraphQL draft projections instead of granting cached-body authority', async () => {
    const view = setup();
    await act(async () =>
      take('MyahInboxEmailDraft').resolve(
        { myahInboxEmailDraft: { ...key, revision: 2, body } },
        [{ message: 'Forbidden' }],
      ),
    );
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(view.entry()?.confirmedBody).toBeNull();
  });

  it('reads the exact guarded draft and saves an actual edit with its captured workspace', async () => {
    const view = setup();
    expect(take('MyahInboxEmailDraft').variables).toEqual({
      threadId: key.threadId,
      expectedWorkspaceId: key.workspaceId,
    });
    // Restart the interrupted read through the real UI authorization lifecycle.
    view.refresh('2');
    await completeRead();
    expect(screen.getByLabelText('Real shared draft')).toHaveValue(
      'server draft',
    );
    fireEvent.change(screen.getByLabelText('Real shared draft'), {
      target: { value: 'operator edit' },
    });
    await act(async () => jest.advanceTimersByTimeAsync(750));
    const save = take('SaveMyahInboxDraft');
    expect(save.variables).toEqual({
      input: {
        expectedWorkspaceId: key.workspaceId,
        threadId: key.threadId,
        expectedRevision: 2,
        body: { markdown: 'operator edit', blocknote: null },
      },
    });
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'operator edit', blocknote: null },
        },
      }),
    );
    expect(view.entry()).toMatchObject({
      status: 'saved',
      confirmedRevision: 3,
    });
  });

  it('masks denied drafts, retains recovery bytes and does not resume autosave', async () => {
    const view = setup();
    await completeRead();
    fireEvent.change(screen.getByLabelText('Real shared draft'), {
      target: { value: 'recovery' },
    });
    view.refresh('2');
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    await act(async () => take('MyahInboxEmailDraft').reject());
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(view.entry()?.localBody.markdown).toBe('recovery');
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
  });

  it('resumes the pending debounce on a successful UI reauthorization without a new edit', async () => {
    const view = setup();
    await completeRead();
    fireEvent.change(screen.getByLabelText('Real shared draft'), {
      target: { value: 'pending' },
    });
    view.refresh('2');
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
    await completeRead();
    await act(async () => jest.advanceTimersByTimeAsync(750));
    const save = take('SaveMyahInboxDraft');
    expect(save.variables).toMatchObject({
      input: { expectedRevision: 2, body: { markdown: 'pending' } },
    });
  });

  it('rejects a wrong-workspace draft response rather than hydrating its body', async () => {
    const view = setup();
    await act(async () =>
      take('MyahInboxEmailDraft').resolve({
        myahInboxEmailDraft: {
          ...key,
          workspaceId: 'workspace-2',
          revision: 2,
          body,
        },
      }),
    );
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(view.entry()?.confirmedBody).not.toEqual(body);
  });

  it('applies an empty-main proposal through real controller CAS and transitions to Send', async () => {
    const view = setup(false, 'main', 'Re: First subject', linkedCampaign);
    await completeRead({ markdown: '', blocknote: null });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' })),
    );
    const generation = take('GenerateMyahInboxReplyProposal');
    expect(generation.variables).toMatchObject({
      input: { expectedWorkspaceId: key.workspaceId, threadId: key.threadId },
    });
    expect(screen.getByLabelText('Real shared draft')).toBeDisabled();
    await act(async () =>
      generation.resolve({
        generateMyahInboxReplyProposal: {
          body: { markdown: 'generated', blocknote: null },
        },
      }),
    );
    const save = take('SaveMyahInboxDraft');
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'generated', blocknote: null },
        },
      }),
    );
    await act(async () =>
      take('MyahInboxReplySendReadiness').resolve({
        myahInboxReplySendReadiness: { status: 'READY', reason: null },
      }),
    );
    expect(view.entry()).toMatchObject({
      operation: null,
      status: 'saved',
      localBody: { markdown: 'generated' },
    });
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Generate reply' }),
    ).not.toBeInTheDocument();
  });

  it('keeps failed empty-main generation available for an explicit retry', async () => {
    const view = setup(false, 'main', 'Re: First subject', linkedCampaign);
    await completeRead({ markdown: '', blocknote: null });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' })),
    );
    await act(async () => take('GenerateMyahInboxReplyProposal').reject());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not generate a reply. Try again.',
    );
    expect(
      screen.getByRole('button', { name: 'Generate reply' }),
    ).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    expect(view.entry()?.localBody.markdown).toBe('');
  });

  it('returns a cleared main draft to Generate and permits another generation', async () => {
    setup(false, 'main', 'Re: First subject', linkedCampaign);
    await completeRead();
    fireEvent.change(screen.getByLabelText('Real shared draft'), {
      target: { value: '' },
    });
    await act(async () => jest.advanceTimersByTimeAsync(750));
    await act(async () =>
      take('SaveMyahInboxDraft').resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: '', blocknote: null },
        },
      }),
    );

    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' })),
    );
    expect(take('GenerateMyahInboxReplyProposal').variables).toMatchObject({
      input: { expectedWorkspaceId: key.workspaceId, threadId: key.threadId },
    });
  });

  it('never applies a delayed generation after forced target loss', async () => {
    const view = setup(false, 'default', 'Re: First subject', linkedCampaign);
    await completeRead();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' })),
    );
    const generation = take('GenerateMyahInboxReplyProposal');
    view.refresh('2', false);
    await act(async () =>
      generation.resolve({
        generateMyahInboxReplyProposal: {
          body: { markdown: 'stale', blocknote: null },
        },
      }),
    );
    expect(view.entry()?.localBody).toEqual(body);
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
  });

  it.each(['OUTCOME_PENDING', 'OUTCOME_UNKNOWN'])(
    'locks every editor action for persisted %s readiness',
    async (status) => {
      const view = setup();
      await act(async () =>
        take('MyahInboxEmailDraft').resolve({
          myahInboxEmailDraft: { ...key, revision: 2, body },
        }),
      );
      await act(async () =>
        take('MyahInboxReplySendReadiness').resolve({
          myahInboxReplySendReadiness: { status, reason: null },
        }),
      );
      expect(screen.getByLabelText('Real shared draft')).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Generate reply' }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(view.entry()?.operation?.kind).toBe(
        status === 'OUTCOME_PENDING' ? 'pending' : 'unknown',
      );
    },
  );

  it('rechecks the exact draft when the workspace member changes without a contact change', async () => {
    const view = setup();
    await completeRead();
    act(() =>
      view.store.set(currentWorkspaceMemberState.atom, {
        id: 'another-member',
      } as never),
    );
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    await act(async () => take('MyahInboxEmailDraft').reject());
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
  });

  it('keeps an Unknown send locked after the editor remounts', async () => {
    const view = setup();
    await completeRead();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Send' })),
    );
    const send = take('SendMyahInboxReply');
    expect(send.variables).toEqual({
      input: {
        expectedWorkspaceId: key.workspaceId,
        threadId: key.threadId,
        expectedDraftRevision: 2,
      },
    });
    await act(async () =>
      send.resolve({
        sendMyahInboxReply: {
          outcome: 'UNKNOWN',
          receiptId: null,
          revision: 2,
          body,
        },
      }),
    );
    expect(view.entry()?.operation?.kind).toBe('unknown');
    view.refresh('2');
    await completeRead();
    expect(screen.getByLabelText('Real shared draft')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(view.entry()?.operation?.kind).toBe('unknown');
  });
});
