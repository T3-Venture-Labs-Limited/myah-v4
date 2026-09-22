import { ForbiddenException } from '@nestjs/common';

import {
  assertProductSchemaWriteAuthority,
  assertProductSchemaWriteAuthorityForOperations,
  PRODUCT_SCHEMA_WRITE_AUTHORITY,
} from 'src/engine/metadata-modules/utils/product-schema-write-authority.util';

const schemaOperation = () => ({
  flatEntityToCreate: { entity: {} },
  flatEntityToDelete: {},
  flatEntityToUpdate: {},
});

const emptyOperation = () => ({
  flatEntityToCreate: {},
  flatEntityToDelete: {},
  flatEntityToUpdate: {},
});

describe('product schema write authority', () => {
  it.each([
    undefined,
    true,
    'system',
    { isSystemBuild: true },
    Symbol('PRODUCT_SCHEMA_WRITE_AUTHORITY'),
  ])('rejects forged authority %#', (authority) => {
    expect(() => assertProductSchemaWriteAuthority(authority)).toThrow(
      ForbiddenException,
    );
  });

  it('accepts only the server-owned authority token', () => {
    expect(() =>
      assertProductSchemaWriteAuthority(PRODUCT_SCHEMA_WRITE_AUTHORITY),
    ).not.toThrow();
  });

  it.each(['objectMetadata', 'fieldMetadata'] as const)(
    'rejects %s writes from application manifests without authority',
    (metadataName) => {
      expect(() =>
        assertProductSchemaWriteAuthorityForOperations(
          { [metadataName]: schemaOperation() },
          undefined,
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('allows schema-free manifests without authority', () => {
    expect(() =>
      assertProductSchemaWriteAuthorityForOperations(
        {
          objectMetadata: emptyOperation(),
          fieldMetadata: emptyOperation(),
        },
        undefined,
      ),
    ).not.toThrow();
  });
});
