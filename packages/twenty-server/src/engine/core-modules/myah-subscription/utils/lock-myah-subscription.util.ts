import { type EntityManager } from 'typeorm';

// Serializes Stripe sync, deletion cleanup and lapse cleanup for one workspace.
// An advisory lock does not block other writers of the workspace row while
// Stripe or Unipile calls are in flight. Released when the transaction ends.
export const lockMyahSubscription = (
  manager: EntityManager,
  workspaceId: string,
) =>
  manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `myah-subscription:${workspaceId}`,
  ]);
