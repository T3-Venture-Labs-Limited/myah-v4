import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

export type CampaignLifecycleJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CampaignLifecycleJsonValue[]
  | { readonly [key: string]: CampaignLifecycleJsonValue };

export type RawWorkspaceCampaignCapacityProjection = Readonly<{
  id: string;
  campaignCapacityTimeZone: string | null;
}>;

export type RawCampaignLifecycleProjection = Readonly<{
  id: string;
  lifecycleStatus: string | null;
  sequenceAuthorization: CampaignLifecycleJsonValue;
}>;

export type CampaignLifecycleActorPermissionContext = Readonly<{
  authContext: WorkspaceAuthContext;
  rolePermissionConfig: RolePermissionConfig;
}>;

export type CampaignLifecycleActorPermissionResolutionInput = Readonly<{
  authContext: WorkspaceAuthContext;
  workspaceId: string;
}>;

/** Trusted server-side resolver; callers cannot provide repository capabilities. */
export interface CampaignLifecycleActorPermissionResolverPort {
  resolveRolePermissionConfig(
    input: CampaignLifecycleActorPermissionResolutionInput,
  ): Promise<RolePermissionConfig | null>;
}

export type LockedCampaignLifecycleContext = Readonly<{
  manager: WorkspaceEntityManager;
  workspaceId: string;
  campaignId: string;
  schemaName: string;
  workspace: RawWorkspaceCampaignCapacityProjection;
  campaign: RawCampaignLifecycleProjection;
  actorPermissionContext: CampaignLifecycleActorPermissionContext;
}>;

export type CampaignLifecycleTransactionInput = Readonly<{
  workspaceId: string;
  campaignId: string;
  authContext: WorkspaceAuthContext;
}>;

/**
 * Trusted DB-only authorization participant. It must use the supplied manager,
 * and must not control, nest, retain, or recursively enter this transaction.
 */
export interface CampaignLifecycleWriteAuthorizationPort {
  assertCampaignWriteAllowedInTransaction(
    context: LockedCampaignLifecycleContext,
  ): Promise<void>;
}

/**
 * Trusted DB-only operation. It must use the supplied manager, and must not
 * control, nest, retain, or recursively enter this transaction.
 */
export type CampaignLifecycleTransactionOperation<T> = (
  context: LockedCampaignLifecycleContext,
) => Promise<T>;
