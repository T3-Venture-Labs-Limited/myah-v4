import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AdminPanelResolver } from 'src/engine/core-modules/admin-panel/admin-panel.resolver';
import { MyahTeamGuard } from 'src/engine/guards/myah-team.guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

describe('AdminPanelResolver global authorization', () => {
  const globalAdminOperations = [
    'versionInfo',
    'getServerAdmins',
    'userLookupAdminPanel',
    'adminPanelRecentUsers',
    'adminPanelTopWorkspaces',
    'workspaceLookupAdminPanel',
    'workspaceBillingAdminPanel',
    'getAdminWorkspaceChatThreads',
    'getAdminChatThreadMessages',
  ] as const;

  it('requires an authenticated, non-impersonated Myah Team identity', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminPanelResolver)).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      MyahTeamGuard,
      NoImpersonationGuard,
    ]);
  });

  it.each(globalAdminOperations)(
    'relies on the resolver-wide Team boundary for %s',
    (methodName) => {
      const method = AdminPanelResolver.prototype[methodName];

      expect(Reflect.getMetadata(GUARDS_METADATA, method)).toBeUndefined();
    },
  );
});
