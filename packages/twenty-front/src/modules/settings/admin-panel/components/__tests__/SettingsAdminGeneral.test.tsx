import { useIsMyahTeamUser } from '@/auth/hooks/useIsMyahTeamUser';
import { currentUserState } from '@/auth/states/currentUserState';
import { canManageFeatureFlagsState } from '@/client-config/states/canManageFeatureFlagsState';
import { SettingsAdminGeneral } from '@/settings/admin-panel/components/SettingsAdminGeneral';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useQuery } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import {
  AdminPanelRecentUsersDocument,
  AdminPanelTopWorkspacesDocument,
} from '~/generated-admin/graphql';

jest.mock('@/auth/hooks/useIsMyahTeamUser');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');
jest.mock('@apollo/client/react');
jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: (value: number) => String(value) }),
}));
jest.mock('@/settings/admin-panel/apollo/hooks/useApolloAdminClient', () => ({
  useApolloAdminClient: () => ({}),
}));
jest.mock(
  '@/settings/admin-panel/components/SettingsAdminVersionContainer',
  () => ({
    SettingsAdminVersionContainer: () => <div>Version card</div>,
  }),
);
jest.mock(
  '@/settings/admin-panel/components/SettingsAdminServerAdmins',
  () => ({
    SettingsAdminServerAdmins: () => <div>Administrators</div>,
  }),
);
jest.mock('@/settings/components/SettingsSectionSkeletonLoader', () => ({
  SettingsSectionSkeletonLoader: () => <div>Loading</div>,
}));
jest.mock('@/ui/input/components/SettingsTextInput', () => ({
  SettingsTextInput: ({ placeholder }: { placeholder: string }) => (
    <input aria-label={placeholder} />
  ),
}));
jest.mock('@/ui/layout/table/components/Table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/ui/layout/table/components/TableBody', () => ({
  TableBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/ui/layout/table/components/TableCell', () => ({
  TableCell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/ui/layout/table/components/TableHeader', () => ({
  TableHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/ui/layout/table/components/TableRow', () => ({
  TableRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('twenty-ui/data-display', () => ({
  Avatar: () => <span>avatar</span>,
}));
jest.mock('twenty-ui/icon', () => ({
  IconChevronRight: () => <span>chevron</span>,
}));
jest.mock('twenty-ui/layout', () => ({
  Section: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock('twenty-ui/surfaces', () => ({
  OverflowingTextWithTooltip: ({ text }: { text: string }) => (
    <span>{text}</span>
  ),
}));
jest.mock('twenty-ui/typography', () => ({
  H2Title: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <header>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
  ),
}));
jest.mock('twenty-ui/theme-constants', () => {
  const React = require('react');

  return {
    ThemeContext: React.createContext({
      theme: {
        icon: { size: { md: 16 }, stroke: { sm: 1 } },
        font: { color: { tertiary: 'gray' } },
      },
    }),
    themeCssVariables: {
      font: { color: { primary: 'black', tertiary: 'gray' } },
      spacing: { 2: '8px', 4: '16px' },
    },
  };
});

const mockUseIsMyahTeamUser = jest.mocked(useIsMyahTeamUser);
const mockUseAtomStateValue = jest.mocked(useAtomStateValue);
const mockUseQuery = jest.mocked(useQuery);
const currentUserAtom = currentUserState.atom as unknown;
const canManageFeatureFlagsAtom = canManageFeatureFlagsState.atom as unknown;

const mockCurrentUser = {
  email: 'operator@t3labs.io',
  canAccessFullAdminPanel: false,
  canImpersonate: false,
};

const mockRecentUsersData = {
  adminPanelRecentUsers: [
    {
      id: 'user-1',
      firstName: 'Myah',
      lastName: 'Operator',
      email: 'operator@t3labs.io',
      avatarUrl: null,
      workspaceId: 'workspace-1',
      workspaceLogo: null,
      workspaceName: 'Apple',
    },
  ],
};

const mockTopWorkspacesData = {
  adminPanelTopWorkspaces: [
    {
      id: 'workspace-1',
      logoUrl: null,
      name: 'Apple',
      totalUsers: 3,
    },
  ],
};

describe('SettingsAdminGeneral', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomStateValue.mockImplementation((atom) => {
      if ((atom as unknown) === currentUserAtom) {
        return mockCurrentUser as never;
      }

      if ((atom as unknown) === canManageFeatureFlagsAtom) {
        return true as never;
      }

      return undefined as never;
    });
    mockUseQuery.mockImplementation((document) => {
      if (document === AdminPanelRecentUsersDocument) {
        return { data: mockRecentUsersData, loading: false } as never;
      }

      if (document === AdminPanelTopWorkspacesDocument) {
        return { data: mockTopWorkspacesData, loading: false } as never;
      }

      return { data: undefined, loading: false } as never;
    });
  });

  it('renders full General content for a Myah Team user without legacy admin flags', () => {
    mockUseIsMyahTeamUser.mockReturnValue(true);

    render(<SettingsAdminGeneral />);

    expect(screen.getByText('About')).toBeVisible();
    expect(screen.getByText('Version card')).toBeVisible();
    expect(screen.getByText('Administrators')).toBeVisible();
    expect(screen.getByText('Recent Users')).toBeVisible();
    expect(screen.getByText('Top Workspaces')).toBeVisible();
    expect(screen.getByText('Myah Operator')).toBeVisible();
    expect(screen.getAllByText('Apple')).toHaveLength(2);
  });

  it('does not render global General dashboard sections for non-Myah Team users', () => {
    mockUseIsMyahTeamUser.mockReturnValue(false);

    render(<SettingsAdminGeneral />);

    expect(screen.queryByText('About')).not.toBeInTheDocument();
    expect(screen.queryByText('Version card')).not.toBeInTheDocument();
    expect(screen.queryByText('Administrators')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Top Workspaces')).not.toBeInTheDocument();
    expect(screen.queryByText('Myah Operator')).not.toBeInTheDocument();
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Workspace administration'),
    ).not.toBeInTheDocument();
  });
});
