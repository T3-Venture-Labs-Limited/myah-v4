import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';

let mockIsMobile = true;

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

type CapturedIconProps = {
  color?: string;
};

const CapturedIcon = ({ color }: CapturedIconProps) => (
  <svg data-color={color} data-testid="captured-icon" />
);

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

  it('inherits the standard color for ready collapsed grouped icons', () => {
    mockIsMobile = false;

    const store = createStore();

    store.set(isNavigationDrawerExpandedState.atom, false);

    render(
      <JotaiProvider store={store}>
        <ThemeProvider colorScheme="light">
          <MemoryRouter>
            <NavigationDrawerItem
              Icon={CapturedIcon}
              indentationLevel={2}
              label="Creators"
              to="/objects/creators"
            />
          </MemoryRouter>
        </ThemeProvider>
      </JotaiProvider>,
    );

    expect(screen.getByTestId('captured-icon')).toHaveAttribute(
      'data-color',
      'currentColor',
    );
  });

  it('shows the Coming soon tooltip when a collapsed Soon item receives focus', async () => {
    mockIsMobile = false;

    const store = createStore();

    store.set(isNavigationDrawerExpandedState.atom, false);

    const user = userEvent.setup();

    render(
      <JotaiProvider store={store}>
        <ThemeProvider colorScheme="light">
          <MemoryRouter>
            <NavigationDrawerItem label="Soon" modifier="soon" disabled />
          </MemoryRouter>
        </ThemeProvider>
      </JotaiProvider>,
    );

    const soonItem = screen.getByRole('button', { name: /Soon/i });

    expect(soonItem).toHaveAttribute('aria-disabled', 'true');
    expect(soonItem).not.toBeDisabled();
    expect(soonItem).not.toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(soonItem).toHaveFocus();

    await waitFor(() => {
      expect(screen.getByText('Coming soon')).toBeVisible();
    });
  });
});
