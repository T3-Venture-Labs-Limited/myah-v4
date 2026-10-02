import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { FlatFieldPermissionValidatorService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-field-permission-validator.service';
import { FlatObjectPermissionValidatorService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-object-permission-validator.service';
import { FlatRolePermissionFlagValidatorService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-role-permission-flag-validator.service';

const owner = '00000000-0000-0000-0000-000000000001';
const foreign = '00000000-0000-0000-0000-000000000002';
const roleId = '00000000-0000-0000-0000-000000000003';
const permissionId = '00000000-0000-0000-0000-000000000004';
const objectId = '00000000-0000-0000-0000-000000000005';
const fieldId = '00000000-0000-0000-0000-000000000006';
const flagId = '00000000-0000-0000-0000-000000000007';

const mapWith = (id: string, entity: object) => ({
  ...createEmptyFlatEntityMaps(),
  byUniversalIdentifier: { [id]: entity },
});

const cases = [
  {
    name: 'object permission',
    service: new FlatObjectPermissionValidatorService(),
    prefix: 'validateFlatObjectPermission',
    permissionMaps: 'flatObjectPermissionMaps',
    entity: {
      universalIdentifier: permissionId,
      roleUniversalIdentifier: roleId,
      objectMetadataUniversalIdentifier: objectId,
    },
    related: {
      flatObjectMetadataMaps: mapWith(objectId, {
        universalIdentifier: objectId,
      }),
    },
    update: { canReadObjectRecords: true },
  },
  {
    name: 'field permission',
    service: new FlatFieldPermissionValidatorService(),
    prefix: 'validateFlatFieldPermission',
    permissionMaps: 'flatFieldPermissionMaps',
    entity: {
      universalIdentifier: permissionId,
      roleUniversalIdentifier: roleId,
      objectMetadataUniversalIdentifier: objectId,
      fieldMetadataUniversalIdentifier: fieldId,
    },
    related: {
      flatObjectMetadataMaps: mapWith(objectId, {
        universalIdentifier: objectId,
      }),
      flatFieldMetadataMaps: mapWith(fieldId, { universalIdentifier: fieldId }),
    },
    update: { canReadFieldValue: true },
  },
  {
    name: 'role permission flag',
    service: new FlatRolePermissionFlagValidatorService(),
    prefix: 'validateFlatRolePermissionFlag',
    permissionMaps: 'flatRolePermissionFlagMaps',
    entity: {
      universalIdentifier: permissionId,
      roleUniversalIdentifier: roleId,
      permissionFlagUniversalIdentifier: flagId,
    },
    related: {
      flatPermissionFlagMaps: mapWith(flagId, { universalIdentifier: flagId }),
    },
    update: { value: true },
  },
] as const;

describe.each(cases)(
  '$name validator',
  ({ service, prefix, permissionMaps, entity, related, update }) => {
    const methods = service as unknown as Record<
      string,
      (args: never) => { errors: { code: string }[] }
    >;

    const validate = (
      action: 'Creation' | 'Update' | 'Deletion',
      system: boolean,
      application = owner,
    ) => {
      const maps = {
        [permissionMaps]:
          action === 'Creation'
            ? createEmptyFlatEntityMaps()
            : mapWith(permissionId, entity),
        flatRoleMaps: mapWith(roleId, {
          universalIdentifier: roleId,
          applicationUniversalIdentifier: owner,
          isEditable: false,
        }),
        ...related,
      };
      return methods[`${prefix}${action}`]({
        flatEntityToValidate: entity,
        universalIdentifier: permissionId,
        flatEntityUpdate: update,
        optimisticFlatEntityMapsAndRelatedFlatEntityMaps: maps,
        buildOptions: {
          isSystemBuild: system,
          applicationUniversalIdentifier: application,
        },
      } as never).errors.map(({ code }) => code);
    };

    it.each(['Creation', 'Update', 'Deletion'] as const)(
      '%s permits trusted system and denies user on noneditable role',
      (action) => {
        expect(validate(action, true)).toEqual([]);
        expect(validate(action, false)).toContain(
          PermissionsExceptionCode.ROLE_NOT_EDITABLE,
        );
      },
    );

    it.each(['Creation', 'Update', 'Deletion'] as const)(
      '%s does not bypass foreign application ownership',
      (action) => {
        expect(validate(action, true, foreign)).toContain(
          PermissionsExceptionCode.ROLE_BELONGS_TO_ANOTHER_APPLICATION,
        );
      },
    );
  },
);

it('still rejects duplicate object permissions during a trusted system build', () => {
  const permission = cases[0].entity;
  const errors = new FlatObjectPermissionValidatorService()
    .validateFlatObjectPermissionCreation({
      flatEntityToValidate: permission,
      optimisticFlatEntityMapsAndRelatedFlatEntityMaps: {
        flatObjectPermissionMaps: mapWith('another-id', {
          ...permission,
          universalIdentifier: 'another-id',
        }),
        flatRoleMaps: mapWith(roleId, {
          universalIdentifier: roleId,
          applicationUniversalIdentifier: owner,
          isEditable: false,
        }),
        ...cases[0].related,
      },
      buildOptions: {
        isSystemBuild: true,
        applicationUniversalIdentifier: owner,
      },
    } as never)
    .errors.map(({ code }) => code);

  expect(errors).toContain(PermissionsExceptionCode.INVALID_SETTING);
});
