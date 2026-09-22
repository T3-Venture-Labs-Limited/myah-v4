import {
  CalendarChannelSyncStage,
  CalendarChannelSyncStatus,
  WebhookSubscriptionStatus,
} from 'twenty-shared/types';

import { RetireCalendarSyncCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000412-retire-calendar-sync.command';

const createFixture = (count: number, activeObjectCount = count) => {
  const query = {
    andWhere: jest.fn(),
    execute: jest.fn(),
    getCount: jest.fn().mockResolvedValue(count),
    set: jest.fn(),
    update: jest.fn(),
    where: jest.fn(),
  };

  Object.values(query).forEach((method) =>
    method.mockReturnValue(
      method === query.getCount ? Promise.resolve(count) : query,
    ),
  );

  const calendarChannelRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(query),
    update: jest.fn(),
  };
  const objectMetadataRepository = {
    countBy: jest.fn().mockResolvedValue(activeObjectCount),
    update: jest.fn(),
  };
  const command = new RetireCalendarSyncCommand(
    {} as never,
    calendarChannelRepository as never,
    objectMetadataRepository as never,
  );

  return {
    calendarChannelRepository,
    command,
    objectMetadataRepository,
    query,
  };
};

describe('RetireCalendarSyncCommand', () => {
  it('reports without mutating in dry-run mode', async () => {
    const { calendarChannelRepository, command, objectMetadataRepository } =
      createFixture(2);

    await command.runOnWorkspace({
      options: { dryRun: true },
      workspaceId: 'workspace-id',
    } as never);

    expect(calendarChannelRepository.update).not.toHaveBeenCalled();
    expect(objectMetadataRepository.update).not.toHaveBeenCalled();
  });

  it('disables active calendar work without deleting recovery identifiers', async () => {
    const { calendarChannelRepository, command, objectMetadataRepository } =
      createFixture(1);

    await command.runOnWorkspace({
      options: { dryRun: false },
      workspaceId: 'workspace-id',
    } as never);

    const retiredState = {
      isSyncEnabled: false,
      syncStage: CalendarChannelSyncStage.PENDING_CONFIGURATION,
      syncStageStartedAt: null,
      syncStatus: CalendarChannelSyncStatus.NOT_SYNCED,
      webhookSubscriptionExpiresAt: expect.any(Date),
      webhookSubscriptionStatus: WebhookSubscriptionStatus.EXPIRED,
    };

    expect(calendarChannelRepository.update).toHaveBeenNthCalledWith(
      1,
      { isSyncEnabled: true, workspaceId: 'workspace-id' },
      retiredState,
    );
    expect(calendarChannelRepository.update).toHaveBeenNthCalledWith(
      2,
      {
        webhookSubscriptionStatus: WebhookSubscriptionStatus.ACTIVE,
        workspaceId: 'workspace-id',
      },
      retiredState,
    );
    expect(objectMetadataRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-id' }),
      {
        isActive: false,
        isUICreatable: false,
        isUIEditable: false,
      },
    );
  });

  it('is repeat-safe when no active calendar work remains', async () => {
    const { calendarChannelRepository, command, objectMetadataRepository } =
      createFixture(0, 0);

    await command.runOnWorkspace({
      options: { dryRun: false },
      workspaceId: 'workspace-id',
    } as never);

    expect(calendarChannelRepository.update).not.toHaveBeenCalled();
    expect(objectMetadataRepository.update).not.toHaveBeenCalled();
  });
});
