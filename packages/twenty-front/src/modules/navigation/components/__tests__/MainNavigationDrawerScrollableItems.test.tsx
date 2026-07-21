import { render, screen } from '@testing-library/react';

import { MainNavigationDrawerScrollableItems } from '@/navigation/components/MainNavigationDrawerScrollableItems';

jest.mock('@/myah/navigation/components/MyahNavigationDrawerSection', () => ({
  MyahNavigationDrawerSection: () => <div data-testid="myah-navigation" />,
}));

jest.mock(
  '@/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection',
  () => ({
    NavigationDrawerOpenedSection: () => <div>Opened section</div>,
  }),
);

jest.mock(
  '@/navigation-menu-item/display/sections/favorites/components/FavoritesSectionDispatcher',
  () => ({
    FavoritesSectionDispatcher: () => <div>Favorites</div>,
  }),
);

jest.mock(
  '@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher',
  () => ({
    WorkspaceSectionDispatcher: () => <div>Workspace</div>,
  }),
);

describe('MainNavigationDrawerScrollableItems', () => {
  it('renders only the Myah navigation hierarchy', () => {
    render(<MainNavigationDrawerScrollableItems />);

    expect(screen.getByTestId('myah-navigation')).toBeVisible();
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Opened section')).not.toBeInTheDocument();
  });
});
