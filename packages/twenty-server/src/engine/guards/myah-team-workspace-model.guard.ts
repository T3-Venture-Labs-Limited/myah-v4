import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { type UpdateWorkspaceInput } from 'src/engine/core-modules/workspace/dtos/update-workspace-input';

type WorkspaceModelConfigurationArgs = {
  data?: Pick<
    UpdateWorkspaceInput,
    'enabledAiModelIds' | 'useRecommendedModels'
  >;
};

type WorkspaceModelConfigurationContext = {
  req: {
    impersonationContext?: {
      impersonatorUserWorkspaceId?: string;
      impersonatedUserWorkspaceId?: string;
    };
    user?: Parameters<MyahTeamAuthorizationService['isMyahTeamMember']>[0];
  };
};

@Injectable()
export class MyahTeamWorkspaceModelGuard implements CanActivate {
  constructor(
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const graphqlContext = GqlExecutionContext.create(context);
    const { data } = graphqlContext.getArgs<WorkspaceModelConfigurationArgs>();

    const isChangingModelConfiguration =
      data?.enabledAiModelIds !== undefined ||
      data?.useRecommendedModels !== undefined;

    if (!isChangingModelConfiguration) {
      return true;
    }

    const { req } =
      graphqlContext.getContext<WorkspaceModelConfigurationContext>();
    const isCurrentlyImpersonating = Boolean(
      req.impersonationContext?.impersonatorUserWorkspaceId &&
      req.impersonationContext?.impersonatedUserWorkspaceId,
    );

    if (isCurrentlyImpersonating) {
      return false;
    }

    return this.myahTeamAuthorizationService.isMyahTeamMember(req.user);
  }
}
