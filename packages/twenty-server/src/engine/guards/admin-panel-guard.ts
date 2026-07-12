import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { type Observable } from 'rxjs';

import { isMyahTeamUser } from 'src/engine/core-modules/myah/utils/is-myah-team-user.util';

export class AdminPanelGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext().req;

    return isMyahTeamUser({
      user: request.user,
      allowedEmails: process.env.MYAH_TEAM_ALLOWED_EMAILS,
      allowedEmailDomains: process.env.MYAH_TEAM_ALLOWED_DOMAINS,
    });
  }
}
