import { useSettingsNavigationItems } from '@/settings/hooks/useSettingsNavigationItems';
import { MockedProvider } from '@apollo/client/testing/react';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { IconBrandInstagram } from 'twenty-ui/icon';
import {
  type Billing,
  OnboardingStatus,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

import { currentUserState } from '@/auth/states/currentUserState';
import { billingState } from '@/client-config/states/billingState';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Provider as JotaiProvider } from 'jotai';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';

i18n.load({
  [SOURCE_LOCALE]: messages,
});
i18n.activate(SOURCE_LOCALE);

const mockCurrentUser = {
  id: 'fake-user-id',
  email: 'fake@email.com',
  supportUserHash: null,
  canAccessFullAdminPanel: false,
  canImpersonate: false,
  isMyahTeamMember: false,
  onboardingStatus: OnboardingStatus.COMPLETED,
  userVars: {},
  firstName: 'fake-first-name',
  lastName: 'fake-last-name',
  hasPassword: true,
};

const mockBilling: Billing = {
  isBillingEnabled: false,
  billingUrl: '',
  trialPeriods: [],
  __typename: 'Billing',
};

const allWorkspaceSettingsPermissions = {
  [PermissionFlagType.WORKSPACE]: true,
  [PermissionFlagType.WORKSPACE_MEMBERS]: true,
  [PermissionFlagType.DATA_MODEL]: true,
  [PermissionFlagType.LAYOUTS]: true,
  [PermissionFlagType.API_KEYS_AND_WEBHOOKS]: true,
  [PermissionFlagType.APPLICATIONS]: true,
  [PermissionFlagType.AI_SETTINGS]: true,
  [PermissionFlagType.ROLES]: true,
  [PermissionFlagType.SECURITY]: true,
  [PermissionFlagType.CONNECTED_ACCOUNTS]: true,
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MockedProvider>
    <JotaiProvider store={jotaiStore}>
      <MemoryRouter>
        <I18nProvider i18n={i18n}>
          <SnackBarComponentInstanceContext.Provider
            value={{ instanceId: 'test-scope-id' }}
          >
            {children}
          </SnackBarComponentInstanceContext.Provider>
        </I18nProvider>
      </MemoryRouter>
    </JotaiProvider>
  </MockedProvider>
);

jest.mock('@/settings/roles/hooks/usePermissionFlagMap', () => ({
  usePermissionFlagMap: jest.fn(),
}));

jest.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: jest.fn().mockImplementation(() => ({
    redirectToWorkspaceDomain: jest.fn(),
  })),
}));

describe('useSettingsNavigationItems', () => {
  beforeEach(() => {
    resetJotaiStore();
    jotaiStore.set(currentUserState.atom, mockCurrentUser);
    jotaiStore.set(billingState.atom, mockBilling);
  });

  it('should hide workspace settings when no permissions', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(() => ({
      [PermissionFlagType.WORKSPACE]: false,
      [PermissionFlagType.WORKSPACE_MEMBERS]: false,
      [PermissionFlagType.DATA_MODEL]: false,
      [PermissionFlagType.LAYOUTS]: false,
      [PermissionFlagType.API_KEYS_AND_WEBHOOKS]: false,
      [PermissionFlagType.APPLICATIONS]: false,
      [PermissionFlagType.AI_SETTINGS]: false,
      [PermissionFlagType.ROLES]: false,
      [PermissionFlagType.SECURITY]: false,
      [PermissionFlagType.CONNECTED_ACCOUNTS]: false,
    }));

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );

    expect(workspaceSection?.items.every((item) => item.isHidden)).toBe(true);
    expect(
      workspaceSection?.items.find((item) => item.path === SettingsPath.Billing)
        ?.isHidden,
    ).toBe(true);
  });

  it('should show workspace settings when has permissions', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );

    expect(workspaceSection?.items.some((item) => !item.isHidden)).toBe(true);
  });

  it('should order the first five workspace settings items', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );

    expect(
      workspaceSection?.items.slice(0, 5).map((item) => item.path),
    ).toEqual([
      SettingsPath.General,
      SettingsPath.Billing,
      SettingsPath.Objects,
      SettingsPath.Layout,
      SettingsPath.WorkspaceMembersPage,
    ]);
  });

  it('should show billing navigation when billing is disabled', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );
    const billingItem = workspaceSection?.items.find(
      (item) => item.label === 'Billing',
    );

    expect(billingItem?.isHidden).toBe(false);
    expect(billingItem?.path).toBe(SettingsPath.Billing);
  });

  it('should show billing navigation when billing config is null', () => {
    jotaiStore.set(billingState.atom, null);

    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );
    const billingItem = workspaceSection?.items.find(
      (item) => item.label === 'Billing',
    );

    expect(billingItem?.isHidden).toBe(false);
    expect(billingItem?.path).toBe(SettingsPath.Billing);
  });

  it('should show user section items regardless of permissions', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(() => ({
      [PermissionFlagType.WORKSPACE]: false,
      [PermissionFlagType.WORKSPACE_MEMBERS]: false,
      [PermissionFlagType.DATA_MODEL]: false,
      [PermissionFlagType.LAYOUTS]: false,
      [PermissionFlagType.API_KEYS_AND_WEBHOOKS]: false,
      [PermissionFlagType.APPLICATIONS]: false,
      [PermissionFlagType.AI_SETTINGS]: false,
      [PermissionFlagType.ROLES]: false,
      [PermissionFlagType.SECURITY]: false,
      [PermissionFlagType.CONNECTED_ACCOUNTS]: false,
    }));

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const userSection = result.current.find(
      (section) => section.label === 'User',
    );
    expect(
      userSection?.items.filter((item) => !item.isHidden).length,
    ).toBeGreaterThan(0);
    expect(
      userSection?.items
        .filter((item) => item.path !== SettingsPath.Accounts)
        .every((item) => !item.isHidden),
    ).toBe(true);
  });

  it('should use the Instagram brand icon for the Instagram settings account item', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(() => ({
      [PermissionFlagType.WORKSPACE]: true,
      [PermissionFlagType.WORKSPACE_MEMBERS]: true,
      [PermissionFlagType.DATA_MODEL]: true,
      [PermissionFlagType.API_KEYS_AND_WEBHOOKS]: true,
      [PermissionFlagType.ROLES]: true,
      [PermissionFlagType.SECURITY]: true,
      [PermissionFlagType.CONNECTED_ACCOUNTS]: true,
    }));

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const userSection = result.current.find(
      (section) => section.label === 'User',
    );
    const accountsItem = userSection?.items.find(
      (item) => item.path === SettingsPath.Accounts,
    );
    const instagramItem = accountsItem?.subItems?.find(
      (item) => item.path === SettingsPath.AccountsInstagram,
    );

    expect(instagramItem?.Icon).toBe(IconBrandInstagram);
  });

  it('should hide Myah-owned settings surfaces from customer Admins', () => {
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );
    const otherSection = result.current.find(
      (section) => section.label === 'Other',
    );

    expect(
      workspaceSection?.items.find(
        (item) => item.path === SettingsPath.Applications,
      )?.isHidden,
    ).toBe(true);
    expect(
      otherSection?.items.find((item) => item.path === SettingsPath.AdminPanel)
        ?.isHidden,
    ).toBe(true);
    expect(
      workspaceSection?.items.find((item) => item.path === SettingsPath.Objects)
        ?.isHidden,
    ).toBe(false);
    expect(
      workspaceSection?.items.find((item) => item.path === SettingsPath.Layout)
        ?.isHidden,
    ).toBe(false);
    expect(
      workspaceSection?.items.find(
        (item) => item.path === SettingsPath.WorkspaceMembersPage,
      )?.isHidden,
    ).toBe(false);
    expect(
      workspaceSection?.items.find(
        (item) => item.path === SettingsPath.ApiWebhooks,
      )?.isHidden,
    ).toBe(false);
    expect(
      workspaceSection?.items.find((item) => item.path === SettingsPath.AI)
        ?.isHidden,
    ).toBe(false);
  });

  it('should show Myah-owned settings surfaces to server-authorized Team users', () => {
    jotaiStore.set(currentUserState.atom, {
      ...mockCurrentUser,
      isMyahTeamMember: true,
    });
    (usePermissionFlagMap as jest.Mock).mockImplementation(
      () => allWorkspaceSettingsPermissions,
    );

    const { result } = renderHook(() => useSettingsNavigationItems(), {
      wrapper: Wrapper,
    });

    const workspaceSection = result.current.find(
      (section) => section.label === 'Workspace',
    );
    const otherSection = result.current.find(
      (section) => section.label === 'Other',
    );

    expect(
      workspaceSection?.items.find(
        (item) => item.path === SettingsPath.Applications,
      )?.isHidden,
    ).toBe(false);
    expect(
      otherSection?.items.find((item) => item.path === SettingsPath.AdminPanel)
        ?.isHidden,
    ).toBe(false);
  });

  it.each([{ canAccessFullAdminPanel: true }, { canImpersonate: true }])(
    'should not expose the global Admin Panel to non-Myah Team server-flag users',
    (userPatch) => {
      (usePermissionFlagMap as jest.Mock).mockImplementation(
        () => allWorkspaceSettingsPermissions,
      );

      jotaiStore.set(currentUserState.atom, {
        ...mockCurrentUser,
        ...userPatch,
      });

      const { result } = renderHook(() => useSettingsNavigationItems(), {
        wrapper: Wrapper,
      });
      const otherSection = result.current.find(
        (section) => section.label === 'Other',
      );

      expect(
        otherSection?.items.find(
          (item) => item.path === SettingsPath.AdminPanel,
        )?.isHidden,
      ).toBe(true);
    },
  );
});
