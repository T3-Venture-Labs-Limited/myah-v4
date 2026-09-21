import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignTimelineVisibilityService } from 'src/modules/timeline/services/campaign-timeline-visibility.service';
import { type TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

const authContext = {
  workspace: { id: '11111111-1111-4111-8111-111111111111' },
} as WorkspaceAuthContext;

const messageVisibility = {
  applyMessagesVisibility: jest.fn(async (messages) => messages),
};

describe('CampaignTimelineVisibilityService', () => {
  it('applies target-specific visibility and keeps a readable Creator projection across Campaigns', async () => {
    const find = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'campaign-readable' }])
      .mockResolvedValueOnce([{ id: 'creator-readable' }]);
    const orm = {
      executeInWorkspaceContext: jest.fn(async (operation) => operation()),
      getRepository: jest.fn().mockResolvedValue({ find }),
    } as unknown as GlobalWorkspaceOrmManager;
    const activities = [
      { id: '1', targetCampaignId: 'campaign-readable' },
      { id: '2', targetCampaignId: 'campaign-hidden' },
      {
        id: '3',
        targetCreatorId: 'creator-readable',
        properties: {
          campaignEvent: { campaignId: 'campaign-hidden-but-attributed' },
        },
      },
      { id: '4', targetCreatorId: 'creator-hidden' },
      { id: '5', targetCampaignId: null, targetCreatorId: null },
    ] as unknown as TimelineActivityWorkspaceEntity[];

    await new CampaignTimelineVisibilityService(
      orm,
      messageVisibility as never,
    ).filter(activities, authContext);

    expect(activities.map(({ id }) => id)).toEqual(['1', '3', '5']);
  });

  it('fails closed when target permission lookup is rejected', async () => {
    const orm = {
      executeInWorkspaceContext: jest.fn().mockRejectedValue(new Error('no')),
    } as unknown as GlobalWorkspaceOrmManager;
    const activities = [
      { id: '1', targetCampaignId: 'campaign-hidden' },
    ] as TimelineActivityWorkspaceEntity[];

    await new CampaignTimelineVisibilityService(
      orm,
      messageVisibility as never,
    ).filter(activities, authContext);

    expect(activities).toEqual([]);
  });

  it('removes mailbox-linked evidence when the exact Message is no longer readable', async () => {
    const findCampaigns = jest.fn().mockResolvedValue([{ id: 'campaign' }]);
    const findMessages = jest
      .fn()
      .mockResolvedValue([{ id: 'message-hidden' }]);
    const orm = {
      executeInWorkspaceContext: jest.fn(async (operation) => operation()),
      getRepository: jest.fn(async (_workspaceId, objectName) => ({
        find: objectName === 'message' ? findMessages : findCampaigns,
      })),
    } as unknown as GlobalWorkspaceOrmManager;
    const visibility = {
      applyMessagesVisibility: jest.fn(async (messages: unknown[]) => {
        messages.splice(0, messages.length);
        return messages;
      }),
    };
    const activities = [
      {
        id: '1',
        targetCampaignId: 'campaign',
        properties: { campaignEvent: { messageId: 'message-hidden' } },
      },
    ] as unknown as TimelineActivityWorkspaceEntity[];

    await new CampaignTimelineVisibilityService(
      orm,
      visibility as never,
    ).filter(activities, authContext);

    expect(activities).toEqual([]);
  });
});
