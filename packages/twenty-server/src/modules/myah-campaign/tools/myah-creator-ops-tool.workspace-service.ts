import { Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { z } from 'zod';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  addCreatorsToCreatorListInputSchema,
  addDirectCampaignCreatorsInputSchema,
  approveCampaignCreatorListAdditionsInputSchema,
  attachCreatorListsToCampaignInputSchema,
  detachCreatorListFromCampaignInputSchema,
  getCampaignAudienceInputSchema,
  getCampaignCreatorListAdditionCandidatesInputSchema,
  removeCreatorFromCreatorListInputSchema,
} from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.schemas';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

export type MyahCreatorOpsToolContext = {
  authContext: UserWorkspaceAuthContext;
};

@Injectable()
export class MyahCreatorOpsToolWorkspaceService {
  constructor(
    private readonly campaignInfluencerService: CampaignInfluencerService,
  ) {}

  generateMyahCreatorOpsTools(context: MyahCreatorOpsToolContext): ToolSet {
    const { authContext } = context;
    const addCreatorsToCreatorListTool = {
      name: 'add_creators_to_creator_list' as const,
      description: 'Add one or more Creators to a Creator List.',
      inputSchema: addCreatorsToCreatorListInputSchema,
      execute: ({
        creatorListId,
        creatorIds,
      }: z.infer<typeof addCreatorsToCreatorListInputSchema>) =>
        this.campaignInfluencerService.addCreatorListMembersIntent(
          { creatorListId, creatorIds },
          authContext,
        ),
    };
    const removeCreatorFromCreatorListTool = {
      name: 'remove_creator_from_creator_list' as const,
      description:
        'Remove a Creator from a Creator List without deleting the Creator.',
      inputSchema: removeCreatorFromCreatorListInputSchema,
      execute: ({
        creatorListId,
        creatorId,
      }: z.infer<typeof removeCreatorFromCreatorListInputSchema>) =>
        this.campaignInfluencerService.removeCreatorListMemberIntent(
          { creatorListId, creatorId },
          authContext,
        ),
    };
    const getCampaignAudienceTool = {
      name: 'get_campaign_audience' as const,
      description:
        'Read the effective audience and Creator List attachments for a Campaign.',
      inputSchema: getCampaignAudienceInputSchema,
      execute: ({
        campaignId,
      }: z.infer<typeof getCampaignAudienceInputSchema>) =>
        this.campaignInfluencerService.snapshot(campaignId, authContext),
    };
    const addDirectCampaignCreatorsTool = {
      name: 'add_direct_campaign_creators' as const,
      description: 'Add one or more Creators directly to a Campaign audience.',
      inputSchema: addDirectCampaignCreatorsInputSchema,
      execute: (input: z.infer<typeof addDirectCampaignCreatorsInputSchema>) =>
        this.campaignInfluencerService.addDirectCampaignCreators(
          input,
          authContext,
        ),
    };
    const attachCreatorListsToCampaignTool = {
      name: 'attach_creator_lists_to_campaign' as const,
      description: 'Attach one or more Creator Lists to a Campaign audience.',
      inputSchema: attachCreatorListsToCampaignInputSchema,
      execute: (
        input: z.infer<typeof attachCreatorListsToCampaignInputSchema>,
      ) =>
        this.campaignInfluencerService.attachCampaignCreatorLists(
          input,
          authContext,
        ),
    };
    const detachCreatorListFromCampaignTool = {
      name: 'detach_creator_list_from_campaign' as const,
      description:
        'Detach a Creator List from a Campaign while retaining audience provenance.',
      inputSchema: detachCreatorListFromCampaignInputSchema,
      execute: (
        input: z.infer<typeof detachCreatorListFromCampaignInputSchema>,
      ) =>
        this.campaignInfluencerService.detachCampaignCreatorList(
          input,
          authContext,
        ),
    };
    const getCampaignCreatorListAdditionCandidatesTool = {
      name: 'get_campaign_creator_list_addition_candidates' as const,
      description:
        'Read Creator List members eligible to be added to a Campaign audience.',
      inputSchema: getCampaignCreatorListAdditionCandidatesInputSchema,
      execute: (
        input: z.infer<
          typeof getCampaignCreatorListAdditionCandidatesInputSchema
        >,
      ) =>
        this.campaignInfluencerService.campaignCreatorListAdditionCandidates(
          input,
          authContext,
        ),
    };
    const approveCampaignCreatorListAdditionsTool = {
      name: 'approve_campaign_creator_list_additions' as const,
      description:
        'Add requested eligible Creator List members to a Campaign audience.',
      inputSchema: approveCampaignCreatorListAdditionsInputSchema,
      execute: (
        input: z.infer<typeof approveCampaignCreatorListAdditionsInputSchema>,
      ) =>
        this.campaignInfluencerService.approveCampaignCreatorListAdditions(
          input,
          authContext,
        ),
    };

    return {
      [addCreatorsToCreatorListTool.name]: addCreatorsToCreatorListTool,
      [removeCreatorFromCreatorListTool.name]: removeCreatorFromCreatorListTool,
      [getCampaignAudienceTool.name]: getCampaignAudienceTool,
      [addDirectCampaignCreatorsTool.name]: addDirectCampaignCreatorsTool,
      [attachCreatorListsToCampaignTool.name]: attachCreatorListsToCampaignTool,
      [detachCreatorListFromCampaignTool.name]:
        detachCreatorListFromCampaignTool,
      [getCampaignCreatorListAdditionCandidatesTool.name]:
        getCampaignCreatorListAdditionCandidatesTool,
      [approveCampaignCreatorListAdditionsTool.name]:
        approveCampaignCreatorListAdditionsTool,
    };
  }
}
