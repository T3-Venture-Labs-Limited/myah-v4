import { act, render, renderHook, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { useOpenRecordsSearchPageInSidePanel } from '@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel';
import { sidePanelSearchFocusRestoreElementState } from '@/side-panel/states/sidePanelSearchFocusRestoreElementState';

const navigateSidePanelMenuMock = jest.fn();

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({
    navigateSidePanelMenu: navigateSidePanelMenuMock,
  }),
}));

jest.mock('uuid', () => ({
  v4: () => 'page-id',
}));

describe('useOpenRecordsSearchPageInSidePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures the focused opener before navigating to global Search', () => {
    const store = createStore();
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
    const { result } = renderHook(() => useOpenRecordsSearchPageInSidePanel(), {
      wrapper: Wrapper,
    });

    render(<button type="button">Search</button>);
    const searchButton = screen.getByRole('button', { name: 'Search' });
    searchButton.focus();

    navigateSidePanelMenuMock.mockImplementation(() => {
      expect(store.get(sidePanelSearchFocusRestoreElementState.atom)).toEqual({
        restoreElement: searchButton,
      });
    });

    act(() => {
      result.current.openRecordsSearchPage();
    });

    expect(navigateSidePanelMenuMock).toHaveBeenCalledTimes(1);
  });
});
