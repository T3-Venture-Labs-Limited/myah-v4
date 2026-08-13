import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CampaignOutreachWorkflowDTO } from 'src/modules/myah-outreach/dtos/campaign-outreach-workflow.dto';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';

@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.WORKFLOWS),
)
@CoreResolver(() => CampaignOutreachWorkflowDTO)
export class CampaignOutreachWorkflowResolver {
  constructor(
    private readonly campaignOutreachWorkflowService: CampaignOutreachWorkflowService,
  ) {}

  @Query(() => CampaignOutreachWorkflowDTO, { nullable: true })
  async findCampaignOutreachWorkflow(
    @Args('campaignId', { type: () => UUIDScalarType }) campaignId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignOutreachWorkflowDTO | null> {
    return this.campaignOutreachWorkflowService.find({
      campaignId,
      workspaceId,
    });
  }

  @Mutation(() => CampaignOutreachWorkflowDTO)
  async createCampaignOutreachWorkflow(
    @Args('campaignId', { type: () => UUIDScalarType }) campaignId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignOutreachWorkflowDTO> {
    return this.campaignOutreachWorkflowService.createOrGet({
      campaignId,
      workspaceId,
    });
  }
}
