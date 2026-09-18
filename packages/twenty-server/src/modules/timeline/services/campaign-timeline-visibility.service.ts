import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

@Injectable()
export class CampaignTimelineVisibilityService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibility: MessageVisibilityPolicyService,
  ) {}

  async filter(
    activities: TimelineActivityWorkspaceEntity[],
    authContext: WorkspaceAuthContext,
  ): Promise<void> {
    const campaignIds = activities
      .map(({ targetCampaignId }) => targetCampaignId)
      .filter((id): id is string => Boolean(id));
    const creatorIds = activities
      .map(({ targetCreatorId }) => targetCreatorId)
      .filter((id): id is string => Boolean(id));
    if (campaignIds.length === 0 && creatorIds.length === 0) return;

    const readableCampaignIds = await this.readableIds(
      authContext,
      'campaign',
      campaignIds,
    );
    const readableCreatorIds = await this.readableIds(
      authContext,
      'creator',
      creatorIds,
    );
    const readableMessageIds = await this.readableMessageIds(
      activities,
      authContext,
    );

    for (let index = activities.length - 1; index >= 0; index--) {
      const activity = activities[index];
      if (
        (activity.targetCampaignId &&
          !readableCampaignIds.has(activity.targetCampaignId)) ||
        (activity.targetCreatorId &&
          !readableCreatorIds.has(activity.targetCreatorId)) ||
        (this.messageId(activity) !== null &&
          !readableMessageIds.has(this.messageId(activity) as string))
      )
        activities.splice(index, 1);
    }
  }

  private messageId(activity: TimelineActivityWorkspaceEntity): string | null {
    const properties = activity.properties as unknown;
    if (properties === null || typeof properties !== 'object') return null;
    const event = (properties as Record<string, unknown>).campaignEvent;
    if (event === null || typeof event !== 'object') return null;
    const messageId = (event as Record<string, unknown>).messageId;
    return typeof messageId === 'string' ? messageId : null;
  }

  private async readableMessageIds(
    activities: TimelineActivityWorkspaceEntity[],
    authContext: WorkspaceAuthContext,
  ): Promise<Set<string>> {
    const ids = activities
      .map((activity) => this.messageId(activity))
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return new Set();
    try {
      const repository =
        await this.globalWorkspaceOrmManager.getRepository<MessageWorkspaceEntity>(
          authContext.workspace.id,
          'message',
        );
      const messages = await repository.find({
        where: { id: In([...new Set(ids)]) },
      });
      await this.messageVisibility.applyMessagesVisibility(
        messages,
        authContext,
      );
      return new Set(messages.map(({ id }) => id));
    } catch {
      return new Set();
    }
  }

  private async readableIds(
    authContext: WorkspaceAuthContext,
    objectName: 'campaign' | 'creator',
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();

    try {
      return await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const repository =
            await this.globalWorkspaceOrmManager.getRepository<{ id: string }>(
              authContext.workspace.id,
              objectName,
            );
          const records = await repository.find({
            select: { id: true },
            where: { id: In([...new Set(ids)]) },
          });
          return new Set(records.map(({ id }) => id));
        },
        authContext,
      );
    } catch {
      return new Set();
    }
  }
}
