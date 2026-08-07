import { Injectable } from '@nestjs/common';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

type MembershipRecord = { id?: string; creatorListId: string; creatorId: string };

abstract class MembershipHook implements WorkspacePostQueryHookInstance {
  constructor(protected readonly influencerService: CampaignInfluencerService) {}
  protected async propagate(authContext: WorkspaceAuthContext, payload: MembershipRecord[], removed = false) {
    for (const membership of payload) {
      await this.influencerService.syncCreatorListMembership(
        removed ? { ...membership, removed: true } : membership,
        authContext,
      );
    }
  }
}

@Injectable()
@WorkspaceQueryHook({ key: 'creatorListMember.createOne', type: WorkspaceQueryHookType.POST_HOOK })
export class MyahCreatorListMemberCreatePostQueryHook extends MembershipHook {
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipRecord[]) { await this.propagate(authContext, payload); }
}

@Injectable()
@WorkspaceQueryHook({ key: 'creatorListMember.createMany', type: WorkspaceQueryHookType.POST_HOOK })
export class MyahCreatorListMemberCreateManyPostQueryHook extends MembershipHook {
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipRecord[]) { await this.propagate(authContext, payload); }
}

@Injectable()
@WorkspaceQueryHook({ key: 'creatorListMember.deleteOne', type: WorkspaceQueryHookType.POST_HOOK })
export class MyahCreatorListMemberDeletePostQueryHook extends MembershipHook {
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipRecord[]) { await this.propagate(authContext, payload, true); }
}

@Injectable()
@WorkspaceQueryHook({ key: 'creatorListMember.deleteMany', type: WorkspaceQueryHookType.POST_HOOK })
export class MyahCreatorListMemberDeleteManyPostQueryHook extends MembershipHook {
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipRecord[]) { await this.propagate(authContext, payload, true); }
}
