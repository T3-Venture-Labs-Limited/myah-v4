import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type PropsWithChildren } from 'react';

import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import { useGetBrowsingContext } from '@/ai/hooks/useBrowsingContext';
import { myahInboxContactSelectionState } from '@/myah/inbox/states/myahInboxSelectionState';

const SELECTED_THREAD_ID = '3ceef358-55fc-4d47-a7a8-2d8ac543641b';

describe('useGetBrowsingContext Inbox bridge', () => {
  it('exposes only the current workspace exact selected Email thread as trusted Inbox context', () => {
    const store = createStore();

    store.set(currentWorkspaceState.atom, {
      id: 'workspace-1',
    } as CurrentWorkspace);
    store.set(myahInboxContactSelectionState.atom, {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'EMAIL',
      emailThreadId: SELECTED_THREAD_ID,
      instagramConversationId: null,
    });

    const { result } = renderHook(() => useGetBrowsingContext(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    expect(result.current.getBrowsingContext()).toEqual({
      type: 'myahInboxThreadSelection',
      workspaceId: 'workspace-1',
      threadId: SELECTED_THREAD_ID,
    });

    store.set(myahInboxContactSelectionState.atom, {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'INSTAGRAM',
      emailThreadId: null,
      instagramConversationId: 'conversation-1',
    });
    expect(result.current.getBrowsingContext()).toBeNull();

    store.set(myahInboxContactSelectionState.atom, {
      workspaceId: 'workspace-2',
      contactId: 'contact-1',
      channel: 'EMAIL',
      emailThreadId: SELECTED_THREAD_ID,
      instagramConversationId: null,
    });
    expect(result.current.getBrowsingContext()).toBeNull();
  });
});
