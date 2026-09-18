import { ForbiddenException, Injectable } from '@nestjs/common';

import { EntityMetadataNotFoundError } from 'typeorm/error/EntityMetadataNotFoundError';

import {
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

type PermissionAwareQueryBuilder = {
  select: (selection: string) => PermissionAwareQueryBuilder;
  where: (condition: string) => PermissionAwareQueryBuilder;
  validatePermissionsBeforeSerialization: () => void;
  getQueryAndParameters: () => [string, unknown[]];
};

type PermissionAwareRepository = {
  createQueryBuilder: (alias: string) => PermissionAwareQueryBuilder;
};

type SerializedReadCapabilityQuery = {
  sql: string;
  parameters: unknown[];
};

const unavailable = (): never => {
  throw new ForbiddenException(
    'Triage is unavailable with your current Inbox access',
  );
};

const isExpectedCapabilityDenial = (error: unknown): boolean =>
  (error instanceof PermissionsException &&
    error.code === PermissionsExceptionCode.PERMISSION_DENIED) ||
  error instanceof EntityMetadataNotFoundError;

const normalizeSerializedSql = (sql: string): string =>
  sql.replace(/\$\d+/g, '$?').replace(/\s+/g, ' ').trim();

const readCapabilitySources = [
  ['messageThread', 'message_thread', 'messageThread'],
  ['myahSocialConversation', 'social_conversation', '_myahSocialConversation'],
  ['myahSocialMessage', 'social_message', '_myahSocialMessage'],
] as const;

const canonicalUnrestrictedReadSql = ({
  alias,
  tableName,
  workspaceId,
}: {
  alias: string;
  tableName: string;
  workspaceId: string;
}): string =>
  `SELECT "${alias}"."id" AS "${alias}_id" FROM "${getWorkspaceSchemaName(workspaceId)}"."${tableName}" "${alias}"`;

// This removes exactly the explicit capability predicate and TypeORM's
// equivalent DeleteDateColumn predicate. Any other WHERE/AND condition remains
// a record-visibility restriction.
const removeDeletedAtPredicate = (sql: string, alias: string): string => {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const deletedAt = `(?:\\(\\s*)?(?:"?${escapedAlias}"?\\.)?"deletedAt"\\s+IS\\s+NULL(?:\\s*\\))?`;
  const leadingDeletedAt = new RegExp(
    `\\s+WHERE\\s+${deletedAt}\\s+AND\\s+`,
    'gi',
  );
  const trailingDeletedAt = new RegExp(
    `\\s+AND\\s+${deletedAt}(?=\\s*(?:AND\\s+|$))`,
    'gi',
  );
  const onlyDeletedAt = new RegExp(`\\s+WHERE\\s+${deletedAt}(?=\\s*$)`, 'gi');
  let normalizedSql = sql;
  let previousSql: string;

  do {
    previousSql = normalizedSql;
    normalizedSql = normalizedSql
      .replace(leadingDeletedAt, ' WHERE ')
      .replace(trailingDeletedAt, '')
      .replace(onlyDeletedAt, '');
  } while (normalizedSql !== previousSql);

  return normalizedSql;
};

export const normalizeReadCapabilitySql = (
  sql: string,
  alias: string,
): string => normalizeSerializedSql(removeDeletedAtPredicate(sql, alias));

export const serializeReadCapabilityQuery = (
  repository: PermissionAwareRepository,
  alias: string,
): SerializedReadCapabilityQuery => {
  const queryBuilder = repository
    .createQueryBuilder(alias)
    .select(`${alias}.id`)
    .where(`${alias}."deletedAt" IS NULL`);

  queryBuilder.validatePermissionsBeforeSerialization();
  const [sql, parameters] = queryBuilder.getQueryAndParameters();

  return { sql, parameters };
};

@Injectable()
export class MyahInboxTriageCapabilityService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assertRead({
    authContext,
  }: {
    authContext: WorkspaceAuthContext;
  }): Promise<void> {
    if (!isUserAuthContext(authContext)) {
      unavailable();
    }
    const userAuthContext = authContext as UserWorkspaceAuthContext;

    const workspaceContext = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });

    if (!rolePermissionConfig) unavailable();
    const resolvedRolePermissionConfig = rolePermissionConfig;

    for (const [objectName, alias, tableName] of readCapabilitySources) {
      let serialized: SerializedReadCapabilityQuery;

      try {
        // SAFETY: native workspace repositories expose this narrowed serialization port.
        const repository = (await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(
          authContext.workspace.id,
          objectName,
          resolvedRolePermissionConfig ?? undefined,
        )) as unknown as PermissionAwareRepository;
        serialized = serializeReadCapabilityQuery(repository, alias);
      } catch (error) {
        if (isExpectedCapabilityDenial(error)) {
          unavailable();
        }

        throw error;
      }
      const canonicalSql = normalizeReadCapabilitySql(serialized.sql, alias);
      const expectedSql = normalizeSerializedSql(
        canonicalUnrestrictedReadSql({
          alias,
          tableName,
          workspaceId: authContext.workspace.id,
        }),
      );

      if (serialized.parameters.length !== 0 || canonicalSql !== expectedSql) {
        unavailable();
      }
    }

    // Object READ permission does not override Email channel privacy. A single
    // hidden participating Email could otherwise change a shared contact tuple
    // without being visible to this user, so the coarse capability must reject
    // it before any tuple is exposed or mutated.
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const [visibility] = await dataSource.query<
      Array<{ hasHiddenParticipatingEmail: boolean }>
    >(
      `SELECT EXISTS (
         SELECT 1
         FROM "${getWorkspaceSchemaName(authContext.workspace.id)}"."messageChannelMessageAssociation" association
         INNER JOIN "${getWorkspaceSchemaName(authContext.workspace.id)}".message message
           ON message.id = association."messageId"
          AND message."deletedAt" IS NULL
         INNER JOIN core."messageChannel" channel
           ON channel.id = association."messageChannelId"
          AND channel."workspaceId" = $1
         LEFT JOIN core."connectedAccount" connected_account
           ON connected_account.id = channel."connectedAccountId"
          AND connected_account."workspaceId" = $1
         WHERE association."deletedAt" IS NULL
           AND channel.type::text = ANY($2::text[])
         GROUP BY association."messageId"
         HAVING NOT BOOL_OR(
           channel.visibility = $3
           OR connected_account."userWorkspaceId" = $4
         )
       ) OR EXISTS (
         SELECT 1
         FROM "${getWorkspaceSchemaName(authContext.workspace.id)}"."myahInboxTriageEmailChannelProvenance" provenance
         WHERE NOT EXISTS (
           SELECT 1
           FROM unnest(provenance."messageChannelIds") AS channel_id(id)
           INNER JOIN core."messageChannel" channel
             ON channel.id = channel_id.id
            AND channel."workspaceId" = $1
           LEFT JOIN core."connectedAccount" connected_account
             ON connected_account.id = channel."connectedAccountId"
            AND connected_account."workspaceId" = $1
           WHERE channel.visibility = $3
              OR connected_account."userWorkspaceId" = $4
         )
       ) AS "hasHiddenParticipatingEmail"`,
      [
        authContext.workspace.id,
        [MessageChannelType.EMAIL, MessageChannelType.EMAIL_GROUP],
        MessageChannelVisibility.SHARE_EVERYTHING,
        userAuthContext.userWorkspaceId,
      ],
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    if (visibility?.hasHiddenParticipatingEmail) unavailable();
  }

  async assertWrite(input: {
    authContext: WorkspaceAuthContext;
  }): Promise<void> {
    await this.assertRead(input);
  }
}
