import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MyahNavigationDrawerSection } from '@/myah/navigation/components/MyahNavigationDrawerSection';
import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { isNavigationSectionOpenFamilyState } from '@/myah/navigation/states/isNavigationSectionOpenFamilyState';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';

jest.mock('@/myah/navigation/hooks/useResolvedMyahNavigationRoutes');

const mockedUseResolvedMyahNavigationRoutes = jest.mocked(
  useResolvedMyahNavigationRoutes,
);

const resolvedRoutes: ResolvedMyahNavigationRoute[] = [
  {
    status: 'ready',
    route: getMyahNavigationRoute('inbox'),
    destination: { kind: 'myah-page', Component: () => null },
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
];

const renderSection = (
  initialEntry = '/objects/campaigns',
  isNavigationDrawerExpanded = true,
  isCreatorCrmSectionOpen = true,
) => {
  const store = createStore();

  store.set(
    isNavigationSectionOpenFamilyState.atomFamily('campaign-operations'),
    false,
  );
  store.set(
    isNavigationSectionOpenFamilyState.atomFamily('creator-crm'),
    isCreatorCrmSectionOpen,
  );
  store.set(isNavigationDrawerExpandedState.atom, isNavigationDrawerExpanded);

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
  it('renders live Myah links and active routes without Soon entries', () => {
    renderSection();

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/myah/inbox',
    );
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Creator CRM' }),
    ).not.toHaveAttribute('href');
    expect(
      screen.getByText('Campaigns').closest('[aria-selected="true"]'),
    ).toBeVisible();
    expect(screen.queryByText('Segments')).not.toBeInTheDocument();

    expect(screen.queryByText('Creator Briefs')).not.toBeInTheDocument();
    expect(screen.queryByText('Creator Discovery')).not.toBeInTheDocument();
    expect(screen.queryByText('Soon')).not.toBeInTheDocument();
  });

  it('removes group headers from the collapsed drawer while retaining group route controls', () => {
    renderSection('/objects/campaigns', false);

    expect(
      screen.queryByRole('button', { name: 'Creator CRM' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Creators' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Creator Briefs.*Soon/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps routes from closed inactive groups visible in collapsed drawer', () => {
    renderSection('/objects/campaigns', false, false);

    expect(screen.getByRole('link', { name: 'Creators' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Creator Discovery.*Soon/i }),
    ).not.toBeInTheDocument();
  });

  it('toggles inactive groups with Enter and Space while keeping active groups open', async () => {
    const { user } = renderSection();
    const creatorCrmToggle = screen.getByRole('button', {
      name: 'Creator CRM',
    });
    const campaignOperationsToggle = screen.getByRole('button', {
      name: 'Campaign Operations',
    });
    expect(campaignOperationsToggle).toHaveAttribute('aria-expanded', 'true');

    creatorCrmToggle.focus();
    await user.keyboard('{Enter}');
    expect(creatorCrmToggle).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard(' ');
    expect(creatorCrmToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(campaignOperationsToggle);
    expect(campaignOperationsToggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeVisible();
  });
});
