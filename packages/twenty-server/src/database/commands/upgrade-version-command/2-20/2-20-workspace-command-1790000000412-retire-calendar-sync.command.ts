import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import {
  CalendarChannelSyncStage,
  CalendarChannelSyncStatus,
  WebhookSubscriptionStatus,
} from 'twenty-shared/types';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { Brackets, In, type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';

export const RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.calendarChannelEventAssociation.universalIdentifier,
  STANDARD_OBJECTS.calendarEventParticipant.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.universalIdentifier,
  STANDARD_OBJECTS.callRecording.universalIdentifier,
];

@RegisteredWorkspaceCommand('2.20.0', 1790000000412)
@Command({
  name: 'upgrade:2-20:retire-calendar-sync',
  description:
    'Disable calendar synchronization while preserving channels and provider recovery identifiers',
})
export class RetireCalendarSyncCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    options,
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    const query = this.calendarChannelRepository
      .createQueryBuilder('calendarChannel')
      .where('calendarChannel.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        new Brackets((builder) => {
          builder
            .where('calendarChannel.isSyncEnabled = true')
            .orWhere(
              'calendarChannel.webhookSubscriptionStatus = :activeStatus',
              { activeStatus: WebhookSubscriptionStatus.ACTIVE },
            );
        }),
      );
    const count = await query.getCount();
    const activeObjectCount = await this.objectMetadataRepository.countBy({
      isActive: true,
      universalIdentifier: In(RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS),
      workspaceId,
    });

    this.logger.log(
      `${count} active calendar channel(s) and ${activeObjectCount} active calendar/call-recording object(s) found`,
      workspaceId,
    );

    if (options.dryRun) {
      return;
    }

    if (count > 0) {
      const retiredState = {
        isSyncEnabled: false,
        syncStage: CalendarChannelSyncStage.PENDING_CONFIGURATION,
        syncStageStartedAt: null,
        syncStatus: CalendarChannelSyncStatus.NOT_SYNCED,
        webhookSubscriptionExpiresAt: new Date(),
        webhookSubscriptionStatus: WebhookSubscriptionStatus.EXPIRED,
      };

      await this.calendarChannelRepository.update(
        { isSyncEnabled: true, workspaceId },
        retiredState,
      );
      await this.calendarChannelRepository.update(
        {
          webhookSubscriptionStatus: WebhookSubscriptionStatus.ACTIVE,
          workspaceId,
        },
        retiredState,
      );
    }

    if (activeObjectCount > 0) {
      await this.objectMetadataRepository.update(
        {
          universalIdentifier: In(
            RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS,
          ),
          workspaceId,
        },
        {
          isActive: false,
          isUICreatable: false,
          isUIEditable: false,
        },
      );
    }
  }
}
