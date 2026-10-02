import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type QueryRunner } from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { fromFieldMetadataEntityToFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/from-field-metadata-entity-to-flat-field-metadata.util';
import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { fromIndexMetadataEntityToFlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/utils/from-index-metadata-entity-to-flat-index-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { fromObjectMetadataEntityToFlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/utils/from-object-metadata-entity-to-flat-object-metadata.util';
import { type FlatObjectPermissionMaps } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission-maps.type';
import { fromObjectPermissionEntityToFlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/utils/from-object-permission-entity-to-flat-object-permission.util';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { computeUniqueFieldMetadataIdsFromIndexEntities } from 'src/engine/metadata-modules/index-metadata/utils/compute-unique-field-metadata-ids-from-index-entities.util';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { regroupEntitiesByRelatedEntityId } from 'src/engine/workspace-cache/utils/regroup-entities-by-related-entity-id';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

// Deliberately not AllFlatEntityMaps: views, roles, search, and other migration
// dependencies have NOT been loaded as flat maps. Never plan directly from this.
export type PinnedPartnershipCoreSnapshot = {
  workspaceId: string;
  databaseSchema: string;
  metadataVersion: number;
  standardApplicationId: string;
  applicationUniversalIdentifierById: Map<string, string>;
  objectMetadata: FlatEntityMaps<FlatObjectMetadata>;
  fieldMetadata: FlatEntityMaps<FlatFieldMetadata>;
  index: FlatEntityMaps<FlatIndexMetadata>;
  objectPermission: FlatObjectPermissionMaps;
  rowCounts: {
    objects: number;
    fields: number;
    indexes: number;
    permissions: number;
  };
};

export const loadPinnedPartnershipMetadataSnapshot = async (
  queryRunner: QueryRunner,
  workspaceId: string,
): Promise<PinnedPartnershipCoreSnapshot> => {
  if (
    !queryRunner.isTransactionActive ||
    queryRunner.isReleased ||
    !(queryRunner as QueryRunner & { databaseConnection?: unknown })
      .databaseConnection ||
    queryRunner.manager.queryRunner !== queryRunner
  ) {
    throw new Error(
      'Pinned partnership snapshot requires a connected active caller-owned QueryRunner',
    );
  }

  const repository = <T extends object>(entity: new () => T) =>
    queryRunner.manager.getRepository(entity);
  const workspace = await repository(WorkspaceEntity).findOne({
    where: { id: workspaceId },
  });
  if (
    !workspace ||
    workspace.activationStatus !== WorkspaceActivationStatus.ACTIVE ||
    !workspace.databaseSchema ||
    !Number.isInteger(workspace.metadataVersion)
  ) {
    throw new Error(
      'Pinned partnership snapshot workspace prerequisite missing',
    );
  }
  const schemaRows: Array<{ exists: boolean }> =
    await queryRunner.manager.query(
      'SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1) AS exists',
      [workspace.databaseSchema],
    );
  if (schemaRows.length !== 1 || schemaRows[0].exists !== true) {
    throw new Error('Pinned partnership snapshot workspace schema missing');
  }

  const where = { workspaceId };
  const [
    applications,
    objects,
    fields,
    indexes,
    permissions,
    roles,
    views,
    viewFields,
    viewFilters,
    viewSorts,
    searchFields,
    fieldPermissions,
  ] = await Promise.all([
    repository(ApplicationEntity).find({ where, withDeleted: true }),
    repository(ObjectMetadataEntity).find({ where, withDeleted: true }),
    repository(FieldMetadataEntity).find({ where, withDeleted: true }),
    repository(IndexMetadataEntity).find({
      where,
      withDeleted: true,
      relations: ['indexFieldMetadatas'],
      relationLoadStrategy: 'join',
    }),
    repository(ObjectPermissionEntity).find({ where, withDeleted: true }),
    repository(RoleEntity).find({ where, withDeleted: true }),
    repository(ViewEntity).find({ where, withDeleted: true }),
    repository(ViewFieldEntity).find({ where, withDeleted: true }),
    repository(ViewFilterEntity).find({ where, withDeleted: true }),
    repository(ViewSortEntity).find({ where, withDeleted: true }),
    repository(SearchFieldMetadataEntity).find({ where }),
    repository(FieldPermissionEntity).find({ where, withDeleted: true }),
  ]);
  const standardApps = applications.filter(
    (app) =>
      app.universalIdentifier ===
        TWENTY_STANDARD_APPLICATION.universalIdentifier &&
      !app.deletedAt &&
      app.name === TWENTY_STANDARD_APPLICATION.name &&
      app.sourceType === TWENTY_STANDARD_APPLICATION.sourceType &&
      app.sourcePath === TWENTY_STANDARD_APPLICATION.sourcePath,
  );
  if (
    standardApps.length !== 1 ||
    applications.some(
      (app) =>
        app.universalIdentifier ===
          TWENTY_STANDARD_APPLICATION.universalIdentifier &&
        app.id !== standardApps[0].id,
    )
  ) {
    throw new Error(
      'Pinned partnership snapshot standard application missing or ambiguous',
    );
  }
  const standardObjectIds = [
    STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    STANDARD_OBJECTS.task.universalIdentifier,
  ];
  for (const id of standardObjectIds) {
    if (
      objects.filter(
        (object) =>
          object.universalIdentifier === id &&
          object.applicationId === standardApps[0].id,
      ).length !== 1 ||
      objects.filter((object) => object.universalIdentifier === id).length !== 1
    ) {
      throw new Error(
        `Pinned partnership snapshot standard object missing or ambiguous: ${id}`,
      );
    }
  }
  if (
    roles.filter(
      (role) =>
        role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier &&
        role.applicationId === standardApps[0].id,
    ).length !== 1
  ) {
    throw new Error(
      'Pinned partnership snapshot standard admin role missing or ambiguous',
    );
  }
  if (
    applications.some(
      (app) =>
        !app.universalIdentifier ||
        applications.filter(
          (other) => other.universalIdentifier === app.universalIdentifier,
        ).length !== 1,
    )
  ) {
    throw new Error('Pinned partnership snapshot ambiguous application owner');
  }
  for (const collection of [
    objects,
    fields,
    indexes,
    permissions,
    roles,
    views,
    viewFields,
    viewFilters,
    viewSorts,
    searchFields,
    fieldPermissions,
  ]) {
    if (
      collection.some(
        (row) =>
          !applications.some(
            (app) => app.id === row.applicationId && !app.deletedAt,
          ),
      )
    ) {
      throw new Error('Pinned partnership snapshot unknown application owner');
    }
  }
  for (const row of [
    ...fields,
    ...indexes,
    ...permissions,
    ...views,
    ...searchFields,
    ...fieldPermissions,
  ]) {
    if (!objects.some((object) => object.id === row.objectMetadataId)) {
      throw new Error(
        'Pinned partnership snapshot orphaned object association',
      );
    }
  }
  for (const row of [
    ...viewFields,
    ...viewFilters,
    ...viewSorts,
    ...searchFields,
    ...fieldPermissions,
  ]) {
    if (
      row.fieldMetadataId &&
      !fields.some((field) => field.id === row.fieldMetadataId)
    ) {
      throw new Error('Pinned partnership snapshot orphaned field association');
    }
  }
  for (const permission of [...permissions, ...fieldPermissions]) {
    if (!roles.some((role) => role.id === permission.roleId)) {
      throw new Error('Pinned partnership snapshot orphaned role association');
    }
  }
  for (const index of indexes) {
    if (
      !index.indexFieldMetadatas?.length ||
      index.indexFieldMetadatas.some(
        (member) =>
          member.indexMetadataId !== index.id ||
          member.workspaceId !== workspaceId ||
          !fields.some(
            (field) =>
              field.id === member.fieldMetadataId &&
              field.objectMetadataId === index.objectMetadataId,
          ),
      )
    ) {
      throw new Error(
        'Pinned partnership snapshot incomplete index membership',
      );
    }
  }
  for (const field of fields) {
    if (
      (field.relationTargetFieldMetadataId &&
        !fields.some(
          (peer) =>
            peer.id === field.relationTargetFieldMetadataId &&
            peer.relationTargetFieldMetadataId === field.id &&
            peer.objectMetadataId === field.relationTargetObjectMetadataId &&
            peer.relationTargetObjectMetadataId === field.objectMetadataId,
        )) ||
      (field.relationTargetObjectMetadataId &&
        !objects.some(
          (object) => object.id === field.relationTargetObjectMetadataId,
        ))
    ) {
      throw new Error(
        'Pinned partnership snapshot incomplete relation inverse',
      );
    }
  }
  const appIds = createIdToUniversalIdentifierMap(applications);
  const objectIds = createIdToUniversalIdentifierMap(objects);
  const fieldIds = createIdToUniversalIdentifierMap(fields);
  const roleIds = createIdToUniversalIdentifierMap(roles);
  const grouped = <T extends { id: string; universalIdentifier: string }>(
    rows: T[],
    foreignKey: keyof T,
  ) =>
    regroupEntitiesByRelatedEntityId({ entities: rows, foreignKey } as never);
  const byObject = {
    fields: grouped(fields, 'objectMetadataId'),
    indexes: grouped(indexes, 'objectMetadataId'),
    permissions: grouped(permissions, 'objectMetadataId'),
    views: grouped(views, 'objectMetadataId'),
    search: grouped(searchFields, 'objectMetadataId'),
    fieldPermissions: grouped(fieldPermissions, 'objectMetadataId'),
  };
  const byField = {
    viewFields: grouped(viewFields, 'fieldMetadataId'),
    viewFilters: grouped(viewFilters, 'fieldMetadataId'),
    viewSorts: grouped(viewSorts, 'fieldMetadataId'),
    search: grouped(searchFields, 'fieldMetadataId'),
    fieldPermissions: grouped(fieldPermissions, 'fieldMetadataId'),
    calendar: grouped(
      views.filter((v) => !!v.calendarFieldMetadataId),
      'calendarFieldMetadataId',
    ),
    kanban: grouped(
      views.filter((v) => !!v.kanbanAggregateOperationFieldMetadataId),
      'kanbanAggregateOperationFieldMetadataId',
    ),
    group: grouped(
      views.filter((v) => !!v.mainGroupByFieldMetadataId),
      'mainGroupByFieldMetadataId',
    ),
  };
  const objectMetadata: FlatEntityMaps<FlatObjectMetadata> =
    createEmptyFlatEntityMaps();
  const fieldMetadata: FlatEntityMaps<FlatFieldMetadata> =
    createEmptyFlatEntityMaps();
  const index: FlatEntityMaps<FlatIndexMetadata> = createEmptyFlatEntityMaps();
  const objectPermission: FlatObjectPermissionMaps =
    createEmptyFlatEntityMaps();
  for (const object of objects) {
    addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
      flatEntity: fromObjectMetadataEntityToFlatObjectMetadata({
        entity: {
          ...object,
          fields: byObject.fields.get(object.id) || [],
          indexMetadatas: byObject.indexes.get(object.id) || [],
          objectPermissions: byObject.permissions.get(object.id) || [],
          views: byObject.views.get(object.id) || [],
          searchFieldMetadatas: byObject.search.get(object.id) || [],
          fieldPermissions: byObject.fieldPermissions.get(object.id) || [],
        },
        applicationIdToUniversalIdentifierMap: appIds,
        fieldMetadataIdToUniversalIdentifierMap: fieldIds,
      }),
      flatEntityMapsToMutate: objectMetadata,
    });
  }
  const uniqueFieldIds =
    computeUniqueFieldMetadataIdsFromIndexEntities(indexes);
  for (const field of fields) {
    const flat = fromFieldMetadataEntityToFlatFieldMetadata({
      entity: {
        ...field,
        viewFields: byField.viewFields.get(field.id) || [],
        viewFilters: byField.viewFilters.get(field.id) || [],
        viewSorts: byField.viewSorts.get(field.id) || [],
        searchFieldMetadatas: byField.search.get(field.id) || [],
        fieldPermissions: byField.fieldPermissions.get(field.id) || [],
        calendarViews: byField.calendar.get(field.id) || [],
        kanbanAggregateOperationViews: byField.kanban.get(field.id) || [],
        mainGroupByFieldMetadataViews: byField.group.get(field.id) || [],
      },
      applicationIdToUniversalIdentifierMap: appIds,
      objectMetadataIdToUniversalIdentifierMap: objectIds,
      fieldMetadataIdToUniversalIdentifierMap: fieldIds,
    });
    addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
      flatEntity: { ...flat, isUnique: uniqueFieldIds.has(field.id) },
      flatEntityMapsToMutate: fieldMetadata,
    });
  }
  for (const entity of indexes) {
    addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
      flatEntity: fromIndexMetadataEntityToFlatIndexMetadata({
        entity,
        applicationIdToUniversalIdentifierMap: appIds,
        objectMetadataIdToUniversalIdentifierMap: objectIds,
        fieldMetadataIdToUniversalIdentifierMap: fieldIds,
      }),
      flatEntityMapsToMutate: index,
    });
  }
  for (const entity of permissions) {
    addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
      flatEntity: fromObjectPermissionEntityToFlatObjectPermission({
        entity,
        applicationIdToUniversalIdentifierMap: appIds,
        objectMetadataIdToUniversalIdentifierMap: objectIds,
        roleIdToUniversalIdentifierMap: roleIds,
      }),
      flatEntityMapsToMutate: objectPermission,
    });
  }
  return {
    workspaceId,
    databaseSchema: workspace.databaseSchema,
    metadataVersion: workspace.metadataVersion,
    standardApplicationId: standardApps[0].id,
    applicationUniversalIdentifierById: appIds,
    objectMetadata,
    fieldMetadata,
    index,
    objectPermission,
    rowCounts: {
      objects: objects.length,
      fields: fields.length,
      indexes: indexes.length,
      permissions: permissions.length,
    },
  };
};
