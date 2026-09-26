import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { CreateMyahInboxReplyContextDraftsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911001-create-myah-inbox-reply-context-drafts';
import { AddMyahInboxReplyDraftIncomingBaselineFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790141137400-add-myah-inbox-reply-draft-incoming-baseline';
import {
  MyahInboxReplyContextDraftService,
  type AnchoredReplyIdentity,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

const isolatedDatabaseUrl = process.env.MYAH_353_ISOLATED_PG_DATABASE_URL;
const describeIsolated = isolatedDatabaseUrl ? describe : describe.skip;
const fixture = (suffix: number) =>
  `30000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const body = (markdown: string) => ({ markdown, blocknote: null });

const baseIdentity: AnchoredReplyIdentity = {
  workspaceId: fixture(1),
  contactAnchorKind: 'CREATOR',
  contactAnchorId: fixture(2),
  channel: ReplyChannel.EMAIL,
  deliveryTargetId: fixture(3),
  context: { kind: ReplyContextKind.CAMPAIGN, campaignId: fixture(4) },
};

describeIsolated(
  'MyahInboxReplyContextDraftService (isolated PostgreSQL)',
  () => {
    let dataSource: DataSource;
    let drafts: MyahInboxReplyContextDraftService;
    let ownsFixture = false;

    beforeAll(async () => {
      dataSource = new DataSource({
        type: 'postgres',
        url: isolatedDatabaseUrl,
        entities: [],
      });
      await dataSource.initialize();
      const [{ occupied }] = await dataSource.query(
        'SELECT to_regclass(\'core."workspace"\') IS NOT NULL OR to_regclass(\'core."actionApprovalBinding"\') IS NOT NULL AS occupied',
      );
      if (occupied)
        throw new Error('Isolated context fixture requires an empty database');
      await dataSource.query('CREATE SCHEMA IF NOT EXISTS core');
      await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await dataSource.query(
        'CREATE TABLE core."workspace" ("id" uuid PRIMARY KEY)',
      );
      await dataSource.query(
        'INSERT INTO core."workspace" ("id") VALUES ($1)',
        [baseIdentity.workspaceId],
      );
      ownsFixture = true;
      await dataSource.query(`CREATE TABLE core."actionApprovalBinding" (
        "id" uuid PRIMARY KEY, "workspaceId" uuid, "actionName" text, "actionVersion" integer,
        "actionKind" text, "threadId" uuid, "draftId" uuid, "interactionContextType" text, "interactionContextId" uuid,
        "contentDigest" text, "recipientFingerprint" text, "sendingAccountFingerprint" text,
        "actionContextFingerprint" text, "initiatorUserWorkspaceId" uuid
      )`);
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await new CreateMyahInboxReplyContextDraftsFastInstanceCommand().up(
        runner,
      );
      // Existing (legacy) rows predate the baseline columns; repeat is additive.
      await dataSource.query(
        `INSERT INTO core."myahInboxReplyContextDraft" (
          "workspaceId","contactAnchorKind","contactAnchorId","channel",
          "deliveryTargetId","contextKind","campaignId","bodyMarkdown","revision"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'legacy body',1)`,
        [
          baseIdentity.workspaceId,
          baseIdentity.contactAnchorKind,
          baseIdentity.contactAnchorId,
          baseIdentity.channel,
          fixture(90),
          baseIdentity.context.kind,
          baseIdentity.context.campaignId,
        ],
      );
      for (let run = 0; run < 2; run++)
        await new AddMyahInboxReplyDraftIncomingBaselineFastInstanceCommand().up(
          runner,
        );
      await runner.release();
      drafts = new MyahInboxReplyContextDraftService(dataSource);
    });

    afterAll(async () => {
      if (!ownsFixture) {
        if (dataSource?.isInitialized) await dataSource.destroy();
        return;
      }
      await dataSource.query(
        'DROP TABLE IF EXISTS core."actionApprovalBinding"',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS core."protectMyahEmailContextAuthority"()',
      );
      await dataSource.query(
        'DROP TABLE IF EXISTS core."myahInboxReplyContextDraft"',
      );
      await dataSource.query('DROP TABLE IF EXISTS core."workspace"');
      await dataSource.query(
        'DROP TYPE IF EXISTS core."myahInboxReplyContextDraft_contextKind_enum"',
      );
      await dataSource.query(
        'DROP TYPE IF EXISTS core."myahInboxReplyContextDraft_channel_enum"',
      );
      await dataSource.destroy();
    });

    it('serializes concurrent first saves into one SAVED row and one CONFLICT', async () => {
      const concurrent = { ...baseIdentity, deliveryTargetId: fixture(6) };
      const results = await Promise.all([
        drafts.save({
          ...concurrent,
          expectedRevision: 0,
          body: body('first'),
        }),
        drafts.save({
          ...concurrent,
          expectedRevision: 0,
          body: body('second'),
        }),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([
        'CONFLICT',
        'SAVED',
      ]);
      expect(
        await dataSource.query(
          `SELECT COUNT(*)::integer AS "count"
           FROM core."myahInboxReplyContextDraft"
           WHERE "workspaceId" = $1 AND "contactAnchorKind" = $2
             AND "contactAnchorId" = $3 AND "channel" = $4
             AND "deliveryTargetId" = $5 AND "contextKind" = $6
             AND "campaignId" IS NOT DISTINCT FROM $7::uuid`,
          [
            concurrent.workspaceId,
            concurrent.contactAnchorKind,
            concurrent.contactAnchorId,
            concurrent.channel,
            concurrent.deliveryTargetId,
            concurrent.context.kind,
            concurrent.context.campaignId,
          ],
        ),
      ).toEqual([{ count: 1 }]);
    });

    it('uses PostgreSQL update tuples without mutating Campaign B or General on a Campaign A CAS', async () => {
      const campaignB = {
        ...baseIdentity,
        context: {
          kind: ReplyContextKind.CAMPAIGN as const,
          campaignId: fixture(5),
        },
      };
      const general = {
        ...baseIdentity,
        context: { kind: ReplyContextKind.GENERAL as const },
      };
      await drafts.save({
        ...baseIdentity,
        expectedRevision: 0,
        body: body('A'),
      });
      await drafts.save({ ...campaignB, expectedRevision: 0, body: body('B') });
      await drafts.save({
        ...general,
        expectedRevision: 0,
        body: body('General'),
      });

      await expect(
        drafts.save({
          ...baseIdentity,
          expectedRevision: 0,
          body: body('stale'),
        }),
      ).resolves.toMatchObject({
        status: 'CONFLICT',
        revision: 1,
        body: body('A'),
      });
      await expect(
        drafts.save({ ...baseIdentity, expectedRevision: 1, body: body('A2') }),
      ).resolves.toMatchObject({
        status: 'SAVED',
        revision: 2,
        body: body('A2'),
      });
      await expect(drafts.read(campaignB)).resolves.toMatchObject({
        revision: 1,
        body: body('B'),
      });
      await expect(drafts.read(general)).resolves.toMatchObject({
        revision: 1,
        body: body('General'),
      });
    });

    it('keeps missing reads, clears, and reviews virtual while preserving existing clear lineage', async () => {
      const empty = { ...baseIdentity, deliveryTargetId: fixture(7) };
      await expect(drafts.read(empty)).resolves.toMatchObject({
        draftId: null,
        revision: 0,
        body: null,
      });
      await expect(
        drafts.save({ ...empty, expectedRevision: 0, body: null }),
      ).resolves.toMatchObject({ status: 'SAVED', revision: 0, body: null });
      await expect(
        drafts.review({ ...empty, reviewedContextFingerprint: 'a'.repeat(64) }),
      ).resolves.toMatchObject({
        draftId: null,
        revision: 0,
        reviewedContextFingerprint: null,
      });
      await expect(
        drafts.save({ ...empty, expectedRevision: 0, body: body('first') }),
      ).resolves.toMatchObject({ status: 'SAVED', revision: 1 });
      await expect(
        drafts.save({ ...empty, expectedRevision: 1, body: null }),
      ).resolves.toMatchObject({ status: 'SAVED', revision: 2, body: null });
      await expect(
        drafts.save({ ...empty, expectedRevision: 1, body: body('stale') }),
      ).resolves.toMatchObject({ status: 'CONFLICT', revision: 2, body: null });
      await expect(
        drafts.save({ ...empty, expectedRevision: 2, body: body('second') }),
      ).resolves.toMatchObject({
        status: 'SAVED',
        revision: 3,
        body: body('second'),
      });
    });

    it('persists proposal and review fingerprints through ordinary edits and clears only the reviewed override for a new proposal', async () => {
      const lineage = { ...baseIdentity, deliveryTargetId: fixture(8) };
      await drafts.save({
        ...lineage,
        expectedRevision: 0,
        body: body('F1 proposal'),
        proposalContextFingerprint: '1'.repeat(64),
      });
      await expect(drafts.read(lineage)).resolves.toMatchObject({
        revision: 1,
        proposalContextFingerprint: '1'.repeat(64),
        reviewedContextFingerprint: null,
      });
      await drafts.save({
        ...lineage,
        expectedRevision: 1,
        body: body('ordinary edit'),
      });
      await expect(drafts.read(lineage)).resolves.toMatchObject({
        revision: 2,
        body: body('ordinary edit'),
        proposalContextFingerprint: '1'.repeat(64),
        reviewedContextFingerprint: null,
      });
      await drafts.review({
        ...lineage,
        reviewedContextFingerprint: '2'.repeat(64),
      });
      await expect(drafts.read(lineage)).resolves.toMatchObject({
        revision: 2,
        proposalContextFingerprint: '1'.repeat(64),
        reviewedContextFingerprint: '2'.repeat(64),
      });
      await drafts.save({
        ...lineage,
        expectedRevision: 2,
        body: body('F3 proposal'),
        proposalContextFingerprint: '3'.repeat(64),
      });
      await expect(drafts.read(lineage)).resolves.toMatchObject({
        revision: 3,
        body: body('F3 proposal'),
        proposalContextFingerprint: '3'.repeat(64),
        reviewedContextFingerprint: null,
      });
      await drafts.save({
        ...lineage,
        expectedRevision: 3,
        body: null,
      });
      await expect(drafts.read(lineage)).resolves.toMatchObject({
        revision: 4,
        body: null,
        proposalContextFingerprint: '3'.repeat(64),
        reviewedContextFingerprint: null,
      });
    });

    it('captures authored incoming baselines without acknowledgement and never silently rebaselines them', async () => {
      const incoming = (id: number) =>
        JSON.stringify([fixture(id), '2099-01-01T00:00:00.000Z']);
      const manual = { ...baseIdentity, deliveryTargetId: fixture(80) };
      await drafts.save({
        ...manual,
        expectedRevision: 0,
        body: body('first manual body'),
        incomingBaseline: incoming(70),
      });
      await expect(drafts.read(manual)).resolves.toMatchObject({
        authoredIncomingBaseline: incoming(70),
        bodyProvenance: 'EDITED',
        proposalContextFingerprint: null,
        reviewedContextFingerprint: null,
      });
      // A later save after new incoming mail keeps the authored baseline.
      await drafts.save({
        ...manual,
        expectedRevision: 1,
        body: body('first manual body'),
        incomingBaseline: incoming(71),
      });
      await expect(drafts.read(manual)).resolves.toMatchObject({
        revision: 2,
        authoredIncomingBaseline: incoming(70),
        bodyProvenance: 'EDITED',
      });

      const proposal = { ...baseIdentity, deliveryTargetId: fixture(81) };
      await drafts.save({
        ...proposal,
        expectedRevision: 0,
        body: body('proposal text'),
        proposalContextFingerprint: '4'.repeat(64),
        incomingBaseline: incoming(72),
      });
      await expect(drafts.read(proposal)).resolves.toMatchObject({
        authoredIncomingBaseline: incoming(72),
        bodyProvenance: 'PROPOSAL',
      });
      // Edit then revert to the exact proposal text remains edited.
      for (const [revision, markdown] of [
        [1, 'human edit'],
        [2, 'proposal text'],
      ] as const)
        await drafts.save({
          ...proposal,
          expectedRevision: revision,
          body: body(markdown),
          incomingBaseline: incoming(73),
        });
      await expect(drafts.read(proposal)).resolves.toMatchObject({
        revision: 3,
        body: body('proposal text'),
        authoredIncomingBaseline: incoming(72),
        bodyProvenance: 'EDITED',
      });
      // A fresh proposal replaces the baseline with its validated snapshot.
      await drafts.save({
        ...proposal,
        expectedRevision: 3,
        body: body('updated proposal'),
        proposalContextFingerprint: '5'.repeat(64),
        incomingBaseline: incoming(73),
      });
      await expect(drafts.read(proposal)).resolves.toMatchObject({
        authoredIncomingBaseline: incoming(73),
        bodyProvenance: 'PROPOSAL',
      });
      // Clearing then writing a body is a new first body creation.
      await drafts.save({ ...proposal, expectedRevision: 4, body: null });
      await expect(drafts.read(proposal)).resolves.toMatchObject({
        authoredIncomingBaseline: null,
        bodyProvenance: null,
      });
      await drafts.save({
        ...proposal,
        expectedRevision: 5,
        body: body('new manual body'),
        incomingBaseline: 'NONE',
      });
      await expect(drafts.read(proposal)).resolves.toMatchObject({
        authoredIncomingBaseline: 'NONE',
        bodyProvenance: 'EDITED',
      });

      // An explicit update replaces text as an untouched current proposal but
      // grants no acknowledgement: send stays blocked until explicit review.
      await drafts.save({
        ...manual,
        expectedRevision: 2,
        body: body('updated from current context'),
        proposalContextFingerprint: '6'.repeat(64),
        acknowledgeProposal: false,
        incomingBaseline: incoming(75),
      });
      await expect(drafts.read(manual)).resolves.toMatchObject({
        revision: 3,
        authoredIncomingBaseline: incoming(75),
        bodyProvenance: 'PROPOSAL',
        proposalContextFingerprint: null,
        reviewedContextFingerprint: null,
      });

      const legacy = { ...baseIdentity, deliveryTargetId: fixture(90) };
      await expect(drafts.read(legacy)).resolves.toMatchObject({
        authoredIncomingBaseline: null,
        bodyProvenance: null,
      });
      await drafts.save({
        ...legacy,
        expectedRevision: 1,
        body: body('legacy edit'),
        incomingBaseline: incoming(74),
      });
      await expect(drafts.read(legacy)).resolves.toMatchObject({
        authoredIncomingBaseline: null,
        bodyProvenance: 'EDITED',
      });
    });

    it('proves Campaign and General partial indexes reject direct duplicate inserts independently of service locks', async () => {
      const insert = (
        contextKind: 'CAMPAIGN' | 'GENERAL',
        campaignId: string | null,
        target: string,
      ) =>
        dataSource.query(
          `INSERT INTO core."myahInboxReplyContextDraft" (
          "id", "workspaceId", "contactAnchorKind", "contactAnchorId", "channel",
          "deliveryTargetId", "contextKind", "campaignId", "revision"
        ) VALUES ($1, $2, 'CREATOR', $3, 'EMAIL', $4, $5, $6, 0)`,
          [
            randomUUID(),
            baseIdentity.workspaceId,
            baseIdentity.contactAnchorId,
            target,
            contextKind,
            campaignId,
          ],
        );
      const campaignTarget = fixture(9);
      await insert('CAMPAIGN', fixture(10), campaignTarget);
      await expect(
        insert('CAMPAIGN', fixture(10), campaignTarget),
      ).rejects.toThrow();
      const generalTarget = fixture(11);
      await insert('GENERAL', null, generalTarget);
      await expect(insert('GENERAL', null, generalTarget)).rejects.toThrow();
    });

    it('isolates workspace, channel, and anchor-kind identity dimensions', async () => {
      const isolatedWorkspaceId = fixture(20);
      await dataSource.query(
        'INSERT INTO core."workspace" ("id") VALUES ($1)',
        [isolatedWorkspaceId],
      );
      const isolatedBase = { ...baseIdentity, deliveryTargetId: fixture(23) };
      const siblingIdentities: AnchoredReplyIdentity[] = [
        { ...isolatedBase, workspaceId: isolatedWorkspaceId },
        { ...isolatedBase, channel: ReplyChannel.INSTAGRAM },
        { ...isolatedBase, contactAnchorKind: 'EMAIL_THREAD' },
      ];

      await Promise.all(
        siblingIdentities.map((identity, index) =>
          drafts.save({
            ...identity,
            expectedRevision: 0,
            body: body(`isolated-${index}`),
          }),
        ),
      );

      await expect(drafts.read(isolatedBase)).resolves.toMatchObject({
        revision: 0,
        body: null,
      });
      await Promise.all(
        siblingIdentities.map((identity, index) =>
          expect(drafts.read(identity)).resolves.toMatchObject({
            revision: 1,
            body: body(`isolated-${index}`),
          }),
        ),
      );
    });

    it('cascades workspace deletion to persisted drafts', async () => {
      const workspaceId = fixture(21);
      const cascading = {
        ...baseIdentity,
        workspaceId,
        deliveryTargetId: fixture(22),
      };
      await dataSource.query(
        'INSERT INTO core."workspace" ("id") VALUES ($1)',
        [workspaceId],
      );
      await drafts.save({
        ...cascading,
        expectedRevision: 0,
        body: body('cascade'),
      });

      await dataSource.query('DELETE FROM core."workspace" WHERE "id" = $1', [
        workspaceId,
      ]);
      await expect(
        dataSource.query(
          'SELECT COUNT(*)::integer AS "count" FROM core."myahInboxReplyContextDraft" WHERE "workspaceId" = $1',
          [workspaceId],
        ),
      ).resolves.toEqual([{ count: 0 }]);
    });

    it('keeps relinked anchors separate and enforces migration-backed channel, anchor, and body constraints', async () => {
      const relinked = {
        ...baseIdentity,
        contactAnchorId: fixture(12),
        deliveryTargetId: fixture(13),
      };
      await expect(
        drafts.save({
          ...relinked,
          expectedRevision: 0,
          body: body('relinked'),
        }),
      ).resolves.toMatchObject({ status: 'SAVED', revision: 1 });
      await expect(
        drafts.read({ ...baseIdentity, deliveryTargetId: fixture(13) }),
      ).resolves.toMatchObject({ revision: 0, body: null });
      await expect(
        dataSource.query(
          `INSERT INTO core."myahInboxReplyContextDraft" (
          "workspaceId", "contactAnchorKind", "contactAnchorId", "channel", "deliveryTargetId",
          "contextKind", "campaignId"
        ) VALUES ($1, 'INSTAGRAM_CONVERSATION', $2, 'EMAIL', $3, 'CAMPAIGN', $4)`,
          [baseIdentity.workspaceId, fixture(14), fixture(15), fixture(16)],
        ),
      ).rejects.toThrow();
      await expect(
        dataSource.query(
          `INSERT INTO core."myahInboxReplyContextDraft" (
          "workspaceId", "contactAnchorKind", "contactAnchorId", "channel", "deliveryTargetId",
          "contextKind", "campaignId", "bodyBlocknote"
        ) VALUES ($1, 'CREATOR', $2, 'EMAIL', $3, 'CAMPAIGN', $4, '[]')`,
          [baseIdentity.workspaceId, fixture(17), fixture(18), fixture(19)],
        ),
      ).rejects.toThrow();
    });
  },
);
