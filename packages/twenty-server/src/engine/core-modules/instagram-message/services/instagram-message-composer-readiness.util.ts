import { FieldMetadataType } from 'twenty-shared/types';

import {
  INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS,
  INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/engine/api/common/common-args-processors/data-arg-processor/utils/assert-instagram-composer-fields-not-written.util';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export const INSTAGRAM_COMPOSER_STORAGE_FIELDS = [
  {
    universalIdentifier:
      INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS.composerInputDigest,
    name: 'composerInputDigest',
    type: FieldMetadataType.TEXT,
    storageType: 'text',
  },
  {
    universalIdentifier:
      INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS.instagramMessageSnapshot,
    name: 'instagramMessageSnapshot',
    type: FieldMetadataType.RAW_JSON,
    storageType: 'jsonb',
  },
] as const;

/** Only fresh/receipt-less paths call this; historical core receipts need no app. */
export const isInstagramComposerReady = async (
  manager: GlobalWorkspaceOrmManager,
  workspaceId: string,
): Promise<boolean> => {
  const context = getWorkspaceContext();
  const object =
    context.flatObjectMetadataMaps.byUniversalIdentifier[
      INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER
    ];
  if (
    context.authContext.workspace.id !== workspaceId ||
    !object ||
    object.universalIdentifier !==
      INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER ||
    object.workspaceId !== workspaceId ||
    object.nameSingular !== 'myahInstagramReplyDraft' ||
    !object.isActive ||
    !object.applicationId ||
    context.objectIdByNameSingular.myahInstagramReplyDraft !== object.id
  )
    return false;

  for (const expected of INSTAGRAM_COMPOSER_STORAGE_FIELDS) {
    const field =
      context.flatFieldMetadataMaps.byUniversalIdentifier[
        expected.universalIdentifier
      ];
    if (
      !field ||
      field.universalIdentifier !== expected.universalIdentifier ||
      field.workspaceId !== workspaceId ||
      field.objectMetadataId !== object.id ||
      field.applicationId !== object.applicationId ||
      !object.fieldIds.includes(field.id) ||
      field.name !== expected.name ||
      field.type !== expected.type ||
      !field.isActive ||
      field.isNullable !== true
    )
      return false;
  }

  const dataSource = await manager.getGlobalWorkspaceDataSource();
  // applicationId is installation-local, not the application's universal ID.
  const applications = await dataSource.query<Array<{ id: string }>>(
    `SELECT "id" FROM core.application
     WHERE "id" = $1 AND "workspaceId" = $2
       AND "universalIdentifier" = $3 AND "deletedAt" IS NULL`,
    [
      object.applicationId,
      workspaceId,
      INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER,
    ],
    undefined,
    { shouldBypassPermissionChecks: true },
  );
  if (applications.length !== 1 || applications[0].id !== object.applicationId)
    return false;

  const columns = await dataSource.query<
    Array<{
      column_name: string;
      udt_name: string;
      is_nullable: string;
    }>
  >(
    `SELECT c.column_name, c.udt_name, c.is_nullable
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = $1 AND c.table_name = '_myahInstagramReplyDraft'
       AND t.table_type = 'BASE TABLE' AND c.column_name = ANY($2)`,
    [
      getWorkspaceSchemaName(workspaceId),
      INSTAGRAM_COMPOSER_STORAGE_FIELDS.map((field) => field.name),
    ],
    undefined,
    { shouldBypassPermissionChecks: true },
  );
  return (
    columns.length === INSTAGRAM_COMPOSER_STORAGE_FIELDS.length &&
    INSTAGRAM_COMPOSER_STORAGE_FIELDS.every((expected) =>
      columns.some(
        (column) =>
          column.column_name === expected.name &&
          column.udt_name === expected.storageType &&
          column.is_nullable === 'YES',
      ),
    )
  );
};

export const assertInstagramComposerReady = async (
  manager: GlobalWorkspaceOrmManager,
  workspaceId: string,
): Promise<void> => {
  if (!(await isInstagramComposerReady(manager, workspaceId))) {
    throw new Error('Instagram composer metadata is unavailable');
  }
};
