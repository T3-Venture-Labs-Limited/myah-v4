import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type QueryRunner } from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { loadPinnedPartnershipMetadataSnapshot } from './load-pinned-partnership-metadata-snapshot.service';

const workspaceId = '116cabac-28b1-45d3-a8be-8cb66b2d04e2';
const appId = '06ac2bf9-8d14-4263-abd3-e6a939f46fe6';
const customAppId = 'eeaa1133-7341-4dbd-98d1-1f3526fa1e19';
const fieldId = '2a6ee485-5948-4f53-89f5-95b3de8c9a16';
const peerId = '5cacbfbe-e049-4a18-9ded-38224d09be16';

const fixture = () => {
  const objects = [
    {
      id: 'a',
      universalIdentifier: STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      applicationId: appId,
    },
    {
      id: 'b',
      universalIdentifier: STANDARD_OBJECTS.task.universalIdentifier,
      applicationId: appId,
    },
  ];
  const fields = [
    {
      id: fieldId,
      universalIdentifier: fieldId,
      objectMetadataId: 'a',
      applicationId: appId,
      relationTargetFieldMetadataId: peerId,
      relationTargetObjectMetadataId: 'b',
    },
    {
      id: peerId,
      universalIdentifier: peerId,
      objectMetadataId: 'b',
      applicationId: appId,
      relationTargetFieldMetadataId: fieldId,
      relationTargetObjectMetadataId: 'a',
    },
  ];
  const indexes = [
    {
      id: 'i',
      universalIdentifier: 'index-uid',
      objectMetadataId: 'a',
      applicationId: appId,
      isUnique: true,
      indexFieldMetadatas: [
        {
          id: 'm',
          indexMetadataId: 'i',
          workspaceId,
          fieldMetadataId: fieldId,
          subFieldName: null,
        },
      ],
    },
  ];
  const applications = [
    { id: appId, ...TWENTY_STANDARD_APPLICATION, deletedAt: null },
    { id: customAppId, universalIdentifier: 'custom-app-uid', deletedAt: null },
  ];
  const permissions = [
    {
      id: 'p',
      universalIdentifier: 'permission-uid',
      objectMetadataId: 'a',
      applicationId: appId,
      roleId: 'r',
    },
  ];
  const roles = [
    {
      id: 'r',
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      applicationId: appId,
    },
  ];
  const viewFields = [
    {
      id: 'vf',
      universalIdentifier: 'view-field-uid',
      fieldMetadataId: fieldId,
      applicationId: appId,
    },
  ];
  const data = new Map<unknown, unknown[]>([
    [ObjectPermissionEntity, permissions],
    [RoleEntity, roles],
    [ViewFieldEntity, viewFields],
    [ApplicationEntity, applications],
    [ObjectMetadataEntity, objects],
    [FieldMetadataEntity, fields],
    [IndexMetadataEntity, indexes],
  ]);
  const find = jest.fn(
    (
      entity: unknown,
      options: { where: { workspaceId: string }; withDeleted?: boolean },
    ) => {
      expect(options.where.workspaceId).toBe(workspaceId);
      if (entity !== WorkspaceEntity && entity !== SearchFieldMetadataEntity) {
        expect(options.withDeleted).toBe(true);
      }
      return Promise.resolve(data.get(entity) || []);
    },
  );
  const manager = {
    query: jest.fn().mockResolvedValue([{ exists: true }]),
    getRepository: jest.fn((entity: unknown) => ({
      find: (options: { where: { workspaceId: string } }) =>
        find(entity, options),
      findOne: jest.fn().mockResolvedValue({
        id: workspaceId,
        activationStatus: WorkspaceActivationStatus.ACTIVE,
        databaseSchema: 'workspace_test',
        metadataVersion: 17,
      }),
    })),
  };
  const runner = {
    isTransactionActive: true,
    isReleased: false,
    databaseConnection: {},
    manager,
  } as unknown as QueryRunner;
  (manager as typeof manager & { queryRunner: QueryRunner }).queryRunner =
    runner;
  return {
    runner,
    manager,
    objects,
    fields,
    indexes,
    applications,
    permissions,
    viewFields,
    data,
  };
};

// Only the scalar conversion itself is mocked; assert its complete inputs and
// use the real flat-map insertion and unique-index calculation.
jest.mock(
  'src/engine/metadata-modules/flat-object-metadata/utils/from-object-metadata-entity-to-flat-object-metadata.util',
  () => ({
    fromObjectMetadataEntityToFlatObjectMetadata: ({
      entity,
    }: {
      entity: {
        fields: Array<{ id: string }>;
        objectPermissions: Array<{ id: string }>;
      };
    }) => ({
      ...entity,
      fieldIds: entity.fields.map((field) => field.id),
      objectPermissionIds: entity.objectPermissions.map(
        (permission) => permission.id,
      ),
    }),
  }),
);
jest.mock(
  'src/engine/metadata-modules/flat-field-metadata/utils/from-field-metadata-entity-to-flat-field-metadata.util',
  () => ({
    fromFieldMetadataEntityToFlatFieldMetadata: ({
      entity,
    }: {
      entity: { viewFields: Array<{ id: string }> };
    }) => ({
      ...entity,
      viewFieldIds: entity.viewFields.map((viewField) => viewField.id),
    }),
  }),
);
jest.mock(
  'src/engine/metadata-modules/flat-index-metadata/utils/from-index-metadata-entity-to-flat-index-metadata.util',
  () => ({
    fromIndexMetadataEntityToFlatIndexMetadata: ({
      entity,
    }: {
      entity: { indexFieldMetadatas: unknown[] };
    }) => ({ ...entity, flatIndexFieldMetadatas: entity.indexFieldMetadatas }),
  }),
);
jest.mock(
  'src/engine/metadata-modules/flat-object-permission/utils/from-object-permission-entity-to-flat-object-permission.util',
  () => ({
    fromObjectPermissionEntityToFlatObjectPermission: ({
      entity,
    }: {
      entity: { universalIdentifier: string };
    }) => entity,
  }),
);

describe('loadPinnedPartnershipMetadataSnapshot', () => {
  it('uses only the bound runner manager and retains exact object, inverse field and unique-index membership', async () => {
    const { runner, manager } = fixture();
    const result = await loadPinnedPartnershipMetadataSnapshot(
      runner,
      workspaceId,
    );
    expect(manager.getRepository).toHaveBeenCalled();
    expect(result.standardApplicationId).toBe(appId);
    expect(result.applicationUniversalIdentifierById.get(customAppId)).toBe(
      'custom-app-uid',
    );
    expect(result.rowCounts).toEqual({
      objects: 2,
      fields: 2,
      indexes: 1,
      permissions: 1,
    });
    expect(
      result.objectMetadata.byUniversalIdentifier[
        STANDARD_OBJECTS.campaignCreator.universalIdentifier
      ]!.fieldIds,
    ).toEqual([fieldId]);
    expect(
      result.fieldMetadata.byUniversalIdentifier[fieldId]!
        .relationTargetFieldMetadataId,
    ).toBe(peerId);
    expect(
      result.fieldMetadata.byUniversalIdentifier[fieldId]!.viewFieldIds,
    ).toEqual(['vf']);
    expect(
      result.objectMetadata.byUniversalIdentifier[
        STANDARD_OBJECTS.campaignCreator.universalIdentifier
      ]!.objectPermissionIds,
    ).toEqual(['p']);
    expect(
      result.objectPermission.byUniversalIdentifier['permission-uid']!.roleId,
    ).toBe('r');
    expect(result.fieldMetadata.byUniversalIdentifier[fieldId]!.isUnique).toBe(
      true,
    );
    expect(
      result.index.byUniversalIdentifier['index-uid']!.flatIndexFieldMetadatas,
    ).toHaveLength(1);
  });

  it('rejects a missing reciprocal relation and incomplete index membership', async () => {
    const missingInverse = fixture();
    missingInverse.fields[1].relationTargetFieldMetadataId = 'other';
    await expect(
      loadPinnedPartnershipMetadataSnapshot(missingInverse.runner, workspaceId),
    ).rejects.toThrow('inverse');
    const wrongTarget = fixture();
    wrongTarget.fields[0].relationTargetObjectMetadataId = 'a';
    await expect(
      loadPinnedPartnershipMetadataSnapshot(wrongTarget.runner, workspaceId),
    ).rejects.toThrow('inverse');
    const missingMember = fixture();
    missingMember.indexes[0].indexFieldMetadatas = [];
    await expect(
      loadPinnedPartnershipMetadataSnapshot(missingMember.runner, workspaceId),
    ).rejects.toThrow('index membership');
  });

  it('rejects a pooled manager, missing schema, missing owner and conflicting standard application', async () => {
    const pooled = fixture();
    (
      pooled.manager as typeof pooled.manager & { queryRunner: QueryRunner }
    ).queryRunner = {} as QueryRunner;
    await expect(
      loadPinnedPartnershipMetadataSnapshot(pooled.runner, workspaceId),
    ).rejects.toThrow('caller-owned');
    const schema = fixture();
    schema.manager.query.mockResolvedValue([{ exists: false }]);
    await expect(
      loadPinnedPartnershipMetadataSnapshot(schema.runner, workspaceId),
    ).rejects.toThrow('schema');
    const owner = fixture();
    owner.fields[0].applicationId = 'unknown';
    await expect(
      loadPinnedPartnershipMetadataSnapshot(owner.runner, workspaceId),
    ).rejects.toThrow('owner');
    const ambiguous = fixture();
    ambiguous.applications.push({
      ...ambiguous.applications[0],
      id: 'duplicate',
    });
    await expect(
      loadPinnedPartnershipMetadataSnapshot(ambiguous.runner, workspaceId),
    ).rejects.toThrow('ambiguous');
  });
});
