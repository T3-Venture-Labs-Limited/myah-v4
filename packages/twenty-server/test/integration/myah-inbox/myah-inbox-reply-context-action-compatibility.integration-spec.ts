import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { type EmailContextV2Binding } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { CreateMyahInboxReplyContextDraftsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911001-create-myah-inbox-reply-context-drafts';

// No repository global setup or default datasource is used by this isolated suite.
const url = process.env.MYAH_353_ISOLATED_PG_DATABASE_URL;
const describeIsolated = url ? describe : describe.skip;
const workspaceId = randomUUID();
const target = randomUUID();
const actor = randomUUID();
const contextBinding = (
  draftId: string,
): EmailContextV2Binding & { workspaceId: string } => ({
  workspaceId,
  actionName: 'send_inbox_reply',
  actionVersion: 2,
  draftId,
  initiatorUserWorkspaceId: actor,
  threadId: null,
  interactionContextType: 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT',
  interactionContextId: draftId,
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  actionContextFingerprint: 'd'.repeat(64),
  evidenceLinks: [],
  myahReplyContextSnapshot: {
    schemaVersion: 1,
    channel: 'EMAIL',
    draftId,
    deliveryTargetId: target,
    replyContext: { kind: 'GENERAL' },
    contactAnchor: { kind: 'EMAIL_THREAD', id: target },
    creatorId: null,
    eligibilityEvidenceDigest: 'e'.repeat(64),
    contextFingerprint: 'f'.repeat(64),
    authoredContextFingerprint: 'f'.repeat(64),
    reviewedContextFingerprint: null,
  },
});

describeIsolated(
  'Email v2/v1 target reservations (isolated PostgreSQL only)',
  () => {
    let db: DataSource;
    let approvals: ActionApprovalService;
    let ownsFixture = false;
    beforeAll(async () => {
      db = new DataSource({
        type: 'postgres',
        url,
        entities: [
          ActionApprovalBindingEntity,
          ActionApprovalBindingEvidenceLinkEntity,
          ActionExecutionReceiptEntity,
        ],
        synchronize: false,
      });
      await db.initialize();
      const [{ occupied }] = await db.query(
        'SELECT to_regclass(\'core."actionApprovalBinding"\') IS NOT NULL OR to_regclass(\'core."workspace"\') IS NOT NULL AS occupied',
      );
      if (occupied)
        throw new Error(
          'Isolated compatibility fixture requires an empty database; existing tables are never replaced',
        );
      await db.query('CREATE SCHEMA IF NOT EXISTS core');
      await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await db.synchronize();
      ownsFixture = true;
      await db.query('CREATE TABLE core."workspace" ("id" uuid PRIMARY KEY)');
      await db.query('INSERT INTO core."workspace" ("id") VALUES ($1)', [
        workspaceId,
      ]);
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        await new CreateMyahInboxReplyContextDraftsFastInstanceCommand().up(
          runner,
        );
      } finally {
        await runner.release();
      }
      approvals = new ActionApprovalService(db, {
        projectReceipt: jest.fn(),
      } as never);
    });
    beforeEach(async () => {
      await db.query('DELETE FROM core."actionExecutionReceipt"');
      await db.query('DELETE FROM core."actionApprovalBindingEvidenceLink"');
      await db.query('DELETE FROM core."actionApprovalBinding"');
    });
    afterAll(async () => {
      if (db?.isInitialized && ownsFixture) {
        await db.query('DROP TABLE core."actionExecutionReceipt"');
        await db.query('DROP TABLE core."actionApprovalBindingEvidenceLink"');
        await db.query('DROP TABLE core."actionApprovalBinding"');
        await db.query('DROP TABLE core."myahInboxReplyContextDraft"');
        await db.query('DROP TABLE core."workspace"');
        await db.query(
          'DROP FUNCTION IF EXISTS core."protectMyahEmailContextAuthority"()',
        );
        await db.query(
          'DROP TYPE IF EXISTS core."actionExecutionReceipt_state_enum"',
        );
        await db.query(
          'DROP TYPE IF EXISTS core."actionApprovalBinding_state_enum"',
        );
        await db.query(
          'DROP TYPE IF EXISTS core."myahInboxReplyContextDraft_contextKind_enum"',
        );
        await db.query(
          'DROP TYPE IF EXISTS core."myahInboxReplyContextDraft_channel_enum"',
        );
      }
      if (db?.isInitialized) await db.destroy();
    });

    it('has one concurrent A/B reservation winner and durable PENDING across contexts', async () => {
      const candidates = [
        contextBinding(randomUUID()),
        contextBinding(randomUUID()),
      ];
      const reserve = (binding: (typeof candidates)[number]) =>
        approvals.executeInboxReplyTargetLocked(
          { workspaceId, deliveryTargetId: target, draftId: binding.draftId },
          async () => {
            if (
              await approvals.getInboxReplyTargetExecutionState({
                workspaceId,
                deliveryTargetId: target,
              })
            )
              return null;
            const approved =
              await approvals.createApprovedInboxReplyBinding(binding);
            return approvals.reserveExecutionForBinding({
              approvalBindingId: approved.id,
              expectedActionBinding: binding,
            });
          },
        );
      const results = await Promise.all(candidates.map(reserve));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await db.getRepository(ActionExecutionReceiptEntity).count()).toBe(
        1,
      );
      await expect(
        approvals.getInboxReplyTargetExecutionState({
          workspaceId,
          deliveryTargetId: target,
        }),
      ).resolves.toBe('PENDING');
      // No provider is called; this separate transaction proves reservation locks have been released.
      await db.transaction(async (manager) => {
        const [{ available }] = await manager.query(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS available',
          [`myah-inbox-reply-target:${workspaceId}:EMAIL:${target}`],
        );
        expect(available).toBe(true);
      });
    });

    it('blocks v2 for legacy v1 draftId even when threadId is an Agent chat and UNKNOWN wins', async () => {
      const v2 = contextBinding(randomUUID());
      const legacy = {
        workspaceId,
        actionName: 'send_inbox_reply' as const,
        actionVersion: 1 as const,
        draftId: target,
        threadId: randomUUID(),
        initiatorUserWorkspaceId: actor,
        contentDigest: v2.contentDigest,
        recipientFingerprint: v2.recipientFingerprint,
        sendingAccountFingerprint: v2.sendingAccountFingerprint,
        actionContextFingerprint: v2.actionContextFingerprint,
        evidenceLinks: [],
      };
      const approved = await approvals.createApprovedInboxReplyBinding(legacy);
      const reserved = await approvals.reserveExecutionForBinding({
        approvalBindingId: approved.id,
        expectedActionBinding: legacy,
      });
      await expect(
        approvals.getInboxReplyTargetExecutionState({
          workspaceId,
          deliveryTargetId: target,
        }),
      ).resolves.toBe('PENDING');
      await db
        .getRepository(ActionExecutionReceiptEntity)
        .update(reserved.receipt.id, {
          state: ActionExecutionReceiptState.UNKNOWN,
        });
      await expect(
        approvals.getInboxReplyTargetExecutionState({
          workspaceId,
          deliveryTargetId: target,
        }),
      ).resolves.toBe('UNKNOWN');
    });

    it('persists/reloads JSONB authority and rejects snapshot or interaction mutation', async () => {
      const input = contextBinding(randomUUID());
      const created = await approvals.createApprovedInboxReplyBinding(input);
      const reloaded = await db
        .getRepository(ActionApprovalBindingEntity)
        .findOneByOrFail({ id: created.id });
      expect(reloaded.myahReplyContextSnapshot).toEqual(
        input.myahReplyContextSnapshot,
      );
      await expect(
        approvals.reserveExecutionForBinding({
          approvalBindingId: created.id,
          expectedActionBinding: input,
        }),
      ).resolves.toMatchObject({ created: true });
      await expect(
        db.query(
          'UPDATE core."actionApprovalBinding" SET "myahReplyContextSnapshot" = jsonb_set("myahReplyContextSnapshot", \'{deliveryTargetId}\', to_jsonb($1::text)) WHERE "id" = $2',
          [randomUUID(), created.id],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        db.query(
          'UPDATE core."actionApprovalBinding" SET "interactionContextId" = $1 WHERE "id" = $2',
          [randomUUID(), created.id],
        ),
      ).rejects.toThrow('immutable');
    });
  },
);
