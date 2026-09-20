import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignTimelineVisibilityService } from 'src/modules/timeline/services/campaign-timeline-visibility.service';
import { type TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

@WorkspaceQueryHook({
  key: 'timelineActivity.findMany',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class CampaignTimelineFindManyPostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(private readonly visibility: CampaignTimelineVisibilityService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: TimelineActivityWorkspaceEntity[],
  ): Promise<void> {
    await this.visibility.filter(payload, authContext);
  }
}

@WorkspaceQueryHook({
  key: 'timelineActivity.findOne',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class CampaignTimelineFindOnePostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(private readonly visibility: CampaignTimelineVisibilityService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: TimelineActivityWorkspaceEntity[],
  ): Promise<void> {
    await this.visibility.filter(payload, authContext);
  }
}
