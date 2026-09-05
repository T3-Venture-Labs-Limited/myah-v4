import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';

@Injectable()
export class ResolveInstagramOutcomePermissionGuard implements CanActivate {
  readonly permissionFlag = PermissionFlagType.RESOLVE_INSTAGRAM_SEND_OUTCOME;

  constructor(
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const graphqlContext = GqlExecutionContext.create(context).getContext<{
      req: {
        user?: Parameters<MyahTeamAuthorizationService['isMyahTeamMember']>[0];
      };
    }>();

    return (
      this.permissionFlag ===
        PermissionFlagType.RESOLVE_INSTAGRAM_SEND_OUTCOME &&
      this.myahTeamAuthorizationService.isMyahTeamMember(
        graphqlContext.req.user,
      )
    );
  }
}
