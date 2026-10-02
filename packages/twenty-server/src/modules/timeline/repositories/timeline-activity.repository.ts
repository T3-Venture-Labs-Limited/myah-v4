import { Injectable } from '@nestjs/common';

import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In, MoreThan } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';

import { objectRecordDiffMerge } from 'src/engine/core-modules/event-emitter/utils/object-record-diff-merge';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';
import { type TimelineActivityPayload } from 'src/modules/timeline/types/timeline-activity-payload';
import { buildTimelineActivityRelatedMorphFieldMetadataName } from 'src/modules/timeline/utils/timeline-activity-related-morph-field-metadata-name-builder.util';

type TimelineActivityPayloadWorkspaceIdAndObjectSingularName = {
  payloads: (Omit<TimelineActivityPayload, 'properties'> & {
    properties: Pick<TimelineActivityPayload['properties'], 'diff'>;
  })[];
  workspaceId: string;
  objectSingularName: string;
};

// This identity belongs to the visible Person/source link, not to a participant
// row (several roles can represent the same link). Never change this namespace
// after activities have been written.
const PARTICIPANT_LINK_NAMESPACE = '208c1837-951d-40cb-89a2-243943e3d94c';

export async function projectParticipantLinkedTimelineActivities({
  globalWorkspaceOrmManager,
  transactionManager,
  workspaceId,
  objectName,
  links,
}: {
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager;
  transactionManager: WorkspaceEntityManager;
  workspaceId: string;
  objectName: 'message' | 'calendarEvent';
  links: { personId: string; recordId: string }[];
}): Promise<void> {
  if (
    !transactionManager.queryRunner?.isTransactionActive ||
    transactionManager.internalContext.workspaceId !== workspaceId
  ) {
    throw new Error(
      'Participant timeline projection requires an active workspace transaction',
    );
  }

  const objectMetadataId =
    transactionManager.internalContext.objectIdByNameSingular[objectName];

  if (!objectMetadataId) {
    throw new Error(`Missing ${objectName} metadata for participant timeline`);
  }

  const sourceRepository = await globalWorkspaceOrmManager.getRepository(
    workspaceId,
    objectName,
  );
  const timelineRepository =
    await globalWorkspaceOrmManager.getRepository<TimelineActivityWorkspaceEntity>(
      workspaceId,
      'timelineActivity',
    );
  const name = `${objectName}.linked`;
  const uniqueLinks = [
    ...new Map(
      links.map((link) => [
        JSON.stringify([link.recordId, link.personId]),
        link,
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      a.recordId.localeCompare(b.recordId) ||
      a.personId.localeCompare(b.personId),
  );

  for (const { personId, recordId } of uniqueLinks) {
    // The source row serializes legacy-row adoption and concurrent rematches.
    // Always acquire locks in source-ID order, before the participant update.
    const source = await sourceRepository
      .createQueryBuilder(objectName, transactionManager.queryRunner)
      .where(`${objectName}.id = :recordId`, { recordId })
      .setLock('pessimistic_write')
      .getOne();

    if (!source) {
      throw new Error(`Missing ${objectName} for participant timeline link`);
    }

    // Include deleted rows: a deliberately removed historical activity must
    // not be resurrected, and an old random-ID row must not be duplicated.
    const existing = await timelineRepository.find(
      {
        where: {
          name,
          targetPersonId: personId,
          linkedRecordId: recordId,
          linkedObjectMetadataId: objectMetadataId,
        },
        withDeleted: true,
        take: 1,
      },
      transactionManager,
    );

    if (existing.length > 0) {
      continue;
    }

    await timelineRepository.insert(
      {
        id: uuidv5(
          JSON.stringify([workspaceId, objectName, recordId, personId, name]),
          PARTICIPANT_LINK_NAMESPACE,
        ),
        name,
        properties: {} as JSON,
        targetPersonId: personId,
        workspaceMemberId: null,
        linkedRecordId: recordId,
        linkedObjectMetadataId: objectMetadataId,
        linkedRecordCachedName: '',
      },
      transactionManager,
    );
  }
}

@Injectable()
export class TimelineActivityRepository {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async upsertTimelineActivities({
    objectSingularName,
    workspaceId,
    payloads,
  }: TimelineActivityPayloadWorkspaceIdAndObjectSingularName) {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const recentTimelineActivities = await this.findRecentTimelineActivities({
        objectSingularName,
        workspaceId,
        payloads,
      });

      const payloadsToUpsert = payloads.flatMap(
        ({ name, properties, ...rest }) => {
          const [objectName, action] = name.split('.');
          const { diff } = properties;
          const hasDiff = isDefined(diff) && Object.keys(diff).length > 0;

          if (objectName.startsWith('linked-')) {
            return [{ ...rest, name, properties: hasDiff ? { diff } : {} }];
          }

          if (action === 'updated') {
            return hasDiff ? [{ ...rest, name, properties: { diff } }] : [];
          }

          return [{ ...rest, name, properties: {} }];
        },
      );

      const payloadsToInsert: TimelineActivityPayloadWorkspaceIdAndObjectSingularName['payloads'] =
        [];

      const timelineActivityPropertyName =
        await this.getTimelineActivityPropertyName(objectSingularName);

      for (const payload of payloadsToUpsert) {
        const recentTimelineActivity = recentTimelineActivities.find(
          (timelineActivity) =>
            timelineActivity[timelineActivityPropertyName] ===
              payload.recordId &&
            timelineActivity.workspaceMemberId === payload.workspaceMemberId &&
            (!isDefined(payload.linkedRecordId) ||
              timelineActivity.linkedRecordId === payload.linkedRecordId) &&
            timelineActivity.name === payload.name,
        );

        if (recentTimelineActivity) {
          const mergedProperties = objectRecordDiffMerge(
            recentTimelineActivity.properties,
            payload.properties,
          );

          await this.updateTimelineActivity({
            id: recentTimelineActivity.id,
            properties: mergedProperties,
            workspaceMemberId: payload.workspaceMemberId,
            workspaceId,
          });
        } else {
          payloadsToInsert.push(payload);
        }
      }

      await this.insertTimelineActivities({
        objectSingularName,
        payloads: payloadsToInsert,
        workspaceId,
      });
    }, authContext);
  }

  private async findRecentTimelineActivities({
    objectSingularName,
    workspaceId,
    payloads,
  }: TimelineActivityPayloadWorkspaceIdAndObjectSingularName) {
    const timelineActivityTypeORMRepository =
      await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'timelineActivity',
        {
          shouldBypassPermissionChecks: true,
        },
      );

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const timelineActivityPropertyName =
      await this.getTimelineActivityPropertyName(objectSingularName);

    const whereConditions: Record<string, unknown> = {
      [timelineActivityPropertyName]: In(
        payloads.map((payload) => payload.recordId),
      ),
      name: In(payloads.map((payload) => payload.name)),
      workspaceMemberId: In(
        payloads.map((payload) => payload.workspaceMemberId || null),
      ),
      createdAt: MoreThan(tenMinutesAgo),
    };

    return await timelineActivityTypeORMRepository.find({
      where: whereConditions,
      order: { createdAt: 'DESC' },
      take: 1,
    });
  }

  public async insertTimelineActivities({
    objectSingularName,
    workspaceId,
    payloads,
  }: TimelineActivityPayloadWorkspaceIdAndObjectSingularName) {
    if (payloads.length === 0) {
      return;
    }

    const timelineActivityTypeORMRepository =
      await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'timelineActivity',
        {
          shouldBypassPermissionChecks: true,
        },
      );

    const timelineActivityPropertyName =
      await this.getTimelineActivityPropertyName(objectSingularName);

    return timelineActivityTypeORMRepository.insert(
      payloads.map((payload) => ({
        name: payload.name,
        properties: payload.properties,
        workspaceMemberId: payload.workspaceMemberId,
        [timelineActivityPropertyName]: payload.recordId,
        linkedRecordCachedName: payload.linkedRecordCachedName ?? '',
        linkedRecordId: payload.linkedRecordId,
        linkedObjectMetadataId: payload.linkedObjectMetadataId,
      })),
    );
  }

  private async updateTimelineActivity({
    id,
    properties,
    workspaceMemberId,
    workspaceId,
  }: {
    id: string;
    properties: Partial<ObjectRecord>;
    workspaceMemberId: string | undefined;
    workspaceId: string;
  }) {
    const timelineActivityTypeORMRepository =
      await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'timelineActivity',
        {
          shouldBypassPermissionChecks: true,
        },
      );

    return timelineActivityTypeORMRepository.update(id, {
      properties: properties,
      workspaceMemberId: workspaceMemberId,
    });
  }

  private async getTimelineActivityPropertyName(objectSingularName: string) {
    return `${buildTimelineActivityRelatedMorphFieldMetadataName(objectSingularName)}Id`;
  }
}
