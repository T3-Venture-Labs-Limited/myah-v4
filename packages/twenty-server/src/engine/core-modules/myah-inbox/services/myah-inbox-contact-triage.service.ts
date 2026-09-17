import { Injectable } from '@nestjs/common';

import { MyahInboxTriageConflictError } from 'src/engine/core-modules/myah-inbox/errors/myah-inbox-triage-conflict.error';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

type SourceType = 'EMAIL_THREAD' | 'INSTAGRAM_CONVERSATION';
type InitialDirection = 'INBOUND' | 'OUTBOUND' | 'UNKNOWN' | null;
type InboxState = 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED';

type SourceRecord = {
  id: string;
  creatorId: string | null;
};

type TriageRecord = {
  inboxOwnerId: string | null;
  inboxState: InboxState;
  snoozedUntil: string | null;
  revision: number;
  identityGeneration: string;
};

type DatabaseTriageRecord = Omit<TriageRecord, 'snoozedUntil'> & {
  snoozedUntil: Date | string | null;
};

export type MyahInboxTriageReceipt = {
  sequence: string;
  channel: 'EMAIL' | 'INSTAGRAM';
  persistedMessageId: string;
  sourceRecordId: string;
  sourceGenerationId: string;
  mode: 'LIVE' | 'BACKFILL';
  direction: 'INBOUND' | 'OUTBOUND';
  providerOccurredAt: string | null;
  originalCreatedAt: string;
  normalizedOccurredAt: string;
  orderKey: string;
};

export type UpdateMyahInboxContactTriageTuple = {
  inboxOwnerId?: string | null;
  inboxState?: InboxState | null;
  snoozedUntil?: string | null;
};

const normalizeTriageRecord = (record: DatabaseTriageRecord): TriageRecord => ({
  ...record,
  snoozedUntil:
    record.snoozedUntil instanceof Date
      ? record.snoozedUntil.toISOString()
      : record.snoozedUntil,
});

@Injectable()
export class MyahInboxContactTriageService {
  // A source-backed mutation must establish that its opaque fallback identity
  // is still current before permission fences, but must not acquire the
  // Creator tuple yet. A linked source is stale by definition and taking its
  // shared Creator lock here can invert an Email association writer.
  async prepareUnmatchedSourceContactInTransaction({
    workspaceId,
    sourceType,
    sourceRecordId,
    manager,
  }: {
    workspaceId?: string;
    sourceType: SourceType;
    sourceRecordId: string;
    manager: WorkspaceEntityManager;
  }): Promise<string | null> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Source contact preparation requires an active transaction manager',
      );
    }
    const resolvedWorkspaceId =
      workspaceId ?? manager.internalContext.workspaceId;
    const sourceKey = buildMyahInboxSourceKey(sourceType, sourceRecordId);

    await query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(resolvedWorkspaceId),
    ]);
    await query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [sourceKey]);
    const sources = (
      sourceType === 'EMAIL_THREAD'
        ? await query(
            'SELECT id, "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE',
            [sourceRecordId],
          )
        : await query(
            'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE id=$1 FOR UPDATE',
            [sourceRecordId],
          )
    ) as SourceRecord[];
    const [source] = sources;
    if (!source || source.creatorId) return null;

    return sourceType === 'EMAIL_THREAD'
      ? `email-thread:${sourceRecordId}`
      : `instagram-conversation:${sourceRecordId}`;
  }

  async ensureSourceContactInTransaction({
    workspaceId,
    sourceType,
    sourceRecordId,
    initialDirection,
    initialOccurredAt,
    previousCreatorId,
    deferPreviousCreatorInvalidation,
    manager,
  }: {
    workspaceId?: string;
    sourceType: SourceType;
    sourceRecordId: string;
    initialDirection?: InitialDirection;
    initialOccurredAt?: string;
    previousCreatorId?: string | null;
    // Batch lifecycle reconciliation locks every identity before copying any
    // shared tuple. It finalizes the old Creator only after every source has
    // received its fallback tuple.
    deferPreviousCreatorInvalidation?: boolean;
    manager: WorkspaceEntityManager;
  }): Promise<string | null> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Source contact initialization requires an active transaction manager',
      );
    }
    const resolvedWorkspaceId =
      workspaceId ?? manager.internalContext.workspaceId;
    const sourceKey = buildMyahInboxSourceKey(sourceType, sourceRecordId);

    await query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(resolvedWorkspaceId),
    ]);
    // This is also acquired by every source identity mutation before it changes
    // the Creator relation. The row is deliberately re-read after acquisition.
    await query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [sourceKey]);
    const sources = (
      sourceType === 'EMAIL_THREAD'
        ? await query(
            'SELECT id, "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE',
            [sourceRecordId],
          )
        : await query(
            'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE id=$1 FOR UPDATE',
            [sourceRecordId],
          )
    ) as SourceRecord[];
    if (sources.length !== 1) return null;

    const [source] = sources;
    const fallbackIdentityKey =
      sourceType === 'EMAIL_THREAD'
        ? `email-thread:${sourceRecordId}`
        : `instagram-conversation:${sourceRecordId}`;
    const identityKey = source.creatorId
      ? `creator:${source.creatorId}`
      : fallbackIdentityKey;
    const previousIdentityKey =
      previousCreatorId && previousCreatorId !== source.creatorId
        ? `creator:${previousCreatorId}`
        : null;
    const lifecycleIdentityKeys = [
      fallbackIdentityKey,
      identityKey,
      ...(previousIdentityKey ? [previousIdentityKey] : []),
    ].sort();
    // Always materialize and lock both lifecycle identities before changing
    // either one. A fallback tuple may predate a Creator link, while a Creator
    // tuple may already be shared by another source.
    await this.lockIdentityKeysInTransaction({
      identityKeys: lifecycleIdentityKeys,
      manager,
    });

    if (source.creatorId) {
      // A Creator without sources is retired. Linking a source back to it must
      // make that Creator the active tuple owner before the fallback merge.
      const activated = (await query(
        `WITH activated AS (
           UPDATE "myahInboxContactIdentity"
           SET "isActive"=true, generation=generation+1, "updatedAt"=now()
           WHERE "contactIdentityKey"=$1 AND "isActive"=false
           RETURNING generation
         )
         SELECT generation FROM activated`,
        [identityKey],
      )) as Array<{ generation: string }>;
      if (activated.length === 1) {
        await query(
          `UPDATE "myahInboxContactTriage"
           SET "identityGeneration"=$2::bigint, revision=revision+1, "triageChangedAt"=now()
           WHERE "contactIdentityKey"=$1`,
          [identityKey, activated[0].generation],
        );
      }
      // A direct Creator-to-Creator relink has no live fallback tuple because
      // the original link retired it. Recreate that source-local tuple from
      // the old Creator before merging it into the new Creator.
      if (previousIdentityKey) {
        await query(
          `INSERT INTO "myahInboxContactTriage" (
             "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState", "snoozedUntil", revision,
             "hasStateDecision", "stateDecisionAt", "lastInboundOccurredAt", "lastInboundOrderKey", "triageChangedAt"
           )
           SELECT $2, fallback_identity.generation, previous_creator."inboxOwnerId", previous_creator."inboxState", previous_creator."snoozedUntil",
                  previous_creator.revision, previous_creator."hasStateDecision", previous_creator."stateDecisionAt", previous_creator."lastInboundOccurredAt", previous_creator."lastInboundOrderKey", previous_creator."triageChangedAt"
           FROM "myahInboxContactTriage" previous_creator
           JOIN "myahInboxContactIdentity" fallback_identity ON fallback_identity."contactIdentityKey"=$2
           WHERE previous_creator."contactIdentityKey"=$1
           ON CONFLICT ("contactIdentityKey") DO NOTHING`,
          [previousIdentityKey, fallbackIdentityKey],
        );
      }
      // Move/merge the source fallback into the Creator tuple while holding
      // both tuple rows. The more recently changed tuple owns mutable fields;
      // inbound ordering is independently preserved below.
      await query(
        `INSERT INTO "myahInboxContactTriage" (
           "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState", "snoozedUntil", revision,
           "hasStateDecision", "stateDecisionAt", "lastInboundOccurredAt", "lastInboundOrderKey", "triageChangedAt"
         )
         SELECT $2, creator_identity.generation, fallback."inboxOwnerId", fallback."inboxState", fallback."snoozedUntil",
                fallback.revision, fallback."hasStateDecision", fallback."stateDecisionAt", fallback."lastInboundOccurredAt", fallback."lastInboundOrderKey", fallback."triageChangedAt"
         FROM "myahInboxContactTriage" fallback
         JOIN "myahInboxContactIdentity" creator_identity ON creator_identity."contactIdentityKey"=$2
         WHERE fallback."contactIdentityKey"=$1
         ON CONFLICT ("contactIdentityKey") DO NOTHING`,
        [fallbackIdentityKey, identityKey],
      );
      await query(
        `UPDATE "myahInboxContactIdentity"
         SET generation=generation+1, "updatedAt"=now()
         WHERE "contactIdentityKey"=$1
           AND EXISTS (
             SELECT 1 FROM "myahInboxContactTriage" WHERE "contactIdentityKey"=$2
           )`,
        [identityKey, fallbackIdentityKey],
      );
      await query(
        `UPDATE "myahInboxContactTriage" creator
         SET "inboxOwnerId"=CASE WHEN fallback."triageChangedAt" > creator."triageChangedAt"
                                     OR (fallback."triageChangedAt" = creator."triageChangedAt" AND fallback."contactIdentityKey" > creator."contactIdentityKey")
                                  THEN fallback."inboxOwnerId" ELSE creator."inboxOwnerId" END,
             "inboxState"=CASE WHEN fallback."triageChangedAt" > creator."triageChangedAt"
                                  OR (fallback."triageChangedAt" = creator."triageChangedAt" AND fallback."contactIdentityKey" > creator."contactIdentityKey")
                               THEN fallback."inboxState" ELSE creator."inboxState" END,
             "snoozedUntil"=CASE WHEN fallback."triageChangedAt" > creator."triageChangedAt"
                                    OR (fallback."triageChangedAt" = creator."triageChangedAt" AND fallback."contactIdentityKey" > creator."contactIdentityKey")
                                 THEN fallback."snoozedUntil" ELSE creator."snoozedUntil" END,
             "hasStateDecision"=CASE WHEN fallback."triageChangedAt" > creator."triageChangedAt"
                                         OR (fallback."triageChangedAt" = creator."triageChangedAt" AND fallback."contactIdentityKey" > creator."contactIdentityKey")
                                      THEN fallback."hasStateDecision" ELSE creator."hasStateDecision" END,
             "stateDecisionAt"=CASE WHEN fallback."triageChangedAt" > creator."triageChangedAt"
                                         OR (fallback."triageChangedAt" = creator."triageChangedAt" AND fallback."contactIdentityKey" > creator."contactIdentityKey")
                                      THEN fallback."stateDecisionAt" ELSE creator."stateDecisionAt" END,
             "lastInboundOccurredAt"=CASE WHEN creator."lastInboundOccurredAt" IS NULL OR fallback."lastInboundOccurredAt" > creator."lastInboundOccurredAt"
                                             OR (fallback."lastInboundOccurredAt" = creator."lastInboundOccurredAt" AND fallback."lastInboundOrderKey" > creator."lastInboundOrderKey")
                                          THEN fallback."lastInboundOccurredAt" ELSE creator."lastInboundOccurredAt" END,
             "lastInboundOrderKey"=CASE WHEN creator."lastInboundOccurredAt" IS NULL OR fallback."lastInboundOccurredAt" > creator."lastInboundOccurredAt"
                                           OR (fallback."lastInboundOccurredAt" = creator."lastInboundOccurredAt" AND fallback."lastInboundOrderKey" > creator."lastInboundOrderKey")
                                        THEN fallback."lastInboundOrderKey" ELSE creator."lastInboundOrderKey" END,
             "identityGeneration"=identity.generation,
             revision=creator.revision+1,
             "triageChangedAt"=GREATEST(creator."triageChangedAt", fallback."triageChangedAt")
         FROM "myahInboxContactTriage" fallback,
              "myahInboxContactIdentity" identity
         WHERE creator."contactIdentityKey"=$2
           AND fallback."contactIdentityKey"=$1
           AND identity."contactIdentityKey"=$2`,
        [fallbackIdentityKey, identityKey],
      );
      await query(
        'DELETE FROM "myahInboxContactTriage" WHERE "contactIdentityKey"=$1',
        [fallbackIdentityKey],
      );
      await query(
        `UPDATE "myahInboxContactIdentity"
         SET "isActive"=false, generation=generation+1, "updatedAt"=now()
         WHERE "contactIdentityKey"=$1 AND "isActive"=true`,
        [fallbackIdentityKey],
      );
      if (
        previousIdentityKey &&
        previousCreatorId &&
        !deferPreviousCreatorInvalidation
      ) {
        await this.invalidatePreviousCreatorIdentity({
          query,
          previousIdentityKey,
          previousCreatorId,
        });
      }
    } else {
      const activated = (await query(
        `WITH activated AS (
           UPDATE "myahInboxContactIdentity"
           SET "isActive"=true, generation=generation+1, "updatedAt"=now()
           WHERE "contactIdentityKey"=$1 AND "isActive"=false
           RETURNING generation
         )
         SELECT generation FROM activated`,
        [identityKey],
      )) as Array<{ generation: string }>;
      if (activated.length === 1) {
        await query(
          `UPDATE "myahInboxContactTriage"
           SET "identityGeneration"=$2::bigint, revision=revision+1, "triageChangedAt"=now()
           WHERE "contactIdentityKey"=$1`,
          [identityKey, activated[0].generation],
        );
      }
      // Unlink is the inverse lifecycle transition: preserve the former
      // Creator tuple for this exact source, but make it a fresh fallback
      // tuple so pre-unlink CAS generations cannot be reused.
      if (previousIdentityKey) {
        await query(
          `INSERT INTO "myahInboxContactTriage" (
             "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState", "snoozedUntil", revision,
             "hasStateDecision", "stateDecisionAt", "lastInboundOccurredAt", "lastInboundOrderKey", "triageChangedAt"
           )
           SELECT $2, fallback_identity.generation, creator."inboxOwnerId", creator."inboxState", creator."snoozedUntil", 1,
                  creator."hasStateDecision", creator."stateDecisionAt", creator."lastInboundOccurredAt", creator."lastInboundOrderKey", now()
           FROM "myahInboxContactTriage" creator
           JOIN "myahInboxContactIdentity" fallback_identity ON fallback_identity."contactIdentityKey"=$2
           WHERE creator."contactIdentityKey"=$1
           ON CONFLICT ("contactIdentityKey") DO UPDATE
             SET "identityGeneration"=EXCLUDED."identityGeneration",
                 "inboxOwnerId"=EXCLUDED."inboxOwnerId", "inboxState"=EXCLUDED."inboxState",
                 "snoozedUntil"=EXCLUDED."snoozedUntil", revision=1,
                 "hasStateDecision"=EXCLUDED."hasStateDecision",
                 "stateDecisionAt"=EXCLUDED."stateDecisionAt",
                 "lastInboundOccurredAt"=EXCLUDED."lastInboundOccurredAt",
                 "lastInboundOrderKey"=EXCLUDED."lastInboundOrderKey",
                 "triageChangedAt"=EXCLUDED."triageChangedAt"`,
          [previousIdentityKey, fallbackIdentityKey],
        );
        if (!deferPreviousCreatorInvalidation) {
          await this.invalidatePreviousCreatorIdentity({
            query,
            previousIdentityKey,
            previousCreatorId: previousCreatorId!,
          });
        }
      }
    }
    await query(
      `INSERT INTO "myahInboxContactTriage" ("contactIdentityKey", "identityGeneration", "inboxState", revision, "stateDecisionAt", "triageChangedAt")
       SELECT "contactIdentityKey", generation, $2, 1, COALESCE($3::timestamptz, now()), now()
       FROM "myahInboxContactIdentity"
       WHERE "contactIdentityKey"=$1
       ON CONFLICT ("contactIdentityKey") DO NOTHING`,
      [
        identityKey,
        this.initialInboxState(initialDirection),
        initialOccurredAt ?? null,
      ],
    );

    // A source can be created before its first persisted message (notably an
    // Instagram conversation discovered during chat projection). In that case
    // the source-only CLOSED tuple already exists when the receipt is drained.
    // Automatic first-message state is not an operator decision. It retains
    // the receipt occurrence time so a later ordered LIVE inbound can reopen
    // it even when provider time predates transaction ingestion time.
    if (initialDirection === 'INBOUND' || initialDirection === 'OUTBOUND') {
      await query(
        `UPDATE "myahInboxContactTriage"
         SET "inboxState"=$2,
             revision=revision+1,
             "stateDecisionAt"=COALESCE($3::timestamptz, now()),
             "triageChangedAt"=now()
         WHERE "contactIdentityKey"=$1
           AND "hasStateDecision"=false
           AND "inboxState"='CLOSED'
           AND "lastInboundOccurredAt" IS NULL`,
        [
          identityKey,
          this.initialInboxState(initialDirection),
          initialOccurredAt ?? null,
        ],
      );
    }

    return identityKey;
  }

  async lockIdentityKeysInTransaction({
    identityKeys,
    manager,
  }: {
    identityKeys: string[];
    manager: WorkspaceEntityManager;
  }): Promise<void> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Identity locking requires an active transaction manager',
      );
    }
    const sortedIdentityKeys = [...new Set(identityKeys)].sort();
    for (const identityKey of sortedIdentityKeys) {
      await query(
        'INSERT INTO "myahInboxContactIdentity" ("contactIdentityKey") VALUES ($1) ON CONFLICT ("contactIdentityKey") DO NOTHING',
        [identityKey],
      );
    }
    if (sortedIdentityKeys.length === 0) return;
    await query(
      'SELECT "contactIdentityKey", generation, "isActive" FROM "myahInboxContactIdentity" WHERE "contactIdentityKey" = ANY($1::text[]) ORDER BY "contactIdentityKey" FOR UPDATE',
      [sortedIdentityKeys],
    );
    await query(
      'SELECT "contactIdentityKey", revision FROM "myahInboxContactTriage" WHERE "contactIdentityKey" = ANY($1::text[]) ORDER BY "contactIdentityKey" FOR UPDATE',
      [sortedIdentityKeys],
    );
  }

  async finalizePreviousCreatorIdentitiesInTransaction({
    previousCreatorIds,
    manager,
  }: {
    previousCreatorIds: string[];
    manager: WorkspaceEntityManager;
  }): Promise<void> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Identity finalization requires an active transaction manager',
      );
    }
    for (const previousCreatorId of [...new Set(previousCreatorIds)].sort()) {
      await this.invalidatePreviousCreatorIdentity({
        query,
        previousIdentityKey: `creator:${previousCreatorId}`,
        previousCreatorId,
      });
    }
  }

  async applyReceiptInTransaction(
    receipt: MyahInboxTriageReceipt,
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const sourceType =
      receipt.channel === 'EMAIL' ? 'EMAIL_THREAD' : 'INSTAGRAM_CONVERSATION';
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Triage receipt application requires an active transaction manager',
      );
    }

    await this.ensureSourceContactInTransaction({
      sourceType,
      sourceRecordId: receipt.sourceRecordId,
      initialDirection: receipt.direction,
      initialOccurredAt: receipt.normalizedOccurredAt,
      manager,
    });
    const sourceRows = (
      sourceType === 'EMAIL_THREAD'
        ? await query(
            'SELECT "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE',
            [receipt.sourceRecordId],
          )
        : await query(
            'SELECT "creatorId" FROM "_myahSocialConversation" WHERE id=$1 FOR UPDATE',
            [receipt.sourceRecordId],
          )
    ) as Pick<SourceRecord, 'creatorId'>[];
    const source = sourceRows[0];
    if (!source) return;

    const identityKey = source.creatorId
      ? `creator:${source.creatorId}`
      : sourceType === 'EMAIL_THREAD'
        ? `email-thread:${receipt.sourceRecordId}`
        : `instagram-conversation:${receipt.sourceRecordId}`;
    await query(
      'SELECT "contactIdentityKey" FROM "myahInboxContactIdentity" WHERE "contactIdentityKey"=$1 FOR UPDATE',
      [identityKey],
    );
    await query(
      'SELECT revision FROM "myahInboxContactTriage" WHERE "contactIdentityKey"=$1 FOR UPDATE',
      [identityKey],
    );

    await this.resolveDueSnoozesInTransaction({
      manager,
      contactIdentityKey: identityKey,
    });

    if (receipt.direction !== 'INBOUND') return;

    if (receipt.mode === 'BACKFILL') {
      await query(
        `UPDATE "myahInboxContactTriage"
         SET "lastInboundOccurredAt"=$2::timestamptz, "lastInboundOrderKey"=$3
         WHERE "contactIdentityKey"=$1
           AND ("lastInboundOccurredAt" IS NULL
             OR "lastInboundOccurredAt" < $2::timestamptz
             OR ("lastInboundOccurredAt" = $2::timestamptz AND "lastInboundOrderKey" < $3))`,
        [identityKey, receipt.normalizedOccurredAt, receipt.orderKey],
      );
      return;
    }

    // hasStateDecision records only an active explicit operator state/snooze
    // decision. Receipt-derived states carry occurrence time but never gain
    // wall-clock operator precedence over a later ordered inbound receipt.
    await query(
      `UPDATE "myahInboxContactTriage"
       SET "lastInboundOccurredAt"=$2::timestamptz,
           "lastInboundOrderKey"=$3,
           "inboxState"=CASE WHEN NOT "hasStateDecision" OR "stateDecisionAt" < $2::timestamptz THEN 'NEEDS_REPLY' ELSE "inboxState" END,
           "snoozedUntil"=CASE WHEN NOT "hasStateDecision" OR "stateDecisionAt" < $2::timestamptz THEN NULL ELSE "snoozedUntil" END,
           "hasStateDecision"=CASE WHEN "hasStateDecision" AND "stateDecisionAt" >= $2::timestamptz THEN true ELSE false END,
           "stateDecisionAt"=CASE WHEN NOT "hasStateDecision" OR "stateDecisionAt" < $2::timestamptz THEN $2::timestamptz ELSE "stateDecisionAt" END,
           revision=revision + CASE WHEN NOT "hasStateDecision" OR "stateDecisionAt" < $2::timestamptz THEN 1 ELSE 0 END,
           "triageChangedAt"=CASE WHEN NOT "hasStateDecision" OR "stateDecisionAt" < $2::timestamptz THEN now() ELSE "triageChangedAt" END
       WHERE "contactIdentityKey"=$1
         AND ("lastInboundOccurredAt" IS NULL
           OR "lastInboundOccurredAt" < $2::timestamptz
           OR ("lastInboundOccurredAt" = $2::timestamptz AND "lastInboundOrderKey" < $3))`,
      [identityKey, receipt.normalizedOccurredAt, receipt.orderKey],
    );
  }

  async updateTupleInTransaction({
    contactIdentityKey,
    expectedRevision,
    expectedIdentityGeneration,
    patch,
    manager,
  }: {
    contactIdentityKey: string;
    expectedRevision: number;
    expectedIdentityGeneration: string;
    patch: UpdateMyahInboxContactTriageTuple;
    manager: WorkspaceEntityManager;
  }): Promise<TriageRecord> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error('Triage mutation requires an active transaction manager');
    }
    // GraphQL accepts explicit null for optional fields. Treat it exactly like
    // omission before deriving state/snooze changes so it cannot clear a live
    // SNOOZED deadline while SQL retains the old state through COALESCE.
    const state = patch.inboxState ?? undefined;
    if (state === 'SNOOZED' && !patch.snoozedUntil) {
      throw new Error('SNOOZED requires snoozedUntil');
    }
    if (
      state === 'SNOOZED' &&
      !(Date.parse(patch.snoozedUntil!) > Date.now())
    ) {
      throw new Error('SNOOZED requires a future snoozedUntil');
    }
    if (state === undefined && patch.snoozedUntil != null) {
      throw new Error('snoozedUntil requires inboxState SNOOZED');
    }

    const changesState = state !== undefined;
    const snoozedUntil = state === 'SNOOZED' ? patch.snoozedUntil : null;
    const rows = (await query(
      `WITH updated AS (
         UPDATE "myahInboxContactTriage"
         SET "inboxOwnerId"=CASE WHEN $4::boolean THEN $5::uuid ELSE "inboxOwnerId" END,
             "inboxState"=COALESCE($6::text, "inboxState"),
             "snoozedUntil"=CASE WHEN $8::boolean THEN $7::timestamptz ELSE "snoozedUntil" END,
             "hasStateDecision"=CASE WHEN $8::boolean THEN true ELSE "hasStateDecision" END,
             revision=revision+1,
             "stateDecisionAt"=CASE WHEN $8::boolean THEN now() ELSE "stateDecisionAt" END,
             "triageChangedAt"=now()
         WHERE "contactIdentityKey"=$1 AND revision=$2 AND "identityGeneration"=$3::bigint
         RETURNING "inboxOwnerId", "inboxState", "snoozedUntil", revision, "identityGeneration"
       )
       SELECT * FROM updated`,
      [
        contactIdentityKey,
        expectedRevision,
        expectedIdentityGeneration,
        patch.inboxOwnerId !== undefined,
        patch.inboxOwnerId ?? null,
        state,
        snoozedUntil,
        changesState,
      ],
    )) as DatabaseTriageRecord[];
    if (rows.length === 1) return normalizeTriageRecord(rows[0]);

    const [latest] = (await query(
      `SELECT "inboxOwnerId", "inboxState", "snoozedUntil", revision, "identityGeneration"
       FROM "myahInboxContactTriage" WHERE "contactIdentityKey"=$1 FOR UPDATE`,
      [contactIdentityKey],
    )) as DatabaseTriageRecord[];
    if (latest)
      throw new MyahInboxTriageConflictError(normalizeTriageRecord(latest));
    throw new Error('Contact triage is unavailable');
  }

  async resolveDueSnoozesInTransaction({
    manager,
    contactIdentityKey,
  }: {
    manager: WorkspaceEntityManager;
    contactIdentityKey?: string;
  }): Promise<number> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Due snooze resolution requires an active transaction manager',
      );
    }

    const rows = (await query(
      `WITH updated AS (
         UPDATE "myahInboxContactTriage"
         SET "inboxState"='NEEDS_REPLY', "snoozedUntil"=NULL,
             "hasStateDecision"=false, revision=revision+1, "stateDecisionAt"=now(), "triageChangedAt"=now()
         WHERE "inboxState"='SNOOZED' AND "snoozedUntil" <= now()
           AND ($1::text IS NULL OR "contactIdentityKey"=$1)
         RETURNING "contactIdentityKey"
       )
       SELECT "contactIdentityKey" FROM updated`,
      [contactIdentityKey ?? null],
    )) as Array<{ contactIdentityKey: string }>;

    return rows.length;
  }

  private async invalidatePreviousCreatorIdentity({
    query,
    previousIdentityKey,
    previousCreatorId,
  }: {
    query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
    previousIdentityKey: string;
    previousCreatorId: string;
  }): Promise<void> {
    await query(
      `UPDATE "myahInboxContactIdentity"
       SET generation=generation+1, "updatedAt"=now()
       WHERE "contactIdentityKey"=$1 AND "isActive"=true`,
      [previousIdentityKey],
    );
    await query(
      `UPDATE "myahInboxContactTriage" triage
       SET "identityGeneration"=identity.generation,
           revision=triage.revision+1,
           "triageChangedAt"=now()
       FROM "myahInboxContactIdentity" identity
       WHERE triage."contactIdentityKey"=$1
         AND identity."contactIdentityKey"=$1`,
      [previousIdentityKey],
    );
    const [instagramRelations] = (await query(
      'SELECT to_regclass($1) IS NOT NULL AS "exists"',
      ['"_myahSocialConversation"'],
    )) as Array<{ exists: boolean }>;
    const instagramSourcePredicate = instagramRelations?.exists
      ? ' AND NOT EXISTS (SELECT 1 FROM "_myahSocialConversation" WHERE "creatorId"=$2::uuid)'
      : '';
    // The Instagram predicate is one of two compile-time constant SQL fragments.
    // pi-lens-ignore: sql-injection
    await query(
      `UPDATE "myahInboxContactIdentity"
       SET "isActive"=false, generation=generation+1, "updatedAt"=now()
       WHERE "contactIdentityKey"=$1 AND "isActive"=true
         AND NOT EXISTS (SELECT 1 FROM "messageThread" WHERE "creatorId"=$2::uuid)${instagramSourcePredicate}`,
      [previousIdentityKey, previousCreatorId],
    );
    // The Instagram predicate is one of two compile-time constant SQL fragments.
    // pi-lens-ignore: sql-injection
    await query(
      `DELETE FROM "myahInboxContactTriage" triage
       WHERE triage."contactIdentityKey"=$1
         AND NOT EXISTS (SELECT 1 FROM "messageThread" WHERE "creatorId"=$2::uuid)${instagramSourcePredicate}`,
      [previousIdentityKey, previousCreatorId],
    );
  }

  private initialInboxState(
    initialDirection: InitialDirection | undefined,
  ): 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'CLOSED' {
    switch (initialDirection) {
      case 'INBOUND':
        return 'NEEDS_REPLY';
      case 'OUTBOUND':
        return 'WAITING_ON_CREATOR';
      case 'UNKNOWN':
      case null:
      case undefined:
        return 'CLOSED';
    }
  }
}
