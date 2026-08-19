import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import {
  AddDirectCampaignCreatorsInput,
  ApproveCampaignCreatorListAdditionsInput,
  AttachCampaignCreatorListsInput,
  CampaignCreatorListAdditionCandidatesDTO,
  CampaignCreatorListAdditionCandidatesInput,
  CampaignCreatorListRemovalImpactDTO,
  CampaignCreatorListRemovalImpactInput,
  CampaignInfluencerCampaignInput,
  CampaignInfluencerSnapshotDTO,
  CreatorListMemberDTO,
  CreatorListMembersIntentInput,
  CreatorListMembershipIntentInput,
  CreatorListMembershipRemovalImpactDTO,
  DetachCampaignCreatorListInput,
  RemoveCreatorListMemberIntentInput,
} from 'src/modules/myah-campaign/dtos/campaign-influencer.dto';
@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
export class CampaignInfluencerResolver {
  constructor(private readonly service: CampaignInfluencerService) {}

  @Query(() => CampaignInfluencerSnapshotDTO)
  async campaignInfluencerSnapshot(
    @Args('input') input: CampaignInfluencerCampaignInput,
  ): Promise<CampaignInfluencerSnapshotDTO> {
    return this.service.snapshot(input.campaignId, getWorkspaceAuthContext());
  }

  @Mutation(() => CampaignInfluencerSnapshotDTO)
  async attachCampaignCreatorLists(
    @Args('input') input: AttachCampaignCreatorListsInput,
  ): Promise<CampaignInfluencerSnapshotDTO> {
    return this.service.attachCampaignCreatorLists(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => CampaignInfluencerSnapshotDTO)
  async addDirectCampaignCreators(
    @Args('input') input: AddDirectCampaignCreatorsInput,
  ): Promise<CampaignInfluencerSnapshotDTO> {
    return this.service.addDirectCampaignCreators(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Query(() => CampaignCreatorListRemovalImpactDTO)
  async campaignCreatorListRemovalImpact(
    @Args('input') input: CampaignCreatorListRemovalImpactInput,
  ): Promise<CampaignCreatorListRemovalImpactDTO> {
    return this.service.campaignCreatorListRemovalImpact(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Query(() => CampaignCreatorListAdditionCandidatesDTO)
  async campaignCreatorListAdditionCandidates(
    @Args('input') input: CampaignCreatorListAdditionCandidatesInput,
  ): Promise<CampaignCreatorListAdditionCandidatesDTO> {
    return this.service.campaignCreatorListAdditionCandidates(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => Boolean)
  async approveCampaignCreatorListAdditions(
    @Args('input') input: ApproveCampaignCreatorListAdditionsInput,
  ) {
    await this.service.approveCampaignCreatorListAdditions(
      input,
      getWorkspaceAuthContext(),
    );
    return true;
  }

  @Mutation(() => CampaignInfluencerSnapshotDTO)
  async detachCampaignCreatorList(
    @Args('input') input: DetachCampaignCreatorListInput,
  ): Promise<CampaignInfluencerSnapshotDTO> {
    return this.service.detachCampaignCreatorList(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Query(() => CreatorListMembershipRemovalImpactDTO)
  async creatorListMembershipRemovalImpact(
    @Args('input') input: CreatorListMembershipIntentInput,
  ): Promise<CreatorListMembershipRemovalImpactDTO> {
    return this.service.creatorListMembershipRemovalImpact(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => CreatorListMemberDTO)
  async addCreatorListMemberIntent(
    @Args('input') input: CreatorListMembershipIntentInput,
  ) {
    return this.service.addCreatorListMemberIntent(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => [CreatorListMemberDTO])
  async addCreatorListMembersIntent(
    @Args('input') input: CreatorListMembersIntentInput,
  ) {
    return this.service.addCreatorListMembersIntent(
      input,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => Boolean)
  async removeCreatorListMemberIntent(
    @Args('input') input: RemoveCreatorListMemberIntentInput,
  ) {
    return this.service.removeCreatorListMemberIntent(
      input,
      getWorkspaceAuthContext(),
    );
  }
}
