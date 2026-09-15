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

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';
import {
  MyahInboxDraftAutosaveProvider,
  useMyahInboxDraftAutosaveController,
} from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import { type MyahInboxDraftAutosaveEntry } from '@/myah/inbox/types/MyahInboxDraftAutosave';

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
  }: {
    title: string;
    ariaLabel?: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
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
  }: {
    entry: MyahInboxDraftAutosaveEntry;
    disabled: boolean;
    onDraftChange: (body: { markdown: string; blocknote: null }) => void;
    actions: ReactNode;
    presentation?: 'default' | 'main';
    subject?: string;
  }) => (
    <div data-presentation={presentation}>
      <input
        aria-label="Real shared draft"
        value={entry.localBody.markdown}
        disabled={disabled}
        onChange={(event) =>
          onDraftChange({ markdown: event.target.value, blocknote: null })
        }
      />
      {subject && <output data-testid="draft-subject">{subject}</output>}
      {actions}
    </div>
  ),
}));

const key = { workspaceId: 'workspace-1', threadId: 'thread-1' };
const thread = { id: key.threadId } as MyahInboxThread;
const body = { markdown: 'server draft', blocknote: null };
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
const completeRead = async () => {
  await act(async () =>
    take('MyahInboxEmailDraft').resolve({
      myahInboxEmailDraft: { ...key, revision: 2, body },
    }),
  );
  await act(async () =>
    take('MyahInboxReplySendReadiness').resolve({
      myahInboxReplySendReadiness: { status: 'READY', reason: null },
    }),
  );
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
) => {
  const store = createStore();
  store.set(currentWorkspaceMemberState.atom, { id: 'member-1' } as never);
  store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never);
  const view = render(
    <Provider store={store}>
      <Harness>
        <MyahInboxReplyWorkspace
          thread={{ ...thread, subject }}
          scopeGeneration="1"
          targetAvailable
          presentation={presentation}
        />
        {duplicateEditor && (
          <MyahInboxReplyWorkspace
            thread={{ ...thread, subject }}
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
    entry: () => store.get(myahInboxDraftAutosaveFamilyState.atomFamily(key)),
    refresh: (generation: string, available = true) =>
      view.rerender(
        <Provider store={store}>
          <Harness>
            <MyahInboxReplyWorkspace
              thread={{ ...thread, subject }}
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

  it('uses the AI-first action order only for the opted-in main composer', async () => {
    setup(false, 'main');
    await completeRead();

    expect(
      screen.getByLabelText('Real shared draft').parentElement,
    ).toHaveAttribute('data-presentation', 'main');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Generate Reply' }),
    ).not.toBeInTheDocument();
  });

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

  it('applies a generated proposal through real controller CAS and the save transport', async () => {
    const view = setup();
    await completeRead();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generate Reply' })),
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
    expect(view.entry()).toMatchObject({
      operation: null,
      status: 'saved',
      localBody: { markdown: 'generated' },
    });
  });

  it('never applies a delayed generation after forced target loss', async () => {
    const view = setup();
    await completeRead();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generate Reply' })),
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
        screen.getByRole('button', { name: 'Generate Reply' }),
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
