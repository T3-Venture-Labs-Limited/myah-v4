import { Injectable } from '@nestjs/common';

import chunk from 'lodash.chunk';
import { isDefined } from 'twenty-shared/utils';
import { Any, In } from 'typeorm';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { type CalendarEventParticipantWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';
import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';
import { findPersonByPrimaryOrAdditionalEmail } from 'src/modules/match-participant/utils/find-person-by-primary-or-additional-email';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { projectParticipantLinkedTimelineActivities } from 'src/modules/timeline/repositories/timeline-activity.repository';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

type ObjectMetadataName = 'messageParticipant' | 'calendarEventParticipant';

type MatchParticipantsForWorkspaceMembersArgs = {
  participantMatching: {
    workspaceMemberIds: string[];
  };
  objectMetadataName: ObjectMetadataName;
  workspaceId: string;
};

type MatchParticipantsForPeopleArgs = {
  participantMatching: {
    personIds: string[];
    personEmails: string[];
  };
  objectMetadataName: ObjectMetadataName;
  workspaceId: string;
};

type MatchParticipantsArgs<
  ParticipantWorkspaceEntity extends
    | Pick<
        CalendarEventParticipantWorkspaceEntity,
        'id' | 'handle' | 'workspaceMemberId' | 'personId' | 'calendarEventId'
      >
    | Pick<
        MessageParticipantWorkspaceEntity,
        'id' | 'handle' | 'workspaceMemberId' | 'personId' | 'messageId'
      >,
> = {
  participants: ParticipantWorkspaceEntity[];
  objectMetadataName: ObjectMetadataName;
  transactionManager?: WorkspaceEntityManager;
  matchWith: 'workspaceMemberOnly' | 'personOnly' | 'workspaceMemberAndPerson';
  workspaceId: string;
};

@Injectable()
export class MatchParticipantService<
  ParticipantWorkspaceEntity extends
    | CalendarEventParticipantWorkspaceEntity
    | MessageParticipantWorkspaceEntity,
> {
  constructor(
    _workspaceEventEmitter: WorkspaceEventEmitter,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  private async getParticipantRepository(
    workspaceId: string,
    objectMetadataName: 'messageParticipant' | 'calendarEventParticipant',
  ) {
    if (objectMetadataName === 'messageParticipant') {
      return await this.globalWorkspaceOrmManager.getRepository<MessageParticipantWorkspaceEntity>(
        workspaceId,
        objectMetadataName,
      );
    }

    return await this.globalWorkspaceOrmManager.getRepository<CalendarEventParticipantWorkspaceEntity>(
      workspaceId,
      objectMetadataName,
    );
  }

  public async matchParticipants({
    participants,
    objectMetadataName,
    transactionManager,
    matchWith = 'workspaceMemberAndPerson',
    workspaceId,
  }: MatchParticipantsArgs<ParticipantWorkspaceEntity>) {
    if (participants.length === 0) {
      return;
    }

    const globalWorkspaceDataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

    if (!transactionManager) {
      await globalWorkspaceDataSource.transaction(async (manager) => {
        await this.matchParticipants({
          participants,
          objectMetadataName,
          transactionManager: manager as WorkspaceEntityManager,
          matchWith,
          workspaceId,
        });
      });
      return;
    }

    if (
      !transactionManager.queryRunner?.isTransactionActive ||
      transactionManager.internalContext.workspaceId !== workspaceId
    ) {
      throw new Error(
        'Participant matching requires an active workspace transaction',
      );
    }

    const shouldMatchWithWorkspaceMember =
      matchWith === 'workspaceMemberAndPerson' ||
      matchWith === 'workspaceMemberOnly';
    const shouldMatchWithPerson =
      matchWith === 'personOnly' ||
      (matchWith === 'workspaceMemberAndPerson' &&
        globalWorkspaceDataSource.hasMetadata('person'));

    const personRepository = shouldMatchWithPerson
      ? await this.globalWorkspaceOrmManager.getRepository<PersonWorkspaceEntity>(
          workspaceId,
          'person',
          { shouldBypassPermissionChecks: true },
        )
      : undefined;

    const participantRepository = await this.getParticipantRepository(
      workspaceId,
      objectMetadataName,
    );

    const workspaceMemberRepository = shouldMatchWithWorkspaceMember
      ? await this.globalWorkspaceOrmManager.getRepository<WorkspaceMemberWorkspaceEntity>(
          workspaceId,
          'workspaceMember',
          { shouldBypassPermissionChecks: true },
        )
      : undefined;

    const chunkSize = 200;
    const sourceId = (participant: ParticipantWorkspaceEntity) =>
      objectMetadataName === 'messageParticipant'
        ? (participant as MessageParticipantWorkspaceEntity).messageId
        : (participant as CalendarEventParticipantWorkspaceEntity)
            .calendarEventId;
    // Keep the parent-row lock order stable even when links span chunks.
    const chunkedParticipants = chunk(
      [...participants].sort((left, right) =>
        sourceId(left).localeCompare(sourceId(right)),
      ),
      chunkSize,
    );

    for (const participants of chunkedParticipants) {
      const uniqueParticipantsHandles = [
        ...new Set(participants.map((participant) => participant.handle)),
      ].filter(isDefined);

      const people = isDefined(personRepository)
        ? await addPersonEmailFiltersToQueryBuilder({
            queryBuilder: personRepository.createQueryBuilder(
              'person',
              transactionManager.queryRunner,
            ),
            emails: uniqueParticipantsHandles,
          })
            .orderBy('person.createdAt', 'ASC')
            .getMany()
        : [];

      const workspaceMembers = isDefined(workspaceMemberRepository)
        ? await workspaceMemberRepository.find(
            {
              where: {
                userEmail: Any(uniqueParticipantsHandles),
              },
            },
            transactionManager,
          )
        : [];

      const partipantsToBeUpdated = participants
        .map((participant) => ({
          ...participant,
          handle: participant.handle ?? '',
        }))
        .map((participant) => {
          const person = findPersonByPrimaryOrAdditionalEmail({
            people,
            email: participant.handle,
          });

          const workspaceMember = workspaceMembers.find(
            (workspaceMember) =>
              workspaceMember.userEmail === participant.handle,
          );

          const newParticipant = {
            ...participant,
            ...(shouldMatchWithPerson && {
              personId: isDefined(person) ? person.id : null,
            }),
            ...(shouldMatchWithWorkspaceMember && {
              workspaceMemberId: isDefined(workspaceMember)
                ? workspaceMember.id
                : null,
            }),
          };

          const isPersonUnchanged =
            !shouldMatchWithPerson ||
            newParticipant.personId === participant.personId;
          const isWorkspaceMemberUnchanged =
            !shouldMatchWithWorkspaceMember ||
            newParticipant.workspaceMemberId === participant.workspaceMemberId;

          return isPersonUnchanged && isWorkspaceMemberUnchanged
            ? null
            : newParticipant;
        })
        .filter(isDefined);

      const objectName =
        objectMetadataName === 'messageParticipant'
          ? 'message'
          : 'calendarEvent';
      const links = partipantsToBeUpdated.flatMap((participant) => {
        if (!shouldMatchWithPerson || !participant.personId) {
          return [];
        }

        return [
          {
            personId: participant.personId,
            recordId:
              objectName === 'message'
                ? (participant as MessageParticipantWorkspaceEntity).messageId
                : (participant as CalendarEventParticipantWorkspaceEntity)
                    .calendarEventId,
          },
        ];
      });

      if (links.length > 0) {
        await projectParticipantLinkedTimelineActivities({
          globalWorkspaceOrmManager: this.globalWorkspaceOrmManager,
          transactionManager,
          workspaceId,
          objectName,
          links,
        });
      }

      await participantRepository.updateMany(
        partipantsToBeUpdated.map((participant) => ({
          criteria: participant.id,
          partialEntity: {
            ...(shouldMatchWithPerson && {
              personId: participant.personId,
            }),
            ...(shouldMatchWithWorkspaceMember && {
              workspaceMemberId: participant.workspaceMemberId,
            }),
          },
        })),
        transactionManager,
      );
    }
  }

  public async matchParticipantsForWorkspaceMembers({
    participantMatching,
    objectMetadataName,
    workspaceId,
  }: MatchParticipantsForWorkspaceMembersArgs) {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const participantRepository = await this.getParticipantRepository(
        workspaceId,
        objectMetadataName,
      );

      const participants = await participantRepository.find({
        where: {
          workspaceMemberId: In(participantMatching.workspaceMemberIds),
        },
      });

      const tobeRematchedParticipants = participants.map((participant) => {
        return {
          ...participant,
          workspaceMemberId: null,
        };
      });

      await this.matchParticipants({
        matchWith: 'workspaceMemberOnly',
        participants: tobeRematchedParticipants as ParticipantWorkspaceEntity[],
        objectMetadataName,
        workspaceId,
      });
    }, authContext);
  }

  public async matchParticipantsForPeople({
    participantMatching,
    objectMetadataName,
    workspaceId,
  }: MatchParticipantsForPeopleArgs) {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const participantRepository = await this.getParticipantRepository(
        workspaceId,
        objectMetadataName,
      );

      let participantsMatchingPersonEmails: ParticipantWorkspaceEntity[] = [];
      let participantsMatchingPersonId: ParticipantWorkspaceEntity[] = [];

      if (participantMatching.personIds.length > 0) {
        participantsMatchingPersonId = (await participantRepository.find({
          where: {
            personId: In(participantMatching.personIds),
          },
        })) as ParticipantWorkspaceEntity[];
      }

      if (participantMatching.personEmails.length > 0) {
        participantsMatchingPersonEmails = (await participantRepository.find({
          where: {
            handle: In(participantMatching.personEmails),
          },
        })) as ParticipantWorkspaceEntity[];
      }

      const uniqueParticipants = [
        ...new Set([
          ...participantsMatchingPersonId,
          ...participantsMatchingPersonEmails,
        ]),
      ];

      const tobeRematchedParticipants = uniqueParticipants.map(
        (participant) => {
          return {
            ...participant,
            personId: null,
          };
        },
      );

      await this.matchParticipants({
        matchWith: 'personOnly',
        participants: tobeRematchedParticipants,
        objectMetadataName,
        workspaceId,
      });
    }, authContext);
  }
}
