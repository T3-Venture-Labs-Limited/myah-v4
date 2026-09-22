import { ForbiddenException } from '@nestjs/common';

export const PRODUCT_SCHEMA_WRITE_AUTHORITY = Symbol(
  'PRODUCT_SCHEMA_WRITE_AUTHORITY',
);

export type ProductSchemaWriteAuthority = typeof PRODUCT_SCHEMA_WRITE_AUTHORITY;

export function assertProductSchemaWriteAuthority(
  authority: unknown,
): asserts authority is ProductSchemaWriteAuthority {
  if (authority !== PRODUCT_SCHEMA_WRITE_AUTHORITY) {
    throw new ForbiddenException(
      'Schema definitions are managed by the product and cannot be changed by customers',
    );
  }
}

type FlatEntityOperation = {
  flatEntityToCreate: Record<string, unknown>;
  flatEntityToDelete: Record<string, unknown>;
  flatEntityToUpdate: Record<string, unknown>;
};

export const assertProductSchemaWriteAuthorityForOperations = (
  operations: {
    objectMetadata?: FlatEntityOperation;
    fieldMetadata?: FlatEntityOperation;
  },
  authority: unknown,
): void => {
  const hasSchemaWrite = [
    operations.objectMetadata,
    operations.fieldMetadata,
  ].some(
    (operation) =>
      operation !== undefined &&
      [
        operation.flatEntityToCreate,
        operation.flatEntityToDelete,
        operation.flatEntityToUpdate,
      ].some((entities) => Object.keys(entities).length > 0),
  );

  if (hasSchemaWrite) assertProductSchemaWriteAuthority(authority);
};
