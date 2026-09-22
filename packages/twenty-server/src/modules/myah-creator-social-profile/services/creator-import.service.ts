import { createHash } from 'crypto';

import { Injectable } from '@nestjs/common';

import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type CommitCreatorImportInput,
  type CommitCreatorImportResult,
} from 'src/modules/myah-creator-social-profile/dtos/creator-import.dto';
import { CreatorDataOperationService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation.service';
import { CreatorDataOperationWriterService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation-writer.service';
import { normalizeSocialProfileIdentity } from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

const CREATOR_IMPORT_FIELDS = [
  'name',
  'email',
  'phone',
  'location',
  'language',
  'source',
  'sourceUrl',
  'importSource',
  'lastImportedAt',
] as const;

@Injectable()
export class CreatorImportService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly operationService: CreatorDataOperationService,
    private readonly writer: CreatorDataOperationWriterService,
  ) {}

  commit(
    input: CommitCreatorImportInput,
    authContext: WorkspaceAuthContext,
  ): Promise<CommitCreatorImportResult> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        this.assertUserActor(authContext);
        this.assertWritePermissions(input, authContext);

        const profiles = input.profiles.map((profile) => ({
          ...normalizeSocialProfileIdentity(profile),
          followerCount: profile.followerCount,
          followerCountObservedAt: profile.followerCountObservedAt
            ? new Date(profile.followerCountObservedAt)
            : undefined,
          followerCountSource: profile.followerCountSource,
        }));
        const identityKeys = profiles.map(
          (profile) =>
            `${profile.platform}:${profile.platformAccountId ?? ''}:${profile.normalizedLocator ?? ''}`,
        );

        if (new Set(identityKeys).size !== identityKeys.length) {
          throw new Error('An imported row contains duplicate social profiles');
        }

        const sourceDigest = createHash('sha256')
          .update(
            JSON.stringify({
              creator: CREATOR_IMPORT_FIELDS.map((field) => [
                field,
                input.creator[field] ?? null,
              ]),
              profiles,
              note: input.note ?? null,
            }),
          )
          .digest('hex');
        const actor = {
          source: 'IMPORT' as const,
          workspaceMemberId: authContext.workspaceMemberId,
          name: 'Creator import',
        };

        return this.operationService.execute({
          workspaceId: authContext.workspace.id,
          kind: 'SPREADSHEET_IMPORT',
          actorWorkspaceMemberId: authContext.workspaceMemberId,
          attemptKey: input.attemptKey,
          operationKey: input.operationKey,
          sourceDigest,
          write: async (manager, schemaName) => {
            const creatorId = await this.writer.createCreator(
              manager,
              schemaName,
              input.creator,
              actor,
            );
            const socialProfileIds: string[] = [];

            for (const profile of profiles) {
              socialProfileIds.push(
                await this.writer.preserveSocialProfile(
                  manager,
                  schemaName,
                  creatorId,
                  profile,
                  actor,
                ),
              );
            }

            const note = await this.writer.createSupplementaryNote(
              manager,
              schemaName,
              creatorId,
              input.note?.title ?? '',
              input.note?.markdown ?? null,
              actor,
            );

            return {
              creatorId,
              socialProfileIds,
              noteId: note.noteId,
              noteTargetId: note.noteTargetId,
            };
          },
        });
      },
      authContext,
    );
  }

  private assertUserActor(
    authContext: WorkspaceAuthContext,
  ): asserts authContext is Extract<WorkspaceAuthContext, { type: 'user' }> {
    if (authContext.type !== 'user') {
      throw new Error(
        'Creator imports require an authenticated workspace user',
      );
    }
  }

  private assertWritePermissions(
    input: CommitCreatorImportInput,
    authContext: WorkspaceAuthContext,
  ): void {
    const context = getWorkspaceContext();
    const permissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });

    if (!permissionConfig) throw new Error('Role could not be resolved');
    if ('shouldBypassPermissionChecks' in permissionConfig) return;

    const requiredFieldsByObject = new Map<string, string[]>([
      [
        'creator',
        CREATOR_IMPORT_FIELDS.filter(
          (field) => input.creator[field] !== undefined,
        ),
      ],
      [
        'socialProfile',
        input.profiles.length > 0
          ? [
              ...new Set([
                'name',
                'creator',
                'platform',
                'normalizedLocator',
                ...input.profiles.flatMap((profile) =>
                  [
                    'handle',
                    'profileUrl',
                    'platformAccountId',
                    'followerCount',
                    'followerCountObservedAt',
                    'followerCountSource',
                  ].filter(
                    (field) =>
                      profile[field as keyof typeof profile] !== undefined,
                  ),
                ),
              ]),
            ]
          : [],
      ],
      ['note', input.note ? ['title', 'bodyV2'] : []],
      ['noteTarget', input.note ? ['note', 'targetCreator'] : []],
    ]);
    const roleIds =
      'unionOf' in permissionConfig
        ? permissionConfig.unionOf
        : permissionConfig.intersectionOf;
    const isUnion = 'unionOf' in permissionConfig;

    for (const [objectName, fieldNames] of requiredFieldsByObject) {
      if (fieldNames.length === 0) continue;
      const objectId = context.objectIdByNameSingular[objectName];
      const fieldIds = Object.values(
        context.flatFieldMetadataMaps.byUniversalIdentifier,
      )
        .filter(
          (field) =>
            field?.objectMetadataId === objectId &&
            fieldNames.includes(field.name) &&
            field.isActive,
        )
        .map((field) => field!.id);

      if (!objectId || fieldIds.length !== new Set(fieldNames).size) {
        throw new Error('Creator import metadata is unavailable');
      }

      const decisions = roleIds.map((roleId) => {
        const permission = context.permissionsPerRoleId[roleId]?.[objectId];

        return (
          permission?.canUpdateObjectRecords === true &&
          fieldIds.every(
            (fieldId) =>
              permission.restrictedFields?.[fieldId]?.canUpdate !== false,
          )
        );
      });

      if (isUnion ? !decisions.some(Boolean) : !decisions.every(Boolean)) {
        throw new Error('Creator import write permission is required');
      }
    }
  }
}
