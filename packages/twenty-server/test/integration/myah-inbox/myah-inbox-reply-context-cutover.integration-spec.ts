import { CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911003-create-myah-inbox-email-general-provenance';
import { InstallMyahInboxEmailGeneralProvenanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789645911004-install-myah-inbox-email-general-provenance.command';
import { DataSource } from 'typeorm';

import { CreateMyahInboxReplyContextDraftsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911001-create-myah-inbox-reply-context-drafts';
import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';

const isolatedDatabaseUrl = process.env.MYAH_353_ISOLATED_PG_DATABASE_URL;
const describeIsolated = isolatedDatabaseUrl ? describe : describe.skip;
const fixture = (suffix: number) =>
  `40000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const workspaceId = fixture(1);
const creatorId = fixture(2);
const campaignId = fixture(3);
const threadId = fixture(4);

describeIsolated('Email reply-context cutover (isolated PostgreSQL)', () => {
  let dataSource: DataSource;
  let activation: EmailReplyContextActivationService;

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: isolatedDatabaseUrl });
    await dataSource.initialize();
    const [{ occupied }] = await dataSource.query(
      'SELECT to_regclass(\'core."workspace"\') IS NOT NULL AS occupied',
    );
    if (occupied)
      throw new Error('Isolated cutover fixture requires an empty database');

    await dataSource.query('CREATE SCHEMA core');
    await dataSource.query(
      `CREATE SCHEMA "workspace_3sehh9hzsgs50mn757ntags1t"`,
    );
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.query(
      "CREATE TYPE core.\"keyValuePair_type_enum\" AS ENUM ('USER_VARIABLE', 'FEATURE_FLAG', 'CONFIG_VARIABLE')",
    );
    await dataSource.query(
      'CREATE TABLE core."workspace" (id uuid PRIMARY KEY)',
    );
    await dataSource.query(`CREATE TABLE core."keyValuePair" (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "workspaceId" uuid, "userId" uuid,
      key text NOT NULL, value jsonb, type core."keyValuePair_type_enum" NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
    )`);
    await dataSource.query(
      'CREATE UNIQUE INDEX cutover_kvp_workspace_key ON core."keyValuePair" (key, "workspaceId") WHERE "userId" IS NULL',
    );
    await dataSource.query(
      `CREATE TABLE "workspace_3sehh9hzsgs50mn757ntags1t".creator (id uuid PRIMARY KEY, "deletedAt" timestamptz)`,
    );
    await dataSource.query(
      `CREATE TABLE "workspace_3sehh9hzsgs50mn757ntags1t".campaign (id uuid PRIMARY KEY, "deletedAt" timestamptz)`,
    );
    await dataSource.query(`CREATE TABLE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" (
      id uuid PRIMARY KEY, "creatorId" uuid, "myahCampaignId" uuid REFERENCES "workspace_3sehh9hzsgs50mn757ntags1t".campaign(id) ON DELETE SET NULL, "deletedAt" timestamptz,
      "myahReplyDraftBodyMarkdown" text, "myahReplyDraftBodyBlocknote" text,
      "myahReplyDraftRevision" integer NOT NULL
    )`);
    await dataSource.query(`CREATE TABLE "workspace_3sehh9hzsgs50mn757ntags1t".message (
      id uuid PRIMARY KEY, "messageThreadId" uuid, "deletedAt" timestamptz,
      "isDraft" boolean NOT NULL, "receivedAt" timestamptz
    )`);
    await dataSource.query(
      'CREATE TABLE core."messageChannel" (id uuid PRIMARY KEY, type text NOT NULL)',
    );
    await dataSource.query(`CREATE TABLE "workspace_3sehh9hzsgs50mn757ntags1t"."messageChannelMessageAssociation" (
      "messageId" uuid, "messageChannelId" uuid, "deletedAt" timestamptz, direction text
    )`);
    await dataSource.query(
      "CREATE TYPE core.\"actionApprovalBinding_state_enum\" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED', 'CONSUMED')",
    );
    await dataSource.query(
      "CREATE TYPE core.\"actionExecutionReceipt_state_enum\" AS ENUM ('PROCESSING', 'PROVIDER_ACCEPTED', 'SENT', 'BLOCKED', 'FAILED', 'UNKNOWN')",
    );
    await dataSource.query(`CREATE TABLE core."actionApprovalBinding" (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL REFERENCES core."workspace"(id) ON DELETE CASCADE,
      "initiatorUserWorkspaceId" uuid NOT NULL,
      "actionName" varchar NOT NULL,
      "actionVersion" integer NOT NULL DEFAULT 1,
      "actionKind" varchar,
      "draftId" uuid NOT NULL,
      "contentDigest" varchar(64) NOT NULL,
      "recipientFingerprint" varchar(64),
      "sendingAccountFingerprint" varchar(64),
      "actionContextFingerprint" varchar(64),
      "inboundMessageId" text,
      "inboundSenderIgsid" text,
      "inboundDirection" text,
      "inboundReceivedAt" timestamptz,
      "threadId" uuid,
      "interactionContextType" varchar,
      "interactionContextId" uuid,
      "myahReplyContextSnapshot" jsonb,
      "state" core."actionApprovalBinding_state_enum" NOT NULL DEFAULT 'PENDING',
      "expiresAt" timestamptz NOT NULL,
      "decidedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await dataSource.query(`CREATE TABLE core."actionExecutionReceipt" (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL REFERENCES core."workspace"(id) ON DELETE CASCADE,
      "actionApprovalBindingId" uuid NOT NULL REFERENCES core."actionApprovalBinding"(id) ON DELETE RESTRICT,
      "idempotencyKey" varchar(64) NOT NULL,
      state core."actionExecutionReceipt_state_enum" NOT NULL DEFAULT 'PROCESSING',
      "providerMessageId" text,
      "providerExternalMessageId" text,
      "providerThreadExternalId" text,
      "providerCode" text,
      "redactedOutcome" varchar,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await dataSource.query('INSERT INTO core.workspace (id) VALUES ($1)', [
      workspaceId,
    ]);
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t".creator (id) VALUES ($1)`,
      [creatorId],
    );
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t".campaign (id) VALUES ($1)`,
      [campaignId],
    );
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" VALUES ($1, $2, $3, NULL, $4, NULL, 7)`,
      [threadId, creatorId, campaignId, 'Preserved'],
    );
    const evidenceThreadId = fixture(5);
    const messageId = fixture(6);
    const channelId = fixture(7);
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" VALUES ($1, $2, $3, NULL, NULL, NULL, 0)`,
      [evidenceThreadId, creatorId, campaignId],
    );
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t".message VALUES ($1, $2, NULL, false, now())`,
      [messageId, evidenceThreadId],
    );
    await dataSource.query(
      'INSERT INTO core."messageChannel" VALUES ($1, $2)',
      [channelId, 'EMAIL'],
    );
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageChannelMessageAssociation" VALUES ($1, $2, NULL, 'OUTGOING')`,
      [messageId, channelId],
    );
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await new CreateMyahInboxReplyContextDraftsFastInstanceCommand().up(runner);
    await new CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand().up(
      runner,
    );
    await runner.release();
    // Historical null predates Release A: installation must not attest it.
    await dataSource.query(
      `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" VALUES ($1, $2, NULL, NULL, NULL, NULL, 0)`,
      [fixture(90), creatorId],
    );
    await new InstallMyahInboxEmailGeneralProvenanceCommand(
      {} as never,
      dataSource,
    ).runOnWorkspace({ workspaceId, options: {} } as never);
    activation = new EmailReplyContextActivationService(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('activates only after preserving the Email source with null fingerprints and does not require Instagram tables', async () => {
    await expect(
      activation.preflightEmailWorkspace(workspaceId),
    ).resolves.toEqual({
      mapped: 1,
      unmapped: 0,
      sourceChanged: 0,
    });
    await expect(
      activation.isEmailContextActivationEnabled(workspaceId),
    ).resolves.toBe(true);
    await expect(
      dataSource.query(
        `SELECT "bodyMarkdown", revision, "proposalContextFingerprint", "reviewedContextFingerprint"
      FROM core."myahInboxReplyContextDraft" WHERE "workspaceId" = $1`,
        [workspaceId],
      ),
    ).resolves.toEqual([
      {
        bodyMarkdown: 'Preserved',
        revision: 7,
        proposalContextFingerprint: null,
        reviewedContextFingerprint: null,
      },
    ]);
  });
  it('never backfills ambiguous historical nulls', async () => {
    expect(
      await dataSource.query(
        `SELECT * FROM core."myahInboxEmailGeneralProvenance" WHERE "deliveryTargetId" = $1`,
        [fixture(90)],
      ),
    ).toEqual([]);
  });

  it.each([
    'campaign hard-delete',
    'campaign unlink',
    'creator relink',
    'soft delete',
    'hard delete',
    'unanchored attach',
  ])('permanently revokes General provenance for %s', async (mode) => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const target = fixture(100);
      const proof = () =>
        runner.query(
          `SELECT "creatorId" FROM core."myahInboxEmailGeneralProvenance" WHERE "workspaceId" = $1 AND "deliveryTargetId" = $2 AND "creatorId" = $3 AND "revokedAt" IS NULL`,
          [workspaceId, target, creatorId],
        );
      await runner.query(
        `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" VALUES ($1, $2, NULL, NULL, NULL, NULL, 0)`,
        [target, mode === 'unanchored attach' ? null : creatorId],
      );
      expect(await proof()).toHaveLength(mode === 'unanchored attach' ? 0 : 1);
      // Benign updates preserve the original proof.
      await runner.query(
        `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "myahReplyDraftRevision" = 1 WHERE id = $1`,
        [target],
      );
      if (mode.startsWith('campaign')) {
        await runner.query(
          `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "myahCampaignId" = $2 WHERE id = $1`,
          [target, campaignId],
        );
        if (mode === 'campaign hard-delete') {
          await runner.query(
            `DELETE FROM "workspace_3sehh9hzsgs50mn757ntags1t".campaign WHERE id = $1`,
            [campaignId],
          );
        } else {
          await runner.query(
            `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "myahCampaignId" = NULL WHERE id = $1`,
            [target],
          );
        }
        expect(
          await runner.query(
            `SELECT "myahCampaignId" FROM "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" WHERE id = $1`,
            [target],
          ),
        ).toEqual([{ myahCampaignId: null }]);
      } else if (mode === 'creator relink' || mode === 'unanchored attach') {
        await runner.query(
          `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "creatorId" = NULL WHERE id = $1`,
          [target],
        );
        await runner.query(
          `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "creatorId" = $2 WHERE id = $1`,
          [target, creatorId],
        );
      } else if (mode === 'soft delete') {
        await runner.query(
          `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "deletedAt" = now() WHERE id = $1`,
          [target],
        );
        await runner.query(
          `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "deletedAt" = NULL WHERE id = $1`,
          [target],
        );
      } else {
        await runner.query(
          `DELETE FROM "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" WHERE id = $1`,
          [target],
        );
        await runner.query(
          `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" VALUES ($1, $2, NULL, NULL, NULL, NULL, 0)`,
          [target, creatorId],
        );
      }
      expect(await proof()).toEqual([]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it.each(['ambiguous null', 'proven General', 'hard-delete SET_NULL'])(
    'Release B consumes only Release A proof: %s',
    async (mode) => {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        const target = mode === 'ambiguous null' ? fixture(90) : fixture(110);
        if (mode !== 'ambiguous null') {
          await runner.query(
            `INSERT INTO "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" VALUES ($1, $2, $3, NULL, NULL, NULL, 0)`,
            [
              target,
              creatorId,
              mode === 'hard-delete SET_NULL' ? campaignId : null,
            ],
          );
        }
        await runner.query(
          `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "myahReplyDraftBodyMarkdown" = 'General candidate' WHERE id = $1`,
          [target],
        );
        if (mode === 'hard-delete SET_NULL') {
          // Remove the other fixture's legacy body so only this source is evaluated.
          await runner.query(
            `UPDATE "workspace_3sehh9hzsgs50mn757ntags1t"."messageThread" SET "myahReplyDraftBodyMarkdown" = NULL WHERE id <> $1`,
            [target],
          );
          await runner.query(
            `DELETE FROM "workspace_3sehh9hzsgs50mn757ntags1t".campaign WHERE id = $1`,
            [campaignId],
          );
        }
        const service = new EmailReplyContextActivationService({
          query: runner.query.bind(runner),
          transaction: async (
            run: (manager: typeof runner.manager) => unknown,
          ) => run(runner.manager),
        } as never);
        const result = await service.preflightEmailWorkspace(workspaceId);
        expect(result.unmapped).toBe(mode === 'proven General' ? 0 : 1);
        expect(await service.isEmailContextActivationEnabled(workspaceId)).toBe(
          mode === 'proven General',
        );
        const drafts = await runner.query(
          `SELECT "contextKind" FROM core."myahInboxReplyContextDraft" WHERE "deliveryTargetId" = $1`,
          [target],
        );
        expect(drafts).toEqual(
          mode === 'proven General' ? [{ contextKind: 'GENERAL' }] : [],
        );
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    },
  );
});
