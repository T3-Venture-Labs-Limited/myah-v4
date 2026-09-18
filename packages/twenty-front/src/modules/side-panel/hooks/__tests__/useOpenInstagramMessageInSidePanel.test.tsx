import { act, renderHook } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { type ReactNode } from 'react';
import { v4 } from 'uuid';
import { SidePanelPages } from 'twenty-shared/types';
import { useOpenInstagramMessageInSidePanel } from '@/side-panel/hooks/useOpenInstagramMessageInSidePanel';
import { instagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { COMMAND_MENU_SIDE_PANEL_PAGES } from '@/side-panel/constants/CommandMenuSidePanelPages';
import { composeEmailDefaultToComponentState } from '@/side-panel/pages/compose-email/states/composeEmailDefaultToComponentState';

const mockNavigate = jest.fn();
const mockUuid = v4 as jest.MockedFunction<() => string>;
jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'),
  v4: jest.fn(jest.requireActual('uuid').v4),
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ navigateSidePanelMenu: mockNavigate }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid
    .mockReturnValueOnce('page-a')
    .mockReturnValueOnce('attempt-a')
    .mockReturnValueOnce('page-b')
    .mockReturnValueOnce('attempt-b');
});
it('initializes one attempt per opening and isolates page state across rerenders and openings', () => {
  const store = createStore();
  const { result, rerender } = renderHook(useOpenInstagramMessageInSidePanel, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
  act(() =>
    result.current.openInstagramMessageInSidePanel({
      creatorRecordId: 'creator-a',
    }),
  );
  const firstAtom = instagramMessageComposerState.atomFamily({
    instanceId: 'page-a',
  });
  expect(store.get(firstAtom)).toEqual({
    recipient: { creatorRecordId: 'creator-a' },
    body: '',
    draftId: 'attempt-a',
  });
  expect(mockNavigate).toHaveBeenCalledWith(
    expect.objectContaining({
      page: SidePanelPages.InstagramMessage,
      pageId: 'page-a',
      pageTitle: 'New Instagram Message',
    }),
  );
  act(() =>
    store.set(firstAtom, { ...store.get(firstAtom)!, body: 'Keep this text' }),
  );
  rerender();
  expect(mockUuid).toHaveBeenCalledTimes(2);
  act(() => result.current.openInstagramMessageInSidePanel());
  expect(
    store.get(
      instagramMessageComposerState.atomFamily({ instanceId: 'page-b' }),
    ),
  ).toEqual({ recipient: null, body: '', draftId: 'attempt-b' });
  expect(store.get(firstAtom)).toEqual({
    recipient: { creatorRecordId: 'creator-a' },
    body: 'Keep this text',
    draftId: 'attempt-a',
  });
  expect(mockUuid).toHaveBeenCalledTimes(4);
  expect(
    store.get(
      composeEmailDefaultToComponentState.atomFamily({ instanceId: 'page-a' }),
    ),
  ).toBe('');
});
it('uses composer header/escape classification, not command search classification', () => {
  expect(COMMAND_MENU_SIDE_PANEL_PAGES).not.toContain(
    SidePanelPages.InstagramMessage,
  );
  expect(COMMAND_MENU_SIDE_PANEL_PAGES).not.toContain(
    SidePanelPages.ComposeEmail,
  );
});
