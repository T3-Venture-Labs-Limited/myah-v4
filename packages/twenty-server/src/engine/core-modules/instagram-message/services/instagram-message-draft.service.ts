import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type QueryRunner, type Repository } from 'typeorm';

import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { isInstagramMessageIdentitySnapshot } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { resolveInstagramRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { InstagramMessageDraftLockService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft-lock.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export type SaveInstagramMessageDraftInput = {
  workspaceId: string;
  workspaceMemberId: string;
  draftId: string;
  expectedRevision: number;
  kind: 'FIRST_MESSAGE' | 'REPLY';
  body: string;
  creatorRecordId: string | null;
  conversationRecordId: string | null;
};

export type GetInstagramMessageDraftForTargetInput = {
  workspaceId: string;
  kind: 'FIRST_MESSAGE' | 'REPLY';
  creatorRecordId: string | null;
  conversationRecordId: string | null;
};

export type SaveInstagramMessageDraftResult = {
  status: 'SAVED' | 'CONFLICT';
  draftId: string;
  revision: number;
  body: string;
};

export type GetInstagramMessageDraftForTargetResult =
  SaveInstagramMessageDraftResult & {
    executionLocked: boolean;
  };

type DraftTarget = {
  creatorRecordId: string;
  conversationRecordId: string | null;
  recipientUsername: string;
  recipientProviderId: string;
};

type SavedDraftRow = {
  id: string;
  revision: number | string;
  body: string;
};

@Injectable()
export class InstagramMessageDraftService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly actionApprovalService: ActionApprovalService,
    private readonly draftLockService: InstagramMessageDraftLockService,
  ) {}

  async saveDraft(
    input: SaveInstagramMessageDraftInput,
  ): Promise<SaveInstagramMessageDraftResult> {
    return this.draftLockService.withLock(
      { workspaceId: input.workspaceId, draftId: input.draftId },
      () => this.saveDraftWithLockHeld(input),
    );
  }

  async getDraftForTarget(
    input: GetInstagramMessageDraftForTargetInput,
  ): Promise<GetInstagramMessageDraftForTargetResult | null> {
    const workspace = await this.getWorkspace(input.workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
        const targetPredicate =
          input.kind === 'FIRST_MESSAGE'
            ? '"creatorId" = $2 AND "conversationId" IS NULL'
            : '"conversationId" = $2';
        const targetRecordId =
          input.kind === 'FIRST_MESSAGE'
            ? input.creatorRecordId
            : input.conversationRecordId;
        const [draft] = await dataSource.query<SavedDraftRow[]>(
          `SELECT "id", "revision", "body"
           FROM "${schemaName}"."_myahInstagramReplyDraft"
           WHERE "kind" = $1
             AND ${targetPredicate}
             AND "sentAt" IS NULL
             AND "deletedAt" IS NULL
           ORDER BY "updatedAt" DESC, "id" DESC
           LIMIT 1`,
          [input.kind, targetRecordId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );

        if (!draft) {
          return null;
        }

        const executionLocked =
          await this.actionApprovalService.isDraftExecutionLocked({
            workspaceId: input.workspaceId,
            actionName: 'send_instagram_message',
            draftId: draft.id,
          });

        return {
          ...this.toResult('SAVED', draft),
          executionLocked,
        };
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  private async saveDraftWithLockHeld(
    input: SaveInstagramMessageDraftInput,
  ): Promise<SaveInstagramMessageDraftResult> {
    const body = input.body.trim();
    if (
      (!body && input.expectedRevision === 0) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw new Error('Invalid Instagram message draft');
    }
    if (
      await this.actionApprovalService.isDraftExecutionLocked({
        workspaceId: input.workspaceId,
        actionName: 'send_instagram_message',
        draftId: input.draftId,
      })
    ) {
      throw new Error('Instagram message draft is locked for execution');
    }
    const workspace = await this.getWorkspace(input.workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);

        return dataSource.transaction(async (manager) => {
          if (
            await this.isVerifiedComposerDraft(
              dataSource,
              schemaName,
              input.draftId,
              manager.queryRunner,
            )
          ) {
            throw new Error('Instagram message draft is locked for execution');
          }
          const target = await this.resolveTarget(
            dataSource,
            manager.queryRunner,
            schemaName,
            input,
          );

          if (input.expectedRevision === 0) {
            const [created] = await dataSource.query<SavedDraftRow[]>(
              `INSERT INTO "${schemaName}"."_myahInstagramReplyDraft" (
                 "id", "name", "title", "body", "kind", "status", "source",
                 "creatorId", "conversationId", "recipientUsername",
                 "recipientProviderId", "revision",
                 "createdBySource", "createdByWorkspaceMemberId", "createdByName",
                 "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName"
               ) VALUES (
                 $1, $2, $2, $3, '${input.kind}', 'DRAFT', 'MANUAL',
                 $4, $5, $6, $7, 1,
                 'MANUAL', $8, 'Workspace member',
                 'MANUAL', $8, 'Workspace member'
               )
               ON CONFLICT ("id") DO NOTHING
               RETURNING "id", "revision", "body"`,
              [
                input.draftId,
                input.kind === 'FIRST_MESSAGE'
                  ? `First message to ${target.recipientUsername}`
                  : `Reply to ${target.recipientUsername}`,
                body,
                target.creatorRecordId,
                target.conversationRecordId,
                target.recipientUsername,
                target.recipientProviderId,
                input.workspaceMemberId,
              ],
              manager.queryRunner,
              { shouldBypassPermissionChecks: true },
            );

            if (created) return this.toResult('SAVED', created);

            const [current] = await dataSource.query<SavedDraftRow[]>(
              `SELECT "id", "revision", "body"
               FROM "${schemaName}"."_myahInstagramReplyDraft"
               WHERE "id" = $1
                 AND "deletedAt" IS NULL
               LIMIT 1`,
              [input.draftId],
              manager.queryRunner,
              { shouldBypassPermissionChecks: true },
            );
            if (!current) {
              throw new Error('Instagram message draft is unavailable');
            }

            return this.toResult('CONFLICT', current);
          }

          const [savedRows] = await dataSource.query<[SavedDraftRow[], number]>(
            `UPDATE "${schemaName}"."_myahInstagramReplyDraft"
             SET "body" = $3,
                 "kind" = '${input.kind}',
                 "creatorId" = $4,
                 "conversationId" = $5,
                 "recipientUsername" = $6,
                 "recipientProviderId" = $7,
                 "revision" = "revision" + 1,
                 "status" = 'DRAFT',
                 "updatedAt" = NOW(),
                 "updatedBySource" = 'MANUAL',
                 "updatedByWorkspaceMemberId" = $8,
                 "updatedByName" = 'Workspace member'
             WHERE "id" = $1
               AND "revision" = $2
               AND "sentAt" IS NULL
               AND "deletedAt" IS NULL
             RETURNING "id", "revision", "body"`,
            [
              input.draftId,
              input.expectedRevision,
              body,
              target.creatorRecordId,
              target.conversationRecordId,
              target.recipientUsername,
              target.recipientProviderId,
              input.workspaceMemberId,
            ],
            manager.queryRunner,
            { shouldBypassPermissionChecks: true },
          );
          const [saved] = savedRows;
          if (saved) return this.toResult('SAVED', saved);

          const [current] = await dataSource.query<SavedDraftRow[]>(
            `SELECT "id", "revision", "body"
             FROM "${schemaName}"."_myahInstagramReplyDraft"
             WHERE "id" = $1
               AND "deletedAt" IS NULL
             LIMIT 1`,
            [input.draftId],
            manager.queryRunner,
            { shouldBypassPermissionChecks: true },
          );
          if (!current)
            throw new Error('Instagram message draft is unavailable');

          return this.toResult('CONFLICT', current);
        });
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  private async isVerifiedComposerDraft(
    dataSource: GlobalWorkspaceDataSource,
    schemaName: string,
    draftId: string,
    queryRunner: QueryRunner | undefined,
  ): Promise<boolean> {
    const columns = await dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = '_myahInstagramReplyDraft'
         AND column_name = ANY($2)`,
      [schemaName, ['composerInputDigest', 'instagramMessageSnapshot']],
      queryRunner,
      { shouldBypassPermissionChecks: true },
    );
    if (columns.length !== 2) return false;
    const [draft] = await dataSource.query<
      Array<{
        composerInputDigest: string | null;
        instagramMessageSnapshot: unknown;
      }>
    >(
      `SELECT "composerInputDigest", "instagramMessageSnapshot"
       FROM "${schemaName}"."_myahInstagramReplyDraft"
       WHERE "id" = $1 AND "deletedAt" IS NULL`,
      [draftId],
      queryRunner,
      { shouldBypassPermissionChecks: true },
    );
    return (
      typeof draft?.composerInputDigest === 'string' &&
      /^[0-9a-f]{64}$/i.test(draft.composerInputDigest) &&
      isInstagramMessageIdentitySnapshot(draft.instagramMessageSnapshot)
    );
  }

  async markSent(input: {
    workspaceId: string;
    draftId: string;
    contentDigest: string;
  }): Promise<void> {
    const workspace = await this.getWorkspace(input.workspaceId);
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      const schemaName = getWorkspaceSchemaName(workspace.id);
      await dataSource.transaction(async (manager) => {
        const [draft] = await dataSource.query<Array<{ body: string | null }>>(
          `SELECT "body"
             FROM "${schemaName}"."_myahInstagramReplyDraft"
             WHERE "id" = $1 AND "deletedAt" IS NULL
             LIMIT 1`,
          [input.draftId],
          manager.queryRunner,
          { shouldBypassPermissionChecks: true },
        );
        if (
          !draft?.body ||
          computeActionContentDigest(draft.body) !== input.contentDigest
        ) {
          throw new Error('Instagram message draft content changed');
        }
        await dataSource.query(
          `UPDATE "${schemaName}"."_myahInstagramReplyDraft"
             SET "status" = 'SENT',
                 "sentAt" = COALESCE("sentAt", NOW()),
                 "updatedAt" = NOW()
             WHERE "id" = $1
               AND "deletedAt" IS NULL`,
          [input.draftId],
          manager.queryRunner,
          { shouldBypassPermissionChecks: true },
        );
      });
    }, buildSystemAuthContext({ workspace }));
  }

  private async resolveTarget(
    dataSource: GlobalWorkspaceDataSource,
    queryRunner: QueryRunner | undefined,
    schemaName: string,
    input: SaveInstagramMessageDraftInput,
  ): Promise<DraftTarget> {
    if (input.kind === 'FIRST_MESSAGE') {
      if (!input.creatorRecordId || input.conversationRecordId) {
        throw new Error(
          'FIRST_MESSAGE draft requires a Creator and no conversation',
        );
      }
      const [creator] = await dataSource.query<
        Array<{
          instagramUsername: string | null;
          instagramUrl: string | null;
          instagramLinkPrimaryLinkUrl: string | null;
        }>
      >(
        `SELECT "instagramUsername", "instagramUrl", "instagramLinkPrimaryLinkUrl"
         FROM "${schemaName}"."creator"
         WHERE "id" = $1 AND "deletedAt" IS NULL
         LIMIT 1`,
        [input.creatorRecordId],
        queryRunner,
        { shouldBypassPermissionChecks: true },
      );
      if (!creator) throw new Error('Creator is unavailable');
      const recipient = resolveInstagramRecipient({
        instagramUsername: creator.instagramUsername,
        instagramUrl: creator.instagramUrl,
        instagramLink: {
          primaryLinkUrl: creator.instagramLinkPrimaryLinkUrl,
        },
      });

      return {
        creatorRecordId: input.creatorRecordId,
        conversationRecordId: null,
        recipientUsername: recipient.normalizedUsername,
        recipientProviderId: recipient.normalizedUsername,
      };
    }

    if (!input.conversationRecordId) {
      throw new Error('Active Unipile conversation is unavailable');
    }
    const [conversation] = await dataSource.query<
      Array<{
        id: string;
        creatorId: string | null;
        provider: string;
        lifecycle: string;
        recipientUsername: string | null;
        recipientIgsid: string | null;
      }>
    >(
      `SELECT "id", "creatorId", "provider", "lifecycle",
              "recipientUsername", "recipientIgsid"
       FROM "${schemaName}"."_myahSocialConversation"
       WHERE "id" = $1
         AND "provider" = 'UNIPILE'
         AND "lifecycle" = 'ACTIVE'
         AND "deletedAt" IS NULL
       LIMIT 1`,
      [input.conversationRecordId],
      queryRunner,
      { shouldBypassPermissionChecks: true },
    );
    if (
      !conversation ||
      !conversation.creatorId ||
      !conversation.recipientIgsid?.trim()
    ) {
      throw new Error('Active Unipile conversation is unavailable');
    }

    const [creator] = await dataSource.query<
      Array<{
        instagramUsername: string | null;
        instagramUrl: string | null;
        instagramLinkPrimaryLinkUrl: string | null;
      }>
    >(
      `SELECT "instagramUsername", "instagramUrl", "instagramLinkPrimaryLinkUrl"
       FROM "${schemaName}"."creator"
       WHERE "id" = $1 AND "deletedAt" IS NULL
       LIMIT 1`,
      [conversation.creatorId],
      queryRunner,
      { shouldBypassPermissionChecks: true },
    );
    if (!creator) throw new Error('Creator is unavailable');
    const recipient = resolveInstagramRecipient({
      instagramUsername: creator.instagramUsername,
      instagramUrl: creator.instagramUrl,
      instagramLink: {
        primaryLinkUrl: creator.instagramLinkPrimaryLinkUrl,
      },
    });

    return {
      creatorRecordId: conversation.creatorId,
      conversationRecordId: conversation.id,
      recipientUsername: recipient.normalizedUsername,
      recipientProviderId: conversation.recipientIgsid.trim(),
    };
  }

  private toResult(
    status: SaveInstagramMessageDraftResult['status'],
    row: SavedDraftRow | undefined,
  ): SaveInstagramMessageDraftResult {
    if (!row) throw new Error('Instagram message draft persistence failed');

    return {
      status,
      draftId: row.id,
      revision: Number(row.revision),
      body: row.body,
    };
  }

  private async getWorkspace(workspaceId: string): Promise<FlatWorkspace> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });
    if (!workspace) throw new Error('Workspace is unavailable');

    // SAFETY: this query only needs the workspace identifier required by the system auth context.
    return workspace as unknown as FlatWorkspace;
  }
}
