import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';

@Injectable()
export class MyahTeamGuard implements CanActivate {
  constructor(
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const graphqlContext = GqlExecutionContext.create(context).getContext<{
      req: {
        user?: Parameters<MyahTeamAuthorizationService['isMyahTeamMember']>[0];
      };
    }>();

    return this.myahTeamAuthorizationService.isMyahTeamMember(
      graphqlContext.req.user,
    );
  }
}
