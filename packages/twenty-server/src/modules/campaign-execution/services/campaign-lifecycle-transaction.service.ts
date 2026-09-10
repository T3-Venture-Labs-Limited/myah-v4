import { types as nodeUtilTypes } from 'node:util';

import { validate as uuidValidate } from 'uuid';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  type CampaignLifecycleActorPermissionResolverPort,
  type CampaignLifecycleTransactionInput,
  type CampaignLifecycleTransactionOperation,
  type CampaignLifecycleWriteAuthorizationPort,
  type LockedCampaignLifecycleContext,
  type RawCampaignLifecycleProjection,
  type RawWorkspaceCampaignCapacityProjection,
} from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';

const WORKSPACE_LOCK_SQL = `SELECT id, "campaignCapacityTimeZone"
         FROM core.workspace
        WHERE id = $1
        FOR UPDATE`;

const CAMPAIGN_ADVISORY_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))';

type PermissionAwareCampaignRepository = {
  findOne(
    options: {
      lock: { mode: 'pessimistic_write' };
      select: {
        id: true;
        lifecycleStatus: true;
        sequenceAuthorization: true;
      };
      where: { id: string };
    },
    manager: WorkspaceEntityManager,
  ): Promise<RawCampaignLifecycleProjection | null>;
};

const assertCanonicalUuid = (label: string, value: string): void => {
  if (
    typeof value !== 'string' ||
    !uuidValidate(value) ||
    value !== value.toLowerCase()
  ) {
    throw new Error(`${label} must be a canonical lowercase UUID`);
  }
};

type DetachedSnapshotOptions = Readonly<{
  allowDangerousKeys: boolean;
  allowDate: boolean;
  allowUndefined: boolean;
  errorMessage: string;
}>;

type DataDescriptorMap = Readonly<
  Record<string, PropertyDescriptor> & {
    readonly [key: symbol]: PropertyDescriptor;
  }
>;

const DANGEROUS_PROPERTY_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const failSnapshot = (message: string): never => {
  throw new Error(message);
};

const getDataDescriptors = (
  value: unknown,
  errorMessage: string,
): DataDescriptorMap => {
  if (
    value === null ||
    typeof value !== 'object' ||
    nodeUtilTypes.isProxy(value)
  ) {
    return failSnapshot(errorMessage);
  }

  let descriptors: PropertyDescriptorMap;

  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return failSnapshot(errorMessage);
  }

  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof PropertyDescriptorMap];

    if (typeof key !== 'string' || !descriptor || !('value' in descriptor)) {
      return failSnapshot(errorMessage);
    }
  }

  return descriptors as DataDescriptorMap;
};

const defineImmutableOwnProperty = (
  target: object,
  key: string,
  value: unknown,
): void => {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  });
};

const snapshotDetachedValue = (
  value: unknown,
  options: DetachedSnapshotOptions,
  seen = new WeakSet<object>(),
): unknown => {
  if (value === undefined) {
    return options.allowUndefined
      ? undefined
      : failSnapshot(options.errorMessage);
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (typeof value !== 'object' || nodeUtilTypes.isProxy(value)) {
    return failSnapshot(options.errorMessage);
  }

  if (seen.has(value)) {
    return failSnapshot(options.errorMessage);
  }
  seen.add(value);

  if (nodeUtilTypes.isDate(value)) {
    if (!options.allowDate) {
      return failSnapshot(options.errorMessage);
    }

    const timestamp = Date.prototype.getTime.call(value);

    if (!Number.isFinite(timestamp)) {
      return failSnapshot(options.errorMessage);
    }

    return Object.freeze(new Date(timestamp));
  }

  const descriptors = getDataDescriptors(value, options.errorMessage);

  if (Array.isArray(value)) {
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    const keys = Reflect.ownKeys(descriptors);

    if (
      !lengthDescriptor ||
      lengthDescriptor.enumerable ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      keys.length !== length + 1
    ) {
      return failSnapshot(options.errorMessage);
    }

    const clone: unknown[] = [];

    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];

      if (!descriptor?.enumerable || !('value' in descriptor)) {
        return failSnapshot(options.errorMessage);
      }

      defineImmutableOwnProperty(
        clone,
        String(index),
        snapshotDetachedValue(descriptor.value, options, seen),
      );
    }

    return Object.freeze(clone);
  }

  const clone = Object.create(null) as Record<string, unknown>;

  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') {
      return failSnapshot(options.errorMessage);
    }

    const descriptor = descriptors[key];

    if (
      !descriptor.enumerable ||
      (!options.allowDangerousKeys && DANGEROUS_PROPERTY_KEYS.has(key))
    ) {
      return failSnapshot(options.errorMessage);
    }

    defineImmutableOwnProperty(
      clone,
      key,
      snapshotDetachedValue(descriptor.value, options, seen),
    );
  }

  return Object.freeze(clone);
};

const getExactRecordValues = (
  value: unknown,
  expectedKeys: readonly string[],
  errorMessage: string,
): Readonly<Record<string, unknown>> => {
  if (Array.isArray(value) || nodeUtilTypes.isDate(value)) {
    return failSnapshot(errorMessage);
  }

  const descriptors = getDataDescriptors(value, errorMessage);
  const keys = Reflect.ownKeys(descriptors);

  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(descriptors, key),
    )
  ) {
    return failSnapshot(errorMessage);
  }

  const values = Object.create(null) as Record<string, unknown>;

  for (const key of expectedKeys) {
    const descriptor = descriptors[key];

    if (!descriptor?.enumerable || !('value' in descriptor)) {
      return failSnapshot(errorMessage);
    }

    defineImmutableOwnProperty(values, key, descriptor.value);
  }

  return Object.freeze(values);
};

const snapshotWorkspaceAuthContext = (value: unknown): WorkspaceAuthContext => {
  const errorMessage = 'Campaign lifecycle auth context was invalid';
  const snapshot = snapshotDetachedValue(value, {
    allowDangerousKeys: false,
    allowDate: true,
    allowUndefined: true,
    errorMessage,
  }) as Readonly<Record<string, unknown>>;
  const workspace = snapshot.workspace as
    | Readonly<Record<string, unknown>>
    | undefined;

  if (
    !workspace ||
    typeof workspace !== 'object' ||
    typeof workspace.id !== 'string' ||
    ![
      'apiKey',
      'application',
      'pendingActivationUser',
      'system',
      'user',
    ].includes(snapshot.type as string)
  ) {
    return failSnapshot(errorMessage);
  }

  if (
    snapshot.workspaceMetadataVersion !== undefined &&
    typeof snapshot.workspaceMetadataVersion !== 'string'
  ) {
    return failSnapshot(errorMessage);
  }

  const hasOnlyAuthKeys = (allowedKeys: readonly string[]) =>
    Object.keys(snapshot).every((key) => allowedKeys.includes(key));
  const baseKeys = ['type', 'workspace', 'workspaceMetadataVersion'];

  switch (snapshot.type) {
    case 'apiKey':
      if (
        !hasOnlyAuthKeys([...baseKeys, 'apiKey']) ||
        !snapshot.apiKey ||
        typeof snapshot.apiKey !== 'object'
      ) {
        return failSnapshot(errorMessage);
      }
      break;
    case 'application':
      if (
        !hasOnlyAuthKeys([
          ...baseKeys,
          'application',
          'userWorkspaceId',
          'user',
          'workspaceMemberId',
          'workspaceMember',
        ]) ||
        !snapshot.application ||
        typeof snapshot.application !== 'object' ||
        (snapshot.userWorkspaceId !== undefined &&
          typeof snapshot.userWorkspaceId !== 'string') ||
        (snapshot.user !== undefined && typeof snapshot.user !== 'object') ||
        (snapshot.workspaceMemberId !== undefined &&
          typeof snapshot.workspaceMemberId !== 'string') ||
        (snapshot.workspaceMember !== undefined &&
          typeof snapshot.workspaceMember !== 'object')
      ) {
        return failSnapshot(errorMessage);
      }
      break;
    case 'pendingActivationUser':
      if (
        !hasOnlyAuthKeys([...baseKeys, 'userWorkspaceId', 'user']) ||
        typeof snapshot.userWorkspaceId !== 'string' ||
        !snapshot.user ||
        typeof snapshot.user !== 'object'
      ) {
        return failSnapshot(errorMessage);
      }
      break;
    case 'system':
      if (!hasOnlyAuthKeys(baseKeys)) {
        return failSnapshot(errorMessage);
      }
      break;
    case 'user':
      if (
        !hasOnlyAuthKeys([
          ...baseKeys,
          'userWorkspaceId',
          'user',
          'workspaceMemberId',
          'workspaceMember',
        ]) ||
        typeof snapshot.userWorkspaceId !== 'string' ||
        !snapshot.user ||
        typeof snapshot.user !== 'object' ||
        typeof snapshot.workspaceMemberId !== 'string' ||
        !snapshot.workspaceMember ||
        typeof snapshot.workspaceMember !== 'object'
      ) {
        return failSnapshot(errorMessage);
      }
      break;
  }

  return snapshot as unknown as WorkspaceAuthContext;
};

const snapshotTransactionInput = (
  value: CampaignLifecycleTransactionInput,
): Readonly<{
  authContext: WorkspaceAuthContext;
  campaignId: string;
  workspaceId: string;
}> => {
  const errorMessage = 'Campaign lifecycle transaction input was invalid';
  const values = getExactRecordValues(
    value,
    ['authContext', 'campaignId', 'workspaceId'],
    errorMessage,
  );

  if (
    typeof values.campaignId !== 'string' ||
    typeof values.workspaceId !== 'string'
  ) {
    return failSnapshot(errorMessage);
  }

  return Object.freeze({
    authContext: snapshotWorkspaceAuthContext(values.authContext),
    campaignId: values.campaignId,
    workspaceId: values.workspaceId,
  });
};

const snapshotRolePermissionConfig = (
  value: RolePermissionConfig,
  authContext: WorkspaceAuthContext,
): RolePermissionConfig => {
  const errorMessage = 'Actor permission resolution was invalid';

  if (Array.isArray(value) || nodeUtilTypes.isDate(value)) {
    return failSnapshot(errorMessage);
  }

  const descriptors = getDataDescriptors(value, errorMessage);
  const keys = Reflect.ownKeys(descriptors);

  if (keys.length !== 1 || typeof keys[0] !== 'string') {
    return failSnapshot(errorMessage);
  }

  const key = keys[0];
  const descriptor = descriptors[key];

  if (!descriptor?.enumerable || !('value' in descriptor)) {
    return failSnapshot(errorMessage);
  }

  if (key === 'shouldBypassPermissionChecks' && descriptor.value === true) {
    if (authContext.type !== 'system') {
      throw new Error('Permission bypass requires a system actor');
    }

    const snapshot = Object.create(null) as {
      shouldBypassPermissionChecks: true;
    };

    defineImmutableOwnProperty(snapshot, key, true);
    return Object.freeze(snapshot);
  }

  if (key !== 'intersectionOf' && key !== 'unionOf') {
    return failSnapshot(errorMessage);
  }

  const roleIds = snapshotDetachedValue(descriptor.value, {
    allowDangerousKeys: false,
    allowDate: false,
    allowUndefined: false,
    errorMessage,
  });

  if (!Array.isArray(roleIds)) {
    return failSnapshot(errorMessage);
  }

  for (const roleId of roleIds) {
    if (typeof roleId !== 'string') {
      return failSnapshot(errorMessage);
    }
  }

  const snapshot = Object.create(null) as Record<string, unknown>;

  defineImmutableOwnProperty(snapshot, key, roleIds);
  return Object.freeze(snapshot) as RolePermissionConfig;
};

const getQueryRows = (result: unknown): readonly unknown[] => {
  const errorMessage = 'Workspace lock query result was invalid';
  const rows = snapshotDetachedValue(result, {
    allowDangerousKeys: false,
    allowDate: false,
    allowUndefined: false,
    errorMessage,
  });

  if (!Array.isArray(rows)) {
    return failSnapshot(errorMessage);
  }

  if (rows.length > 0 && Array.isArray(rows[0])) {
    return rows[0];
  }

  return rows;
};

const snapshotWorkspaceProjection = (
  value: unknown,
): RawWorkspaceCampaignCapacityProjection => {
  const errorMessage = 'Workspace lock projection was invalid';
  const values = getExactRecordValues(
    value,
    ['campaignCapacityTimeZone', 'id'],
    errorMessage,
  );

  if (
    typeof values.id !== 'string' ||
    (values.campaignCapacityTimeZone !== null &&
      typeof values.campaignCapacityTimeZone !== 'string')
  ) {
    return failSnapshot(errorMessage);
  }

  const snapshot = Object.create(null) as Record<string, unknown>;

  defineImmutableOwnProperty(
    snapshot,
    'campaignCapacityTimeZone',
    values.campaignCapacityTimeZone,
  );
  defineImmutableOwnProperty(snapshot, 'id', values.id);

  return Object.freeze(
    snapshot,
  ) as unknown as RawWorkspaceCampaignCapacityProjection;
};

const snapshotCampaignProjection = (
  value: unknown,
): RawCampaignLifecycleProjection => {
  const errorMessage = 'Campaign lock projection was invalid';
  const values = getExactRecordValues(
    value,
    ['id', 'lifecycleStatus', 'sequenceAuthorization'],
    errorMessage,
  );

  if (
    typeof values.id !== 'string' ||
    (values.lifecycleStatus !== null &&
      typeof values.lifecycleStatus !== 'string')
  ) {
    return failSnapshot(errorMessage);
  }

  const snapshot = Object.create(null) as Record<string, unknown>;

  defineImmutableOwnProperty(snapshot, 'id', values.id);
  defineImmutableOwnProperty(
    snapshot,
    'lifecycleStatus',
    values.lifecycleStatus,
  );
  defineImmutableOwnProperty(
    snapshot,
    'sequenceAuthorization',
    snapshotDetachedValue(values.sequenceAuthorization, {
      allowDangerousKeys: true,
      allowDate: false,
      allowUndefined: false,
      errorMessage,
    }),
  );

  return Object.freeze(snapshot) as unknown as RawCampaignLifecycleProjection;
};

const assertActiveTransactionManager = (manager: WorkspaceEntityManager) => {
  const queryRunner = manager.queryRunner;

  if (
    !queryRunner ||
    queryRunner.isTransactionActive !== true ||
    queryRunner.isReleased
  ) {
    throw new Error(
      'Campaign lifecycle transaction requires an active, unreleased query runner',
    );
  }

  if (queryRunner.manager !== manager) {
    throw new Error(
      'Campaign lifecycle transaction manager must own its query runner',
    );
  }

  return queryRunner;
};

export class CampaignLifecycleTransactionService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly actorPermissionResolver: CampaignLifecycleActorPermissionResolverPort,
    private readonly writeAuthorization: CampaignLifecycleWriteAuthorizationPort,
  ) {}

  async run<T>(
    input: CampaignLifecycleTransactionInput,
    operation: CampaignLifecycleTransactionOperation<T>,
  ): Promise<T> {
    // Snapshot every caller-owned value before the first await. Nothing below
    // reads through input or its nested aliases.
    const { authContext, campaignId, workspaceId } =
      snapshotTransactionInput(input);

    assertCanonicalUuid('workspaceId', workspaceId);
    assertCanonicalUuid('campaignId', campaignId);

    if (authContext.workspace.id !== workspaceId) {
      throw new Error(
        'Actor permission context does not match workspace scope',
      );
    }

    const schemaName = getWorkspaceSchemaName(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const resolvedRolePermissionConfig =
          await this.actorPermissionResolver.resolveRolePermissionConfig(
            Object.freeze({
              authContext,
              workspaceId,
            }),
          );

        if (resolvedRolePermissionConfig === null) {
          throw new Error('Actor permission resolution failed');
        }

        const rolePermissionConfig = snapshotRolePermissionConfig(
          resolvedRolePermissionConfig,
          authContext,
        );
        const actorPermissionContext = Object.freeze({
          authContext,
          rolePermissionConfig,
        });
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

        return dataSource.transaction(
          async (manager: WorkspaceEntityManager) => {
            const queryRunner = assertActiveTransactionManager(manager);
            const workspaceRows = getQueryRows(
              await queryRunner.query(WORKSPACE_LOCK_SQL, [workspaceId]),
            );

            if (workspaceRows.length !== 1) {
              throw new Error('Workspace was not found in the requested scope');
            }

            const workspace = snapshotWorkspaceProjection(workspaceRows[0]);

            if (workspace.id !== workspaceId) {
              throw new Error('Workspace was not found in the requested scope');
            }

            await queryRunner.query(CAMPAIGN_ADVISORY_LOCK_SQL, [
              workspaceId,
              campaignId,
            ]);

            const campaignRepository =
              // SAFETY: the selected dynamic Campaign fields exactly match this
              // read-only projection, and WorkspaceRepository accepts the supplied manager.
              (await this.globalWorkspaceOrmManager.getRepository<{
                id: string;
              }>(
                workspaceId,
                'campaign',
                rolePermissionConfig,
              )) as unknown as PermissionAwareCampaignRepository;
            const rawCampaign = await campaignRepository.findOne(
              {
                lock: { mode: 'pessimistic_write' },
                select: {
                  id: true,
                  lifecycleStatus: true,
                  sequenceAuthorization: true,
                },
                where: { id: campaignId },
              },
              manager,
            );

            if (!rawCampaign) {
              throw new Error('Campaign was not found in the requested scope');
            }

            const campaign = snapshotCampaignProjection(rawCampaign);

            if (campaign.id !== campaignId) {
              throw new Error('Campaign was not found in the requested scope');
            }

            const context: LockedCampaignLifecycleContext = Object.freeze({
              actorPermissionContext,
              campaign,
              campaignId,
              manager,
              schemaName,
              workspace,
              workspaceId,
            });

            await this.writeAuthorization.assertCampaignWriteAllowedInTransaction(
              context,
            );

            return operation(context);
          },
        );
      },
      authContext,
    );
  }
}
