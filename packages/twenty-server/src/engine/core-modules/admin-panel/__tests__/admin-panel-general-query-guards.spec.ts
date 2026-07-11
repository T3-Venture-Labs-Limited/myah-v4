import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AdminPanelResolver } from 'src/engine/core-modules/admin-panel/admin-panel.resolver';
import { AdminPanelGuard } from 'src/engine/guards/admin-panel-guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';

describe('AdminPanelResolver General tab query guards', () => {
  it.each([
    ['versionInfo', [AdminPanelGuard]],
    ['getServerAdmins', [AdminPanelGuard, NoImpersonationGuard]],
    ['userLookupAdminPanel', [AdminPanelGuard]],
    ['adminPanelRecentUsers', [AdminPanelGuard]],
    ['adminPanelTopWorkspaces', [AdminPanelGuard]],
    ['workspaceLookupAdminPanel', [AdminPanelGuard]],
    ['workspaceBillingAdminPanel', [AdminPanelGuard]],
    ['getAdminWorkspaceChatThreads', [AdminPanelGuard]],
    ['getAdminChatThreadMessages', [AdminPanelGuard]],
  ] as const)(
    'keeps global admin query %s behind server-level guards',
    (methodName, expectedGuards) => {
      const method = AdminPanelResolver.prototype[methodName];

      expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual(
        expectedGuards,
      );
    },
  );
});
