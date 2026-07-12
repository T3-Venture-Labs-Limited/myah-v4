import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { isMyahTeamUser } from 'src/engine/core-modules/myah/utils/is-myah-team-user.util';
import { userCanServerImpersonate } from 'src/engine/core-modules/impersonation/utils/user-can-server-impersonate.util';

export class ServerLevelImpersonateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext().req;

    return (
      isMyahTeamUser({
        user: request.user,
        allowedEmails: process.env.MYAH_TEAM_ALLOWED_EMAILS,
        allowedEmailDomains: process.env.MYAH_TEAM_ALLOWED_DOMAINS,
      }) || userCanServerImpersonate(request.user)
    );
  }
}
