import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MyahNavigationDrawerSection } from '@/myah/navigation/components/MyahNavigationDrawerSection';
import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { isNavigationSectionOpenFamilyState } from '@/myah/navigation/states/isNavigationSectionOpenFamilyState';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';

jest.mock('@/myah/navigation/hooks/useResolvedMyahNavigationRoutes');

const mockedUseResolvedMyahNavigationRoutes = jest.mocked(
  useResolvedMyahNavigationRoutes,
);

const resolvedRoutes: ResolvedMyahNavigationRoute[] = [
  {
    status: 'ready',
    route: getMyahNavigationRoute('today'),
    destination: { kind: 'native', path: '/objects/dashboards' },
  },
  {
    status: 'ready',
    route: getMyahNavigationRoute('creators'),
    destination: {
      kind: 'native',
      path: '/objects/creators',
      objectNameSingular: 'creator',
    },
  },
  {
    status: 'deferred',
    route: getMyahNavigationRoute('segments'),
  },
  {
    status: 'soon',
    route: getMyahNavigationRoute('creator-discovery'),
  },
  {
    status: 'ready',
    route: getMyahNavigationRoute('campaigns'),
    destination: {
      kind: 'native',
      path: '/objects/campaigns',
      objectNameSingular: 'campaign',
    },
  },
  {
    status: 'soon',
    route: getMyahNavigationRoute('creator-briefs'),
  },
  {
    status: 'missing',
    route: getMyahNavigationRoute('brand-brain'),
  },
];

const renderSection = (initialEntry = '/objects/campaigns') => {
  const store = createStore();

  store.set(
    isNavigationSectionOpenFamilyState.atomFamily('campaign-operations'),
    false,
  );
  mockedUseResolvedMyahNavigationRoutes.mockReturnValue(resolvedRoutes);

  const user = userEvent.setup();

  render(
    <JotaiProvider store={store}>
      <ThemeProvider colorScheme="light">
        <MemoryRouter initialEntries={[initialEntry]}>
          <MyahNavigationDrawerSection />
        </MemoryRouter>
      </ThemeProvider>
    </JotaiProvider>,
  );

  return { user };
};
describe('MyahNavigationDrawerSection', () => {
  it('renders Myah entry links, active routes, and non-interactive Soon entries', () => {
    renderSection();

    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/myah/today',
    );
    expect(
      screen.getByRole('button', { name: 'Creator CRM' }),
    ).not.toHaveAttribute('href');
    expect(
      screen.getByText('Campaigns').closest('[aria-selected="true"]'),
    ).toBeVisible();
    expect(screen.queryByText('Segments')).not.toBeInTheDocument();

    const creatorBriefsControl = screen.getByRole('button', {
      name: /Creator Briefs.*Soon/i,
    });
    expect(creatorBriefsControl).toHaveTextContent('Soon');

    expect(creatorBriefsControl).toHaveAttribute('aria-disabled', 'true');
    expect(creatorBriefsControl).toHaveAttribute('tabindex', '-1');
    expect(creatorBriefsControl).not.toHaveAttribute('href');
    const brandBrainControl = screen.getByRole('button', {
      name: 'Brand Brain',
    });

    expect(brandBrainControl).toHaveAttribute('aria-disabled', 'true');
    expect(brandBrainControl).toHaveAttribute('tabindex', '-1');
    expect(brandBrainControl).not.toHaveAttribute('href');
  });

  it('toggles inactive groups with Enter and Space while keeping active groups open', async () => {
    const { user } = renderSection();
    const creatorCrmToggle = screen.getByRole('button', {
      name: 'Creator CRM',
    });
    const campaignOperationsToggle = screen.getByRole('button', {
      name: 'Campaign Operations',
    });
    const creatorBriefsControl = screen.getByRole('button', {
      name: /Creator Briefs.*Soon/i,
    });

    expect(campaignOperationsToggle).toHaveAttribute('aria-expanded', 'true');

    creatorCrmToggle.focus();
    await user.keyboard('{Enter}');
    expect(creatorCrmToggle).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard(' ');
    expect(creatorCrmToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(campaignOperationsToggle);
    expect(campaignOperationsToggle).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    expect(creatorBriefsControl).not.toHaveFocus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('button', { name: /Creator Briefs.*Soon/i }),
    ).toBeDisabled();
  });
});
