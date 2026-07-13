import { GUARDS_METADATA } from '@nestjs/common/constants';

import { ImpersonationResolver } from 'src/engine/core-modules/impersonation/impersonation.resolver';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

describe('ImpersonationResolver authorization chain', () => {
  it('defers target-aware impersonation authorization until after the authenticated, non-impersonated request boundary', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        ImpersonationResolver.prototype.impersonate,
      ),
    ).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      NoImpersonationGuard,
      CustomPermissionGuard,
    ]);
  });
});
