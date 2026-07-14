import { useIsMyahTeamUser } from '@/auth/hooks/useIsMyahTeamUser';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { billingState } from '@/client-config/states/billingState';
import { canManageFeatureFlagsState } from '@/client-config/states/canManageFeatureFlagsState';
import { SettingsAdminUserDetail } from '~/pages/settings/admin-panel/SettingsAdminUserDetail';
import { SettingsAdminWorkspaceDetail } from '~/pages/settings/admin-panel/SettingsAdminWorkspaceDetail';
import { useHandleImpersonate } from '@/settings/admin-panel/hooks/useHandleImpersonate';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMutation, useQuery } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';

jest.mock('@/auth/hooks/useIsMyahTeamUser');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue');
jest.mock('@apollo/client/react');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ userId: 'target-user', workspaceId: 'workspace-1' }),
}));
jest.mock('@/settings/admin-panel/apollo/hooks/useApolloAdminClient', () => ({
  useApolloAdminClient: () => ({}),
}));
jest.mock('@/settings/admin-panel/hooks/useHandleImpersonate', () => ({
  useHandleImpersonate: jest.fn(),
}));
jest.mock(
  '@/settings/admin-panel/components/SettingsAdminServerAdminAccess',
  () => ({
    SettingsAdminServerAdminAccess: () => <div>server access manager</div>,
  }),
);
jest.mock(
  '@/settings/admin-panel/components/SettingsAdminWorkspaceContent',
  () => ({
    SettingsAdminWorkspaceContent: () => <div>workspace information</div>,
  }),
);
jest.mock(
  '@/settings/admin-panel/components/SettingsAdminWorkspaceBillingContent',
  () => ({
    SettingsAdminWorkspaceBillingContent: () => <div>workspace billing</div>,
  }),
);
jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/settings/components/SettingsSkeletonLoader', () => ({
  SettingsSkeletonLoader: () => <div>loading</div>,
}));
jest.mock('@/settings/components/SettingsSectionSkeletonLoader', () => ({
  SettingsSectionSkeletonLoader: () => <div>loading section</div>,
}));
jest.mock('@/settings/components/SettingsTableCard', () => ({
  SettingsTableCard: ({
    items,
  }: {
    items: Array<{ label: string; value: React.ReactNode }>;
  }) => (
    <dl>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  ),
}));
jest.mock('@/settings/admin-panel/hooks/useAdminUpdateFeatureFlag', () => ({
  useAdminUpdateFeatureFlag: () => ({ updateFeatureFlagState: jest.fn() }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));
jest.mock('@/ui/layout/tab-list/components/TabList', () => ({
  TabList: ({ tabs }: { tabs: Array<{ id: string; title: string }> }) => (
    <nav>
      {tabs.map((tab) => (
        <span key={tab.id} role="tab">
          {tab.title}
        </span>
      ))}
    </nav>
  ),
}));
jest.mock('@/ui/layout/table/components/Table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => (
    <table>{children}</table>
  ),
}));
jest.mock('@/ui/layout/table/components/TableBody', () => ({
  TableBody: ({ children }: { children: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
}));
jest.mock('@/ui/layout/table/components/TableCell', () => ({
  TableCell: ({ children }: { children: React.ReactNode }) => (
    <td>{children}</td>
  ),
}));
jest.mock('@/ui/layout/table/components/TableHeader', () => ({
  TableHeader: ({ children }: { children: React.ReactNode }) => (
    <th>{children}</th>
  ),
}));
jest.mock('@/ui/layout/table/components/TableRow', () => ({
  TableRow: ({ children }: { children: React.ReactNode }) => (
    <tr>{children}</tr>
  ),
}));
jest.mock('twenty-ui/data-display', () => ({
  Avatar: () => <span>avatar</span>,
}));
jest.mock('twenty-ui/icon', () => ({
  IconCalendar: () => null,
  IconCreditCard: () => null,
  IconEyeShare: () => null,
  IconFlag: () => null,
  IconId: () => null,
  IconLock: () => null,
  IconMail: () => null,
  IconMessage: () => null,
  IconSettings2: () => null,
  IconUser: () => null,
  IconUsers: () => null,
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({ title, disabled }: { title: string; disabled?: boolean }) => (
    <button aria-label={title} disabled={disabled} type="button">
      {title}
    </button>
  ),
  Toggle: () => <input type="checkbox" />,
}));
jest.mock('twenty-ui/layout', () => ({
  Section: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock('twenty-ui/surfaces', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    font: { color: { primary: 'black' } },
    spacing: { 2: '8px', 3: '12px' },
  },
}));

const mockUseIsMyahTeamUser = jest.mocked(useIsMyahTeamUser);
const mockUseAtomStateValue = jest.mocked(useAtomStateValue);
const mockUseAtomComponentStateValue = jest.mocked(useAtomComponentStateValue);
const mockUseHandleImpersonate = jest.mocked(useHandleImpersonate);
const mockUseQuery = jest.mocked(useQuery);
const mockUseMutation = jest.mocked(useMutation);

const currentUserAtom = currentUserState as unknown;
const currentWorkspaceAtom = currentWorkspaceState as unknown;
const billingAtom = billingState as unknown;
const canManageFeatureFlagsAtom = canManageFeatureFlagsState as unknown;

const userLookupData = {
  userLookupAdminPanel: {
    user: {
      id: 'target-user',
      firstName: 'Target',
      lastName: 'User',
      email: 'target@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    workspaces: [
      {
        id: 'workspace-1',
        name: 'Workspace One',
        logo: null,
        allowImpersonation: true,
      },
    ],
  },
};

const workspaceLookupData = {
  workspaceLookupAdminPanel: {
    workspaces: [
      {
        id: 'workspace-1',
        name: 'Workspace One',
        logo: null,
        allowImpersonation: true,
        featureFlags: [],
        users: [
          {
            id: 'target-user',
            firstName: 'Target',
            lastName: 'User',
            email: 'target@example.com',
            avatarUrl: null,
          },
        ],
      },
    ],
  },
};

const setCurrentUser = ({
  canAccessFullAdminPanel,
  canImpersonate,
}: {
  canAccessFullAdminPanel: boolean;
  canImpersonate: boolean;
}) => {
  mockUseAtomStateValue.mockImplementation((atom) => {
    if ((atom as unknown) === currentUserAtom) {
      return {
        id: 'current-user',
        canAccessFullAdminPanel,
        canImpersonate,
      } as never;
    }

    if ((atom as unknown) === currentWorkspaceAtom) {
      return undefined as never;
    }

    if ((atom as unknown) === billingAtom) {
      return { isBillingEnabled: false } as never;
    }

    if ((atom as unknown) === canManageFeatureFlagsAtom) {
      return false as never;
    }

    return undefined as never;
  });
};

describe('Admin Panel detail Team action gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHandleImpersonate.mockReturnValue({
      handleImpersonate: jest.fn(),
      impersonatingUserId: null,
    });
    mockUseMutation.mockReturnValue([jest.fn()] as never);
  });

  it('shows Admin user server access and impersonation actions for a Team user without legacy flags', () => {
    mockUseIsMyahTeamUser.mockReturnValue(true);
    setCurrentUser({
      canAccessFullAdminPanel: false,
      canImpersonate: false,
    });
    mockUseAtomComponentStateValue.mockReturnValue(undefined);
    mockUseQuery.mockReturnValue({
      data: userLookupData,
      loading: false,
    } as never);

    render(<SettingsAdminUserDetail />);

    expect(screen.getByText('server access manager')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Impersonate' })).toBeVisible();
  });

  it('hides Admin user server access and impersonation actions for a non-Team user with legacy flags', () => {
    mockUseIsMyahTeamUser.mockReturnValue(false);
    setCurrentUser({
      canAccessFullAdminPanel: true,
      canImpersonate: true,
    });
    mockUseAtomComponentStateValue.mockReturnValue(undefined);
    mockUseQuery.mockReturnValue({
      data: userLookupData,
      loading: false,
    } as never);

    render(<SettingsAdminUserDetail />);

    expect(screen.queryByText('server access manager')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Impersonate' }),
    ).not.toBeInTheDocument();
  });

  it('shows the workspace Members tab and impersonation action for a Team user without legacy flags', () => {
    mockUseIsMyahTeamUser.mockReturnValue(true);
    setCurrentUser({
      canAccessFullAdminPanel: false,
      canImpersonate: false,
    });
    mockUseAtomComponentStateValue.mockReturnValue('members');
    mockUseQuery
      .mockReturnValueOnce({
        data: workspaceLookupData,
        loading: false,
      } as never)
      .mockReturnValueOnce({
        data: { getAdminWorkspaceChatThreads: [] },
        loading: false,
      } as never)
      .mockReturnValueOnce({
        data: { getUpgradeStatus: [] },
        loading: false,
      } as never);

    render(<SettingsAdminWorkspaceDetail />);

    expect(screen.getByRole('tab', { name: 'Members' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Impersonate' })).toBeVisible();
  });

  it('hides the workspace Members tab and impersonation action for a non-Team user with legacy flags', () => {
    mockUseIsMyahTeamUser.mockReturnValue(false);
    setCurrentUser({
      canAccessFullAdminPanel: true,
      canImpersonate: true,
    });
    mockUseAtomComponentStateValue.mockReturnValue('members');
    mockUseQuery
      .mockReturnValueOnce({
        data: workspaceLookupData,
        loading: false,
      } as never)
      .mockReturnValueOnce({
        data: { getAdminWorkspaceChatThreads: [] },
        loading: false,
      } as never)
      .mockReturnValueOnce({
        data: { getUpgradeStatus: [] },
        loading: false,
      } as never);

    render(<SettingsAdminWorkspaceDetail />);

    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace members')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Impersonate' }),
    ).not.toBeInTheDocument();
  });
});
