import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { isMyahTeamUser } from 'src/engine/core-modules/myah/utils/is-myah-team-user.util';
import { userHasAdminPrivileges } from 'src/engine/core-modules/impersonation/utils/user-has-admin-privileges.util';

// Read-only admin-panel lookups (user/recent-users search) are available to
// full admins as well as impersonators: managing server-admin access requires
// finding users, and a full admin is the higher privilege.
export class AdminPanelOrImpersonateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext().req;

    return (
      isMyahTeamUser({
        user: request.user,
        allowedEmails: process.env.MYAH_TEAM_ALLOWED_EMAILS,
        allowedEmailDomains: process.env.MYAH_TEAM_ALLOWED_DOMAINS,
      }) || userHasAdminPrivileges(request.user)
    );
  }
}
