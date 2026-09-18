import { Injectable } from '@nestjs/common';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';

@Injectable()
export class MessagingCursorService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  public async updateCursorInTransaction({
    messageChannel,
    nextSyncCursor,
    workspaceId,
    folderId,
    manager,
  }: {
    messageChannel: MessageChannelEntity;
    nextSyncCursor: string;
    workspaceId: string;
    folderId: string | null;
    manager: WorkspaceEntityManager;
  }) {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error('Cursor updates require an active transaction manager');
    }

    if (!folderId) {
      await query(
        `UPDATE core."messageChannel"
         SET "throttleFailureCount"=0, "throttleRetryAfter"=NULL, "syncStageStartedAt"=NULL,
             "syncCursor"=CASE WHEN "syncCursor" IS NULL OR $3 > "syncCursor" THEN $3 ELSE "syncCursor" END
         WHERE id=$1 AND "workspaceId"=$2`,
        [messageChannel.id, workspaceId, nextSyncCursor],
      );
      return;
    }

    await query(
      `UPDATE core."messageFolder" SET "syncCursor"=$3 WHERE id=$1 AND "workspaceId"=$2`,
      [folderId, workspaceId, nextSyncCursor],
    );
    await query(
      `UPDATE core."messageChannel"
       SET "throttleFailureCount"=0, "throttleRetryAfter"=NULL, "syncStageStartedAt"=NULL
       WHERE id=$1 AND "workspaceId"=$2`,
      [messageChannel.id, workspaceId],
    );
  }

  public async updateCursor(
    messageChannel: MessageChannelEntity,
    nextSyncCursor: string,
    workspaceId: string,
    folderId?: string,
  ) {
    const authContext = buildSystemAuthContext(workspaceId);
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceDataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        await workspaceDataSource?.transaction((manager) =>
          this.updateCursorInTransaction({
            messageChannel,
            nextSyncCursor,
            workspaceId,
            folderId: folderId ?? null,
            manager: manager as WorkspaceEntityManager,
          }),
        );
      },
      authContext,
      { lite: true },
    );
  }
}
