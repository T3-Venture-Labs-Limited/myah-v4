import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import {
  CreateMyahE2eCallbackFixtureInput,
  CreateMyahE2eCampaignMailboxFixtureInput,
  MyahE2eCallbackFixtureDTO,
  MyahE2eCampaignMailboxFixtureDTO,
  MyahE2eCampaignMailboxFixtureStatusDTO,
  MyahE2eFixtureIdInput,
} from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.dto';
import { MyahE2eFixtureService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, UserAuthGuard, NoPermissionGuard)
export class MyahE2eFixtureResolver {
  constructor(private readonly service: MyahE2eFixtureService) {}

  @Mutation(() => MyahE2eCampaignMailboxFixtureDTO)
  createMyahE2eCampaignMailboxFixture(
    @Args('input') input: CreateMyahE2eCampaignMailboxFixtureInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<MyahE2eCampaignMailboxFixtureDTO> {
    return this.service.createCampaignMailboxFixture(
      { workspaceId: workspace.id, userWorkspaceId, workspace },
      input.campaignId,
    );
  }

  @Mutation(() => MyahE2eCallbackFixtureDTO)
  createMyahE2eCampaignCallbackFixture(
    @Args('input') input: CreateMyahE2eCallbackFixtureInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<MyahE2eCallbackFixtureDTO> {
    return this.service.createCallbackFixture(
      { workspaceId: workspace.id, userWorkspaceId, workspace },
      input.fixtureId,
      input.campaignId,
      input.operationsTabId,
    );
  }

  @Query(() => MyahE2eCampaignMailboxFixtureStatusDTO)
  getMyahE2eCampaignMailboxFixtureStatus(
    @Args('input') input: MyahE2eFixtureIdInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): MyahE2eCampaignMailboxFixtureStatusDTO {
    return this.service.getCampaignMailboxFixtureStatus(
      { workspaceId: workspace.id, userWorkspaceId, workspace },
      input.fixtureId,
    );
  }

  @Mutation(() => Boolean)
  async cleanupMyahE2eCampaignMailboxFixture(
    @Args('input') input: MyahE2eFixtureIdInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<boolean> {
    return this.service.cleanup(
      { workspaceId: workspace.id, userWorkspaceId, workspace },
      input.fixtureId,
    );
  }
}
