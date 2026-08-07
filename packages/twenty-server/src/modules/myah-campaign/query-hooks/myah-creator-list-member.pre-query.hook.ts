import { Injectable } from '@nestjs/common';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

type MembershipMutationPayload = { input?: { creatorListId?: string; creatorId?: string }; filter?: { creatorListId?: { eq?: string }; creatorId?: { eq?: string } } };

@Injectable()
@WorkspaceQueryHook('creatorListMember.createOne')
export class MyahCreatorListMemberCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipMutationPayload) {
    await this.service.assertGenericMembershipMutationAllowed(payload.input?.creatorListId, authContext);
    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('creatorListMember.createMany')
export class MyahCreatorListMemberCreateManyPreQueryHook extends MyahCreatorListMemberCreateOnePreQueryHook {}

@Injectable()
@WorkspaceQueryHook('creatorListMember.deleteOne')
export class MyahCreatorListMemberDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipMutationPayload) {
    await this.service.assertGenericMembershipMutationAllowed(payload.filter?.creatorListId?.eq, authContext);
    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('creatorListMember.deleteMany')
export class MyahCreatorListMemberDeleteManyPreQueryHook extends MyahCreatorListMemberDeleteOnePreQueryHook {}
