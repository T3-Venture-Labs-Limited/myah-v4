import { type ObjectLiteral, type UpdateResult } from 'typeorm';

import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { formatTwentyOrmEventToDatabaseBatchEvent } from 'src/engine/twenty-orm/utils/format-twenty-orm-event-to-database-batch-event.util';
import { getObjectMetadataFromEntityTarget } from 'src/engine/twenty-orm/utils/get-object-metadata-from-entity-target.util';

// Only for the composer's locked null -> Creator link. The role-aware update
// retains creatorId IS NULL, so its shared event after-read is necessarily empty.
// Like ORM event readbacks, these internal snapshots do not filter event payloads
// through read permissions. They never authorize or bypass the mutation.
export const withInstagramConversationLinkEvents = async ({
  manager,
  conversationId,
  creatorId,
  beforeQuery,
  update,
}: {
  manager: WorkspaceEntityManager;
  conversationId: string;
  creatorId: string;
  beforeQuery: () => Promise<void>;
  update: () => Promise<UpdateResult>;
}): Promise<void> => {
  const target = 'myahSocialConversation';
  const internalContext = manager.internalContext;
  const objectMetadata = getObjectMetadataFromEntityTarget(
    target,
    internalContext,
  );
  const readSnapshot = async () => {
    await beforeQuery();
    return manager
      .createQueryBuilder<ObjectLiteral>(target, target, manager.queryRunner, {
        shouldBypassPermissionChecks: true,
      })
      .where({ id: conversationId })
      .getOne();
  };
  const before = await readSnapshot();
  if (!before || before.creatorId !== null) {
    throw new Error('Instagram composer conversation is unavailable');
  }
  await beforeQuery();
  const linked = await update();
  if (linked.affected !== 1) {
    throw new Error('Instagram composer conversation is unavailable');
  }
  const after = await readSnapshot();
  if (!after || after.creatorId !== creatorId) {
    throw new Error('Instagram composer conversation is unavailable');
  }
  for (const action of [
    DatabaseEventAction.UPDATED,
    DatabaseEventAction.UPSERTED,
  ]) {
    internalContext.eventEmitterService.emitDatabaseBatchEvent(
      formatTwentyOrmEventToDatabaseBatchEvent({
        action,
        objectMetadataItem: objectMetadata,
        flatFieldMetadataMaps: internalContext.flatFieldMetadataMaps,
        workspaceId: internalContext.workspaceId,
        recordsBefore: [before],
        recordsAfter: [after],
        authContext: manager.authContext,
      }),
    );
  }
};
