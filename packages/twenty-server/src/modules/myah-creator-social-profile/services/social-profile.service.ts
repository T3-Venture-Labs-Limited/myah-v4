import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { IsNull, type QueryRunner } from 'typeorm';

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

export type SocialProfileIdentityUpdateInput = {
  id: string;
  platform?: unknown;
  handle?: unknown;
  profileUrl?: unknown;
  platformAccountId?: unknown;
  followerCount?: number | null;
  followerCountObservedAt?: Date | null;
  followerCountSource?: string | null;
  creatorId?: unknown;
  creator?: unknown;
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

  async updateIdentity(
    input: SocialProfileIdentityUpdateInput,
    authContext: WorkspaceAuthContext,
  ): Promise<SocialProfileRecord> {
    if (input.creatorId !== undefined || input.creator !== undefined) {
      throw new Error('A social profile cannot be moved to another Creator');
    }

    return this.inWorkspaceTransaction(
      authContext,
      async (repository, queryRunner) => {
        // Serialize edits to this row before reading its identity. A waiter must
        // observe the committed correction, not reuse a locator read before it.
        await queryRunner.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`${authContext.workspace.id}:profile:${input.id}`],
        );
        const existing = await repository.findOneBy({ id: input.id });

        if (!existing) throw new Error('Social profile not found');
        assertValidSocialProfileFollowerCount(input.followerCount);

        // Workspace ORM formats a nullable TEXT field as '' on read.
        const existingPlatformAccountId =
          existing.platformAccountId === '' ? null : existing.platformAccountId;
        const isLocatorCorrection =
          input.handle !== undefined || input.profileUrl !== undefined;
        const identity = normalizeSocialProfileIdentity({
          platform:
            input.platform === undefined ? existing.platform : input.platform,
          // A corrected handle or URL identifies a new locator. Do not combine it
          // with the prior locator, which would turn a valid correction into a
          // contradictory handle/URL pair.
          handle: isLocatorCorrection ? input.handle : existing.handle,
          profileUrl: isLocatorCorrection
            ? input.profileUrl
            : existing.profileUrl,
          platformAccountId:
            input.platformAccountId === undefined
              ? existingPlatformAccountId
              : input.platformAccountId,
        });

        if (identity.platform !== existing.platform) {
          throw new Error('Social profile platform cannot change');
        }
        if (
          existingPlatformAccountId !== null &&
          identity.platformAccountId !== existingPlatformAccountId
        ) {
          throw new Error('A stable account ID cannot be reassigned');
        }

        await this.lockIdentityKeys(queryRunner, authContext, [
          {
            platform: existing.platform,
            platformAccountId: existingPlatformAccountId,
            normalizedLocator: existing.normalizedLocator,
          },
          identity,
        ]);

        const conflicts = await repository.find({
          where: this.identityWhere(identity),
        });
        const conflict = conflicts.find(
          (profile) => profile.deletedAt === null && profile.id !== existing.id,
        );

        if (conflict) {
          throw new Error(
            'Social profile identity is already owned by another profile',
          );
        }

        const patch: Partial<SocialProfileRecord> = {
          ...(isLocatorCorrection
            ? {
                name: socialProfileDisplayName(identity),
                handle: identity.handle,
                profileUrl: identity.profileUrl,
                normalizedLocator: identity.normalizedLocator,
              }
            : {}),
          ...(input.platformAccountId !== undefined
            ? {
                name: socialProfileDisplayName(identity),
                platformAccountId: identity.platformAccountId,
              }
            : {}),
          ...this.observationPatch(input),
        };
        if (Object.keys(patch).length > 0) {
          // The legacy migration writer uses a different advisory lock. Its
          // row-locking enrichment may commit after our read: compare against
          // the database value at write time, under the permission-aware ORM.
          const result = await repository.update(
            isLocatorCorrection || input.platformAccountId !== undefined
              ? {
                  id: existing.id,
                  platformAccountId: existingPlatformAccountId ?? IsNull(),
                }
              : { id: existing.id },
            patch,
          );
          if (
            (isLocatorCorrection || input.platformAccountId !== undefined) &&
            result.affected !== 1
          ) {
            throw new Error('Social profile identity changed during update');
          }
        }
        const updated = await repository.findOneBy({ id: existing.id });

        if (!updated)
          throw new Error('Social profile disappeared during update');
        return updated;
      },
    );
  }

  async retire(
    id: string,
    authContext: WorkspaceAuthContext,
  ): Promise<SocialProfileRecord> {
    return this.inWorkspaceTransaction(authContext, async (repository) => {
      // Retire is intentionally idempotent while still using the
      // permission-aware repository, so a caller cannot distinguish an
      // inaccessible row from a missing one.
      const existing = await repository.findOne({
        where: { id },
        withDeleted: true,
      });

      if (!existing) throw new Error('Social profile not found');
      if (existing.deletedAt === null) {
        await repository.softDelete({ id: existing.id });
      }
      const retired = await repository.findOne({
        where: { id: existing.id },
        withDeleted: true,
      });

      if (!retired)
        throw new Error('Social profile disappeared during retirement');
      return retired;
    });
  }

  async restore(
    id: string,
    authContext: WorkspaceAuthContext,
  ): Promise<SocialProfileRecord> {
    return this.inWorkspaceTransaction(
      authContext,
      async (repository, queryRunner) => {
        const existing = await repository.findOne({
          where: { id },
          withDeleted: true,
        });

        if (!existing) throw new Error('Social profile not found');
        await this.lockIdentityKeys(queryRunner, authContext, [existing]);
        const conflicts = await repository.find({
          where: this.identityWhere(existing),
        });
        const conflict = conflicts.find(
          (profile) => profile.deletedAt === null && profile.id !== existing.id,
        );

        if (conflict) {
          throw new Error(
            'Social profile identity is already owned by another profile',
          );
        }

        await repository.restore({ id: existing.id });
        const restored = await repository.findOneBy({ id: existing.id });

        if (!restored)
          throw new Error('Social profile disappeared during restoration');
        return restored;
      },
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

        const result = await repository.update(
          match.enrichPlatformAccountId
            ? { id: matchedProfile.id, platformAccountId: IsNull() }
            : { id: matchedProfile.id },
          patch,
        );
        if (match.enrichPlatformAccountId && result.affected !== 1) {
          throw new Error('Social profile identity changed during update');
        }
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

  private async inWorkspaceTransaction(
    authContext: WorkspaceAuthContext,
    write: (
      repository: WorkspaceRepository<SocialProfileRecord>,
      queryRunner: QueryRunner,
    ) => Promise<SocialProfileRecord>,
  ): Promise<SocialProfileRecord> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
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
          const result = await write(repository, queryRunner);

          await queryRunner.commitTransaction();
          return result;
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw error;
        } finally {
          await queryRunner.release();
        }
      },
      authContext,
    );
  }

  private identityWhere(
    identity: Pick<
      SocialProfileRecord,
      'platform' | 'platformAccountId' | 'normalizedLocator'
    >,
  ) {
    return [
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
  }

  private async lockIdentityKeys(
    queryRunner: {
      query(query: string, parameters: string[]): Promise<unknown>;
    },
    authContext: WorkspaceAuthContext,
    identities: Array<
      Pick<
        SocialProfileRecord,
        'platform' | 'platformAccountId' | 'normalizedLocator'
      >
    >,
  ): Promise<void> {
    const keys = new Set<string>();
    for (const identity of identities) {
      if (identity.platformAccountId) {
        keys.add(
          `${authContext.workspace.id}:${identity.platform}:id:${identity.platformAccountId}`,
        );
      }
      if (identity.normalizedLocator) {
        keys.add(
          `${authContext.workspace.id}:${identity.platform}:locator:${identity.normalizedLocator}`,
        );
      }
    }
    for (const key of [...keys].sort()) {
      await queryRunner.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [key],
      );
    }
  }

  private observationPatch(
    input: Pick<
      SocialProfileWriteInput,
      'followerCount' | 'followerCountObservedAt' | 'followerCountSource'
    >,
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
