import { useAiChatEditor } from '@/ai/hooks/useAiChatEditor';
import {
  AGENT_CHAT_NEW_THREAD_DRAFT_KEY,
  agentChatDraftsByThreadIdState,
} from '@/ai/states/agentChatDraftsByThreadIdState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { type EditorOptions } from '@tiptap/core';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'jotai';
import { type ReactNode } from 'react';

let mockOptions: Partial<EditorOptions> = {};
let mockEnabled = true;
let mockHasAccess = true;
let mockExhausted = true;
const mockSend = jest.fn();
const mockEnsureThread = jest.fn();
const mockEditor = {
  setEditable: jest.fn(),
  extensionStorage: {
    'mention-suggestion': { searchMentionRecords: jest.fn() },
  },
  commands: { clearContent: jest.fn(), setContent: jest.fn() },
};
jest.mock('@tiptap/react', () => ({
  useEditor: (options: Partial<EditorOptions>) => {
    mockOptions = options;
    return mockEditor;
  },
}));
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => ({
    isEnabled: mockEnabled,
    hasAccess: mockHasAccess,
    usage: { exhausted: mockExhausted },
  }),
}));
jest.mock('@/mention/hooks/useMentionSearch', () => ({
  useMentionSearch: () => ({ searchMentionRecords: jest.fn() }),
}));
jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: jest.fn(),
  }),
}));
jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: jest.fn(),
    }),
  }),
);
jest.mock('@/ai/utils/dispatchAgentChatSendMessageEvent', () => ({
  dispatchAgentChatSendMessageEvent: () => mockSend(),
}));
jest.mock('@/ai/utils/dispatchAgentChatEnsureThreadForDraftEvent', () => ({
  dispatchAgentChatEnsureThreadForDraftEvent: () => mockEnsureThread(),
}));
const Wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={jotaiStore}>{children}</Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  resetJotaiStore();
  mockEnabled = true;
  mockHasAccess = true;
  mockExhausted = true;
  jotaiStore.set(agentChatDraftsByThreadIdState.atom, {
    [AGENT_CHAT_NEW_THREAD_DRAFT_KEY]: 'Keep my draft',
  });
});

it('disables editing and both send paths without clearing or dispatching the draft at the limit', () => {
  const { result } = renderHook(() => useAiChatEditor(), { wrapper: Wrapper });
  expect(mockOptions.editable).toBe(false);
  expect(mockEditor.setEditable).toHaveBeenLastCalledWith(false, false);
  expect(result.current.isMyahUsageBlocked).toBe(true);
  act(() => result.current.handleSendAndClear());
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    cancelable: true,
  });
  const props = mockOptions.editorProps;
  props?.handleKeyDown?.call(props, {} as never, event);
  expect(event.defaultPrevented).toBe(true);
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockEnsureThread).not.toHaveBeenCalled();
  expect(mockEditor.commands.clearContent).not.toHaveBeenCalled();
  expect(
    jotaiStore.get(agentChatDraftsByThreadIdState.atom)[
      AGENT_CHAT_NEW_THREAD_DRAFT_KEY
    ],
  ).toBe('Keep my draft');
});

it('restores editing after reset but sends only on an explicit action', () => {
  const { result, rerender } = renderHook(() => useAiChatEditor(), {
    wrapper: Wrapper,
  });
  mockExhausted = false;
  rerender();
  expect(mockEditor.setEditable).toHaveBeenLastCalledWith(true, false);
  expect(result.current.isMyahUsageBlocked).toBe(false);
  expect(mockSend).not.toHaveBeenCalled();
  act(() => result.current.handleSendAndClear());
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockEditor.commands.clearContent).toHaveBeenCalledTimes(1);
});

it('blocks chat while subscription access is absent or still loading', () => {
  mockHasAccess = false;
  mockExhausted = false;
  const { result } = renderHook(() => useAiChatEditor(), { wrapper: Wrapper });
  expect(result.current.isMyahUsageBlocked).toBe(true);
  act(() => result.current.handleSendAndClear());
  expect(mockSend).not.toHaveBeenCalled();
});

it('keeps the flag-off editor behavior', () => {
  mockEnabled = false;
  const { result } = renderHook(() => useAiChatEditor(), { wrapper: Wrapper });
  expect(result.current.isMyahUsageBlocked).toBe(false);
  expect(result.current.myahUsageExhausted).toBe(false);
  act(() => result.current.handleSendAndClear());
  expect(mockSend).toHaveBeenCalledTimes(1);
});
