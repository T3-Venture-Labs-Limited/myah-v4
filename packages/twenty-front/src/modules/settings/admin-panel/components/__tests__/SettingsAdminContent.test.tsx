import { SettingsAdminContent } from '@/settings/admin-panel/components/SettingsAdminContent';
import { SETTINGS_ADMIN_TABS } from '@/settings/admin-panel/constants/SettingsAdminTabs';
import { useIsMyahTeamUser } from '@/auth/hooks/useIsMyahTeamUser';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { render, screen } from '@testing-library/react';

jest.mock('@/auth/hooks/useIsMyahTeamUser');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');
jest.mock('@/settings/admin-panel/components/SettingsAdminTabContent', () => ({
  SettingsAdminTabContent: () => <div>admin tab content</div>,
}));
jest.mock('@/ui/layout/tab-list/components/TabList', () => ({
  TabList: ({ tabs }: { tabs: Array<{ id: string; title: string }> }) => (
    <nav>
      {tabs.map((tab) => (
        <span key={tab.id}>{tab.title}</span>
      ))}
    </nav>
  ),
}));
jest.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div>redirect:{to}</div>,
}));

const mockUseIsMyahTeamUser = jest.mocked(useIsMyahTeamUser);
const mockUseAtomStateValue = jest.mocked(useAtomStateValue);

describe('SettingsAdminContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomStateValue
      .mockReturnValueOnce({
        canAccessFullAdminPanel: false,
        canImpersonate: false,
      })
      .mockReturnValueOnce({ isBillingEnabled: false });
  });

  it('redirects customer admins away from the global Admin Panel', () => {
    mockUseIsMyahTeamUser.mockReturnValue(false);

    render(<SettingsAdminContent />);

    expect(screen.getByText('redirect:/settings/general')).toBeVisible();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
    expect(screen.queryByText('Apps')).not.toBeInTheDocument();
    expect(screen.queryByText('AI')).not.toBeInTheDocument();
    expect(screen.queryByText('Config')).not.toBeInTheDocument();
    expect(screen.queryByText('Health')).not.toBeInTheDocument();
    expect(screen.queryByText('Enterprise')).not.toBeInTheDocument();
  });

  it('keeps all admin panel tabs for Myah Team users', () => {
    mockUseIsMyahTeamUser.mockReturnValue(true);

    render(<SettingsAdminContent />);

    expect(screen.getByText('General')).toBeVisible();
    expect(screen.getByText('Apps')).toBeVisible();
    expect(screen.getByText('AI')).toBeVisible();
    expect(screen.getByText('Config')).toBeVisible();
    expect(screen.getByText('Health')).toBeVisible();
    expect(screen.getByText('Enterprise')).toBeVisible();
    expect(SETTINGS_ADMIN_TABS.GENERAL).toBe('general');
  });
});
