import { type ObjectLiteral, type UpdateResult } from 'typeorm';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';

// Guard the composer's locked null -> Creator link. The role-aware update
// emits its own events after reading the changed row by ID.
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
};
