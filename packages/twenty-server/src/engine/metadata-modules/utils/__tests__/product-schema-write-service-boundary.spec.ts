import { ForbiddenException } from '@nestjs/common';

import { ApplicationSyncService } from 'src/engine/core-modules/application/application-manifest/application-sync.service';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';

const workspaceId = 'workspace-id';
const objectService = Object.create(
  ObjectMetadataService.prototype,
) as ObjectMetadataService;
const fieldService = Object.create(
  FieldMetadataService.prototype,
) as FieldMetadataService;
const applicationSyncService = Object.create(
  ApplicationSyncService.prototype,
) as ApplicationSyncService;

describe('product schema write service boundary', () => {
  it.each([
    [
      'object create',
      () =>
        objectService.createOneObject({
          workspaceId,
          createObjectInput: {} as never,
        }),
    ],
    [
      'object update',
      () =>
        objectService.updateOneObject({
          workspaceId,
          updateObjectInput: {} as never,
        }),
    ],
    [
      'object delete with a forged system flag',
      () =>
        objectService.deleteOneObject({
          workspaceId,
          deleteObjectInput: {} as never,
          isSystemBuild: true,
        }),
    ],
    [
      'field create',
      () =>
        fieldService.createOneField({
          workspaceId,
          createFieldInput: {} as never,
        }),
    ],
    [
      'field bulk create with a forged system flag',
      () =>
        fieldService.createManyFields({
          workspaceId,
          createFieldInputs: [{} as never],
          isSystemBuild: true,
        }),
    ],
    [
      'field update with a forged system flag',
      () =>
        fieldService.updateOneField({
          workspaceId,
          updateFieldInput: {} as never,
          isSystemBuild: true,
        }),
    ],
    [
      'field delete with a forged system flag',
      () =>
        fieldService.deleteOneField({
          workspaceId,
          deleteOneFieldInput: {} as never,
          isSystemBuild: true,
        }),
    ],
    [
      'application manifest schema install with forged authority',
      () =>
        applicationSyncService.synchronizeFromManifest({
          workspaceId,
          manifest: { objects: [{}], fields: [] } as never,
          schemaWriteAuthority: { isSystemBuild: true } as never,
        }),
    ],
  ])('denies untrusted %s before reading metadata', async (_name, mutate) => {
    await expect(mutate()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
