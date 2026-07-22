import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MyahNavigationDrawerGroup } from '@/myah/navigation/components/MyahNavigationDrawerGroup';
import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem',
  () => ({
    NavigationDrawerItem: ({
      label,
      subItemState,
    }: {
      label: string;
      subItemState?: string;
    }) => (
      <div data-testid={label} data-sub-item-state={subItemState ?? 'unset'} />
    ),
  }),
);

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItemGroup',
  () => ({
    NavigationDrawerItemGroup: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <div data-testid="gapless-navigation-group">{children}</div>,
  }),
);

const outreachRoutes: ResolvedMyahNavigationRoute[] = [
  {
    status: 'ready',
    route: getMyahNavigationRoute('automations'),
    destination: { kind: 'native', path: '/objects/workflows' },
  },
  {
    status: 'ready',
    route: getMyahNavigationRoute('automation-runs'),
    destination: { kind: 'native', path: '/objects/workflowRuns' },
  },
  {
    status: 'ready',
    route: getMyahNavigationRoute('automation-versions'),
    destination: { kind: 'native', path: '/objects/workflowVersions' },
  },
  {
    status: 'ready',
    route: getMyahNavigationRoute('tasks'),
    destination: { kind: 'native', path: '/objects/tasks' },
  },
];

describe('MyahNavigationDrawerGroup', () => {
  it('uses the shared connector states for nested Outreach items', () => {
    render(
      <MemoryRouter
        initialEntries={['/myah/automation-versions']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <JotaiProvider store={createStore()}>
          <ThemeProvider colorScheme="light">
            <MyahNavigationDrawerGroup
              id="outreach"
              label="Outreach"
              routes={outreachRoutes}
              pathname="/myah/automation-versions"
              search=""
              hash=""
            />
          </ThemeProvider>
        </JotaiProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('gapless-navigation-group')).toBeInTheDocument();

    expect(screen.getByTestId('Automations')).toHaveAttribute(
      'data-sub-item-state',
      'intermediate-before-selected',
    );
    expect(screen.getByTestId('Automation runs')).toHaveAttribute(
      'data-sub-item-state',
      'intermediate-before-selected',
    );
    expect(screen.getByTestId('Automation versions')).toHaveAttribute(
      'data-sub-item-state',
      'intermediate-selected',
    );
    expect(screen.getByTestId('Tasks')).toHaveAttribute(
      'data-sub-item-state',
      'last-not-selected',
    );
  });
});
