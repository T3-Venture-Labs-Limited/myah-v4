import { ConflictException, Injectable } from '@nestjs/common';

import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
  type MyahInboxSourceType,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const MYAH_INBOX_CREATOR_ANCHOR_ADVISORY_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-anchor:' || $1, 0))";

export type MyahInboxSourceSnapshot = {
  sourceType: MyahInboxSourceType;
  sourceRecordId: string;
  creatorId: string | null;
};

type QueryableManager = Pick<WorkspaceEntityManager, 'queryRunner'>;

@Injectable()
export class MyahInboxContactTriageLifecycleService {
  constructor(
    private readonly myahInboxContactTriageService?: MyahInboxContactTriageService,
  ) {}

  async withCreatorMutationLocksInTransaction<T>({
    creatorIds,
    manager,
    mutate,
  }: {
    creatorIds: string[];
    manager: QueryableManager;
    mutate: () => Promise<T>;
  }): Promise<T> {
    const query = this.getTransactionQuery(manager);

    for (const creatorId of [...new Set(creatorIds)].sort((left, right) =>
      left.localeCompare(right),
    )) {
      await query(MYAH_INBOX_CREATOR_ANCHOR_ADVISORY_LOCK_SQL, [
        `creator:${creatorId}`,
      ]);
    }

    return mutate();
  }

  async prepareCreatorMutationInTransaction({
    workspaceId,
    creatorIds,
    manager,
  }: {
    workspaceId: string;
    creatorIds: string[];
    manager: WorkspaceEntityManager;
  }): Promise<MyahInboxSourceSnapshot[]> {
    return this.withCreatorMutationLocksInTransaction({
      creatorIds,
      manager,
      mutate: () =>
        this.prepareAttachedSourcesInTransaction({
          workspaceId,
          creatorIds,
          manager,
        }),
    });
  }

  async withPreparedCreatorMutationInTransaction<T>({
    workspaceId,
    creatorIds,
    manager,
    verify,
    mutate,
  }: {
    workspaceId: string;
    creatorIds: string[];
    manager: WorkspaceEntityManager;
    verify?: () => Promise<void>;
    mutate: (sources: MyahInboxSourceSnapshot[]) => Promise<T>;
  }): Promise<T> {
    return this.withCreatorMutationLocksInTransaction({
      creatorIds,
      manager,
      mutate: async () => {
        const sources = await this.prepareAttachedSourcesInTransaction({
          workspaceId,
          creatorIds,
          manager,
        });
        await verify?.();
        const result = await mutate(sources);
        await this.reconcilePreparedSourcesInTransaction({
          workspaceId,
          sources,
          manager,
        });

        return result;
      },
    });
  }

  async withPreparedSourceMutationInTransaction<T>({
    workspaceId,
    sourceType,
    sourceRecordIds,
    nextCreatorIds = [],
    manager,
    verify,
    mutate,
  }: {
    workspaceId: string;
    sourceType: MyahInboxSourceType;
    sourceRecordIds: string[];
    nextCreatorIds?: string[];
    manager: WorkspaceEntityManager;
    verify?: () => Promise<void>;
    mutate: () => Promise<T>;
  }): Promise<T> {
    const query = this.getTransactionQuery(manager);
    const sortedSourceIds = [...new Set(sourceRecordIds)].sort((left, right) =>
      left.localeCompare(right),
    );

    await query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(workspaceId),
    ]);
    const anticipatedSources = await this.readSourcesById(
      query,
      sourceType,
      sortedSourceIds,
      false,
    );
    const anchorCreatorIds = [
      ...anticipatedSources.map((source) => source.creatorId),
      ...nextCreatorIds,
    ].filter((creatorId): creatorId is string => creatorId !== null);

    return this.withCreatorMutationLocksInTransaction({
      creatorIds: anchorCreatorIds,
      manager,
      mutate: async () => {
        for (const sourceRecordId of sortedSourceIds) {
          await query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
            buildMyahInboxSourceKey(sourceType, sourceRecordId),
          ]);
        }
        const sources = await this.readSourcesById(
          query,
          sourceType,
          sortedSourceIds,
          true,
        );
        const anticipatedCreators = new Map(
          anticipatedSources.map((source) => [
            source.sourceRecordId,
            source.creatorId,
          ]),
        );
        if (
          sources.some(
            (source) =>
              anticipatedCreators.get(source.sourceRecordId) !==
              source.creatorId,
          )
        ) {
          throw new ConflictException(
            'Inbox source changed before lock preparation',
          );
        }
        await verify?.();
        const result = await mutate();
        await this.reconcilePreparedSourcesInTransaction({
          workspaceId,
          sources,
          manager,
        });

        return result;
      },
    });
  }

  async reconcilePreparedSourcesInTransaction({
    workspaceId,
    sources,
    manager,
  }: {
    workspaceId: string;
    sources: MyahInboxSourceSnapshot[];
    manager: WorkspaceEntityManager;
  }): Promise<void> {
    if (!this.myahInboxContactTriageService) {
      throw new Error('Contact triage lifecycle reconciliation is unavailable');
    }

    const query = this.getTransactionQuery(manager);
    const preparedSources = [...sources].sort(compareSources);
    const currentSources: MyahInboxSourceSnapshot[] = [];

    // Source rows remain locked from preparation. Re-read their relation only
    // after the original mutation, then lock the full identity/triage union
    // once before any source can copy or retire a shared Creator tuple.
    for (const source of preparedSources) {
      const rows = (await query(
        source.sourceType === 'EMAIL_THREAD'
          ? 'SELECT id, "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE'
          : 'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE id=$1 FOR UPDATE',
        [source.sourceRecordId],
      )) as Array<{ id: string; creatorId: string | null }>;
      if (rows.length !== 1) continue;
      currentSources.push({
        sourceType: source.sourceType,
        sourceRecordId: source.sourceRecordId,
        creatorId: rows[0].creatorId,
      });
    }

    const previousSourcesByKey = new Map(
      preparedSources.map((source) => [
        buildMyahInboxSourceKey(source.sourceType, source.sourceRecordId),
        source,
      ]),
    );
    const identityKeys = currentSources.flatMap((source) => {
      const previousSource = previousSourcesByKey.get(
        buildMyahInboxSourceKey(source.sourceType, source.sourceRecordId),
      );
      const fallbackIdentityKey = this.fallbackIdentityKey(source);

      return [
        fallbackIdentityKey,
        source.creatorId ? `creator:${source.creatorId}` : fallbackIdentityKey,
        ...(previousSource?.creatorId &&
        previousSource.creatorId !== source.creatorId
          ? [`creator:${previousSource.creatorId}`]
          : []),
      ];
    });
    await this.myahInboxContactTriageService.lockIdentityKeysInTransaction({
      identityKeys: [...new Set(identityKeys)].sort(),
      manager,
    });

    const previousCreatorIds: string[] = [];
    for (const source of currentSources) {
      const previousSource = previousSourcesByKey.get(
        buildMyahInboxSourceKey(source.sourceType, source.sourceRecordId),
      );
      const previousCreatorId = previousSource?.creatorId ?? null;
      if (previousCreatorId && previousCreatorId !== source.creatorId) {
        previousCreatorIds.push(previousCreatorId);
      }
      await this.myahInboxContactTriageService.ensureSourceContactInTransaction(
        {
          workspaceId,
          sourceType: source.sourceType,
          sourceRecordId: source.sourceRecordId,
          previousCreatorId,
          deferPreviousCreatorInvalidation: true,
          manager,
        },
      );
    }

    await this.myahInboxContactTriageService.finalizePreviousCreatorIdentitiesInTransaction(
      { previousCreatorIds: [...new Set(previousCreatorIds)].sort(), manager },
    );
  }

  async rekeyPreparedSourcesToUnmatchedInTransaction({
    sources,
    manager,
  }: {
    sources: MyahInboxSourceSnapshot[];
    manager: WorkspaceEntityManager;
  }): Promise<void> {
    const query = this.getTransactionQuery(manager);

    for (const source of sources) {
      await query(
        source.sourceType === 'EMAIL_THREAD'
          ? 'UPDATE "messageThread" SET "creatorId"=NULL WHERE id=$1'
          : 'UPDATE "_myahSocialConversation" SET "creatorId"=NULL WHERE id=$1',
        [source.sourceRecordId],
      );
    }
  }

  private async prepareAttachedSourcesInTransaction({
    workspaceId,
    creatorIds,
    manager,
  }: {
    workspaceId: string;
    creatorIds: string[];
    manager: WorkspaceEntityManager;
  }): Promise<MyahInboxSourceSnapshot[]> {
    const query = this.getTransactionQuery(manager);
    await query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(workspaceId),
    ]);

    const hasInstagramConversation =
      await this.hasInstagramConversationRelation(query);
    const lockedSourceKeys = new Set<string>();
    let snapshots = await this.readAttachedSources(
      query,
      creatorIds,
      false,
      hasInstagramConversation,
    );

    // Do not take a source row lock until every source in a stable re-read has
    // its advisory lock. A newly linked source therefore restarts the snapshot
    // phase rather than inverting the source advisory/row lock order.
    while (true) {
      const newSources = snapshots.filter(
        (source) =>
          !lockedSourceKeys.has(
            buildMyahInboxSourceKey(source.sourceType, source.sourceRecordId),
          ),
      );
      for (const source of newSources) {
        const sourceKey = buildMyahInboxSourceKey(
          source.sourceType,
          source.sourceRecordId,
        );
        await query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [sourceKey]);
        lockedSourceKeys.add(sourceKey);
      }
      const reread = await this.readAttachedSources(
        query,
        creatorIds,
        false,
        hasInstagramConversation,
      );
      if (
        reread.every((source) =>
          lockedSourceKeys.has(
            buildMyahInboxSourceKey(source.sourceType, source.sourceRecordId),
          ),
        )
      ) {
        snapshots = reread;
        break;
      }
      snapshots = reread;
    }

    const emailSourceIds = snapshots
      .filter((source) => source.sourceType === 'EMAIL_THREAD')
      .map((source) => source.sourceRecordId);
    const instagramSourceIds = snapshots
      .filter((source) => source.sourceType === 'INSTAGRAM_CONVERSATION')
      .map((source) => source.sourceRecordId);
    const lockedSources = [
      ...(await this.readSourcesById(
        query,
        'EMAIL_THREAD',
        emailSourceIds,
        true,
      )),
      ...(hasInstagramConversation
        ? await this.readSourcesById(
            query,
            'INSTAGRAM_CONVERSATION',
            instagramSourceIds,
            true,
          )
        : []),
    ];

    return lockedSources.sort(compareSources);
  }

  private getTransactionQuery(manager: QueryableManager) {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Contact triage lifecycle requires an active transaction',
      );
    }
    return query;
  }

  private async readAttachedSources(
    query: (sql: string, parameters?: unknown[]) => Promise<unknown>,
    creatorIds: string[],
    lockRows: boolean,
    hasInstagramConversation: boolean,
  ): Promise<MyahInboxSourceSnapshot[]> {
    if (creatorIds.length === 0) return [];
    const [emailSources, instagramSources] = await Promise.all([
      query(
        lockRows
          ? 'SELECT id, "creatorId" FROM "messageThread" WHERE "creatorId" = ANY($1::uuid[]) ORDER BY id FOR UPDATE'
          : 'SELECT id, "creatorId" FROM "messageThread" WHERE "creatorId" = ANY($1::uuid[]) ORDER BY id',
        [creatorIds],
      ) as Promise<Array<{ id: string; creatorId: string | null }>>,
      hasInstagramConversation
        ? (query(
            lockRows
              ? 'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE "creatorId" = ANY($1::uuid[]) ORDER BY id FOR UPDATE'
              : 'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE "creatorId" = ANY($1::uuid[]) ORDER BY id',
            [creatorIds],
          ) as Promise<Array<{ id: string; creatorId: string | null }>>)
        : Promise.resolve([]),
    ]);

    return this.toSourceSnapshots(emailSources, instagramSources);
  }

  private async readSourcesById(
    query: (sql: string, parameters?: unknown[]) => Promise<unknown>,
    sourceType: MyahInboxSourceType,
    sourceRecordIds: string[],
    lockRows: boolean,
  ): Promise<MyahInboxSourceSnapshot[]> {
    if (sourceRecordIds.length === 0) return [];
    if (
      sourceType === 'INSTAGRAM_CONVERSATION' &&
      !(await this.hasInstagramConversationRelation(query))
    ) {
      return [];
    }
    const sql =
      sourceType === 'EMAIL_THREAD'
        ? lockRows
          ? 'SELECT id, "creatorId" FROM "messageThread" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE'
          : 'SELECT id, "creatorId" FROM "messageThread" WHERE id = ANY($1::uuid[]) ORDER BY id'
        : lockRows
          ? 'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE'
          : 'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE id = ANY($1::uuid[]) ORDER BY id';
    const rows = (await query(sql, [sourceRecordIds])) as Array<{
      id: string;
      creatorId: string | null;
    }>;

    return this.toSourceSnapshots(
      sourceType === 'EMAIL_THREAD' ? rows : [],
      sourceType === 'INSTAGRAM_CONVERSATION' ? rows : [],
    );
  }

  private async hasInstagramConversationRelation(
    query: (sql: string, parameters?: unknown[]) => Promise<unknown>,
  ): Promise<boolean> {
    const [relation] = (await query(
      'SELECT to_regclass($1) IS NOT NULL AS "exists"',
      ['"_myahSocialConversation"'],
    )) as Array<{ exists: boolean }>;

    return relation?.exists === true;
  }

  private fallbackIdentityKey(source: MyahInboxSourceSnapshot): string {
    return source.sourceType === 'EMAIL_THREAD'
      ? `email-thread:${source.sourceRecordId}`
      : `instagram-conversation:${source.sourceRecordId}`;
  }

  private toSourceSnapshots(
    emailSources: Array<{ id: string; creatorId: string | null }>,
    instagramSources: Array<{ id: string; creatorId: string | null }>,
  ): MyahInboxSourceSnapshot[] {
    return [
      ...emailSources.map((source) => ({
        sourceType: 'EMAIL_THREAD' as const,
        sourceRecordId: source.id,
        creatorId: source.creatorId,
      })),
      ...instagramSources.map((source) => ({
        sourceType: 'INSTAGRAM_CONVERSATION' as const,
        sourceRecordId: source.id,
        creatorId: source.creatorId,
      })),
    ].sort(compareSources);
  }
}

const compareSources = (
  left: MyahInboxSourceSnapshot,
  right: MyahInboxSourceSnapshot,
) =>
  buildMyahInboxSourceKey(left.sourceType, left.sourceRecordId).localeCompare(
    buildMyahInboxSourceKey(right.sourceType, right.sourceRecordId),
  );
