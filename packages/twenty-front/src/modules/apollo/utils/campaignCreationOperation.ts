import {
  CombinedGraphQLErrors,
  ServerError,
  ServerParseError,
} from '@apollo/client/errors';
import { Kind, type SelectionSetNode } from 'graphql';
import { jwtDecode } from 'jwt-decode';
import { z } from 'zod';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { getNonReadableFieldMetadataIdsFromObjectPermissions } from '@/object-metadata/utils/getNonReadableFieldMetadataIdsFromObjectPermissions';
import { campaignCreationState } from '@/object-record/record-index/states/campaignCreationState';
import {
  type CampaignCreationIdentity,
  type CampaignCreationOperationContext,
} from '@/object-record/record-index/types/CampaignCreationAttempt';
import { canCreateRecordsForObjectMetadataItem } from '@/object-record/utils/canCreateRecordsForObjectMetadataItem';

const identitySchema = z
  .object({
    type: z.literal('ACCESS'),
    workspaceId: z.string().min(1),
    userId: z.string().min(1),
    userWorkspaceId: z.string().min(1),
    workspaceMemberId: z.string().optional(),
    isImpersonating: z.boolean().default(false),
    impersonatorUserWorkspaceId: z.string().optional(),
    impersonatedUserWorkspaceId: z.string().optional(),
  })
  .passthrough();

export const decodeCampaignCreationIdentity = (
  token: string | undefined,
): CampaignCreationIdentity | undefined => {
  if (!token) return undefined;
  try {
    const parsed = identitySchema.safeParse(jwtDecode(token));
    if (!parsed.success) return undefined;
    const {
      workspaceId,
      userId,
      userWorkspaceId,
      workspaceMemberId,
      isImpersonating,
      impersonatorUserWorkspaceId,
      impersonatedUserWorkspaceId,
    } = parsed.data;
    return {
      workspaceId,
      userId,
      userWorkspaceId,
      workspaceMemberId,
      isImpersonating,
      impersonatorUserWorkspaceId,
      impersonatedUserWorkspaceId,
    };
  } catch {
    return undefined;
  }
};

export const campaignCreationIdentityKey = (
  identity: CampaignCreationIdentity,
): string =>
  JSON.stringify([
    identity.workspaceId,
    identity.userId,
    identity.userWorkspaceId,
    identity.workspaceMemberId ?? null,
    identity.isImpersonating,
    identity.impersonatorUserWorkspaceId ?? null,
    identity.impersonatedUserWorkspaceId ?? null,
  ]);
export const campaignCreationActorKey = (
  identity: CampaignCreationIdentity,
): string =>
  JSON.stringify([
    identity.userId,
    identity.isImpersonating,
    identity.impersonatorUserWorkspaceId ?? null,
    identity.impersonatedUserWorkspaceId ?? null,
  ]);
export const campaignCreationAttemptKey = (
  identity: CampaignCreationIdentity,
): string =>
  JSON.stringify([identity.workspaceId, campaignCreationActorKey(identity)]);

export class CampaignCreationBoundaryError extends Error {
  readonly code = 'CAMPAIGN_CREATION_BOUNDARY_CHANGED';
}
export class CampaignCreationUnconfirmedError extends Error {
  readonly code = 'CAMPAIGN_CREATION_UNCONFIRMED';
}

export const assertCampaignCreationIdentityCurrent = (
  context: CampaignCreationOperationContext,
  authorization?: string,
): void => {
  const { store, identity } = context;
  const state = store.get(campaignCreationState.atom);
  const attempt = state.attempts[context.attemptKey];
  const actualIdentity = decodeCampaignCreationIdentity(
    getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
  );
  const headerIdentity =
    authorization === undefined
      ? undefined
      : decodeCampaignCreationIdentity(
          authorization.startsWith('Bearer ')
            ? authorization.slice(7)
            : undefined,
        );
  const member = store.get(currentWorkspaceMemberState.atom);
  const userWorkspace = store.get(currentUserWorkspaceState.atom);
  const metadata = store
    .get(objectMetadataItemsSelector.atom)
    .find(
      (item) =>
        item.id === context.objectMetadataId &&
        item.nameSingular === 'campaign',
    );
  const matches = (candidate: CampaignCreationIdentity | undefined) =>
    candidate &&
    campaignCreationIdentityKey(candidate) ===
      campaignCreationIdentityKey(identity);
  if (
    context.invalidated ||
    !matches(actualIdentity) ||
    (authorization !== undefined && !matches(headerIdentity)) ||
    state.sessionGeneration !== context.sessionGeneration ||
    state.boundaryGeneration !== context.boundaryGeneration ||
    state.actorKey !== campaignCreationActorKey(identity) ||
    context.attemptKey !== campaignCreationAttemptKey(identity) ||
    attempt?.runId !== context.runId ||
    attempt?.objectMetadataId !== context.objectMetadataId ||
    store.get(currentWorkspaceState.atom)?.id !== identity.workspaceId ||
    store.get(currentUserState.atom)?.id !== identity.userId ||
    !member ||
    member.userWorkspaceId !== identity.userWorkspaceId ||
    (identity.workspaceMemberId !== undefined &&
      member.id !== identity.workspaceMemberId) ||
    !userWorkspace ||
    !metadata
  ) {
    context.invalidated = true;
    throw new CampaignCreationBoundaryError();
  }
};

export const assertCampaignCreationCurrent = (
  context: CampaignCreationOperationContext,
  authorization?: string,
): void => {
  assertCampaignCreationIdentityCurrent(context, authorization);
  const { store } = context;
  const userWorkspace = store.get(currentUserWorkspaceState.atom);
  const metadata = store
    .get(objectMetadataItemsSelector.atom)
    .find(
      (item) =>
        item.id === context.objectMetadataId &&
        item.nameSingular === 'campaign',
    );
  const permissions = getObjectPermissionsForObject(
    Object.fromEntries(
      (userWorkspace?.objectsPermissions ?? []).map((item) => [
        item.objectMetadataId,
        item,
      ]),
    ),
    context.objectMetadataId,
  );
  const unreadable = getNonReadableFieldMetadataIdsFromObjectPermissions({
    objectPermissions: permissions,
  });
  if (
    !metadata ||
    !permissions.canReadObjectRecords ||
    !['id', 'deletedAt'].every((name) =>
      metadata.readableFields.some(
        (field) => field.name === name && !unreadable.includes(field.id),
      ),
    ) ||
    (context.kind === 'create' &&
      !canCreateRecordsForObjectMetadataItem({
        objectMetadataItem: metadata,
        objectPermissions: permissions,
      }))
  ) {
    context.invalidated = true;
    throw new CampaignCreationBoundaryError();
  }
};

export const isCampaignCreationTransportUncertain = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error && error.name === 'AbortError') ||
  ServerParseError.is(error) ||
  (ServerError.is(error) && error.statusCode >= 500);
export const isCampaignCreationRecordNotConfirmed = (
  error: unknown,
): boolean => {
  if (!CombinedGraphQLErrors.is(error) || error.errors.length !== 1)
    return false;
  const item = error.errors[0];
  const data = error.data;
  return (
    item.message === 'Record not found' &&
    item.extensions?.code === 'NOT_FOUND' &&
    item.extensions?.subCode === 'RECORD_NOT_FOUND' &&
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data) &&
    Object.keys(data).length === 1 &&
    Object.hasOwn(data, 'campaign') &&
    (data as Record<string, unknown>).campaign === null &&
    (!Object.hasOwn(item, 'path') ||
      (Array.isArray(item.path) &&
        item.path.length === 1 &&
        item.path[0] === 'campaign'))
  );
};

export const isCampaignCreationDuplicate = (error: unknown): boolean =>
  CombinedGraphQLErrors.is(error) &&
  error.errors.length > 0 &&
  error.errors.every(
    (item) =>
      item.extensions?.subCode === 'DUPLICATE_ENTRY_DETECTED' ||
      (item.extensions?.code === 'BAD_USER_INPUT' &&
        item.message === 'A duplicate entry was detected'),
  );

export const hasCompleteCampaignCreationSelection = (
  value: unknown,
  selection: SelectionSetNode,
): boolean => {
  if (value === null) return true;
  if (Array.isArray(value))
    return value.every((item) =>
      hasCompleteCampaignCreationSelection(item, selection),
    );
  if (typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  return selection.selections.every((field) => {
    if (field.kind !== Kind.FIELD) return false;
    const key = field.alias?.value ?? field.name.value;
    if (!Object.hasOwn(object, key) || object[key] === undefined) return false;
    return (
      !field.selectionSet ||
      hasCompleteCampaignCreationSelection(object[key], field.selectionSet)
    );
  });
};
