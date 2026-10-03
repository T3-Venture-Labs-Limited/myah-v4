import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  MyahReplyAgentDraftLabelDTO,
  MyahReplyAgentDraftLabelInput,
  MyahReplyAgentReviewDTO,
  MyahReplyAgentReviewInput,
  MyahReplyAgentReviewNodeDTO,
  RegenerateMyahReplyAgentDraftInput,
} from 'src/modules/myah-reply-agent/dtos/myah-reply-agent-review.dto';
import { MyahReplyAgentReviewService } from 'src/modules/myah-reply-agent/services/myah-reply-agent-review.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
export class MyahReplyAgentReviewResolver {
  constructor(private readonly service: MyahReplyAgentReviewService) {}

  @Query(() => MyahReplyAgentReviewDTO)
  async myahReplyAgentReview(
    @Args('input') input: MyahReplyAgentReviewInput,
  ): Promise<MyahReplyAgentReviewDTO> {
    return this.service.review(input.campaignId, getWorkspaceAuthContext());
  }

  @Mutation(() => MyahReplyAgentReviewNodeDTO)
  async regenerateMyahReplyAgentDraft(
    @Args('input') input: RegenerateMyahReplyAgentDraftInput,
  ): Promise<MyahReplyAgentReviewNodeDTO> {
    return this.service.regenerate(
      input.campaignCreatorId,
      getWorkspaceAuthContext(),
    );
  }

  @Query(() => MyahReplyAgentDraftLabelDTO, { nullable: true })
  async myahReplyAgentDraftLabel(
    @Args('input') input: MyahReplyAgentDraftLabelInput,
  ): Promise<MyahReplyAgentDraftLabelDTO | null> {
    return this.service.draftLabel(input, getWorkspaceAuthContext());
  }
}
