import { upsertFieldPermissions } from 'test/integration/metadata/suites/field-permission/utils/upsert-field-permissions.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { upsertObjectPermissions } from 'test/integration/metadata/suites/object-permission/utils/upsert-object-permissions.util';
import { createOneRole } from 'test/integration/metadata/suites/role/utils/create-one-role.util';
import { deleteOneRole } from 'test/integration/metadata/suites/role/utils/delete-one-role.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import { isDefined } from 'twenty-shared/utils';

describe('Field permission upsert should succeed', () => {
  let createdRoleId: string;
  let customObjectMetadataId: string;
  let oneFieldMetadataId: string;
  let objectWithNoObjectPermissionMetadataId: string;
  let objectWithNoObjectPermissionFieldMetadataId: string;

  beforeAll(async () => {
    const { data: roleData } = await createOneRole({
      expectToFail: false,
      input: {
        label: 'Test Role For Field Permission Success',
        description: 'Role for field permission successful tests',
        icon: 'IconSettings',
        canUpdateAllSettings: false,
        canAccessAllTools: true,
        canReadAllObjectRecords: true,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canBeAssignedToUsers: true,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: false,
      },
    });

    createdRoleId = roleData?.createOneRole?.id;
    jestExpectToBeDefined(createdRoleId);

    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular fieldsList { id name }',
      expectToFail: false,
    });
    const creator = objects.find((object) => object.nameSingular === 'creator');
    const socialProfile = objects.find(
      (object) => object.nameSingular === 'socialProfile',
    );
    const location = creator?.fieldsList?.find(
      (field) => field.name === 'location',
    );
    const platform = socialProfile?.fieldsList?.find(
      (field) => field.name === 'platform',
    );

    jestExpectToBeDefined(creator);
    jestExpectToBeDefined(socialProfile);
    jestExpectToBeDefined(location);
    jestExpectToBeDefined(platform);
    customObjectMetadataId = creator.id;
    oneFieldMetadataId = location.id;
    objectWithNoObjectPermissionMetadataId = socialProfile.id;
    objectWithNoObjectPermissionFieldMetadataId = platform.id;

    await upsertObjectPermissions({
      expectToFail: false,
      input: {
        roleId: createdRoleId,
        objectPermissions: [
          {
            objectMetadataId: customObjectMetadataId,
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
          },
        ],
      },
    });
  });

  afterAll(async () => {
    if (isDefined(createdRoleId)) {
      await deleteOneRole({
        expectToFail: false,
        input: { idToDelete: createdRoleId },
      });
    }
  });

  it('should upsert one field permission (create)', async () => {
    const { data } = await upsertFieldPermissions({
      expectToFail: false,
      input: {
        roleId: createdRoleId,
        fieldPermissions: [
          {
            objectMetadataId: customObjectMetadataId,
            fieldMetadataId: oneFieldMetadataId,
            canReadFieldValue: false,
            canUpdateFieldValue: false,
          },
        ],
      },
    });

    expect(data?.upsertFieldPermissions).toHaveLength(1);
    expect(data?.upsertFieldPermissions?.[0]).toMatchObject({
      objectMetadataId: customObjectMetadataId,
      fieldMetadataId: oneFieldMetadataId,
      roleId: createdRoleId,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    });
  });

  it('should upsert to update existing field permission', async () => {
    const { data } = await upsertFieldPermissions({
      expectToFail: false,
      input: {
        roleId: createdRoleId,
        fieldPermissions: [
          {
            objectMetadataId: customObjectMetadataId,
            fieldMetadataId: oneFieldMetadataId,
            canReadFieldValue: false,
            canUpdateFieldValue: false,
          },
        ],
      },
    });

    expect(data?.upsertFieldPermissions).toHaveLength(1);
    expect(data?.upsertFieldPermissions?.[0]).toMatchObject({
      objectMetadataId: customObjectMetadataId,
      fieldMetadataId: oneFieldMetadataId,
      roleId: createdRoleId,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    });
  });

  it('should upsert with both canReadFieldValue and canUpdateFieldValue false', async () => {
    const { data } = await upsertFieldPermissions({
      expectToFail: false,
      input: {
        roleId: createdRoleId,
        fieldPermissions: [
          {
            objectMetadataId: customObjectMetadataId,
            fieldMetadataId: oneFieldMetadataId,
            canReadFieldValue: false,
            canUpdateFieldValue: false,
          },
        ],
      },
    });

    expect(data?.upsertFieldPermissions).toHaveLength(1);
    expect(data?.upsertFieldPermissions?.[0]).toMatchObject({
      objectMetadataId: customObjectMetadataId,
      fieldMetadataId: oneFieldMetadataId,
      roleId: createdRoleId,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    });
  });

  it('should upsert even when object permission is not found for role on object', async () => {
    const { data } = await upsertFieldPermissions({
      expectToFail: false,
      input: {
        roleId: createdRoleId,
        fieldPermissions: [
          {
            objectMetadataId: objectWithNoObjectPermissionMetadataId,
            fieldMetadataId: objectWithNoObjectPermissionFieldMetadataId,
            canReadFieldValue: false,
            canUpdateFieldValue: false,
          },
        ],
      },
    });

    expect(data?.upsertFieldPermissions).toHaveLength(1);
    expect(data?.upsertFieldPermissions?.[0]).toMatchObject({
      objectMetadataId: objectWithNoObjectPermissionMetadataId,
      fieldMetadataId: objectWithNoObjectPermissionFieldMetadataId,
      roleId: createdRoleId,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    });
  });
});
