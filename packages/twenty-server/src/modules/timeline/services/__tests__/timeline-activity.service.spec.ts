import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ObjectRecordBaseEvent } from 'twenty-shared/database-events';
import { FieldMetadataType } from 'twenty-shared/types';

import { type FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { type TimelineActivityRepository } from 'src/modules/timeline/repositories/timeline-activity.repository';
import { TimelineActivityService } from 'src/modules/timeline/services/timeline-activity.service';

const WORKSPACE_ID = 'workspace-id';
const CREATOR_OBJECT_METADATA_ID = 'creator-object-metadata-id';
const TIMELINE_ACTIVITY_OBJECT_METADATA_ID =
  'timeline-activity-object-metadata-id';
const CREATOR_TIMELINE_ACTIVITIES_FIELD_ID =
  'creator-timeline-activities-field-id';
const TARGET_CREATOR_FIELD_ID = 'target-creator-field-id';

const buildFlatFieldMetadataMaps = (
  flatFieldMetadatas: FlatFieldMetadata[],
): FlatEntityMaps<FlatFieldMetadata> => ({
  byUniversalIdentifier: Object.fromEntries(
    flatFieldMetadatas.map((flatFieldMetadata) => [
      flatFieldMetadata.universalIdentifier,
      flatFieldMetadata,
    ]),
  ),
  universalIdentifierById: Object.fromEntries(
    flatFieldMetadatas.map((flatFieldMetadata) => [
      flatFieldMetadata.id,
      flatFieldMetadata.universalIdentifier,
    ]),
  ),
  universalIdentifiersByApplicationId: {},
});
const creatorObjectMetadata = getFlatObjectMetadataMock({
  id: CREATOR_OBJECT_METADATA_ID,
  universalIdentifier: 'creator-object-universal-identifier',
  nameSingular: 'creator',
  namePlural: 'creators',
  fieldIds: [CREATOR_TIMELINE_ACTIVITIES_FIELD_ID],
  fieldUniversalIdentifiers: [
    'creator-timeline-activities-field-universal-identifier',
  ],
  workspaceId: WORKSPACE_ID,
});

const buildCreatorTimelineRelationFields = ({
  targetObjectMetadataId = TIMELINE_ACTIVITY_OBJECT_METADATA_ID,
  targetObjectUniversalIdentifier = STANDARD_OBJECTS.timelineActivity
    .universalIdentifier,
}: {
  targetObjectMetadataId?: string;
  targetObjectUniversalIdentifier?: string;
} = {}): FlatFieldMetadata[] => {
  const creatorTimelineActivitiesField = getFlatFieldMetadataMock({
    id: CREATOR_TIMELINE_ACTIVITIES_FIELD_ID,
    universalIdentifier:
      'creator-timeline-activities-field-universal-identifier',
    objectMetadataId: CREATOR_OBJECT_METADATA_ID,
    objectMetadataUniversalIdentifier: 'creator-object-universal-identifier',
    type: FieldMetadataType.RELATION,
    name: 'timelineActivities',
    relationTargetFieldMetadataId: TARGET_CREATOR_FIELD_ID,
    relationTargetFieldMetadataUniversalIdentifier:
      'target-creator-field-universal-identifier',
    relationTargetObjectMetadataId: targetObjectMetadataId,
    relationTargetObjectMetadataUniversalIdentifier:
      targetObjectUniversalIdentifier,
  });
  const targetCreatorField = getFlatFieldMetadataMock({
    id: TARGET_CREATOR_FIELD_ID,
    universalIdentifier: 'target-creator-field-universal-identifier',
    objectMetadataId: targetObjectMetadataId,
    objectMetadataUniversalIdentifier: targetObjectUniversalIdentifier,
    type: FieldMetadataType.MORPH_RELATION,
    name: 'targetCreator',
    relationTargetFieldMetadataId: CREATOR_TIMELINE_ACTIVITIES_FIELD_ID,
    relationTargetFieldMetadataUniversalIdentifier:
      'creator-timeline-activities-field-universal-identifier',
    relationTargetObjectMetadataId: CREATOR_OBJECT_METADATA_ID,
    relationTargetObjectMetadataUniversalIdentifier:
      'creator-object-universal-identifier',
  });

  return [creatorTimelineActivitiesField, targetCreatorField];
};

const buildCreatedEventBatch = ({
  objectMetadata,
  recordId,
}: {
  objectMetadata: FlatObjectMetadata;
  recordId: string;
}): WorkspaceEventBatch<ObjectRecordBaseEvent> => ({
  name: `${objectMetadata.nameSingular}.created`,
  workspaceId: WORKSPACE_ID,
  objectMetadata,
  events: [
    {
      recordId,
      properties: {
        after: { id: recordId },
      },
    },
  ],
});

describe('TimelineActivityService', () => {
  const upsertTimelineActivities = jest.fn();
  const getOrRecomputeManyOrAllFlatEntityMaps = jest.fn();
  const timelineActivityService = new TimelineActivityService(
    { upsertTimelineActivities } as unknown as TimelineActivityRepository,
    {} as FeatureFlagService,
    {} as GlobalWorkspaceOrmManager,
    {
      getOrRecomputeManyOrAllFlatEntityMaps,
    } as unknown as WorkspaceManyOrAllFlatEntityMapsCacheService,
  );

  it('skips Creator List updates without Timeline target metadata', async () => {
    const creatorListObjectMetadata = getFlatObjectMetadataMock({
      id: 'creator-list-object-metadata-id',
      universalIdentifier: 'creator-list-object-universal-identifier',
      nameSingular: 'creatorList',
      namePlural: 'creatorLists',
      fieldIds: [],
      fieldUniversalIdentifiers: [],
      workspaceId: WORKSPACE_ID,
    });

    getOrRecomputeManyOrAllFlatEntityMaps.mockResolvedValue({
      flatFieldMetadataMaps: buildFlatFieldMetadataMaps([]),
    });

    await timelineActivityService.upsertEvents({
      name: 'creatorList.updated',
      workspaceId: WORKSPACE_ID,
      objectMetadata: creatorListObjectMetadata,
      events: [
        {
          recordId: 'creator-list-id',
          properties: {
            updatedFields: ['name'],
            diff: { name: { before: 'Old list', after: 'New list' } },
            before: { id: 'creator-list-id', name: 'Old list' },
            after: { id: 'creator-list-id', name: 'New list' },
          },
        },
      ],
    });

    expect(upsertTimelineActivities).not.toHaveBeenCalled();
  });

  it('persists direct Creator events when Timeline target metadata is active', async () => {
    getOrRecomputeManyOrAllFlatEntityMaps.mockResolvedValue({
      flatFieldMetadataMaps: buildFlatFieldMetadataMaps(
        buildCreatorTimelineRelationFields(),
      ),
    });

    await timelineActivityService.upsertEvents(
      buildCreatedEventBatch({
        objectMetadata: creatorObjectMetadata,
        recordId: 'creator-id',
      }),
    );

    expect(upsertTimelineActivities).toHaveBeenCalledWith({
      objectSingularName: 'creator',
      workspaceId: WORKSPACE_ID,
      payloads: [
        {
          name: 'creator.created',
          objectSingularName: 'creator',
          recordId: 'creator-id',
          workspaceMemberId: undefined,
          properties: {
            after: { id: 'creator-id' },
          },
        },
      ],
    });
  });

  it('skips lookalike morph pairs that do not target Timeline Activity', async () => {
    getOrRecomputeManyOrAllFlatEntityMaps.mockResolvedValue({
      flatFieldMetadataMaps: buildFlatFieldMetadataMaps(
        buildCreatorTimelineRelationFields({
          targetObjectMetadataId: 'attachment-object-metadata-id',
          targetObjectUniversalIdentifier:
            'attachment-object-universal-identifier',
        }),
      ),
    });

    await timelineActivityService.upsertEvents(
      buildCreatedEventBatch({
        objectMetadata: creatorObjectMetadata,
        recordId: 'creator-id',
      }),
    );

    expect(upsertTimelineActivities).not.toHaveBeenCalled();
  });
});
