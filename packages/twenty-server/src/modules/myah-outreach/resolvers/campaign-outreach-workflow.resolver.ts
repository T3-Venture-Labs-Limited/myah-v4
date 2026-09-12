import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CampaignOutreachWorkflowDTO } from 'src/modules/myah-outreach/dtos/campaign-outreach-workflow.dto';
import {
  CampaignSequenceLoadResultDTO,
  CampaignSequenceSnapshotDTO,
  PublishCampaignSequenceInput,
  ReplaceLegacyCampaignSequenceInput,
  SaveCampaignSequenceInput,
} from 'src/modules/myah-outreach/dtos/campaign-sequence.dto';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';
import {
  type CampaignSequenceLoadResult,
  CampaignSequenceService,
} from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { LegacyCampaignSequenceCleanupWorkspaceService } from 'src/modules/myah-outreach/services/legacy-campaign-sequence-cleanup.workspace-service';

@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.WORKFLOWS),
)
@CoreResolver(() => CampaignOutreachWorkflowDTO)
export class CampaignOutreachWorkflowResolver {
  constructor(
    private readonly campaignOutreachWorkflowService: CampaignOutreachWorkflowService,
    private readonly campaignSequenceService: CampaignSequenceService,
    private readonly legacyCampaignSequenceCleanupService: LegacyCampaignSequenceCleanupWorkspaceService,
  ) {}

  @Query(() => CampaignOutreachWorkflowDTO, { nullable: true })
  async findCampaignOutreachWorkflow(
    @Args('campaignId', { type: () => UUIDScalarType }) campaignId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignOutreachWorkflowDTO | null> {
    return this.campaignOutreachWorkflowService.find({
      authContext: getWorkspaceAuthContext(),
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
      authContext: getWorkspaceAuthContext(),
      campaignId,
      workspaceId,
    });
  }

  @Query(() => CampaignSequenceLoadResultDTO)
  async campaignSequence(
    @Args('campaignId', { type: () => UUIDScalarType }) campaignId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignSequenceLoadResult> {
    return this.campaignSequenceService.load({
      authContext: getWorkspaceAuthContext(),
      campaignId,
      workspaceId,
    });
  }

  @Mutation(() => CampaignSequenceSnapshotDTO)
  async saveCampaignSequence(
    @Args('input') input: SaveCampaignSequenceInput,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignSequenceSnapshotDTO> {
    return this.campaignSequenceService.save({
      ...input,
      authContext: getWorkspaceAuthContext(),
      workspaceId,
    });
  }

  @Mutation(() => CampaignSequenceSnapshotDTO)
  async publishCampaignSequence(
    @Args('input') input: PublishCampaignSequenceInput,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignSequenceSnapshotDTO> {
    return this.campaignSequenceService.publish({
      ...input,
      authContext: getWorkspaceAuthContext(),
      workspaceId,
    });
  }

  @Mutation(() => CampaignSequenceSnapshotDTO)
  async replaceLegacyCampaignSequence(
    @Args('input', { type: () => ReplaceLegacyCampaignSequenceInput })
    input: ReplaceLegacyCampaignSequenceInput,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignSequenceSnapshotDTO> {
    return this.legacyCampaignSequenceCleanupService.replaceLegacyCampaignSequence(
      {
        authContext: getWorkspaceAuthContext(),
        campaignId: input.campaignId,
        expectedWorkflowId: input.expectedWorkflowId,
        workspaceId,
      },
    );
  }

  @Mutation(() => CampaignSequenceSnapshotDTO)
  async validateCampaignSequence(
    @Args('campaignId', { type: () => UUIDScalarType }) campaignId: string,
    @Args('expectedVersionId', { type: () => UUIDScalarType })
    expectedVersionId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
  ): Promise<CampaignSequenceSnapshotDTO> {
    return this.campaignSequenceService.validate({
      authContext: getWorkspaceAuthContext(),
      campaignId,
      expectedVersionId,
      workspaceId,
    });
  }
}
