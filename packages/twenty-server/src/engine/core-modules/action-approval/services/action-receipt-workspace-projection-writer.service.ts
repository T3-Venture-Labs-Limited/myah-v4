import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { FieldActorSource } from 'twenty-shared/types';
import { type DataSource, type EntityManager } from 'typeorm';

import { type ActionReceiptProjectionWriter } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

@Injectable()
export class ActionReceiptWorkspaceProjectionWriterService
  implements ActionReceiptProjectionWriter
{
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async project({
    receiptId,
    workspaceId,
    draftId,
  }: Parameters<ActionReceiptProjectionWriter['project']>[0]): Promise<void> {
    const schemaName = getWorkspaceSchemaName(workspaceId);

    await this.dataSource.transaction(async (manager) => {
      if (await this.hasProjection(manager, schemaName, receiptId)) {
        return;
      }

      const [drafts] = await manager.query<[{ body: string }[], number]>(
        `UPDATE "${schemaName}"."_myahInstagramReplyDraft"
          SET "status" = 'SENT', "sentAt" = NOW(), "updatedAt" = NOW()
          WHERE "id" = $1 AND "sentAt" IS NULL
          RETURNING "body"`,
        [draftId],
      );
      const [draft] = drafts;
      if (!draft) {
        if (await this.hasProjection(manager, schemaName, receiptId)) {
          return;
        }
        throw new Error('The approved draft is unavailable for projection');
      }

      await manager.query(
        `INSERT INTO "${schemaName}"."_myahSocialMessage" (
          "id", "text", "direction", "sentVia", "createdAt", "updatedAt",
          "createdBySource", "createdByWorkspaceMemberId", "createdByName", "createdByContext",
          "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName", "updatedByContext"
        ) VALUES (
          $1, $2, 'OUTBOUND', 'UNKNOWN', NOW(), NOW(),
          $3, NULL, 'System', $4::jsonb, $3, NULL, 'System', $4::jsonb
        )`,
        [
          randomUUID(),
          draft.body,
          FieldActorSource.SYSTEM,
          JSON.stringify({ actionReceiptId: receiptId }),
        ],
      );
    });
  }

  private async hasProjection(
    manager: EntityManager,
    schemaName: string,
    receiptId: string,
  ): Promise<boolean> {
    const projections = await manager.query<{ id: string }[]>(
      `SELECT "id" FROM "${schemaName}"."_myahSocialMessage"
        WHERE "createdByContext" ->> 'actionReceiptId' = $1
        LIMIT 1`,
      [receiptId],
    );

    return projections.length > 0;
  }
}
