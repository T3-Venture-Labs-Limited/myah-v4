import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { useOpenRecordsSearchPageInSidePanel } from '@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { sidePanelSearchFocusRestoreElementState } from '@/side-panel/states/sidePanelSearchFocusRestoreElementState';
import { waitForSidePanelClose } from '@/ui/layout/side-panel/utils/waitForSidePanelClose';

const navigateSidePanelMock = jest.fn();
const closeAnyOpenDropdownMock = jest.fn();
const resetRecordIndexSelectionMock = jest.fn();
const removeFocusItemFromFocusStackByIdMock = jest.fn();
const waitForSidePanelCloseMock = jest.mocked(waitForSidePanelClose);

jest.mock('@/side-panel/hooks/useNavigateSidePanel', () => ({
  useNavigateSidePanel: () => ({ navigateSidePanel: navigateSidePanelMock }),
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseAnyOpenDropdown', () => ({
  useCloseAnyOpenDropdown: () => ({
    closeAnyOpenDropdown: closeAnyOpenDropdownMock,
  }),
}));

jest.mock(
  '@/object-record/record-index/hooks/useResetRecordIndexSelection',
  () => ({
    useResetRecordIndexSelection: () => ({
      resetRecordIndexSelection: resetRecordIndexSelectionMock,
    }),
  }),
);

jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: removeFocusItemFromFocusStackByIdMock,
    }),
  }),
);

jest.mock('@/ui/layout/side-panel/utils/waitForSidePanelClose', () => ({
  waitForSidePanelClose: jest.fn(),
}));

const renderUseSidePanelMenu = () => {
  const store = createStore();
  store.set(isSidePanelOpenedState.atom, true);

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  return {
    store,
    ...renderHook(() => useSidePanelMenu(), { wrapper: Wrapper }),
  };
};

const createFocusedSearchButton = () => {
  const searchButton = document.createElement('button');
  searchButton.textContent = 'Search';
  document.body.append(searchButton);
  searchButton.focus();

  return searchButton;
};

const renderUseSidePanelMenuWithRecordsSearch = () => {
  const store = createStore();
  store.set(isSidePanelOpenedState.atom, true);

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  return {
    store,
    ...renderHook(
      () => ({
        ...useSidePanelMenu(),
        ...useOpenRecordsSearchPageInSidePanel(),
      }),
      { wrapper: Wrapper },
    ),
  };
};

describe('useSidePanelMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    waitForSidePanelCloseMock.mockResolvedValue(undefined);
  });

  it('restores a connected Search opener after the side panel closes', async () => {
    const { result, store } = renderUseSidePanelMenu();
    const searchButton = createFocusedSearchButton();
    store.set(sidePanelSearchFocusRestoreElementState.atom, {
      restoreElement: searchButton,
    });
    const sidePanelButton = document.createElement('button');
    document.body.append(sidePanelButton);
    sidePanelButton.focus();

    await act(async () => {
      await result.current.closeSidePanelMenu();
    });

    expect(waitForSidePanelCloseMock).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(searchButton);
    expect(store.get(sidePanelSearchFocusRestoreElementState.atom)).toBeNull();
  });

  it('clears a disconnected Search opener without throwing', async () => {
    const { result, store } = renderUseSidePanelMenu();
    const searchButton = createFocusedSearchButton();
    store.set(sidePanelSearchFocusRestoreElementState.atom, {
      restoreElement: searchButton,
    });
    searchButton.remove();

    await act(async () => {
      await expect(
        result.current.closeSidePanelMenu(),
      ).resolves.toBeUndefined();
    });

    expect(store.get(sidePanelSearchFocusRestoreElementState.atom)).toBeNull();
  });
  it('does not restore or clear a newer Search operation from the same opener after an earlier close resolves', async () => {
    let resolveSidePanelClose = () => {};
    waitForSidePanelCloseMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSidePanelClose = resolve;
        }),
    );

    const { result, store } = renderUseSidePanelMenuWithRecordsSearch();
    const searchButton = createFocusedSearchButton();
    act(() => {
      result.current.openRecordsSearchPage();
    });
    const oldRestoreTarget = store.get(
      sidePanelSearchFocusRestoreElementState.atom,
    );

    let closeSidePanelMenuPromise = Promise.resolve();
    await act(async () => {
      closeSidePanelMenuPromise = result.current.closeSidePanelMenu();
    });

    navigateSidePanelMock.mockImplementation(() => {
      store.set(isSidePanelOpenedState.atom, true);
    });
    act(() => {
      result.current.openRecordsSearchPage();
    });
    const newRestoreTarget = store.get(
      sidePanelSearchFocusRestoreElementState.atom,
    );

    expect(newRestoreTarget).not.toBe(oldRestoreTarget);

    await act(async () => {
      resolveSidePanelClose();
      await closeSidePanelMenuPromise;
    });

    expect(document.activeElement).toBe(searchButton);
    expect(store.get(sidePanelSearchFocusRestoreElementState.atom)).toBe(
      newRestoreTarget,
    );
  });

  it('clears an old Search target when another panel reopens and never restores it later', async () => {
    let resolveSidePanelClose = () => {};
    waitForSidePanelCloseMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSidePanelClose = resolve;
        }),
    );

    const { result, store } = renderUseSidePanelMenu();
    const searchButton = createFocusedSearchButton();
    store.set(sidePanelSearchFocusRestoreElementState.atom, {
      restoreElement: searchButton,
    });

    let closeSidePanelMenuPromise = Promise.resolve();
    await act(async () => {
      closeSidePanelMenuPromise = result.current.closeSidePanelMenu();
    });

    const nonSearchPanelButton = document.createElement('button');
    document.body.append(nonSearchPanelButton);
    nonSearchPanelButton.focus();
    store.set(isSidePanelOpenedState.atom, true);

    await act(async () => {
      resolveSidePanelClose();
      await closeSidePanelMenuPromise;
    });

    expect(document.activeElement).toBe(nonSearchPanelButton);
    expect(store.get(sidePanelSearchFocusRestoreElementState.atom)).toBeNull();

    await act(async () => {
      await result.current.closeSidePanelMenu();
    });

    expect(document.activeElement).toBe(nonSearchPanelButton);
  });
  it('does not restore a Search opener after a non-Search reopen closes before either close wait resolves', async () => {
    const resolveSidePanelCloses: Array<() => void> = [];
    waitForSidePanelCloseMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSidePanelCloses.push(resolve);
        }),
    );

    const { result, store } = renderUseSidePanelMenu();
    const searchButton = createFocusedSearchButton();
    store.set(sidePanelSearchFocusRestoreElementState.atom, {
      restoreElement: searchButton,
    });

    let firstClosePromise = Promise.resolve();
    await act(async () => {
      firstClosePromise = result.current.closeSidePanelMenu();
    });

    const commandMenuButton = document.createElement('button');
    document.body.append(commandMenuButton);
    commandMenuButton.focus();
    navigateSidePanelMock.mockImplementation(() => {
      store.set(isSidePanelOpenedState.atom, true);
    });

    act(() => {
      result.current.openSidePanelMenu();
    });

    let secondClosePromise = Promise.resolve();
    await act(async () => {
      secondClosePromise = result.current.closeSidePanelMenu();
    });

    await act(async () => {
      resolveSidePanelCloses.forEach((resolve) => resolve());
      await Promise.all([firstClosePromise, secondClosePromise]);
    });

    expect(document.activeElement).toBe(commandMenuButton);
    expect(store.get(sidePanelSearchFocusRestoreElementState.atom)).toBeNull();
  });
});
