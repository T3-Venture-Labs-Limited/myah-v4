import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { validateRichTextFieldOrThrow } from 'src/engine/api/common/common-args-processors/data-arg-processor/validator-utils/validate-rich-text-field-or-throw.util';
import {
  MyahInboxDraftSaveStatus,
  type MyahInboxDraftSaveResult,
  type MyahRichText,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

export type AnchoredReplyIdentity = {
  workspaceId: string;
  contactAnchorKind: string;
  contactAnchorId: string;
  channel: ReplyChannel;
  deliveryTargetId: string;
  context:
    | { kind: ReplyContextKind.GENERAL; campaignId?: never }
    | { kind: ReplyContextKind.CAMPAIGN; campaignId: string };
};

export type ReplyContextDraftSnapshot = {
  draftId: string | null;
  revision: number;
  body: MyahRichText | null;
  proposalContextFingerprint: string | null;
  reviewedContextFingerprint: string | null;
};

export type SaveReplyContextDraftInput = AnchoredReplyIdentity & {
  expectedRevision: number;
  body: MyahRichText | null;
  // This value is provided only by the verified proposal-result path.
  proposalContextFingerprint?: string | null;
};

export type ReviewReplyContextDraftInput = AnchoredReplyIdentity & {
  reviewedContextFingerprint: string;
};

type ReplyContextDraftRow = {
  id: string;
  revision: number | string;
  bodyMarkdown: string | null;
  bodyBlocknote: string | null;
  proposalContextFingerprint: string | null;
  reviewedContextFingerprint: string | null;
};

const replyContextLockKey = (identity: AnchoredReplyIdentity) =>
  [
    'myah-reply-context',
    identity.workspaceId,
    identity.contactAnchorKind,
    identity.contactAnchorId,
    identity.channel,
    identity.deliveryTargetId,
    identity.context.kind,
    identity.context.campaignId ?? 'GENERAL',
  ].join(':');

const identityValues = (identity: AnchoredReplyIdentity) => [
  identity.workspaceId,
  identity.contactAnchorKind,
  identity.contactAnchorId,
  identity.channel,
  identity.deliveryTargetId,
  identity.context.kind,
  identity.context.campaignId ?? null,
];

const IDENTITY_PREDICATE = `
  "workspaceId" = $1 AND "contactAnchorKind" = $2
  AND "contactAnchorId" = $3 AND "channel" = $4
  AND "deliveryTargetId" = $5 AND "contextKind" = $6
  AND "campaignId" IS NOT DISTINCT FROM $7::uuid`;

@Injectable()
export class MyahInboxReplyContextDraftService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async read(input: AnchoredReplyIdentity): Promise<ReplyContextDraftSnapshot> {
    this.assertIdentity(input);
    const rows = await this.dataSource.query<ReplyContextDraftRow[]>(
      `SELECT "id", "revision", "bodyMarkdown", "bodyBlocknote",
              "proposalContextFingerprint", "reviewedContextFingerprint"
       FROM core."myahInboxReplyContextDraft"
       WHERE ${IDENTITY_PREDICATE}`,
      identityValues(input),
    );

    return this.toSnapshot(rows[0]);
  }

  async save(
    input: SaveReplyContextDraftInput,
  ): Promise<MyahInboxDraftSaveResult> {
    this.assertIdentity(input);
    this.assertSaveInput(input);

    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, input);
      const current = await this.load(manager, input);

      if (!current) {
        if (input.expectedRevision !== 0) {
          return this.toSaveResult(
            MyahInboxDraftSaveStatus.CONFLICT,
            undefined,
          );
        }
        if (input.body === null) {
          return this.toSaveResult(MyahInboxDraftSaveStatus.SAVED, undefined);
        }

        const rows = await manager.query<ReplyContextDraftRow[]>(
          `INSERT INTO core."myahInboxReplyContextDraft" (
            "workspaceId", "contactAnchorKind", "contactAnchorId", "channel",
            "deliveryTargetId", "contextKind", "campaignId", "bodyMarkdown",
            "bodyBlocknote", "revision", "proposalContextFingerprint"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
          ON CONFLICT DO NOTHING
          RETURNING "id", "revision", "bodyMarkdown", "bodyBlocknote",
                    "proposalContextFingerprint", "reviewedContextFingerprint"`,
          [
            ...identityValues(input),
            input.body?.markdown ?? null,
            input.body?.blocknote ?? null,
            input.proposalContextFingerprint ?? null,
          ],
        );
        const created = rows[0];
        if (created) {
          return this.toSaveResult(MyahInboxDraftSaveStatus.SAVED, created);
        }

        return this.toSaveResult(
          MyahInboxDraftSaveStatus.CONFLICT,
          await this.load(manager, input),
        );
      }

      const [rows, affected] = await manager.query<
        [ReplyContextDraftRow[], number]
      >(
        `UPDATE core."myahInboxReplyContextDraft"
         SET "bodyMarkdown" = $8, "bodyBlocknote" = $9,
             "revision" = "revision" + 1,
             "proposalContextFingerprint" = CASE
               WHEN $10::varchar IS NULL THEN "proposalContextFingerprint"
               ELSE $10::varchar
             END,
             "reviewedContextFingerprint" = CASE
               WHEN $10::varchar IS NULL THEN "reviewedContextFingerprint"
               ELSE NULL
             END,
             "updatedAt" = NOW()
         WHERE ${IDENTITY_PREDICATE} AND "revision" = $11 AND "id" = $12
         RETURNING "id", "revision", "bodyMarkdown", "bodyBlocknote",
                   "proposalContextFingerprint", "reviewedContextFingerprint"`,
        [
          ...identityValues(input),
          input.body?.markdown ?? null,
          input.body?.blocknote ?? null,
          input.proposalContextFingerprint ?? null,
          input.expectedRevision,
          current.id,
        ],
      );

      if (affected === 1 && rows.length === 1) {
        return this.toSaveResult(MyahInboxDraftSaveStatus.SAVED, rows[0]);
      }
      if (affected === 0 && rows.length === 0) {
        return this.toSaveResult(
          MyahInboxDraftSaveStatus.CONFLICT,
          await this.load(manager, input),
        );
      }
      throw new Error('Unexpected reply context draft save update result');
    });
  }

  async review(
    input: ReviewReplyContextDraftInput,
  ): Promise<ReplyContextDraftSnapshot> {
    this.assertIdentity(input);
    this.assertFingerprint(input.reviewedContextFingerprint);

    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, input);
      const current = await this.load(manager, input);

      if (!current) return this.toSnapshot(undefined);

      const [rows, affected] = await manager.query<
        [ReplyContextDraftRow[], number]
      >(
        `UPDATE core."myahInboxReplyContextDraft"
         SET "reviewedContextFingerprint" = $8, "updatedAt" = NOW()
         WHERE ${IDENTITY_PREDICATE} AND "id" = $9
         RETURNING "id", "revision", "bodyMarkdown", "bodyBlocknote",
                   "proposalContextFingerprint", "reviewedContextFingerprint"`,
        [
          ...identityValues(input),
          input.reviewedContextFingerprint,
          current.id,
        ],
      );

      if (affected === 1 && rows.length === 1) return this.toSnapshot(rows[0]);
      if (affected === 0 && rows.length === 0) {
        return this.toSnapshot(await this.load(manager, input));
      }
      throw new Error('Unexpected reply context draft review update result');
    });
  }

  private async lock(manager: EntityManager, input: AnchoredReplyIdentity) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      replyContextLockKey(input),
    ]);
  }

  private async load(
    manager: EntityManager,
    input: AnchoredReplyIdentity,
  ): Promise<ReplyContextDraftRow | undefined> {
    const rows = await manager.query<ReplyContextDraftRow[]>(
      `SELECT "id", "revision", "bodyMarkdown", "bodyBlocknote",
              "proposalContextFingerprint", "reviewedContextFingerprint"
       FROM core."myahInboxReplyContextDraft"
       WHERE ${IDENTITY_PREDICATE}`,
      identityValues(input),
    );

    return rows[0];
  }

  private toSaveResult(
    status: MyahInboxDraftSaveStatus,
    row: ReplyContextDraftRow | undefined,
  ): MyahInboxDraftSaveResult {
    const snapshot = this.toSnapshot(row);

    return { status, revision: snapshot.revision, body: snapshot.body };
  }

  private toSnapshot(
    row: ReplyContextDraftRow | undefined,
  ): ReplyContextDraftSnapshot {
    if (!row) {
      return {
        draftId: null,
        revision: 0,
        body: null,
        proposalContextFingerprint: null,
        reviewedContextFingerprint: null,
      };
    }

    return {
      draftId: row.id,
      revision: Number(row.revision),
      body:
        row.bodyMarkdown === null
          ? null
          : { markdown: row.bodyMarkdown, blocknote: row.bodyBlocknote },
      proposalContextFingerprint: row.proposalContextFingerprint,
      reviewedContextFingerprint: row.reviewedContextFingerprint,
    };
  }

  private assertIdentity(input: AnchoredReplyIdentity): void {
    const contextCampaignId = (input.context as { campaignId?: unknown })
      .campaignId;
    const ids = [
      input.workspaceId,
      input.contactAnchorId,
      input.deliveryTargetId,
      contextCampaignId,
    ].filter((id): id is string => typeof id === 'string');
    const supportedAnchor =
      (input.channel === ReplyChannel.EMAIL &&
        ['CREATOR', 'EMAIL_THREAD'].includes(input.contactAnchorKind)) ||
      (input.channel === ReplyChannel.INSTAGRAM &&
        ['CREATOR', 'INSTAGRAM_CONVERSATION'].includes(
          input.contactAnchorKind,
        ));
    if (
      !supportedAnchor ||
      !Object.values(ReplyChannel).includes(input.channel) ||
      !Object.values(ReplyContextKind).includes(input.context.kind) ||
      ids.some((id) => !this.isUuid(id)) ||
      (input.context.kind === ReplyContextKind.CAMPAIGN &&
        !input.context.campaignId) ||
      (input.context.kind === ReplyContextKind.GENERAL &&
        contextCampaignId !== undefined &&
        contextCampaignId !== null)
    ) {
      throw new BadRequestException('Invalid reply context draft identity');
    }
  }

  private assertSaveInput(input: SaveReplyContextDraftInput): void {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw new BadRequestException('Invalid reply context draft revision');
    }
    if (
      input.proposalContextFingerprint !== undefined &&
      input.proposalContextFingerprint !== null
    ) {
      this.assertFingerprint(input.proposalContextFingerprint);
    }
    if (input.body === null) return;
    if (
      typeof input.body.markdown !== 'string' ||
      (input.body.blocknote !== null &&
        typeof input.body.blocknote !== 'string')
    ) {
      throw new BadRequestException('Invalid reply context draft body');
    }
    try {
      validateRichTextFieldOrThrow(input.body, 'myahReplyDraftBody');
    } catch {
      throw new BadRequestException('Invalid reply context draft body');
    }
  }

  private assertFingerprint(value: string): void {
    if (!/^[a-f0-9]{64}$/.test(value)) {
      throw new BadRequestException('Invalid reply context fingerprint');
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
