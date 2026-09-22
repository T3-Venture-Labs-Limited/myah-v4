import { Optional, UseGuards, UsePipes } from '@nestjs/common';
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
  CampaignActivityConnectionDTO,
  CampaignActivityInput,
} from 'src/modules/campaign-execution/dtos/campaign-activity.dto';
import {
  CampaignExecutionMutationResultDTO,
  CampaignSendingWindowMutationResultDTO,
  ExcludeCampaignCreatorInput,
  ExcludeCampaignCreatorResultDTO,
  StartCampaignExecutionInput,
  StopCampaignExecutionInput,
  UpdateCampaignSendingWindowInput,
} from 'src/modules/campaign-execution/dtos/campaign-execution.dto';
import { CampaignActivityReaderService } from 'src/modules/campaign-execution/services/campaign-activity-reader.service';
import {
  CampaignMessageOverviewConnectionDTO,
  CampaignMessageOverviewInput,
} from 'src/modules/campaign-execution/dtos/campaign-message-overview.dto';
import { CampaignMessageOverviewReaderService } from 'src/modules/campaign-execution/services/campaign-message-overview-reader.service';
import { CampaignCreatorExclusionService } from 'src/modules/campaign-execution/services/campaign-creator-exclusion.service';
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
    @Optional()
    private readonly creatorExclusion?: CampaignCreatorExclusionService,
    @Optional()
    private readonly activityReader?: CampaignActivityReaderService,
    @Optional()
    private readonly messageOverviewReader?: CampaignMessageOverviewReaderService,
  ) {}

  @Query(() => CampaignActivityConnectionDTO)
  campaignActivity(
    @Args('input') input: CampaignActivityInput,
  ): Promise<CampaignActivityConnectionDTO> {
    if (!this.activityReader)
      throw new Error('Campaign activity is unavailable');
    return this.activityReader.read({
      ...input,
      authContext: getWorkspaceAuthContext(),
    });
  }

  @Query(() => CampaignMessageOverviewConnectionDTO)
  campaignMessageOverview(
    @Args('input') input: CampaignMessageOverviewInput,
  ): Promise<CampaignMessageOverviewConnectionDTO> {
    if (!this.messageOverviewReader)
      throw new Error('Campaign message overview is unavailable');
    return this.messageOverviewReader.read({
      authContext: getWorkspaceAuthContext(),
      filters: input,
    });
  }

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

  @Mutation(() => ExcludeCampaignCreatorResultDTO)
  excludeCampaignCreator(
    @Args('input') input: ExcludeCampaignCreatorInput,
  ): Promise<ExcludeCampaignCreatorResultDTO> {
    const authContext = getWorkspaceAuthContext();
    if (!this.creatorExclusion)
      throw new Error('Campaign Creator exclusion is unavailable');

    return this.creatorExclusion.exclude({
      workspaceId: authContext.workspace.id,
      campaignId: input.campaignId,
      campaignCreatorId: input.campaignCreatorId,
      reason: input.reason,
      authContext,
    });
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
