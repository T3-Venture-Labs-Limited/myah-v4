import { PermissionFlagType } from '~/generated-metadata/graphql';
import { myahInboxPendingInstagramSelectionState } from '@/myah/inbox/states/myahInboxPendingInstagramSelectionState';
import { myahInboxContactSelectionState } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode, StrictMode } from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { instagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { useInstagramMessageComposer } from '@/side-panel/pages/instagram-message/hooks/useInstagramMessageComposer';

let mockClient: ApolloClient;
const mockNavigate = jest.fn();
let mockPermission = true;
let mockFirstPermission = true;
let mockReplyPermission = true;
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: (flag: PermissionFlagType) =>
    mockPermission &&
    (flag === PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL
      ? mockFirstPermission
      : mockReplyPermission),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const ready = {
  status: 'READY',
  code: null,
  normalizedHandle: 'recipient',
  creatorRecordId: 'creator',
  sender: { accountRecordId: 'account', label: '@sender' },
  actionKind: 'START_CHAT',
  preparationFingerprint: 'fingerprint',
};
const sent = {
  status: 'SENT',
  receiptId: 'receipt',
  code: null,
  nextEligibleAt: null,
  creatorRecordId: 'creator',
  conversationRecordId: 'conversation',
};
const calls: Array<{
  name: string;
  variables: Record<string, unknown>;
  operationType?: string;
}> = [];
let respond: (
  name: string,
  variables: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
const atom = instagramMessageComposerState.atomFamily({ instanceId: 'page' });
const setup = () => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: 'workspace' } as never);
  store.set(atom, {
    draftId: 'attempt',
    recipient: { rawHandle: 'recipient' },
    body: '  Hello  ',
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <Provider store={store}>
        <SidePanelPageComponentInstanceContext.Provider
          value={{ instanceId: 'page' }}
        >
          {children}
        </SidePanelPageComponentInstanceContext.Provider>
      </Provider>
    </StrictMode>
  );
  return {
    store,
    wrapper,
    ...renderHook(useInstagramMessageComposer, { wrapper }),
  };
};
const mutations = () =>
  calls
    .filter(({ name }) => name === 'SendInstagramMessageComposer')
    .map(({ name, variables }) => ({ name, variables }));
beforeEach(() => {
  calls.length = 0;
  mockPermission = true;
  mockFirstPermission = true;
  mockReplyPermission = true;
  mockNavigate.mockClear();
  respond = async (name) => {
    if (name === 'InstagramMessageComposerAccount')
      return {
        instagramMessageComposerAccount: {
          status: 'READY',
          code: null,
          sender: ready.sender,
        },
      };
    if (name === 'PrepareInstagramMessageComposer')
      return { prepareInstagramMessageComposer: ready };
    if (name === 'SendInstagramMessageComposer')
      return { sendInstagramMessageComposer: sent };
    if (name === 'InstagramMessageSendStatus')
      return {
        instagramMessageSendStatus: {
          receiptId: 'receipt',
          state: 'SENT',
          providerCode: null,
          outcome: null,
          creatorRecordId: 'creator',
          conversationRecordId: 'conversation',
        },
      };
    if (name === 'InstagramMessageComposerAttempt')
      return { instagramMessageComposerAttempt: null };
    throw new Error(`Unexpected operation ${name}`);
  };
  mockClient = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const definition = operation.query.definitions.find(
            ({ kind }) => kind === 'OperationDefinition',
          );
          calls.push({
            name: operation.operationName ?? '',
            variables: operation.variables,
            operationType:
              definition?.kind === 'OperationDefinition'
                ? definition.operation
                : undefined,
          });
          void respond(operation.operationName ?? '', operation.variables).then(
            (data) => {
              observer.next({ data });
              observer.complete();
            },
            (error) => observer.error(error),
          );
        }),
    ),
  });
});
afterEach(() => mockClient.stop());

it('prepares the composer through a mutation operation', async () => {
  const view = setup();

  await waitFor(() =>
    expect(
      calls.find(({ name }) => name === 'PrepareInstagramMessageComposer')
        ?.operationType,
    ).toBe('mutation'),
  );

  view.unmount();
});

it('freezes exact input synchronously for double click, retains it through remount, never sends on mount', async () => {
  const view = setup();
  expect(mutations()).toHaveLength(0);
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  await act(async () => {
    await Promise.all([view.result.current.send(), view.result.current.send()]);
  });
  expect(mutations()).toEqual([
    {
      name: 'SendInstagramMessageComposer',
      variables: {
        input: {
          rawHandle: 'recipient',
          draftId: 'attempt',
          expectedAccountRecordId: 'account',
          expectedPreparationFingerprint: 'fingerprint',
          body: 'Hello',
        },
      },
    },
  ]);
  expect(view.store.get(atom)?.attempt?.input.body).toBe('Hello');
  view.unmount();
  const remount = renderHook(useInstagramMessageComposer, {
    wrapper: view.wrapper,
  });
  await act(async () => {
    await remount.result.current.send();
  });
  expect(mutations()).toHaveLength(1);
});

it.each([
  null,
  {
    draftId: 'attempt',
    receiptId: null,
    approvalBindingId: null,
    state: 'COMMITTED',
  },
])(
  'recovers lost response read-only, never resends or rotates absent/committed attempt %j',
  async (attempt) => {
    const original = respond;
    respond = async (name, variables) => {
      if (name === 'SendInstagramMessageComposer')
        throw new Error('response lost');
      if (name === 'InstagramMessageComposerAttempt')
        return { instagramMessageComposerAttempt: attempt };
      return original(name, variables);
    };
    const view = setup();
    await waitFor(() => expect(view.result.current.canSend).toBe(true));
    await act(async () => {
      await view.result.current.send();
    });
    expect(view.result.current.canSend).toBe(false);
    expect(view.result.current.canStartNewAttempt).toBe(false);
    await act(async () => {
      await view.result.current.checkStatus();
      await view.result.current.send();
      view.result.current.startNewAttempt();
    });
    expect(mutations()).toHaveLength(1);
    expect(view.store.get(atom)?.draftId).toBe('attempt');
    expect(
      calls
        .filter(({ name }) => name === 'InstagramMessageComposerAttempt')
        .every(({ variables }) => variables.draftId === 'attempt'),
    ).toBe(true);
  },
);

it.each([
  'RECIPIENT_UNAVAILABLE',
  'CREATOR_AMBIGUOUS',
  'MISSING_ROUTE_PERMISSION',
  'ACCOUNT_UNAVAILABLE',
  'TARGET_LOCKED',
  'CONTEXT_CHANGED',
])('blocks preparation %s without changing Creator or text', async (code) => {
  const original = respond;
  respond = async (name, variables) =>
    name === 'PrepareInstagramMessageComposer'
      ? {
          prepareInstagramMessageComposer: {
            ...ready,
            status: 'BLOCKED',
            code,
          },
        }
      : original(name, variables);
  const view = setup();
  await waitFor(() => expect(view.result.current.preparation?.code).toBe(code));
  await act(async () => {
    await view.result.current.send();
  });
  expect(mutations()).toHaveLength(0);
  expect(view.store.get(atom)?.body).toBe('  Hello  ');
});

it('discards late preparation after committed recipient change and empty body blocks', async () => {
  let resolveOld: (value: Record<string, unknown>) => void = () => undefined;
  const original = respond;
  respond = async (name, variables) =>
    name === 'PrepareInstagramMessageComposer' &&
    (variables.input as { rawHandle: string }).rawHandle === 'recipient'
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : original(name, variables);
  const view = setup();
  await waitFor(() =>
    expect(
      calls.some(({ name }) => name === 'PrepareInstagramMessageComposer'),
    ).toBe(true),
  );
  act(() => view.result.current.setRecipient({ rawHandle: 'other' }));
  expect(view.result.current.canSend).toBe(false);
  await act(async () => resolveOld({ prepareInstagramMessageComposer: ready }));
  expect(view.result.current.canSend).toBe(false);
  act(() => view.result.current.setBody('   '));
  await waitFor(() =>
    expect(view.result.current.preparation?.status).toBe('READY'),
  );
  expect(view.result.current.canSend).toBe(false);
});

it('suppresses late response state and navigation after workspace change or unmount', async () => {
  let resolveSend: (value: Record<string, unknown>) => void = () => undefined;
  const original = respond;
  respond = async (name, variables) =>
    name === 'SendInstagramMessageComposer'
      ? new Promise((resolve) => {
          resolveSend = resolve;
        })
      : original(name, variables);
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  act(() => {
    void view.result.current.send();
  });
  act(() =>
    view.store.set(currentWorkspaceState.atom, {
      id: 'other-workspace',
    } as never),
  );
  view.unmount();
  await act(async () => resolveSend({ sendInstagramMessageComposer: sent }));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(view.store.get(atom)?.attempt?.result?.status).not.toBe('SENT');
});

it('does not prepare or send without either messaging permission', async () => {
  mockPermission = false;
  const view = setup();
  await act(async () => {
    await view.result.current.send();
  });
  expect(view.result.current.canSend).toBe(false);
  expect(calls).toHaveLength(0);
});

it('invalidates preparation before a same-tick recipient change followed by send', async () => {
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  await act(async () => {
    view.result.current.setRecipient({ rawHandle: 'changed' });
    await view.result.current.send();
  });
  expect(mutations()).toHaveLength(0);
});

it.each(['FAILED', 'BLOCKED'])(
  'only offers explicit new attempt after read-only terminal %s, with fresh preparation and retained input',
  async (status) => {
    const original = respond;
    respond = async (name, variables) => {
      if (name === 'SendInstagramMessageComposer')
        return {
          sendInstagramMessageComposer: {
            ...sent,
            status,
            code:
              status === 'BLOCKED' ? 'INSTAGRAM_ACTION_LIMIT_REACHED' : null,
            nextEligibleAt: '2026-09-17T00:00:00.000Z',
          },
        };
      if (name === 'InstagramMessageComposerAttempt')
        return {
          instagramMessageComposerAttempt: {
            draftId: 'attempt',
            receiptId: 'receipt',
            approvalBindingId: 'binding',
            state: status,
          },
        };
      if (name === 'InstagramMessageSendStatus')
        return {
          instagramMessageSendStatus: {
            receiptId: 'receipt',
            state: status,
            providerCode: null,
            outcome: null,
            creatorRecordId: null,
            conversationRecordId: null,
          },
        };
      return original(name, variables);
    };
    const view = setup();
    await waitFor(() => expect(view.result.current.canSend).toBe(true));
    await act(async () => {
      await view.result.current.send();
    });
    expect(view.result.current.canStartNewAttempt).toBe(false);
    expect(view.store.get(atom)?.attempt?.result?.nextEligibleAt).toBe(
      '2026-09-17T00:00:00.000Z',
    );
    await act(async () => {
      await view.result.current.checkStatus();
    });
    expect(view.result.current.canStartNewAttempt).toBe(true);
    if (status === 'BLOCKED')
      expect(view.store.get(atom)?.attempt?.result?.nextEligibleAt).toBe(
        '2026-09-17T00:00:00.000Z',
      );
    expect(view.store.get(atom)?.draftId).toBe('attempt');
    act(() => view.result.current.startNewAttempt());
    expect(view.store.get(atom)?.draftId).not.toBe('attempt');
    expect(view.result.current.canSend).toBe(false);
    expect(view.store.get(atom)?.body).toBe('Hello');
    expect(view.store.get(atom)?.recipient).toEqual({ rawHandle: 'recipient' });
    await waitFor(() => expect(view.result.current.canSend).toBe(true));
    expect(mutations()).toHaveLength(1);
  },
);

it('recovers a lost response through the owned receipt to the authorized destination, never by Creator-as-contact', async () => {
  const original = respond;
  respond = async (name, variables) => {
    if (name === 'SendInstagramMessageComposer')
      throw new Error('response lost');
    if (name === 'InstagramMessageComposerAttempt')
      return {
        instagramMessageComposerAttempt: {
          draftId: 'attempt',
          receiptId: 'receipt',
          approvalBindingId: 'binding',
          state: 'PROVIDER_ACCEPTED',
        },
      };
    return original(name, variables);
  };
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  await act(async () => {
    await view.result.current.send();
  });
  expect(view.store.get(atom)?.attempt?.result?.status).toBe('SENT');
  expect(mockNavigate).toHaveBeenCalledWith('/myah/inbox');
  expect(view.store.get(myahInboxPendingInstagramSelectionState.atom)).toEqual({
    workspaceId: 'workspace',
    creatorRecordId: 'creator',
    conversationRecordId: 'conversation',
  });
  expect(
    view.store.get(myahInboxContactSelectionState.atom).contactId,
  ).toBeNull();
  expect(mutations()).toHaveLength(1);
});

it('preserves visible SENT on missing destination and subsequent failed status recovery', async () => {
  const original = respond;
  respond = async (name, variables) => {
    if (name === 'InstagramMessageSendStatus')
      return {
        instagramMessageSendStatus: {
          receiptId: 'receipt',
          state: 'SENT',
          providerCode: null,
          outcome: null,
          creatorRecordId: null,
          conversationRecordId: null,
        },
      };
    return original(name, variables);
  };
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  await act(async () => {
    await view.result.current.send();
  });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(view.store.get(atom)?.attempt?.result?.status).toBe('SENT');
  await act(async () => {
    await view.result.current.checkStatus();
  });
  expect(view.store.get(atom)?.attempt?.result?.status).toBe('SENT');
  act(() => view.result.current.openInbox());
  expect(mockNavigate).toHaveBeenCalledWith('/myah/inbox');
  expect(mutations()).toHaveLength(1);
});

it('refresh invalidates synchronously and account drift must prepare again', async () => {
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  const original = respond;
  respond = async (name, variables) =>
    name === 'InstagramMessageComposerAccount'
      ? {
          instagramMessageComposerAccount: {
            status: 'READY',
            code: null,
            sender: { accountRecordId: 'other-account', label: '@other' },
          },
        }
      : original(name, variables);
  await act(async () => {
    view.result.current.refreshPreparation();
    await view.result.current.send();
  });
  expect(mutations()).toHaveLength(0);
  await waitFor(() =>
    expect(view.result.current.account?.sender?.accountRecordId).toBe(
      'other-account',
    ),
  );
  await waitFor(() =>
    expect(view.result.current.preparation?.status).toBe('READY'),
  );
  expect(view.result.current.canSend).toBe(false);
});

it.each(['PROCESSING', 'PENDING', 'PROVIDER_ACCEPTED'])(
  'bounds %s polling at 15 and never treats free-text outcome or exhaustion as retry permission',
  async (status) => {
    const original = respond;
    respond = async (name, variables) => {
      if (name === 'SendInstagramMessageComposer')
        return { sendInstagramMessageComposer: { ...sent, status } };
      if (name === 'InstagramMessageSendStatus')
        return {
          instagramMessageSendStatus: {
            receiptId: 'receipt',
            state: status,
            providerCode: null,
            outcome: 'SENT',
            creatorRecordId: null,
            conversationRecordId: null,
          },
        };
      return original(name, variables);
    };
    const view = setup();
    await waitFor(() => expect(view.result.current.canSend).toBe(true));
    jest.useFakeTimers();
    try {
      let pending: Promise<void>;
      await act(async () => {
        pending = view.result.current.send();
      });
      expect(view.store.get(atom)?.attempt?.result?.status).toBe(status);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(15_000);
        await pending;
      });
      expect(
        calls.filter(({ name }) => name === 'InstagramMessageSendStatus'),
      ).toHaveLength(15);
      expect(view.result.current.canSend).toBe(false);
      expect(view.result.current.canStartNewAttempt).toBe(false);
      await act(async () => {
        view.result.current.startNewAttempt();
        await view.result.current.send();
      });
      expect(view.store.get(atom)?.draftId).toBe('attempt');
      expect(mutations()).toHaveLength(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  },
);

it('locks UNKNOWN across a second mounted instance and only checks status read-only', async () => {
  const original = respond;
  respond = async (name, variables) => {
    if (name === 'SendInstagramMessageComposer')
      return { sendInstagramMessageComposer: { ...sent, status: 'UNKNOWN' } };
    if (name === 'InstagramMessageComposerAttempt')
      return {
        instagramMessageComposerAttempt: {
          draftId: 'attempt',
          receiptId: 'receipt',
          approvalBindingId: 'binding',
          state: 'UNKNOWN',
        },
      };
    if (name === 'InstagramMessageSendStatus')
      return {
        instagramMessageSendStatus: {
          receiptId: 'receipt',
          state: 'UNKNOWN',
          providerCode: null,
          outcome: 'accepted',
          creatorRecordId: null,
          conversationRecordId: null,
        },
      };
    return original(name, variables);
  };
  const view = setup();
  const second = renderHook(useInstagramMessageComposer, {
    wrapper: view.wrapper,
  });
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  await waitFor(() => expect(second.result.current.canSend).toBe(true));
  await act(async () => {
    await Promise.all([
      view.result.current.send(),
      second.result.current.send(),
    ]);
  });
  await act(async () => {
    await second.result.current.checkStatus();
  });
  expect(mutations()).toHaveLength(1);
  expect(second.result.current.canSend).toBe(false);
  expect(second.result.current.canStartNewAttempt).toBe(false);
  expect(view.store.get(atom)?.draftId).toBe('attempt');
});

it.each([
  ['START_CHAT', false, true, false],
  ['REPLY', true, false, false],
  ['START_CHAT', true, false, true],
  ['REPLY', false, true, true],
] as const)(
  'gates %s with first=%s reply=%s',
  async (actionKind, first, reply, allowed) => {
    mockFirstPermission = first;
    mockReplyPermission = reply;
    const original = respond;
    respond = async (name, variables) =>
      name === 'PrepareInstagramMessageComposer'
        ? { prepareInstagramMessageComposer: { ...ready, actionKind } }
        : original(name, variables);
    const view = setup();
    await waitFor(() =>
      expect(view.result.current.preparation?.status).toBe('READY'),
    );
    expect(view.result.current.canSend).toBe(allowed);
  },
);

it('never navigates over a newer Inbox selection while the send response is delayed', async () => {
  let resolveSend: (value: Record<string, unknown>) => void = () => undefined;
  const original = respond;
  respond = async (name, variables) =>
    name === 'SendInstagramMessageComposer'
      ? new Promise((resolve) => {
          resolveSend = resolve;
        })
      : original(name, variables);
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  let sending: Promise<void>;
  act(() => {
    sending = view.result.current.send();
  });
  act(() =>
    view.store.set(myahInboxContactSelectionState.atom, {
      workspaceId: 'workspace',
      contactId: 'newer-user-choice',
      channel: 'EMAIL',
      emailThreadId: 'thread',
      instagramConversationId: null,
    }),
  );
  await act(async () => {
    resolveSend({ sendInstagramMessageComposer: sent });
    await sending;
  });
  expect(view.store.get(atom)?.attempt?.result?.status).toBe('SENT');
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(
    view.store.get(myahInboxPendingInstagramSelectionState.atom),
  ).toBeNull();
});

it.each(['workspace', 'unmount'])(
  'suppresses late SENT for %s independently',
  async (transition) => {
    let resolveSend: (value: Record<string, unknown>) => void = () => undefined;
    const original = respond;
    respond = async (name, variables) =>
      name === 'SendInstagramMessageComposer'
        ? new Promise((resolve) => {
            resolveSend = resolve;
          })
        : original(name, variables);
    const view = setup();
    await waitFor(() => expect(view.result.current.canSend).toBe(true));
    let sending: Promise<void>;
    act(() => {
      sending = view.result.current.send();
    });
    if (transition === 'workspace')
      act(() =>
        view.store.set(currentWorkspaceState.atom, {
          id: 'other-workspace',
        } as never),
      );
    else view.unmount();
    await act(async () => {
      resolveSend({ sendInstagramMessageComposer: sent });
      await sending;
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(view.store.get(atom)?.attempt?.result?.status).not.toBe('SENT');
    expect(
      calls.filter(({ name }) => name === 'InstagramMessageSendStatus'),
    ).toHaveLength(0);
  },
);

it('opens the recovered authorized destination after a later explicit status check confirms SENT', async () => {
  const original = respond;
  respond = async (name, variables) => {
    if (name === 'SendInstagramMessageComposer')
      throw new Error('response lost');
    return original(name, variables);
  };
  const view = setup();
  await waitFor(() => expect(view.result.current.canSend).toBe(true));
  await act(async () => {
    await view.result.current.send();
  });
  expect(mockNavigate).not.toHaveBeenCalled();
  respond = async (name, variables) =>
    name === 'InstagramMessageComposerAttempt'
      ? {
          instagramMessageComposerAttempt: {
            draftId: 'attempt',
            receiptId: 'receipt',
            approvalBindingId: 'binding',
            state: 'SENT',
          },
        }
      : original(name, variables);
  await act(async () => {
    await view.result.current.checkStatus();
  });
  expect(mockNavigate).toHaveBeenCalledWith('/myah/inbox');
  expect(mutations()).toHaveLength(1);
});
