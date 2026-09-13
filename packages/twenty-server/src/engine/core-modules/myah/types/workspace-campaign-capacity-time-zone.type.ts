import { type EntityManager } from 'typeorm';

export type WorkspaceCampaignCapacityTimeZoneReadInput = Readonly<{
  workspaceId: string;
}>;

export type WorkspaceCampaignCapacityTimeZoneMutationInput = Readonly<{
  workspaceId: string;
  campaignCapacityTimeZone: string | null;
}>;

export type WorkspaceCampaignCapacityTimeZoneReadResult =
  | Readonly<{
      status: 'CONFIGURED';
      campaignCapacityTimeZone: string;
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason:
        | 'WORKSPACE_SCOPE_UNAVAILABLE'
        | 'NOT_CONFIGURED'
        | 'INVALID_STORED_TIME_ZONE';
    }>;

export type WorkspaceCampaignCapacityTimeZoneMutationResult =
  | Readonly<{
      status: 'UPDATED' | 'UNCHANGED';
      campaignCapacityTimeZone: string | null;
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason:
        | 'WORKSPACE_SCOPE_UNAVAILABLE'
        | 'CAMPAIGN_SCAN_INCOMPLETE'
        | 'ACTIVE_CAMPAIGN_EXISTS';
    }>;

/**
 * Trusted server-side, DB-only authorization participant. Implementations
 * derive authority from established server context and must use only the exact
 * supplied active transaction manager. They must not open, switch, or retain a
 * transaction, query runner, manager, workspace context, or repository, and
 * must not perform cache, provider, event, file, queue, or network I/O.
 * Operation callers never supply a permission configuration, bypass flag,
 * role list, or authorization object.
 */
export abstract class WorkspaceCampaignCapacityTimeZoneAuthorizationPort {
  abstract assertReadAllowedInTransaction(
    input: WorkspaceCampaignCapacityTimeZoneReadInput,
    manager: EntityManager,
  ): Promise<void>;

  abstract assertMutationAllowedInTransaction(
    input: WorkspaceCampaignCapacityTimeZoneMutationInput,
    manager: EntityManager,
  ): Promise<void>;
}
