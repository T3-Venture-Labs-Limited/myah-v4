import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';
import { FieldActorSource } from 'twenty-shared/types';

import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { UnipileInstagramAccountBindingStatus } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { type UnipileInstagramAccount } from 'src/modules/myah-unipile/types/unipile-v1.type';

type WorkspaceIdentity = {
  id: string;
};

export type UnipileInstagramAccountProjectionInput = {
  workspace: WorkspaceIdentity;
  account: UnipileInstagramAccount;
  status: UnipileInstagramAccountBindingStatus;
};

export type UnipileInstagramAccountStatusInput = {
  workspace: WorkspaceIdentity;
  workspaceInstagramAccountRecordId: string;
  status: UnipileInstagramAccountBindingStatus;
  lastError: string | null;
};

export type UnipileInstagramAccountStatus = {
  id: string;
  username: string | null;
  status: UnipileInstagramAccountBindingStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
};

type UnipileInstagramAccountStatusReadInput = {
  workspace: WorkspaceIdentity;
  workspaceInstagramAccountRecordId: string;
};

type InstagramAccountRecord = {
  id: string;
};

type InstagramAccountIdentityRecord = InstagramAccountRecord & {
  deletedAt: string | Date | null;
};

const queryOptions = { shouldBypassPermissionChecks: true };

@Injectable()
export class UnipileInstagramAccountProjectionService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async upsertVerifiedAccount(
    input: UnipileInstagramAccountProjectionInput,
  ): Promise<string> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);
        const records = await dataSource.query<
          InstagramAccountIdentityRecord[]
        >(
          `
            SELECT "id", "deletedAt"
            FROM "${schemaName}"."_myahInstagramAccount"
            WHERE "igUserId" = $1
            LIMIT 2
          `,
          [input.account.instagramUserId],
          undefined,
          queryOptions,
        );

        if (records.length > 1) {
          throw new ConflictException(
            'Multiple Instagram accounts match the verified Instagram identity',
          );
        }

        // Both unique identities remain reserved by soft-deleted records.
        const providerRecords = await dataSource.query<
          InstagramAccountRecord[]
        >(
          `
            SELECT "id"
            FROM "${schemaName}"."_myahInstagramAccount"
            WHERE "unipileAccountId" = $1
            LIMIT 2
          `,
          [input.account.accountId],
          undefined,
          queryOptions,
        );

        if (providerRecords.some((record) => record.id !== records[0]?.id)) {
          throw new ConflictException('Instagram account identity conflict');
        }

        if (records[0]?.deletedAt != null) {
          throw new ConflictException(
            'Instagram account requires explicit restore',
          );
        }

        const lastCheckedAt = new Date().toISOString();
        const displayName = input.account.username
          ? `@${input.account.username}`
          : 'Workspace Instagram account';
        const systemActor = 'System';

        if (records.length === 1) {
          const [record] = records;

          const [updatedRecords, affectedCount] = await dataSource.query<
            [InstagramAccountRecord[], number]
          >(
            `
              UPDATE "${schemaName}"."_myahInstagramAccount"
              SET
                "name" = $1,
                "label" = $2,
                "unipileAccountId" = $3,
                "username" = $4,
                "status" = $5,
                "lastCheckedAt" = $6,
                "lastError" = $7,
                "updatedAt" = now(),
                "updatedBySource" = $8,
                "updatedByWorkspaceMemberId" = $9,
                "updatedByName" = $10,
                "updatedByContext" = $11
              WHERE "id" = $12
                AND "deletedAt" IS NULL
              RETURNING "id"
            `,
            [
              displayName,
              displayName,
              input.account.accountId,
              input.account.username,
              input.status,
              lastCheckedAt,
              null,
              FieldActorSource.SYSTEM,
              null,
              systemActor,
              {},
              record.id,
            ],
            undefined,
            queryOptions,
          );

          if (
            affectedCount !== 1 ||
            updatedRecords.length !== 1 ||
            updatedRecords[0].id !== record.id
          ) {
            throw new ConflictException(
              'Instagram account verification update failed',
            );
          }

          return record.id;
        }

        const id = randomUUID();

        await dataSource.query(
          `
            INSERT INTO "${schemaName}"."_myahInstagramAccount" (
              "id",
              "name",
              "label",
              "unipileAccountId",
              "igUserId",
              "username",
              "status",
              "lastCheckedAt",
              "lastError",
              "createdBySource",
              "createdByWorkspaceMemberId",
              "createdByName",
              "createdByContext",
              "updatedBySource",
              "updatedByWorkspaceMemberId",
              "updatedByName",
              "updatedByContext"
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17
            )
          `,
          [
            id,
            displayName,
            displayName,
            input.account.accountId,
            input.account.instagramUserId,
            input.account.username,
            input.status,
            lastCheckedAt,
            null,
            FieldActorSource.SYSTEM,
            null,
            systemActor,
            {},
            FieldActorSource.SYSTEM,
            null,
            systemActor,
            {},
          ],
          undefined,
          queryOptions,
        );

        return id;
      },
      buildSystemAuthContext({
        workspace: input.workspace as NonNullable<RawAuthContext['workspace']>,
      }),
    );
  }

  async getAccountStatus(
    input: UnipileInstagramAccountStatusReadInput,
  ): Promise<UnipileInstagramAccountStatus | null> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);
        const records = await dataSource.query<UnipileInstagramAccountStatus[]>(
          `
            SELECT
              "id", "username", "status", "lastCheckedAt", "lastError"
            FROM "${schemaName}"."_myahInstagramAccount"
            WHERE "id" = $1
              AND "deletedAt" IS NULL
          `,
          [input.workspaceInstagramAccountRecordId],
          undefined,
          queryOptions,
        );

        return records[0] ?? null;
      },
      buildSystemAuthContext({
        workspace: input.workspace as NonNullable<RawAuthContext['workspace']>,
      }),
    );
  }

  async markAccountStatus(
    input: UnipileInstagramAccountStatusInput,
  ): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);
        const records = await dataSource.query<InstagramAccountRecord[]>(
          `
            UPDATE "${schemaName}"."_myahInstagramAccount"
            SET
              "status" = $1,
              "lastCheckedAt" = $2,
              "lastError" = $3,
              "updatedAt" = now(),
              "updatedBySource" = $4,
              "updatedByWorkspaceMemberId" = $5,
              "updatedByName" = $6,
              "updatedByContext" = $7
            WHERE "id" = $8
              AND "deletedAt" IS NULL
            RETURNING "id"
          `,
          [
            input.status,
            new Date().toISOString(),
            input.lastError,
            FieldActorSource.SYSTEM,
            null,
            'System',
            {},
            input.workspaceInstagramAccountRecordId,
          ],
          undefined,
          queryOptions,
        );

        if (records.length === 0) {
          throw new ConflictException('Instagram account status update failed');
        }
      },
      buildSystemAuthContext({
        workspace: input.workspace as NonNullable<RawAuthContext['workspace']>,
      }),
    );
  }
}
