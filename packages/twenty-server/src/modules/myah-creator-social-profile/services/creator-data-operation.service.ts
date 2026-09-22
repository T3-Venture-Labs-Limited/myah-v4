import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager } from 'typeorm';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export type CreatorDataOperationKind =
  | 'LEGACY_MIGRATION'
  | 'SPREADSHEET_IMPORT';

export type CreatorDataOperationResult = {
  receiptId: string;
  creatorId: string;
  socialProfileIds: string[];
  noteId: string | null;
  noteTargetId: string | null;
  replayed: boolean;
};

type CreatorDataOperationReceiptRow = Omit<
  CreatorDataOperationResult,
  'receiptId' | 'replayed'
> & {
  id: string;
  sourceDigest: string;
};

type ExecuteCreatorDataOperationInput = {
  workspaceId: string;
  kind: CreatorDataOperationKind;
  actorWorkspaceMemberId: string | null;
  attemptKey: string;
  operationKey: string;
  sourceDigest: string;
  write: (
    manager: EntityManager,
    schemaName: string,
  ) => Promise<Omit<CreatorDataOperationResult, 'receiptId' | 'replayed'>>;
};

@Injectable()
export class CreatorDataOperationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: ExecuteCreatorDataOperationInput,
  ): Promise<CreatorDataOperationResult> {
    if (!input.attemptKey.trim() || !input.operationKey.trim()) {
      throw new Error('Creator data operation identity is required');
    }
    if (!/^[0-9a-f]{64}$/u.test(input.sourceDigest)) {
      throw new Error('Creator data operation digest is invalid');
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.executeOnce(input);
      } catch (error) {
        if (!this.isRetryableTransactionError(error) || attempt === 1) {
          throw error;
        }
      }
    }

    throw new Error('Creator data operation could not be completed');
  }

  private executeOnce({
    workspaceId,
    kind,
    actorWorkspaceMemberId,
    attemptKey,
    operationKey,
    sourceDigest,
    write,
  }: ExecuteCreatorDataOperationInput): Promise<CreatorDataOperationResult> {
    const schemaName = getWorkspaceSchemaName(workspaceId);

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`creator-data:${workspaceId}:${kind}:${attemptKey}:${operationKey}`],
      );

      const [existing] = await manager.query<CreatorDataOperationReceiptRow[]>(
        `SELECT
          "id", "sourceDigest", "creatorId", "socialProfileIds",
          "noteId", "noteTargetId"
        FROM core."creatorDataOperationReceipt"
        WHERE "workspaceId" = $1
          AND "kind" = $2
          AND "attemptKey" = $3
          AND "operationKey" = $4
        FOR UPDATE`,
        [workspaceId, kind, attemptKey, operationKey],
      );

      if (existing) {
        if (existing.sourceDigest !== sourceDigest) {
          throw new Error(
            'Creator data operation identity was reused with different input',
          );
        }

        return {
          receiptId: existing.id,
          creatorId: existing.creatorId,
          socialProfileIds: existing.socialProfileIds,
          noteId: existing.noteId,
          noteTargetId: existing.noteTargetId,
          replayed: true,
        };
      }

      const result = await write(manager, schemaName);
      const [receipt] = await manager.query<{ id: string }[]>(
        `INSERT INTO core."creatorDataOperationReceipt" (
          "workspaceId", "kind", "actorWorkspaceMemberId", "attemptKey",
          "operationKey", "sourceDigest", "creatorId", "socialProfileIds",
          "noteId", "noteTargetId", "result"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10, $11::jsonb)
        RETURNING "id"`,
        [
          workspaceId,
          kind,
          actorWorkspaceMemberId,
          attemptKey,
          operationKey,
          sourceDigest,
          result.creatorId,
          result.socialProfileIds,
          result.noteId,
          result.noteTargetId,
          JSON.stringify(result),
        ],
      );

      if (!receipt) {
        throw new Error('Creator data operation receipt was not created');
      }

      return { receiptId: receipt.id, ...result, replayed: false };
    });
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === '23505' ||
        error.code === '40001' ||
        error.code === '40P01')
    );
  }
}
