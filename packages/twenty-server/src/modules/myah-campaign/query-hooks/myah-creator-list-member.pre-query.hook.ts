import { Injectable } from '@nestjs/common';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

type MembershipMutationPayload = { data?: { creatorListId?: string; creatorId?: string } | Array<{ creatorListId?: string; creatorId?: string }>; id?: string; filter?: Record<string, unknown> };

@Injectable()
@WorkspaceQueryHook('creatorListMember.createOne')
export class MyahCreatorListMemberCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}
  async execute(authContext: WorkspaceAuthContext, _objectName: string, payload: MembershipMutationPayload) {
    const rows = Array.isArray(payload.data) ? payload.data : [payload.data];
    for (const row of rows) await this.service.assertGenericMembershipMutationAllowed(row?.creatorListId, authContext);
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
  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: MembershipMutationPayload,
  ) {
    const creatorListId = (payload.filter?.creatorListId as { eq?: string } | undefined)?.eq;
    await this.service.assertGenericMembershipMutationAllowed(creatorListId, authContext);
    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('creatorListMember.deleteMany')
export class MyahCreatorListMemberDeleteManyPreQueryHook extends MyahCreatorListMemberDeleteOnePreQueryHook {}
