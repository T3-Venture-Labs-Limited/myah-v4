import { Injectable } from '@nestjs/common';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

type MembershipRecord = {
  creatorListId: string;
  creatorId: string;
};

@Injectable()
@WorkspaceQueryHook({
  key: 'creatorListMember.createOne',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class MyahCreatorListMemberCreatePostQueryHook
  implements WorkspacePostQueryHookInstance
{
  constructor(private readonly influencerService: CampaignInfluencerService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: MembershipRecord[],
  ): Promise<void> {
    for (const membership of payload) {
      await this.influencerService.syncCreatorListMembership(
        membership,
        authContext,
      );
    }
  }
}

@Injectable()
@WorkspaceQueryHook({
  key: 'creatorListMember.deleteOne',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class MyahCreatorListMemberDeletePostQueryHook
  implements WorkspacePostQueryHookInstance
{
  constructor(private readonly influencerService: CampaignInfluencerService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: MembershipRecord[],
  ): Promise<void> {
    for (const membership of payload) {
      await this.influencerService.syncCreatorListMembership(
        { ...membership, removed: true },
        authContext,
      );
    }
  }
}
