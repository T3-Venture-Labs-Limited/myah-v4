import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
  type DeleteManyResolverArgs,
  type DeleteOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

type MembershipData = { creatorListId?: string };

type DeleteFilter = {
  creatorListId?: { eq?: string };
  id?: { eq?: string; in?: string[] };
};

@WorkspaceQueryHook('creatorListMember.createOne')
export class MyahCreatorListMemberCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs<MembershipData>,
  ) {
    await this.service.assertGenericMembershipMutationAllowed(
      payload.data.creatorListId,
      authContext,
    );
    return payload;
  }
}

@WorkspaceQueryHook('creatorListMember.createMany')
export class MyahCreatorListMemberCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs<MembershipData>,
  ) {
    await this.service.assertGenericMembershipMutationAllowedForListIds(
      payload.data.map(({ creatorListId }) => creatorListId),
      authContext,
    );
    return payload;
  }
}

@WorkspaceQueryHook('creatorListMember.deleteOne')
export class MyahCreatorListMemberDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteOneResolverArgs,
  ) {
    await this.service.assertGenericMembershipMutationAllowedForMemberIds(
      [payload.id],
      authContext,
    );
    return payload;
  }
}

@WorkspaceQueryHook('creatorListMember.deleteMany')
export class MyahCreatorListMemberDeleteManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly service: CampaignInfluencerService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteManyResolverArgs<DeleteFilter>,
  ) {
    await this.service.assertGenericMembershipMutationAllowedForDeleteFilter(
      payload.filter,
      authContext,
    );
    return payload;
  }
}
