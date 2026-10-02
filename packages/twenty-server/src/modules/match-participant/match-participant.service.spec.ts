import { Test, type TestingModule } from '@nestjs/testing';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { MatchParticipantService } from 'src/modules/match-participant/match-participant.service';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { CalendarEventParticipantWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';

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
  let timelineRepository: { find: jest.Mock; insert: jest.Mock };
  let sourceRepository: { createQueryBuilder: jest.Mock };
  let transactionManager: {
    queryRunner: { isTransactionActive: boolean };
    internalContext: {
      workspaceId: string;
      objectIdByNameSingular: Record<string, string>;
    };
  };
  let workspaceEventEmitter: { emitCustomBatchEvent: jest.Mock };

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

    transactionManager = {
      queryRunner: { isTransactionActive: true },
      internalContext: {
        workspaceId,
        objectIdByNameSingular: {
          message: 'message-metadata-id',
          calendarEvent: 'calendar-metadata-id',
        },
      },
    };
    participantRepository = {
      updateMany: jest.fn().mockResolvedValue(undefined),
    };
    timelineRepository = {
      find: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const sourceBuilder = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'message-id' }),
    };
    sourceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(sourceBuilder),
    };
    workspaceEventEmitter = { emitCustomBatchEvent: jest.fn() };
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
      if (name === 'timelineActivity') return timelineRepository;
      if (name === 'message' || name === 'calendarEvent')
        return sourceRepository;
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
              transaction: jest
                .fn()
                .mockImplementation(async (fn) => fn(transactionManager)),
            }),
            getRepository,
          },
        },
        {
          provide: WorkspaceEventEmitter,
          useValue: workspaceEventEmitter,
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
    expect(participantRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: participantId,
          partialEntity: { workspaceMemberId },
        },
      ],
      transactionManager,
    );
  });

  it('keeps matched participant updates in the caller transaction', async () => {
    await service.matchParticipants({
      matchWith: 'workspaceMemberAndPerson',
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
      transactionManager: transactionManager as never,
    });
    expect(participantRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: participantId,
          partialEntity: { personId, workspaceMemberId },
        },
      ],
      transactionManager,
    );
  });

  it('does not publish a matched event before a caller-owned transaction commits', async () => {
    await service.matchParticipants({
      matchWith: 'workspaceMemberAndPerson',
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
      transactionManager: transactionManager as never,
    });

    expect(workspaceEventEmitter.emitCustomBatchEvent).not.toHaveBeenCalled();
    expect(timelineRepository.insert).toHaveBeenCalledTimes(1);
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

    expect(participantRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: participantId,
          partialEntity: { personId, workspaceMemberId },
        },
      ],
      transactionManager,
    );
  });

  it('preserves a historical linked row, including a soft-deleted one, rather than inserting a duplicate', async () => {
    timelineRepository.find.mockResolvedValue([
      { id: 'legacy-random-id', deletedAt: new Date() },
    ]);

    await match('personOnly');

    expect(timelineRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        withDeleted: true,
        where: {
          name: 'message.linked',
          targetPersonId: personId,
          linkedRecordId: 'message-id',
          linkedObjectMetadataId: 'message-metadata-id',
        },
      }),
      transactionManager,
    );
    expect(timelineRepository.insert).not.toHaveBeenCalled();
    expect(participantRepository.updateMany).toHaveBeenCalledTimes(1);
  });

  it('deduplicates participant roles for one Person and Message, and does not re-project an unchanged link', async () => {
    const participant = (id: string, currentPersonId: string | null) =>
      ({
        handle: email,
        id,
        messageId: 'message-id',
        personId: currentPersonId,
        workspaceMemberId: workspaceMemberId,
      }) as MessageParticipantWorkspaceEntity;

    await service.matchParticipants({
      matchWith: 'personOnly',
      objectMetadataName: 'messageParticipant',
      participants: [participant('role-1', null), participant('role-2', null)],
      workspaceId,
      transactionManager: transactionManager as never,
    });
    expect(timelineRepository.insert).toHaveBeenCalledTimes(1);
    const stableId = timelineRepository.insert.mock.calls[0][0].id;

    timelineRepository.insert.mockClear();
    await service.matchParticipants({
      matchWith: 'personOnly',
      objectMetadataName: 'messageParticipant',
      participants: [participant('role-1', personId)],
      workspaceId,
      transactionManager: transactionManager as never,
    });
    expect(timelineRepository.insert).not.toHaveBeenCalled();
    expect(stableId).toMatch(/^[0-9a-f-]{36}$/);
    expect(workspaceEventEmitter.emitCustomBatchEvent).not.toHaveBeenCalled();
  });

  it('projects Calendar links through the same caller-owned transaction', async () => {
    getRepository.mockImplementation((_workspaceId, name) => {
      if (name === 'calendarEventParticipant') return participantRepository;
      if (name === 'calendarEvent') return sourceRepository;
      if (name === 'workspaceMember') return workspaceMemberRepository;
      if (name === 'person') return personRepository;
      if (name === 'timelineActivity') return timelineRepository;
      throw new Error(`Unexpected repository ${String(name)}`);
    });
    await (
      service as unknown as MatchParticipantService<CalendarEventParticipantWorkspaceEntity>
    ).matchParticipants({
      matchWith: 'personOnly',
      objectMetadataName: 'calendarEventParticipant',
      participants: [
        {
          id: participantId,
          handle: email,
          calendarEventId: 'calendar-id',
          personId: null,
          workspaceMemberId: null,
        } as CalendarEventParticipantWorkspaceEntity,
      ],
      workspaceId,
      transactionManager: transactionManager as never,
    });
    expect(timelineRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'calendarEvent.linked',
        targetPersonId: personId,
        linkedRecordId: 'calendar-id',
        linkedObjectMetadataId: 'calendar-metadata-id',
      }),
      transactionManager,
    );
  });

  it('fails closed before updating participants when timeline projection fails', async () => {
    timelineRepository.insert.mockRejectedValue(new Error('projection failed'));
    await expect(match('personOnly')).rejects.toThrow('projection failed');
    expect(participantRepository.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a manager from another workspace before any write', async () => {
    transactionManager.internalContext.workspaceId = 'another-workspace';
    await expect(match('personOnly')).rejects.toThrow(
      'active workspace transaction',
    );
    expect(participantRepository.updateMany).not.toHaveBeenCalled();
    expect(timelineRepository.insert).not.toHaveBeenCalled();
  });

  it('does not project a Person link when there is no matching Person', async () => {
    queryBuilder.getMany.mockResolvedValue([]);
    await match('workspaceMemberAndPerson');
    expect(timelineRepository.insert).not.toHaveBeenCalled();
    expect(participantRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: participantId,
          partialEntity: { personId: null, workspaceMemberId },
        },
      ],
      transactionManager,
    );
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
