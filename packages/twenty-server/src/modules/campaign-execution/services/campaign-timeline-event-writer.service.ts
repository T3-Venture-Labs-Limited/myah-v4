import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';

export type CampaignTimelineWriteContext = Readonly<{
  manager: WorkspaceEntityManager;
  workspaceId: string;
  campaignId: string;
  actorPermissionContext?: {
    authContext: WorkspaceAuthContext;
  };
}>;

export type CampaignTimelineEventInput = Readonly<{
  businessEventKey: string;
  eventKind:
    | 'ACTIVATED'
    | 'PAUSED'
    | 'COMPLETED'
    | 'ENROLLED'
    | 'SCHEDULED'
    | 'EXCLUDED'
    | 'HELD'
    | 'HOLD_RECOVERED'
    | 'UNKNOWN'
    | 'UNKNOWN_RECOVERED_ACCEPTED'
    | 'UNKNOWN_RECOVERED_UNACCEPTED'
    | 'DEFINITELY_UNACCEPTED'
    | 'PROVIDER_SUBMITTED'
    | 'MESSAGE_ACCEPTED'
    | 'REPLIED'
    | 'STAGE_CHANGED'
    | 'TERMINAL';
  happenedAt: string;
  sourceId: string;
  sourceType:
    | 'ACTIVATION'
    | 'ENROLLMENT'
    | 'OCCURRENCE'
    | 'CAMPAIGN'
    | 'CAMPAIGN_CREATOR'
    | 'ATTEMPT'
    | 'MESSAGE';
  creatorId?: string;
  reason?: string;
  messageId?: string;
  messageThreadId?: string;
  stageValue?: string;
  stageLabel?: string;
}>;

const deterministicUuid = (key: string): string => {
  const hash = createHash('md5')
    .update(`campaign-event:v1:${key}`)
    .digest('hex');

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
};

export const campaignTimelineBusinessEventId = (businessEventKey: string) =>
  deterministicUuid(`business:${businessEventKey}`);

export const campaignTimelineProjectionId = (
  businessEventId: string,
  target: 'CAMPAIGN' | 'CREATOR',
  targetId: string,
) => deterministicUuid(`projection:${businessEventId}:${target}:${targetId}`);

@Injectable()
export class CampaignTimelineEventWriterService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async writeInTransaction(
    context: CampaignTimelineWriteContext,
    input: CampaignTimelineEventInput,
  ): Promise<void> {
    const repository =
      await this.globalWorkspaceOrmManager.getRepository<TimelineActivityWorkspaceEntity>(
        context.workspaceId,
        'timelineActivity',
        {
          shouldBypassPermissionChecks: true,
        },
      );
    const businessEventId = campaignTimelineBusinessEventId(
      input.businessEventKey,
    );
    const authContext = context.actorPermissionContext?.authContext;
    const workspaceMemberId =
      authContext && 'workspaceMemberId' in authContext
        ? authContext.workspaceMemberId
        : null;
    const properties = {
      campaignEvent: {
        version: 1,
        businessEventId,
        campaignId: context.campaignId,
        eventKind: input.eventKind,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.messageId ? { messageId: input.messageId } : {}),
        ...(input.messageThreadId
          ? { messageThreadId: input.messageThreadId }
          : {}),
        ...(input.stageValue ? { stageValue: input.stageValue } : {}),
        ...(input.stageLabel ? { stageLabel: input.stageLabel } : {}),
      },
    };
    // SAFETY: this plain, recursively JSON-compatible event snapshot contains no class instances.
    const jsonProperties = properties as unknown as JSON;

    await repository.upsert(
      {
        id: campaignTimelineProjectionId(
          businessEventId,
          'CAMPAIGN',
          context.campaignId,
        ),
        name: `campaign.${input.eventKind.toLowerCase()}`,
        happensAt: new Date(input.happenedAt),
        properties: jsonProperties,
        workspaceMemberId,
        targetCampaignId: context.campaignId,
      },
      ['id'],
      context.manager,
    );

    if (input.creatorId) {
      await repository.upsert(
        {
          id: campaignTimelineProjectionId(
            businessEventId,
            'CREATOR',
            input.creatorId,
          ),
          name: `campaign.${input.eventKind.toLowerCase()}`,
          happensAt: new Date(input.happenedAt),
          properties: jsonProperties,
          workspaceMemberId,
          targetCreatorId: input.creatorId,
        },
        ['id'],
        context.manager,
      );
    }
  }
}
