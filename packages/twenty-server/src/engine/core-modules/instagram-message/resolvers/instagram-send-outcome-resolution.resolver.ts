import { UseGuards } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import {
  InstagramSendOutcomeResolutionDto,
  ResolveInstagramSendOutcomeInput,
} from 'src/engine/core-modules/instagram-message/dtos/instagram-send-outcome-resolution.dto';
import { ResolveInstagramOutcomePermissionGuard } from 'src/engine/core-modules/instagram-message/guards/resolve-instagram-outcome-permission.guard';
import { InstagramSendOutcomeResolutionService } from 'src/engine/core-modules/instagram-message/services/instagram-send-outcome-resolution.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

// The dedicated permission guard maps RESOLVE_INSTAGRAM_SEND_OUTCOME to the
// verified Myah Team identity; customer roles cannot acquire this grant.
@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  ResolveInstagramOutcomePermissionGuard,
  NoImpersonationGuard,
  CustomPermissionGuard,
)
@CoreResolver()
export class InstagramSendOutcomeResolutionResolver {
  constructor(
    private readonly resolutionService: InstagramSendOutcomeResolutionService,
  ) {}

  @Mutation(() => InstagramSendOutcomeResolutionDto)
  async resolveInstagramUnknownSend(
    @Args('input') input: ResolveInstagramSendOutcomeInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<InstagramSendOutcomeResolutionDto> {
    const resolution = await this.resolutionService.resolve({
      ...input,
      workspaceId: workspace.id,
      resolvedByUserWorkspaceId: userWorkspaceId,
    });

    return {
      id: resolution.id,
      receiptId: resolution.actionExecutionReceiptId,
      outcome: resolution.outcome,
    };
  }
}
