import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => true,
}));

describe('NavigationDrawerItem', () => {
  it('closes the mobile drawer for enabled links but not disabled Soon content', async () => {
    const store = createStore();
    const user = userEvent.setup();
    const disabledOnClick = jest.fn();

    store.set(isNavigationDrawerExpandedState.atom, true);

    render(
      <JotaiProvider store={store}>
        <ThemeProvider colorScheme="light">
          <MemoryRouter>
            <NavigationDrawerItem label="Internal" to="/internal" />
            <NavigationDrawerItem
              label="External"
              to="https://example.com"
              onClick={() => undefined}
            />
            <NavigationDrawerItem
              label="Soon"
              to="/soon"
              modifier="soon"
              disabled
              onClick={disabledOnClick}
            />
          </MemoryRouter>
        </ThemeProvider>
      </JotaiProvider>,
    );

    await user.click(screen.getByRole('link', { name: 'Internal' }));
    expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(false);

    act(() => store.set(isNavigationDrawerExpandedState.atom, true));
    await user.click(screen.getByRole('link', { name: 'External' }));
    expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(false);

    act(() => store.set(isNavigationDrawerExpandedState.atom, true));
    await user.click(screen.getByRole('button', { name: /Soon/i }));
    expect(store.get(isNavigationDrawerExpandedState.atom)).toBe(true);
    expect(disabledOnClick).not.toHaveBeenCalled();
  });
});
