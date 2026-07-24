import { renderHook, act } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type PropsWithChildren } from 'react';

import { useAgentChat } from '@/ai/hooks/useAgentChat';
import { useRetryChatMessage } from '@/ai/hooks/useRetryChatMessage';
import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatInputState } from '@/ai/states/agentChatInputState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { type BrowsingContext } from '@/ai/types/BrowsingContext';

const mockMutate = jest.fn();
const mockGetBrowsingContext = jest.fn<BrowsingContext | null, []>();

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ mutate: mockMutate }),
}));

jest.mock('@/ai/hooks/useAgentChatModelId', () => ({
  useAgentChatModelId: () => ({ modelIdForRequest: 'model-id' }),
}));

jest.mock('@/ai/hooks/useBrowsingContext', () => ({
  useGetBrowsingContext: () => ({
    getBrowsingContext: mockGetBrowsingContext,
  }),
}));

jest.mock('@/ai/hooks/useOptimisticallyUnarchiveOnSend', () => ({
  useOptimisticallyUnarchiveOnSend: () => ({
    applyOptimisticUnarchive: () => undefined,
  }),
}));

jest.mock('@/ai/hooks/useWorkspaceAiModelAvailability', () => ({
  useWorkspaceAiModelAvailability: () => ({ enabledModels: [{}] }),
}));

jest.mock('@/browser-event/hooks/useListenToBrowserEvent', () => ({
  useListenToBrowserEvent: jest.fn(),
}));

jest.mock('@/browser-event/utils/dispatchBrowserEvent', () => ({
  dispatchBrowserEvent: jest.fn(),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

const THREAD_ID = 'a055a421-3ca7-44e8-a32d-1bf64c66970d';
const INBOX_THREAD_ID = '3ceef358-55fc-4d47-a7a8-2d8ac543641b';
const inboxSelection: BrowsingContext = {
  type: 'myahInboxThreadSelection',
  workspaceId: 'workspace-id',
  threadId: INBOX_THREAD_ID,
};

const renderWithStore = <T,>(callback: () => T, store = createStore()) => ({
  store,
  ...renderHook(callback, {
    wrapper: ({ children }: PropsWithChildren) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    ),
  }),
});

describe('agent chat trusted Inbox browsing context', () => {
  beforeEach(() => {
    mockMutate.mockReset().mockResolvedValue({
      data: { sendChatMessage: { queued: false } },
    });
    mockGetBrowsingContext.mockReset();
  });

  it('sends an unchanged dedicated Inbox selection on every chat turn', async () => {
    mockGetBrowsingContext.mockReturnValue(inboxSelection);
    const store = createStore();
    store.set(currentAiChatThreadState.atom, THREAD_ID);
    store.set(agentChatInputState.atom, 'First request');
    const { result } = renderWithStore(
      () => useAgentChat(async () => THREAD_ID),
      store,
    );

    await act(async () => result.current.handleSendMessage());
    act(() => store.set(agentChatInputState.atom, 'Second request'));
    await act(async () => result.current.handleSendMessage());

    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate.mock.calls[0][0].variables.browsingContext).toEqual(
      inboxSelection,
    );
    expect(mockMutate.mock.calls[1][0].variables.browsingContext).toEqual(
      inboxSelection,
    );
  });

  it('keeps ordinary browsing context deduplicated after the first turn', async () => {
    const recordContext: BrowsingContext = {
      type: 'recordPage',
      objectNameSingular: 'person',
      recordId: '0af464b5-ce24-4ae4-ba15-62b33407b2f2',
    };
    mockGetBrowsingContext.mockReturnValue(recordContext);
    const store = createStore();
    store.set(currentAiChatThreadState.atom, THREAD_ID);
    store.set(agentChatInputState.atom, 'First request');
    const { result } = renderWithStore(
      () => useAgentChat(async () => THREAD_ID),
      store,
    );

    await act(async () => result.current.handleSendMessage());
    act(() => store.set(agentChatInputState.atom, 'Second request'));
    await act(async () => result.current.handleSendMessage());

    expect(mockMutate.mock.calls[0][0].variables.browsingContext).toEqual(
      recordContext,
    );
    expect(mockMutate.mock.calls[1][0].variables.browsingContext).toBeNull();
  });

  it('sends only the current dedicated Inbox selection when retrying', async () => {
    const store = createStore();
    store.set(agentChatDisplayedThreadState.atom, THREAD_ID);
    mockGetBrowsingContext
      .mockReturnValueOnce(inboxSelection)
      .mockReturnValueOnce(null);
    const { result } = renderWithStore(() => useRetryChatMessage(), store);

    await act(async () => result.current.retryChatMessage());
    await act(async () => result.current.retryChatMessage());

    expect(mockMutate.mock.calls[0][0].variables.browsingContext).toEqual(
      inboxSelection,
    );
    expect(mockMutate.mock.calls[1][0].variables.browsingContext).toBeNull();
  });
});
