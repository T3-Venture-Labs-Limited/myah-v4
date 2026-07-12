import { SettingsCommunity } from '~/pages/settings/community/SettingsCommunity';
import { render, screen } from '@testing-library/react';

jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock('@/settings/components/SettingsDiscoveryHeroCard', () => ({
  SettingsDiscoveryHeroCard: () => <div>hero</div>,
}));
jest.mock('@/settings/components/SettingsCard', () => ({
  SettingsCard: ({ title }: { title: string }) => <div>{title}</div>,
}));
jest.mock('twenty-ui/icon', () => ({
  IconBrandX: () => <span>X</span>,
  IconTransform: () => <span>Changelog</span>,
  useIcons: () => ({ getIcon: () => () => <span>Discord</span> }),
}));

describe('SettingsCommunity', () => {
  it('uses Myah community links and keeps only the changelog utility card', () => {
    render(<SettingsCommunity />);

    expect(
      screen.getByRole('link', { name: 'Join our Discord' }),
    ).toHaveAttribute('href', 'https://discord.gg/5x2Sag4cRk');
    expect(
      screen.getByRole('link', { name: 'Follow us on X' }),
    ).toHaveAttribute('href', 'https://x.com/MyahDev');
    expect(screen.getByRole('link', { name: 'Read changelog' })).toBeVisible();
    expect(screen.queryByText('Partners')).not.toBeInTheDocument();
    expect(screen.queryByText('Browse partners')).not.toBeInTheDocument();
    expect(screen.queryByText('Features')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Try our upcoming features/),
    ).not.toBeInTheDocument();
  });
});
