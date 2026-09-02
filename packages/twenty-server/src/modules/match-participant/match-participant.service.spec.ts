import { Test, type TestingModule } from '@nestjs/testing';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { MatchParticipantService } from 'src/modules/match-participant/match-participant.service';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';

const workspaceId = 'workspace-id';
const participantId = 'participant-id';
const workspaceMemberId = 'workspace-member-id';
const personId = 'person-id';
const email = 'creator@example.com';

type MatchWith = Parameters<
  MatchParticipantService<MessageParticipantWorkspaceEntity>['matchParticipants']
>[0]['matchWith'];

describe('MatchParticipantService', () => {
  let service: MatchParticipantService<MessageParticipantWorkspaceEntity>;
  let getRepository: jest.Mock;
  let hasMetadata: jest.Mock;
  let participantRepository: { updateMany: jest.Mock };
  let workspaceMemberRepository: { find: jest.Mock };
  let personRepository: { createQueryBuilder: jest.Mock };

  const queryBuilder = {
    getMany: jest.fn(),
    orderBy: jest.fn(),
    orWhere: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
    withDeleted: jest.fn(),
  };

  const match = async (matchWith: MatchWith) => {
    await service.matchParticipants({
      matchWith,
      objectMetadataName: 'messageParticipant',
      participants: [
        {
          handle: email,
          id: participantId,
          messageId: 'message-id',
          personId: null,
          workspaceMemberId: null,
        } as MessageParticipantWorkspaceEntity,
      ],
      workspaceId,
    });
  };

  beforeEach(async () => {
    for (const method of [
      queryBuilder.orderBy,
      queryBuilder.orWhere,
      queryBuilder.select,
      queryBuilder.where,
      queryBuilder.withDeleted,
    ]) {
      method.mockReturnValue(queryBuilder);
    }
    queryBuilder.getMany.mockResolvedValue([
      {
        emails: {
          additionalEmails: [],
          primaryEmail: email,
        },
        id: personId,
      },
    ]);

    participantRepository = {
      updateMany: jest.fn().mockResolvedValue(undefined),
    };
    workspaceMemberRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: workspaceMemberId, userEmail: email }]),
    };
    personRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    hasMetadata = jest.fn().mockReturnValue(true);
    getRepository = jest.fn().mockImplementation((_workspaceId, name) => {
      if (name === 'messageParticipant') return participantRepository;
      if (name === 'workspaceMember') return workspaceMemberRepository;
      if (name === 'person') return personRepository;
      throw new Error(`Unexpected repository ${String(name)}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchParticipantService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
              hasMetadata,
            }),
            getRepository,
          },
        },
        {
          provide: WorkspaceEventEmitter,
          useValue: { emitCustomBatchEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(MatchParticipantService);
  });

  it('falls back to workspace member matching when combined mode has no Person metadata', async () => {
    hasMetadata.mockImplementation((name) => name !== 'person');

    await match('workspaceMemberAndPerson');

    expect(getRepository).not.toHaveBeenCalledWith(
      workspaceId,
      'person',
      expect.anything(),
    );
    expect(participantRepository.updateMany).toHaveBeenCalledWith([
      {
        criteria: participantId,
        partialEntity: { workspaceMemberId },
      },
    ]);
  });

  it('does not resolve Person in workspace-member-only mode', async () => {
    await match('workspaceMemberOnly');

    expect(getRepository).not.toHaveBeenCalledWith(
      workspaceId,
      'person',
      expect.anything(),
    );
    expect(personRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('matches both relations when combined mode has Person metadata', async () => {
    await match('workspaceMemberAndPerson');

    expect(participantRepository.updateMany).toHaveBeenCalledWith([
      {
        criteria: participantId,
        partialEntity: { personId, workspaceMemberId },
      },
    ]);
  });

  it('keeps explicit Person-only matching strict', async () => {
    hasMetadata.mockImplementation((name) => name !== 'person');
    getRepository.mockImplementation((_workspaceId, name) => {
      if (name === 'person') throw new Error('No Person metadata');
      if (name === 'messageParticipant') return participantRepository;
      throw new Error(`Unexpected repository ${String(name)}`);
    });

    await expect(match('personOnly')).rejects.toThrow('No Person metadata');
  });
});
