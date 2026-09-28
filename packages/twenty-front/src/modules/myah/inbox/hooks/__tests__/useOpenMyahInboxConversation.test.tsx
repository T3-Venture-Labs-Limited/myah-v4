import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useOpenMyahInboxConversation } from '@/myah/inbox/hooks/useOpenMyahInboxConversation';
import {
  myahInboxContactSelectionState,
  myahInboxPreserveSelectionOnUnmountState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

const store = createStore();
const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <MemoryRouter initialEntries={['/campaign']}>
      {children}
      <Location />
    </MemoryRouter>
  </Provider>
);
const Location = () => {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}:{JSON.stringify(location.state)}
    </span>
  );
};

describe('useOpenMyahInboxConversation', () => {
  beforeEach(() => {
    store.set(currentWorkspaceState.atom, { id: 'workspace-1' } as never);
  });

  it('sets the exact contact and thread before entering Inbox', () => {
    const { result } = renderHook(useOpenMyahInboxConversation, { wrapper });

    act(() => {
      expect(
        result.current.openMyahInboxConversation({
          workspaceId: 'workspace-1',
          contactId: 'contact-1',
          threadId: 'thread-1',
        }),
      ).toBe(true);
    });

    expect(store.get(myahInboxContactSelectionState.atom)).toEqual({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'EMAIL',
      emailThreadId: 'thread-1',
      instagramConversationId: null,
    });
    expect(store.get(myahInboxPreserveSelectionOnUnmountState.atom)).toBe(true);
  });

  it('carries only a validated campaign creator return without changing the exact Inbox binding', () => {
    const { result } = renderHook(useOpenMyahInboxConversation, { wrapper });
    const returnTarget = {
      workspaceId: 'workspace-1',
      campaignId: 'campaign-1',
      membershipId: 'member-1',
      influencerTabId: 'tab-1',
      pathname: getAppPath(AppPath.RecordShowPage, {
        objectNameSingular: 'campaign',
        objectRecordId: 'campaign-1',
      }),
      search: '?view=list',
      scrollTop: 320,
    };
    act(() => {
      expect(
        result.current.openMyahInboxConversation({
          workspaceId: 'workspace-1',
          contactId: 'contact-1',
          threadId: 'thread-1',
          creatorReturnTarget: returnTarget,
        }),
      ).toBe(true);
    });
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-1',
      emailThreadId: 'thread-1',
    });
    act(() => {
      expect(
        result.current.openMyahInboxConversation({
          workspaceId: 'workspace-1',
          contactId: 'contact-2',
          threadId: 'thread-2',
          creatorReturnTarget: { ...returnTarget, scrollTop: -1 },
        }),
      ).toBe(false);
    });
    act(() => {
      expect(
        result.current.openMyahInboxConversation({
          workspaceId: 'workspace-1',
          contactId: 'contact-2',
          threadId: 'thread-2',
          creatorReturnTarget: { ...returnTarget, pathname: '/myah/messages' },
        }),
      ).toBe(false);
    });
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-1',
      emailThreadId: 'thread-1',
    });
  });

  it('refuses a workspace mismatch without changing selection', () => {
    const before = store.get(myahInboxContactSelectionState.atom);
    const { result } = renderHook(useOpenMyahInboxConversation, { wrapper });

    act(() => {
      expect(
        result.current.openMyahInboxConversation({
          workspaceId: 'workspace-2',
          contactId: 'contact-2',
          threadId: 'thread-2',
        }),
      ).toBe(false);
    });

    expect(store.get(myahInboxContactSelectionState.atom)).toEqual(before);
  });
});
