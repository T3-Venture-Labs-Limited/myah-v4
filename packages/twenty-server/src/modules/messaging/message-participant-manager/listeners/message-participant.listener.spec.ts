import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { MessageParticipantListener } from 'src/modules/messaging/message-participant-manager/listeners/message-participant.listener';

describe('MessageParticipantListener', () => {
  it('does not resolve Person timeline metadata when no participant has a Person ID', async () => {
    const findOneOrFail = jest.fn();
    const upsertTimelineActivities = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageParticipantListener,
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

    const listener = module.get(MessageParticipantListener);

    await listener.handleMessageParticipantMatched({
      events: [
        {
          participants: [
            {
              id: 'participant-id',
              messageId: 'message-id',
              personId: null,
              workspaceMemberId: 'workspace-member-id',
            } as MessageParticipantWorkspaceEntity,
          ],
          workspaceMemberId: 'workspace-member-id',
        },
      ],
      name: 'messageParticipant_matched',
      workspaceId: 'workspace-id',
    });

    expect(findOneOrFail).not.toHaveBeenCalled();
    expect(upsertTimelineActivities).not.toHaveBeenCalled();
  });
});
