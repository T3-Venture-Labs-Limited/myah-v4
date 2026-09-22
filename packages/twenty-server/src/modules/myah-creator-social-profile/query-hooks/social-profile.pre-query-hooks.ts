import {
  type WorkspacePreQueryHookInstance,
  type WorkspaceRawInputPreQueryHookContext,
} from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
  type DeleteManyResolverArgs,
  type DeleteOneResolverArgs,
  type DestroyManyResolverArgs,
  type DestroyOneResolverArgs,
  type RestoreManyResolverArgs,
  type RestoreOneResolverArgs,
  type UpdateManyResolverArgs,
  type UpdateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  assertValidSocialProfileFollowerCount,
  normalizeSocialProfileIdentity,
  socialProfileDisplayName,
} from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

type SocialProfileMutationData = {
  id?: string;
  creator?: unknown;
  creatorId?: unknown;
  platform?: unknown;
  handle?: unknown;
  profileUrl?: unknown;
  platformAccountId?: unknown;
  normalizedLocator?: unknown;
  name?: unknown;
  followerCount?: unknown;
  followerCountObservedAt?: unknown;
  followerCountSource?: unknown;
};

const INTERNAL_FIELDS = ['name', 'normalizedLocator'] as const;
const IDENTITY_FIELDS = [
  'creator',
  'creatorId',
  'platform',
  'handle',
  'profileUrl',
  'platformAccountId',
  'normalizedLocator',
  'name',
] as const;

const hasOwn = (value: SocialProfileMutationData, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const validateCreateData = (data: SocialProfileMutationData): void => {
  assertValidSocialProfileFollowerCount(data.followerCount);
  if (INTERNAL_FIELDS.some((field) => hasOwn(data, field))) {
    throw new Error(
      'Social profile internal identity fields are managed by Myah',
    );
  }
};

const prepareCreateData = (
  data: SocialProfileMutationData,
): SocialProfileMutationData => {
  if (typeof data.creatorId !== 'string' || !data.creatorId.trim()) {
    throw new Error('Creator is required');
  }

  const identity = normalizeSocialProfileIdentity({
    platform: data.platform,
    handle: data.handle,
    profileUrl: data.profileUrl,
    platformAccountId: data.platformAccountId,
  });

  return {
    ...data,
    platform: identity.platform,
    handle: identity.handle,
    profileUrl: identity.profileUrl,
    platformAccountId: identity.platformAccountId,
    normalizedLocator: identity.normalizedLocator,
    name: socialProfileDisplayName(identity),
  };
};

const validateUpdateData = (data: SocialProfileMutationData): void => {
  assertValidSocialProfileFollowerCount(data.followerCount);
  if (IDENTITY_FIELDS.some((field) => hasOwn(data, field))) {
    throw new Error(
      'Social profile identity fields must be changed through the managed profile service',
    );
  }
};

const rejectGenericRetirement = (): never => {
  throw new Error(
    'Social profile retirement and restoration require the managed retirement service',
  );
};

@WorkspaceQueryHook('socialProfile.createOne')
export class SocialProfileCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  validateRawInput(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs<SocialProfileMutationData>,
    _context: WorkspaceRawInputPreQueryHookContext,
  ): void {
    validateCreateData(payload.data);
    if (payload.upsert) {
      throw new Error('Use the managed profile service for repeat-safe writes');
    }
  }

  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs<SocialProfileMutationData>,
  ): Promise<CreateOneResolverArgs<SocialProfileMutationData>> {
    return { ...payload, data: prepareCreateData(payload.data) };
  }
}

@WorkspaceQueryHook('socialProfile.createMany')
export class SocialProfileCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  validateRawInput(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs<SocialProfileMutationData>,
    _context: WorkspaceRawInputPreQueryHookContext,
  ): void {
    payload.data.forEach(validateCreateData);
    if (payload.upsert) {
      throw new Error('Use the managed profile service for repeat-safe writes');
    }
  }

  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs<SocialProfileMutationData>,
  ): Promise<CreateManyResolverArgs<SocialProfileMutationData>> {
    return { ...payload, data: payload.data.map(prepareCreateData) };
  }
}

@WorkspaceQueryHook('socialProfile.updateOne')
export class SocialProfileUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs<SocialProfileMutationData>,
  ): Promise<UpdateOneResolverArgs<SocialProfileMutationData>> {
    validateUpdateData(payload.data);
    return payload;
  }
}

@WorkspaceQueryHook('socialProfile.updateMany')
export class SocialProfileUpdateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateManyResolverArgs<SocialProfileMutationData>,
  ): Promise<UpdateManyResolverArgs<SocialProfileMutationData>> {
    validateUpdateData(payload.data);
    return payload;
  }
}

@WorkspaceQueryHook('socialProfile.deleteOne')
export class SocialProfileDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DeleteOneResolverArgs,
  ): Promise<DeleteOneResolverArgs> {
    return rejectGenericRetirement();
  }
}

@WorkspaceQueryHook('socialProfile.deleteMany')
export class SocialProfileDeleteManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DeleteManyResolverArgs,
  ): Promise<DeleteManyResolverArgs> {
    return rejectGenericRetirement();
  }
}

@WorkspaceQueryHook('socialProfile.destroyOne')
export class SocialProfileDestroyOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DestroyOneResolverArgs,
  ): Promise<DestroyOneResolverArgs> {
    return rejectGenericRetirement();
  }
}

@WorkspaceQueryHook('socialProfile.destroyMany')
export class SocialProfileDestroyManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DestroyManyResolverArgs,
  ): Promise<DestroyManyResolverArgs> {
    return rejectGenericRetirement();
  }
}

@WorkspaceQueryHook('socialProfile.restoreOne')
export class SocialProfileRestoreOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: RestoreOneResolverArgs,
  ): Promise<RestoreOneResolverArgs> {
    return rejectGenericRetirement();
  }
}

@WorkspaceQueryHook('socialProfile.restoreMany')
export class SocialProfileRestoreManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: RestoreManyResolverArgs,
  ): Promise<RestoreManyResolverArgs> {
    return rejectGenericRetirement();
  }
}
