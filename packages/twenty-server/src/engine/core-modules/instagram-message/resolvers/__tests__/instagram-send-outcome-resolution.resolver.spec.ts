import { GUARDS_METADATA } from '@nestjs/common/constants';

import { InstagramSendOutcomeResolutionResolver } from 'src/engine/core-modules/instagram-message/resolvers/instagram-send-outcome-resolution.resolver';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { ResolveInstagramOutcomePermissionGuard } from 'src/engine/core-modules/instagram-message/guards/resolve-instagram-outcome-permission.guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

describe('InstagramSendOutcomeResolutionResolver', () => {
  it('uses authenticated, non-impersonated Myah Team identity as the initial server-owned resolution grant', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InstagramSendOutcomeResolutionResolver,
    ) as unknown[];

    expect(guards).toEqual(
      expect.arrayContaining([
        WorkspaceAuthGuard,
        UserAuthGuard,
        ResolveInstagramOutcomePermissionGuard,
        NoImpersonationGuard,
        CustomPermissionGuard,
      ]),
    );
    expect(guards).toHaveLength(5);
  });
});
