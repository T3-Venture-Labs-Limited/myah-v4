import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { type SocialProfileRecord } from 'src/modules/myah-creator-social-profile/types/social-profile-record.type';
import {
  assertValidSocialProfileFollowerCount,
  normalizeSocialProfileIdentity,
  resolveSocialProfileIdentityMatch,
  socialProfileDisplayName,
  type SocialProfileIdentityInput,
} from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

export type SocialProfileWriteInput = SocialProfileIdentityInput & {
  creatorId: string;
  followerCount?: number | null;
  followerCountObservedAt?: Date | null;
  followerCountSource?: string | null;
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

@Injectable()
export class SocialProfileService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async upsert(
    input: SocialProfileWriteInput,
    authContext: WorkspaceAuthContext,
  ): Promise<SocialProfileRecord> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            return await this.upsertInTransaction(input, authContext);
          } catch (error) {
            if (!isUniqueViolation(error) || attempt === 1) throw error;
          }
        }

        throw new Error('Social profile write could not be completed');
      },
      authContext,
    );
  }

  private async upsertInTransaction(
    input: SocialProfileWriteInput,
    authContext: WorkspaceAuthContext,
  ): Promise<SocialProfileRecord> {
    if (!input.creatorId.trim()) throw new Error('Creator is required');
    assertValidSocialProfileFollowerCount(input.followerCount);

    const identity = normalizeSocialProfileIdentity(input);
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const repository = dataSource
        .createEntityManager(queryRunner)
        .getRepository<SocialProfileRecord>(
          'socialProfile',
          this.permissionOptions(authContext),
          authContext,
        ) as WorkspaceRepository<SocialProfileRecord>;
      if (identity.platformAccountId) {
        await queryRunner.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [
            `${authContext.workspace.id}:${identity.platform}:id:${identity.platformAccountId}`,
          ],
        );
      }

      const profilesMatchingAccountId = identity.platformAccountId
        ? await repository.find({
            where: [
              {
                platform: identity.platform,
                platformAccountId: identity.platformAccountId,
              },
            ],
          })
        : [];
      const locatorLockKeys = new Set(
        [
          identity.normalizedLocator,
          ...profilesMatchingAccountId
            .filter((profile) => profile.deletedAt === null)
            .map((profile) => profile.normalizedLocator),
        ]
          .filter((locator): locator is string => locator !== null)
          .map(
            (locator) =>
              `${authContext.workspace.id}:${identity.platform}:locator:${locator}`,
          ),
      );

      for (const key of [...locatorLockKeys].sort()) {
        await queryRunner.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [key],
        );
      }

      const where = [
        identity.platformAccountId
          ? {
              platform: identity.platform,
              platformAccountId: identity.platformAccountId,
            }
          : null,
        identity.normalizedLocator
          ? {
              platform: identity.platform,
              normalizedLocator: identity.normalizedLocator,
            }
          : null,
      ].filter((condition): condition is NonNullable<typeof condition> =>
        Boolean(condition),
      );
      const existingProfiles = (await repository.find({ where })).filter(
        (profile) => profile.deletedAt === null,
      );
      const byPlatformAccountId =
        existingProfiles.find(
          (profile) =>
            identity.platformAccountId !== null &&
            profile.platformAccountId === identity.platformAccountId,
        ) ?? null;
      const byNormalizedLocator =
        existingProfiles.find(
          (profile) =>
            identity.normalizedLocator !== null &&
            profile.normalizedLocator === identity.normalizedLocator,
        ) ?? null;
      const match = resolveSocialProfileIdentityMatch({
        creatorId: input.creatorId,
        identity,
        byPlatformAccountId,
        byNormalizedLocator,
      });

      if (match.profile) {
        const matchedProfile = existingProfiles.find(
          (profile) => profile.id === match.profile?.id,
        );

        if (!matchedProfile)
          throw new Error('Matched social profile disappeared');
        const mergedIdentity = {
          ...identity,
          handle: identity.handle ?? matchedProfile.handle,
          profileUrl: identity.profileUrl ?? matchedProfile.profileUrl,
          normalizedLocator:
            identity.normalizedLocator ?? matchedProfile.normalizedLocator,
          platformAccountId:
            identity.platformAccountId ?? matchedProfile.platformAccountId,
        };
        const patch: Partial<SocialProfileRecord> = {
          name: socialProfileDisplayName(mergedIdentity),
          ...(identity.handle ? { handle: identity.handle } : {}),
          ...(identity.profileUrl ? { profileUrl: identity.profileUrl } : {}),
          ...(identity.normalizedLocator
            ? { normalizedLocator: identity.normalizedLocator }
            : {}),
          ...(match.enrichPlatformAccountId
            ? { platformAccountId: identity.platformAccountId }
            : {}),
          ...this.observationPatch(input),
        };

        await repository.update({ id: matchedProfile.id }, patch);
        const updated = await repository.findOneBy({ id: matchedProfile.id });

        if (!updated)
          throw new Error('Social profile disappeared during update');
        await queryRunner.commitTransaction();
        return updated;
      }

      const created = await repository.save(
        repository.create({
          id: randomUUID(),
          creatorId: input.creatorId,
          name: socialProfileDisplayName(identity),
          platform: identity.platform,
          handle: identity.handle,
          profileUrl: identity.profileUrl,
          normalizedLocator: identity.normalizedLocator,
          platformAccountId: identity.platformAccountId,
          followerCount: input.followerCount ?? null,
          followerCountObservedAt: input.followerCountObservedAt ?? null,
          followerCountSource: input.followerCountSource?.trim() || null,
          deletedAt: null,
        }),
      );

      await queryRunner.commitTransaction();
      return created;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private observationPatch(
    input: SocialProfileWriteInput,
  ): Partial<SocialProfileRecord> {
    return {
      ...(input.followerCount !== undefined
        ? { followerCount: input.followerCount }
        : {}),
      ...(input.followerCountObservedAt !== undefined
        ? { followerCountObservedAt: input.followerCountObservedAt }
        : {}),
      ...(input.followerCountSource !== undefined
        ? { followerCountSource: input.followerCountSource?.trim() || null }
        : {}),
    };
  }

  private permissionOptions(
    authContext: WorkspaceAuthContext,
  ): RolePermissionConfig {
    const context = getWorkspaceContext();
    const options = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });

    if (!options) throw new Error('Role could not be resolved');
    return options;
  }
}
