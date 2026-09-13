import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  CampaignOutreachAudienceExclusionReasonDTO,
  CampaignOutreachAudienceReviewDTO,
  CampaignOutreachAudienceReviewStateDTO,
} from 'src/modules/campaign-execution/dtos/campaign-outreach-audience-review.dto';
import {
  CampaignExecutionMutationResultDTO,
  CampaignSendingWindowMutationResultDTO,
  StartCampaignExecutionInput,
  StopCampaignExecutionInput,
  UpdateCampaignSendingWindowInput,
} from 'src/modules/campaign-execution/dtos/campaign-execution.dto';
import { CampaignExecutionApplicationService } from 'src/modules/campaign-execution/services/campaign-execution-application.service';
import {
  CampaignOutreachAudienceAccessError,
  CampaignOutreachAudienceReviewService,
} from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
export class CampaignExecutionResolver {
  constructor(
    private readonly service: CampaignExecutionApplicationService,
    private readonly audienceReview: CampaignOutreachAudienceReviewService,
  ) {}

  @Query(() => CampaignOutreachAudienceReviewDTO)
  async campaignOutreachAudienceReview(
    @Args('campaignId', { type: () => UUIDScalarType }) campaignId: string,
  ): Promise<CampaignOutreachAudienceReviewDTO> {
    let review;
    try {
      review = await this.audienceReview.preview({
        authContext: getWorkspaceAuthContext(),
        campaignId,
      });
    } catch (error) {
      if (error instanceof CampaignOutreachAudienceAccessError) throw error;
      return {
        state: CampaignOutreachAudienceReviewStateDTO.ERROR,
        campaignId,
        errorCode: 'AUDIENCE_UNAVAILABLE',
        eligibleCount: 0,
        eligibleCreators: [],
        excludedCount: 0,
        excludedCreators: [],
      };
    }

    return {
      state: CampaignOutreachAudienceReviewStateDTO.LOADED,
      campaignId: review.campaignId,
      errorCode: null,
      eligibleCount: review.eligible.length,
      eligibleCreators: review.eligible.map(
        ({ campaignCreatorId, creatorId, creatorName }) => ({
          campaignCreatorId,
          creatorId,
          creatorName,
        }),
      ),
      excludedCount: review.excluded.length,
      excludedCreators: review.excluded.map((creator) => ({
        ...creator,
        reasons: creator.reasons.map(
          (reason) => reason as CampaignOutreachAudienceExclusionReasonDTO,
        ),
      })),
    };
  }

  @Mutation(() => CampaignExecutionMutationResultDTO)
  startCampaignExecution(
    @Args('input') input: StartCampaignExecutionInput,
  ): Promise<CampaignExecutionMutationResultDTO> {
    return this.service.start(
      input.campaignId,
      input.startIdempotencyKey,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => CampaignSendingWindowMutationResultDTO)
  updateCampaignSendingWindow(
    @Args('input') input: UpdateCampaignSendingWindowInput,
  ): Promise<CampaignSendingWindowMutationResultDTO> {
    return this.service.updateSendingWindow(
      input.campaignId,
      {
        timeZone: input.timeZone,
        startLocalTime: input.startLocalTime,
        endLocalTime: input.endLocalTime,
      },
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => CampaignExecutionMutationResultDTO)
  stopCampaignExecution(
    @Args('input') input: StopCampaignExecutionInput,
  ): Promise<CampaignExecutionMutationResultDTO> {
    return this.service.stop(input.campaignId, getWorkspaceAuthContext());
  }
}
