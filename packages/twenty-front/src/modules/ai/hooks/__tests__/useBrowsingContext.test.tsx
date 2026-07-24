import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type PropsWithChildren } from 'react';

import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import { useGetBrowsingContext } from '@/ai/hooks/useBrowsingContext';
import {
  myahInboxSelectionWorkspaceIdState,
  myahInboxSelectedThreadIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';

const SELECTED_THREAD_ID = '3ceef358-55fc-4d47-a7a8-2d8ac543641b';

describe('useGetBrowsingContext Inbox bridge', () => {
  it('exposes only the current workspace selected thread as native record context', () => {
    const store = createStore();

    store.set(currentWorkspaceState.atom, {
      id: 'workspace-1',
    } as CurrentWorkspace);
    store.set(myahInboxSelectedThreadIdState.atom, SELECTED_THREAD_ID);
    store.set(myahInboxSelectionWorkspaceIdState.atom, 'workspace-1');

    const { result } = renderHook(() => useGetBrowsingContext(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    expect(result.current.getBrowsingContext()).toEqual({
      type: 'recordPage',
      objectNameSingular: 'messageThread',
      recordId: SELECTED_THREAD_ID,
    });

    store.set(myahInboxSelectedThreadIdState.atom, null);
    expect(result.current.getBrowsingContext()).toBeNull();

    store.set(myahInboxSelectedThreadIdState.atom, SELECTED_THREAD_ID);
    store.set(myahInboxSelectionWorkspaceIdState.atom, 'workspace-2');
    expect(result.current.getBrowsingContext()).toBeNull();
  });
});
