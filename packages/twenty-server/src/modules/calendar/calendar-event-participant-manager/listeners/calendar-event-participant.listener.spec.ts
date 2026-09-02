import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CalendarEventParticipantListener } from 'src/modules/calendar/calendar-event-participant-manager/listeners/calendar-event-participant.listener';
import { type CalendarEventParticipantWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';

describe('CalendarEventParticipantListener', () => {
  it('does not resolve Person timeline metadata when no participant has a Person ID', async () => {
    const findOneOrFail = jest.fn();
    const upsertTimelineActivities = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarEventParticipantListener,
        {
          provide: 'TimelineActivityRepository',
          useValue: { upsertTimelineActivities },
        },
        {
          provide: getRepositoryToken(ObjectMetadataEntity),
          useValue: { findOneOrFail },
        },
        { provide: FeatureFlagService, useValue: {} },
      ],
    }).compile();

    const listener = module.get(CalendarEventParticipantListener);

    await listener.handleCalendarEventParticipantMatchedEvent({
      events: [
        {
          participants: [
            {
              calendarEventId: 'calendar-event-id',
              id: 'participant-id',
              personId: null,
              workspaceMemberId: 'workspace-member-id',
            } as CalendarEventParticipantWorkspaceEntity,
          ],
          workspaceMemberId: 'workspace-member-id',
        },
      ],
      name: 'calendarEventParticipant_matched',
      workspaceId: 'workspace-id',
    });

    expect(findOneOrFail).not.toHaveBeenCalled();
    expect(upsertTimelineActivities).not.toHaveBeenCalled();
  });
});
