import { draftKeyFixture } from '@/myah/inbox/hooks/__tests__/fixtures/myahInboxDraftAutosaveTestFixture';
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
import { MemoryRouter } from 'react-router-dom';
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
    subjectOptions,
    subjectValue,
    onSubjectChange,
    campaignOptions,
    campaignValue,
    onCampaignChange,
  }: {
    entry: MyahInboxDraftAutosaveEntry;
    disabled: boolean;
    onDraftChange: (body: { markdown: string; blocknote: null }) => void;
    actions: ReactNode;
    presentation?: 'default' | 'main';
    subject?: string;
    subjectOptions?: Array<{
      label: string;
      value: string;
      contextualText?: string;
    }>;
    subjectValue?: string;
    onSubjectChange?: (value: string) => void;
    campaignOptions?: Array<{ label: string; value: string }>;
    campaignValue?: string;
    onCampaignChange?: (value: string) => void;
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
      {subjectOptions && subjectValue && onSubjectChange ? (
        <select
          aria-label="Reply subject"
          value={subjectValue}
          onChange={(event) => onSubjectChange(event.target.value)}
        >
          {subjectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.contextualText ? ` · ${option.contextualText}` : ''}
            </option>
          ))}
        </select>
      ) : null}
      {campaignOptions && campaignValue && onCampaignChange ? (
        <select
          aria-label="Reply Campaign"
          value={campaignValue}
          onChange={(event) => onCampaignChange(event.target.value)}
        >
          {campaignOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {actions}
    </div>
  ),
}));

const key = draftKeyFixture('workspace-1', 'thread-1');
const thread = { id: key.deliveryTargetId } as MyahInboxThread;
const body = { markdown: 'server draft', blocknote: null };
const contactId = 'opaque-contact';
const campaignId = 'campaign-1';
const campaign2Id = 'campaign-2';
const contextFingerprint = 'fingerprint-1';
const contextInput = {
  expectedWorkspaceId: key.workspaceId,
  target: {
    channel: 'EMAIL',
    contactId,
    threadId: key.deliveryTargetId,
  },
  replyContext: { kind: 'CAMPAIGN', campaignId },
};
const contextOptionsPayload = {
  myahInboxReplyContextOptions: {
    edges: [
      {
        cursor: 'cursor-1',
        node: { id: campaignId, name: 'Spring Campaign' },
      },
      {
        cursor: 'cursor-2',
        node: { id: campaign2Id, name: 'Holiday Campaign' },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
    generalAvailable: false,
    defaultContext: {
      kind: 'CAMPAIGN',
      campaignId,
      campaignName: 'Spring Campaign',
    },
  },
};
const draftPayload = (
  overrides: Record<string, unknown> = {},
  contextCampaignId = campaignId,
) => ({
  myahInboxReplyDraft: {
    revision: 2,
    executionState: 'READY',
    body,
    resolvedContext: {
      kind: 'CAMPAIGN',
      campaignId: contextCampaignId,
      contextFingerprint,
      target: {
        channel: 'EMAIL',
        deliveryTargetId: key.deliveryTargetId,
        contactAnchorKind: 'CREATOR',
        contactAnchorId: 'creator-1',
      },
    },
    ...overrides,
  },
});
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
const takeIfPending = (name: string) => {
  const request = requests.find((candidate) => candidate.name === name);
  if (!request) return null;
  requests.splice(requests.indexOf(request), 1);
  return request;
};
const completeOptions = async () => {
  const options = takeIfPending('MyahInboxReplyContextOptions');
  if (options) await act(async () => options.resolve(contextOptionsPayload));
};
// Resolves every read the current surfaces still have in flight, in contract
// order. Reauthorizations may queue more than one draft read at a time.
const completeRead = async (draftOverrides: Record<string, unknown> = {}) => {
  while (true) {
    const options = takeIfPending('MyahInboxReplyContextOptions');
    if (options) await act(async () => options.resolve(contextOptionsPayload));
    const draft = takeIfPending('MyahInboxReplyDraft');
    if (draft)
      await act(async () => draft.resolve(draftPayload(draftOverrides)));
    const readiness = takeIfPending('MyahInboxReplySendReadiness');
    if (readiness)
      await act(async () =>
        readiness.resolve({
          myahInboxReplySendReadiness: { status: 'READY', reason: null },
        }),
      );
    if (!options && !draft && !readiness) return;
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
  replyTargets?: Array<{
    threadId: string;
    subject: string | null;
    campaignLabel: string | null;
  }>,
  onReplyTargetChange?: (threadId: string) => void,
  withContact = true,
) => {
  const store = createStore();
  store.set(currentWorkspaceMemberState.atom, { id: 'member-1' } as never);
  store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never);
  const view = render(
    <MemoryRouter>
      <Provider store={store}>
        <Harness>
          <MyahInboxReplyWorkspace
            thread={{ ...thread, subject }}
            contactId={withContact ? contactId : undefined}
            scopeGeneration="1"
            targetAvailable
            presentation={presentation}
            replyTargets={replyTargets}
            onReplyTargetChange={onReplyTargetChange}
          />
          {duplicateEditor && (
            <MyahInboxReplyWorkspace
              thread={{ ...thread, subject }}
              contactId={withContact ? contactId : undefined}
              scopeGeneration="1"
              targetAvailable
              presentation={presentation}
              replyTargets={replyTargets}
              onReplyTargetChange={onReplyTargetChange}
            />
          )}
        </Harness>
      </Provider>
    </MemoryRouter>,
  );
  return {
    ...view,
    store,
    entry: () => store.get(myahInboxDraftAutosaveFamilyState.atomFamily(key)),
    refresh: (generation: string, available = true) =>
      view.rerender(
        <MemoryRouter>
          <Provider store={store}>
            <Harness>
              <MyahInboxReplyWorkspace
                thread={{ ...thread, subject }}
                contactId={withContact ? contactId : undefined}
                scopeGeneration={generation}
                targetAvailable={available}
                presentation={presentation}
                replyTargets={replyTargets}
                onReplyTargetChange={onReplyTargetChange}
              />
            </Harness>
          </Provider>
        </MemoryRouter>,
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

  it('maps readable Campaign cards to the main subject selector', async () => {
    const onReplyTargetChange = jest.fn();
    setup(
      false,
      'main',
      'Re: First subject',
      [
        {
          threadId: 'thread-1',
          subject: 'Re: First subject',
          campaignLabel: 'Spring Campaign',
        },
        {
          threadId: 'thread-2',
          subject: 'RE: Re: Holiday subject',
          campaignLabel: 'Holiday Campaign',
        },
        {
          threadId: 'thread-3',
          subject: 'General question',
          campaignLabel: '   ',
        },
      ],
      onReplyTargetChange,
    );
    await completeRead();

    const selector = screen.getByRole('combobox', { name: 'Reply subject' });
    expect(selector).toHaveValue('thread-1');
    expect(selector).toHaveTextContent('First subject · Spring Campaign');
    expect(selector).toHaveTextContent('Holiday subject · Holiday Campaign');
    expect(selector).toHaveTextContent('General question');
    expect(selector).not.toHaveTextContent('General question · General');

    fireEvent.change(selector, { target: { value: 'thread-2' } });
    expect(onReplyTargetChange).toHaveBeenCalledWith('thread-2');
  });

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

  it('fails closed for a standalone thread-only caller without an opaque contactId', async () => {
    setup(false, 'default', 'Re: First subject', undefined, undefined, false);
    await act(async () => Promise.resolve());
    expect(requests).toEqual([]);
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generate reply' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
    // A composer that cannot be used renders no status copy at all.
    expect(
      screen.queryByText(/Shared draft unavailable/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('uses the AI-first action order only for the opted-in main composer', async () => {
    setup(false, 'main');
    await completeRead();

    expect(
      screen.getByLabelText('Real shared draft').parentElement,
    ).toHaveAttribute('data-presentation', 'main');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Generate reply' }),
    ).not.toBeInTheDocument();
  });

  it('renders only one editor and send authority when two surfaces mount the same key', async () => {
    setup(true);
    await completeRead();
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1);
    expect(
      screen.getByText('This draft is open in another editor.'),
    ).toBeVisible();
  });

  it('does not resurrect an older authorized read over a newer denied generation', async () => {
    const view = setup();
    await completeOptions();
    const oldRead = take('MyahInboxReplyDraft');
    view.refresh('2');
    await act(async () => take('MyahInboxReplyDraft').reject());
    await act(async () => oldRead.resolve(draftPayload()));
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(view.entry()?.confirmedBody ?? null).toBeNull();
  });

  it('rejects partial GraphQL draft projections instead of granting cached-body authority', async () => {
    const view = setup();
    await completeOptions();
    await act(async () =>
      take('MyahInboxReplyDraft').resolve(draftPayload(), [
        { message: 'Forbidden' },
      ]),
    );
    expect(
      screen.queryByLabelText('Real shared draft'),
    ).not.toBeInTheDocument();
    expect(view.entry()?.confirmedBody ?? null).toBeNull();
  });

  it('reads the exact guarded draft and saves an actual edit with its captured workspace', async () => {
    const view = setup();
    await completeOptions();
    expect(take('MyahInboxReplyDraft').variables).toEqual({
      input: contextInput,
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
        ...contextInput,
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
    await act(async () => take('MyahInboxReplyDraft').reject());
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
    await completeOptions();
    await act(async () =>
      take('MyahInboxReplyDraft').resolve(
        draftPayload({
          resolvedContext: {
            kind: 'CAMPAIGN',
            campaignId,
            contextFingerprint,
            target: {
              channel: 'EMAIL',
              deliveryTargetId: 'other-thread',
              contactAnchorKind: 'CREATOR',
              contactAnchorId: 'creator-1',
            },
          },
        }),
      ),
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
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' })),
    );
    const generation = take('GenerateMyahInboxReplyProposal');
    expect(generation.variables).toMatchObject({
      input: {
        ...contextInput,
        expectedContextFingerprint: contextFingerprint,
      },
    });
    expect(screen.getByLabelText('Real shared draft')).toBeDisabled();
    await act(async () =>
      generation.resolve({
        generateMyahInboxReplyProposal: {
          body: { markdown: 'generated', blocknote: null },
          contextFingerprint,
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
    // The committed save refreshes execution metadata before the operation releases.
    await completeRead({
      revision: 3,
      body: { markdown: 'generated', blocknote: null },
    });
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
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' })),
    );
    const generation = take('GenerateMyahInboxReplyProposal');
    view.refresh('2', false);
    await act(async () =>
      generation.resolve({
        generateMyahInboxReplyProposal: {
          body: { markdown: 'stale', blocknote: null },
          contextFingerprint,
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
      await completeOptions();
      await act(async () =>
        take('MyahInboxReplyDraft').resolve(draftPayload()),
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
    await act(async () => take('MyahInboxReplyDraft').reject());
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
      input: { ...contextInput, expectedDraftRevision: 2 },
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
    await completeRead({ executionState: 'OUTCOME_UNKNOWN' });
    expect(screen.getByLabelText('Real shared draft')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(view.entry()?.operation?.kind).toBe('unknown');
  });
});
