import { types as nodeUtilTypes } from 'node:util';

import { IANA_TIME_ZONES } from 'twenty-shared/constants';
import { type EntityManager, type QueryRunner } from 'typeorm';
import { validate as uuidValidate } from 'uuid';

import {
  type WorkspaceCampaignCapacityTimeZoneAuthorizationPort,
  type WorkspaceCampaignCapacityTimeZoneMutationInput,
  type WorkspaceCampaignCapacityTimeZoneMutationResult,
  type WorkspaceCampaignCapacityTimeZoneReadInput,
  type WorkspaceCampaignCapacityTimeZoneReadResult,
} from 'src/engine/core-modules/myah/types/workspace-campaign-capacity-time-zone.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const WORKSPACE_LOCK_SQL = `SELECT id, "campaignCapacityTimeZone"
         FROM core.workspace
        WHERE id = $1
        FOR UPDATE`;
const CAMPAIGN_METADATA_SQL = `SELECT c.relkind AS "relationKind",
       c.relrowsecurity AS "rowSecurityEnabled",
       c.relforcerowsecurity AS "forceRowSecurityEnabled",
       COUNT(a.attname)::integer AS "requiredColumnCount"
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
   AND a.attname IN ('id', 'lifecycleStatus', 'deletedAt')
 WHERE n.nspname = $1
   AND c.relname = 'campaign'
 GROUP BY c.relkind, c.relrowsecurity, c.relforcerowsecurity`;
const WORKSPACE_UPDATE_SQL = `UPDATE core.workspace
   SET "campaignCapacityTimeZone" = $2
 WHERE id = $1
   AND "campaignCapacityTimeZone" IS NOT DISTINCT FROM $3
 RETURNING id, "campaignCapacityTimeZone"`;

const SUPPORTED_TIME_ZONES = new Set<string>(IANA_TIME_ZONES);
const CAMPAIGN_LIFECYCLE_STATUSES = new Set([
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
]);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type DataRecord = Readonly<Record<string, unknown>>;

type WorkspaceRow = Readonly<{
  id: string;
  campaignCapacityTimeZone: string | null;
}>;

const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  uuidValidate(value) &&
  value === value.toLowerCase();

const isSupportedTimeZone = (value: unknown): value is string =>
  typeof value === 'string' && SUPPORTED_TIME_ZONES.has(value);

const readDataRecord = (value: unknown): DataRecord | null => {
  if (
    value === null ||
    typeof value !== 'object' ||
    nodeUtilTypes.isProxy(value) ||
    Array.isArray(value)
  ) {
    return null;
  }

  let descriptors: PropertyDescriptorMap;

  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }

  const record = Object.create(null) as Record<string, unknown>;

  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof PropertyDescriptorMap];

    if (
      typeof key !== 'string' ||
      DANGEROUS_KEYS.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      return null;
    }

    Object.defineProperty(record, key, {
      configurable: false,
      enumerable: true,
      value: descriptor.value,
      writable: false,
    });
  }

  return Object.freeze(record);
};

const readExactRecord = (
  value: unknown,
  expectedKeys: readonly string[],
): DataRecord | null => {
  const record = readDataRecord(value);

  if (record === null) {
    return null;
  }

  const keys = Object.keys(record);

  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(record, key),
    )
  ) {
    return null;
  }

  return record;
};

const readDenseArray = (value: unknown): readonly unknown[] | null => {
  if (nodeUtilTypes.isProxy(value) || !Array.isArray(value)) {
    return null;
  }

  let descriptors: PropertyDescriptorMap;

  try {
    descriptors = Object.getOwnPropertyDescriptors(
      value,
    ) as unknown as PropertyDescriptorMap;
  } catch {
    return null;
  }

  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor?.value;

  if (
    !lengthDescriptor ||
    lengthDescriptor.enumerable ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    Reflect.ownKeys(descriptors).length !== length + 1
  ) {
    return null;
  }

  const rows: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];

    if (!descriptor?.enumerable || !('value' in descriptor)) {
      return null;
    }

    rows.push(descriptor.value);
  }

  return Object.freeze(rows);
};

const snapshotReadInput = (
  input: WorkspaceCampaignCapacityTimeZoneReadInput,
): WorkspaceCampaignCapacityTimeZoneReadInput => {
  const record = readExactRecord(input, ['workspaceId']);

  if (record === null || !isCanonicalUuid(record.workspaceId)) {
    throw new Error('Workspace capacity timezone read input was invalid');
  }

  return Object.freeze({ workspaceId: record.workspaceId });
};

const snapshotMutationInput = (
  input: WorkspaceCampaignCapacityTimeZoneMutationInput,
): WorkspaceCampaignCapacityTimeZoneMutationInput => {
  const record = readExactRecord(input, [
    'workspaceId',
    'campaignCapacityTimeZone',
  ]);

  if (
    record === null ||
    !isCanonicalUuid(record.workspaceId) ||
    (record.campaignCapacityTimeZone !== null &&
      !isSupportedTimeZone(record.campaignCapacityTimeZone))
  ) {
    throw new Error('Workspace capacity timezone mutation input was invalid');
  }

  return Object.freeze({
    workspaceId: record.workspaceId,
    campaignCapacityTimeZone: record.campaignCapacityTimeZone,
  });
};

const getCallerOwnedQueryRunner = (manager: EntityManager): QueryRunner => {
  const queryRunner = manager.queryRunner;

  if (
    queryRunner === undefined ||
    queryRunner === null ||
    queryRunner.isReleased ||
    !queryRunner.isTransactionActive ||
    queryRunner.manager !== manager
  ) {
    throw new Error(
      'Workspace capacity timezone requires an active caller-owned transaction manager',
    );
  }

  return queryRunner;
};

const buildCampaignScanSql = (
  schemaName: string,
): string => `SELECT id, "lifecycleStatus"
  FROM "${schemaName}"."campaign"
 WHERE "deletedAt" IS NULL
 ORDER BY id ASC`;

const parseWorkspaceRow = (
  value: unknown,
  workspaceId: string,
): WorkspaceRow | null => {
  const record = readExactRecord(value, ['id', 'campaignCapacityTimeZone']);

  if (
    record === null ||
    record.id !== workspaceId ||
    (record.campaignCapacityTimeZone !== null &&
      typeof record.campaignCapacityTimeZone !== 'string')
  ) {
    return null;
  }

  return Object.freeze({
    id: workspaceId,
    campaignCapacityTimeZone: record.campaignCapacityTimeZone,
  });
};

const parseSingleWorkspaceRow = (
  value: unknown,
  workspaceId: string,
): WorkspaceRow | null => {
  const rows = readDenseArray(value);

  return rows?.length === 1 ? parseWorkspaceRow(rows[0], workspaceId) : null;
};

const isCompleteCampaignMetadata = (value: unknown): boolean => {
  const rows = readDenseArray(value);

  if (rows?.length !== 1) {
    return false;
  }

  const record = readExactRecord(rows[0], [
    'relationKind',
    'rowSecurityEnabled',
    'forceRowSecurityEnabled',
    'requiredColumnCount',
  ]);

  return (
    record !== null &&
    (record.relationKind === 'r' || record.relationKind === 'p') &&
    record.rowSecurityEnabled === false &&
    record.forceRowSecurityEnabled === false &&
    record.requiredColumnCount === 3
  );
};

const inspectCampaignRows = (
  value: unknown,
): 'COMPLETE' | 'ACTIVE' | 'INCOMPLETE' => {
  const rows = readDenseArray(value);

  if (rows === null) {
    return 'INCOMPLETE';
  }

  const seenIds = new Set<string>();
  let containsActive = false;

  for (const row of rows) {
    const record = readExactRecord(row, ['id', 'lifecycleStatus']);

    if (
      record === null ||
      !isCanonicalUuid(record.id) ||
      typeof record.lifecycleStatus !== 'string' ||
      !CAMPAIGN_LIFECYCLE_STATUSES.has(record.lifecycleStatus) ||
      seenIds.has(record.id)
    ) {
      return 'INCOMPLETE';
    }

    seenIds.add(record.id);
    containsActive ||= record.lifecycleStatus === 'ACTIVE';
  }

  return containsActive ? 'ACTIVE' : 'COMPLETE';
};

const parseStructuredWorkspaceUpdate = (
  value: unknown,
  workspaceId: string,
  campaignCapacityTimeZone: string | null,
): WorkspaceRow | null => {
  const result = readDataRecord(value);

  if (result === null || result.affected !== 1) {
    return null;
  }

  const records = readDenseArray(result.records);
  const row =
    records?.length === 1 ? parseWorkspaceRow(records[0], workspaceId) : null;

  return row?.campaignCapacityTimeZone === campaignCapacityTimeZone
    ? row
    : null;
};

export class WorkspaceCampaignCapacityTimeZoneService {
  constructor(
    private readonly authorization: WorkspaceCampaignCapacityTimeZoneAuthorizationPort,
  ) {}

  async readCampaignCapacityTimeZoneInTransaction(
    input: WorkspaceCampaignCapacityTimeZoneReadInput,
    manager: EntityManager,
  ): Promise<WorkspaceCampaignCapacityTimeZoneReadResult> {
    const detachedInput = snapshotReadInput(input);

    const queryRunner = getCallerOwnedQueryRunner(manager);

    await this.authorization.assertReadAllowedInTransaction(
      detachedInput,
      manager,
    );

    const workspace = parseSingleWorkspaceRow(
      await queryRunner.query(WORKSPACE_LOCK_SQL, [detachedInput.workspaceId]),
      detachedInput.workspaceId,
    );

    if (workspace === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'WORKSPACE_SCOPE_UNAVAILABLE',
      });
    }

    if (workspace.campaignCapacityTimeZone === null) {
      return Object.freeze({ status: 'BLOCKED', reason: 'NOT_CONFIGURED' });
    }

    if (!isSupportedTimeZone(workspace.campaignCapacityTimeZone)) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'INVALID_STORED_TIME_ZONE',
      });
    }

    return Object.freeze({
      status: 'CONFIGURED',
      campaignCapacityTimeZone: workspace.campaignCapacityTimeZone,
    });
  }

  async setCampaignCapacityTimeZoneInTransaction(
    input: WorkspaceCampaignCapacityTimeZoneMutationInput,
    manager: EntityManager,
  ): Promise<WorkspaceCampaignCapacityTimeZoneMutationResult> {
    const detachedInput = snapshotMutationInput(input);

    const queryRunner = getCallerOwnedQueryRunner(manager);

    await this.authorization.assertMutationAllowedInTransaction(
      detachedInput,
      manager,
    );

    const workspace = parseSingleWorkspaceRow(
      await queryRunner.query(WORKSPACE_LOCK_SQL, [detachedInput.workspaceId]),
      detachedInput.workspaceId,
    );

    if (workspace === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'WORKSPACE_SCOPE_UNAVAILABLE',
      });
    }

    const schemaName = getWorkspaceSchemaName(detachedInput.workspaceId);
    const metadata = await queryRunner.query(CAMPAIGN_METADATA_SQL, [
      schemaName,
    ]);

    if (!isCompleteCampaignMetadata(metadata)) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_SCAN_INCOMPLETE',
      });
    }

    const campaignInspection = inspectCampaignRows(
      await queryRunner.query(buildCampaignScanSql(schemaName), []),
    );

    if (campaignInspection === 'INCOMPLETE') {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_SCAN_INCOMPLETE',
      });
    }

    if (campaignInspection === 'ACTIVE') {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'ACTIVE_CAMPAIGN_EXISTS',
      });
    }

    if (
      workspace.campaignCapacityTimeZone ===
      detachedInput.campaignCapacityTimeZone
    ) {
      return Object.freeze({
        status: 'UNCHANGED',
        campaignCapacityTimeZone: detachedInput.campaignCapacityTimeZone,
      });
    }

    const updatedWorkspace = parseStructuredWorkspaceUpdate(
      await queryRunner.query(
        WORKSPACE_UPDATE_SQL,
        [
          detachedInput.workspaceId,
          detachedInput.campaignCapacityTimeZone,
          workspace.campaignCapacityTimeZone,
        ],
        true,
      ),
      detachedInput.workspaceId,
      detachedInput.campaignCapacityTimeZone,
    );

    if (updatedWorkspace === null) {
      throw new Error('Workspace capacity timezone update was inconsistent');
    }

    return Object.freeze({
      status: 'UPDATED',
      campaignCapacityTimeZone: updatedWorkspace.campaignCapacityTimeZone,
    });
  }
}
