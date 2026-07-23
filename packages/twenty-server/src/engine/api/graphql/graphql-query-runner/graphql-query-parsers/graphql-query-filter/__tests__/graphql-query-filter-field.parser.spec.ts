import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { type WhereExpressionBuilder } from 'typeorm';

import { GraphqlQueryFilterFieldParser } from 'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query-filter/graphql-query-filter-field.parser';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/repository/workspace-select-query-builder';

const buildFlatEntityMaps = <T extends SyncableFlatEntity>(
  entities: T[],
): FlatEntityMaps<T> => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});

describe('GraphqlQueryFilterFieldParser', () => {
  it('selects only the target identifier for a one-to-many EXISTS filter', () => {
    const creatorObject = getFlatObjectMetadataMock({
      id: 'creator-object-id',
      universalIdentifier: 'creator-object-uid',
      nameSingular: 'creator',
      fieldUniversalIdentifiers: ['creator-list-memberships-field-uid'],
    });
    const creatorListMemberObject = getFlatObjectMetadataMock({
      id: 'creator-list-member-object-id',
      universalIdentifier: 'creator-list-member-object-uid',
      nameSingular: 'creatorListMember',
      fieldUniversalIdentifiers: [
        'creator-list-member-creator-field-uid',
        'creator-list-member-list-field-uid',
      ],
    });
    const listMembershipsField = getFlatFieldMetadataMock({
      id: 'creator-list-memberships-field-id',
      universalIdentifier: 'creator-list-memberships-field-uid',
      objectMetadataId: creatorObject.id,
      type: FieldMetadataType.RELATION,
      name: 'listMemberships',
      relationTargetObjectMetadataId: creatorListMemberObject.id,
      relationTargetFieldMetadataId: 'creator-list-member-creator-field-id',
      settings: { relationType: RelationType.ONE_TO_MANY },
    });
    const creatorField = getFlatFieldMetadataMock({
      id: 'creator-list-member-creator-field-id',
      universalIdentifier: 'creator-list-member-creator-field-uid',
      objectMetadataId: creatorListMemberObject.id,
      type: FieldMetadataType.RELATION,
      name: 'creator',
      settings: { relationType: RelationType.MANY_TO_ONE },
    });
    const creatorListField = getFlatFieldMetadataMock({
      id: 'creator-list-member-list-field-id',
      universalIdentifier: 'creator-list-member-list-field-uid',
      objectMetadataId: creatorListMemberObject.id,
      type: FieldMetadataType.TEXT,
      name: 'creatorListId',
    });
    creatorObject.fieldIds = [listMembershipsField.id];
    creatorListMemberObject.fieldIds = [creatorField.id, creatorListField.id];
    const flatFieldMetadataMaps = buildFlatEntityMaps<FlatFieldMetadata>([
      listMembershipsField,
      creatorField,
      creatorListField,
    ]);
    const flatObjectMetadataMaps = buildFlatEntityMaps<FlatObjectMetadata>([
      creatorObject,
      creatorListMemberObject,
    ]);
    const targetQueryBuilder = {
      andWhere: jest.fn(),
      where: jest.fn(),
      getParameters: jest.fn(() => ({})),
      getQuery: jest.fn(() => 'SELECT * FROM creator_list_member'),
      shouldBypassPermissionChecks: true,
      select: jest.fn(),
      validatePermissionsBeforeSerialization: jest.fn(),
    };
    const outerQueryBuilder = {
      connection: {
        getMetadata: jest.fn(() => ({ target: 'creatorListMember' })),
      },
      createPermissionAwareSelectQueryBuilder: jest.fn(
        () => targetQueryBuilder,
      ),
      shouldBypassPermissionChecks: true,
      setParameters: jest.fn(),
    } as unknown as WorkspaceSelectQueryBuilder<Record<string, unknown>>;
    const queryBuilder = {
      andWhere: jest.fn(),
      where: jest.fn(),
    };

    new GraphqlQueryFilterFieldParser(
      creatorObject,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    ).parse(
      queryBuilder as unknown as WhereExpressionBuilder,
      outerQueryBuilder,
      'creator',
      'listMemberships',
      {
        creatorListId: { eq: 'list-id' },
      },
    );

    expect(targetQueryBuilder.select).toHaveBeenCalledWith(
      'listMemberships_0.id',
    );
  });
});
