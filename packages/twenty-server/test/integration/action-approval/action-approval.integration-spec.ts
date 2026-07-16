import { DataSource } from 'typeorm';

import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-evolve-instagram-approval-to-action-authority';
import {
  ActionApprovalBindingEntity,
  ActionApprovalBindingState,
} from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { SEED_EMPTY_WORKSPACE_3_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

const workspaceId = SEED_EMPTY_WORKSPACE_3_ID;
const bindingId = '90000000-0000-4000-8000-000000000002';
const draftId = '90000000-0000-4000-8000-000000000003';
const threadId = '90000000-0000-4000-8000-000000000004';
const initiatorUserWorkspaceId = '90000000-0000-4000-8000-000000000005';
const objectMetadataId = '90000000-0000-4000-8000-000000000006';
const recordId = '90000000-0000-4000-8000-000000000007';
const projectionWorkspaceId = workspaceId;
const projectionBindingId = '90000000-0000-4000-8000-000000000010';
const projectionReceiptId = '90000000-0000-4000-8000-000000000011';
const projectionDraftId = '90000000-0000-4000-8000-000000000012';
const projectionSchemaName = getWorkspaceSchemaName(projectionWorkspaceId);

const expectedBinding = {
  workspaceId,
  actionName: 'send_instagram_reply' as const,
  actionVersion: 1 as const,
  draftId,
  contentDigest: computeActionContentDigest('  Cafe\u0301\r\n  '),
  recipientFingerprint: 'a'.repeat(64),
  sendingAccountFingerprint: 'b'.repeat(64),
  threadId,
  initiatorUserWorkspaceId,
  evidenceLinks: [
    { objectMetadataId, recordId, role: 'recipient' },
  ],
};

describe('ActionApprovalService (PostgreSQL)', () => {
  let dataSource: DataSource;
  let service: ActionApprovalService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.PG_DATABASE_URL,
      schema: 'core',
      entities: [
        ActionApprovalBindingEntity,
        ActionApprovalBindingEvidenceLinkEntity,
        ActionExecutionReceiptEntity,
      ],
      synchronize: false,
    });
    await dataSource.initialize();

    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('core."actionApprovalBinding"') IS NOT NULL AS "exists"`,
    );
    if (!exists) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
          queryRunner,
        );
      } finally {
        await queryRunner.release();
      }
    }

    const projectionWriter = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource,
    );
    service = new ActionApprovalService(
      dataSource,
      new ActionReceiptProjectorService(
        dataSource.getRepository(ActionExecutionReceiptEntity),
        projectionWriter,
      ),
    );
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${projectionSchemaName}"`);
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${projectionSchemaName}"."_myahInstagramReplyDraft" (
        "id" uuid PRIMARY KEY,
        "body" text NOT NULL,
        "status" varchar NOT NULL,
        "sentAt" timestamptz,
        "updatedAt" timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${projectionSchemaName}"."_myahSocialMessage" (
        "id" uuid PRIMARY KEY,
        "text" text NOT NULL,
        "direction" varchar NOT NULL,
        "sentVia" varchar NOT NULL,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        "createdBySource" varchar NOT NULL,
        "createdByWorkspaceMemberId" uuid,
        "createdByName" varchar NOT NULL,
        "createdByContext" jsonb NOT NULL,
        "updatedBySource" varchar NOT NULL,
        "updatedByWorkspaceMemberId" uuid,
        "updatedByName" varchar NOT NULL,
        "updatedByContext" jsonb NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await dataSource.query(
      'DELETE FROM core."actionExecutionReceipt" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      'DELETE FROM core."actionApprovalBinding" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialMessage"
      WHERE "createdByContext" ->> 'actionReceiptId' = $1`,
      [projectionReceiptId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahInstagramReplyDraft" WHERE "id" = $1`,
      [projectionDraftId],
    );
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      'DELETE FROM core."actionExecutionReceipt" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      'DELETE FROM core."actionApprovalBinding" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialMessage"
      WHERE "createdByContext" ->> 'actionReceiptId' = $1`,
      [projectionReceiptId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahInstagramReplyDraft" WHERE "id" = $1`,
      [projectionDraftId],
    );
    await dataSource.getRepository(ActionApprovalBindingEntity).save({
      id: bindingId,
      workspaceId,
      initiatorUserWorkspaceId,
      actionName: expectedBinding.actionName,
      actionVersion: expectedBinding.actionVersion,
      draftId,
      contentDigest: expectedBinding.contentDigest,
      recipientFingerprint: expectedBinding.recipientFingerprint,
      sendingAccountFingerprint: expectedBinding.sendingAccountFingerprint,
      threadId,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    await dataSource.getRepository(ActionApprovalBindingEvidenceLinkEntity).save({
      actionApprovalBindingId: bindingId,
      objectMetadataId,
      recordId,
      role: 'recipient',
    });
  });

  it('atomically consumes one approved binding and returns one receipt under concurrent reservation', async () => {
    const [first, second] = await Promise.all([
      service.reserveExecution(expectedBinding),
      service.reserveExecution(expectedBinding),
    ]);

    expect(first).toEqual(second);
    expect(first.state).toBe(ActionExecutionReceiptState.PROCESSING);
    expect(
      await dataSource.getRepository(ActionExecutionReceiptEntity).count({
        where: { workspaceId },
      }),
    ).toBe(1);
    expect(
      await dataSource.getRepository(ActionApprovalBindingEntity).findOneByOrFail({
        id: bindingId,
      }),
    ).toMatchObject({ state: ActionApprovalBindingState.CONSUMED });
  });

  it('does not consume a binding whose rebuilt evidence differs', async () => {
    await expect(
      service.reserveExecution({
        ...expectedBinding,
        evidenceLinks: [{ objectMetadataId, recordId, role: 'different-role' }],
      }),
    ).rejects.toThrow('Action evidence does not match approved binding');

    expect(
      await dataSource.getRepository(ActionExecutionReceiptEntity).count({
        where: { workspaceId },
      }),
    ).toBe(0);
  });

  it('replays an existing receipt before considering a separately-created expired or mismatched approval', async () => {
    const first = await service.reserveExecution(expectedBinding);
    const competingBindingId = '90000000-0000-4000-8000-000000000008';
    await dataSource.getRepository(ActionApprovalBindingEntity).save({
      id: competingBindingId,
      workspaceId,
      initiatorUserWorkspaceId,
      actionName: expectedBinding.actionName,
      actionVersion: expectedBinding.actionVersion,
      draftId,
      contentDigest: expectedBinding.contentDigest,
      recipientFingerprint: expectedBinding.recipientFingerprint,
      sendingAccountFingerprint: expectedBinding.sendingAccountFingerprint,
      threadId,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    await dataSource.getRepository(ActionApprovalBindingEvidenceLinkEntity).save({
      actionApprovalBindingId: competingBindingId,
      objectMetadataId,
      recordId,
      role: 'mismatched-role',
    });

    await expect(service.reserveExecution(expectedBinding)).resolves.toEqual(first);
  });

  it('retries a real PostgreSQL workspace projection after post-projection loss', async () => {
    await dataSource.getRepository(ActionApprovalBindingEntity).save({
      id: projectionBindingId,
      workspaceId: projectionWorkspaceId,
      initiatorUserWorkspaceId,
      actionName: expectedBinding.actionName,
      actionVersion: expectedBinding.actionVersion,
      draftId: projectionDraftId,
      contentDigest: expectedBinding.contentDigest,
      recipientFingerprint: expectedBinding.recipientFingerprint,
      sendingAccountFingerprint: expectedBinding.sendingAccountFingerprint,
      threadId,
      state: ActionApprovalBindingState.CONSUMED,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    await dataSource.getRepository(ActionExecutionReceiptEntity).save({
      id: projectionReceiptId,
      workspaceId: projectionWorkspaceId,
      actionApprovalBindingId: projectionBindingId,
      idempotencyKey: 'projection-retry-key',
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      providerMessageId: null,
      providerCode: 'accepted',
      redactedOutcome: 'accepted',
    });
    await dataSource.query(
      `INSERT INTO "${projectionSchemaName}"."_myahInstagramReplyDraft" (
        "id", "body", "status"
      ) VALUES ($1, $2, 'NEEDS_REVIEW')`,
      [projectionDraftId, 'Projected message'],
    );

    const projector = new ActionReceiptProjectorService(
      dataSource.getRepository(ActionExecutionReceiptEntity),
      new ActionReceiptWorkspaceProjectionWriterService(dataSource),
    );

    await expect(
      projector.projectReceipt(projectionReceiptId, {
        afterWorkspaceProjection: async () => {
          throw new Error('lost after workspace projection');
        },
      }),
    ).rejects.toThrow('lost after workspace projection');

    await expect(projector.projectReceipt(projectionReceiptId)).resolves.toEqual({
      projected: true,
    });
    await expect(
      dataSource.getRepository(ActionExecutionReceiptEntity).findOneByOrFail({
        id: projectionReceiptId,
      }),
    ).resolves.toMatchObject({ state: ActionExecutionReceiptState.SENT });
    await expect(
      dataSource.query<{ count: string }[]>(
        `SELECT count(*)::text AS "count"
        FROM "${projectionSchemaName}"."_myahSocialMessage"
        WHERE "createdByContext" ->> 'actionReceiptId' = $1`,
        [projectionReceiptId],
      ),
    ).resolves.toEqual([{ count: '1' }]);
    await expect(
      dataSource.query(
        `SELECT "status", "sentAt" IS NOT NULL AS "sent"
        FROM "${projectionSchemaName}"."_myahInstagramReplyDraft"
        WHERE "id" = $1`,
        [projectionDraftId],
      ),
    ).resolves.toEqual([{ status: 'SENT', sent: true }]);
  });

  it('marks a receipt UNKNOWN after an injected post-reservation loss without submitting to a provider', async () => {
    const submit = jest.fn();

    await expect(
      service.execute(expectedBinding, submit, {
        afterReservation: async () => {
          throw new Error('lost after reservation');
        },
      }),
    ).rejects.toThrow('lost after reservation');
    expect(submit).not.toHaveBeenCalled();

    const reconciled = await service.reconcile({
      processingBefore: new Date('2031-01-01T00:00:00.000Z'),
    });
    expect(reconciled).toEqual({ unknown: 1, projected: 0 });
  });

  it('preserves PROVIDER_ACCEPTED after injected post-response loss and replays with zero provider calls', async () => {
    const submit = jest.fn().mockResolvedValue({
      code: 'accepted',
      acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
    });

    await expect(
      service.execute(expectedBinding, submit, {
        afterProviderAccepted: async () => {
          throw new Error('lost after provider success');
        },
      }),
    ).rejects.toThrow('lost after provider success');
    expect(submit).toHaveBeenCalledTimes(1);

    const replay = await service.execute(expectedBinding, submit);
    expect(replay).toMatchObject({
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      providerCode: 'accepted',
      outcome: 'accepted',
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(
      await dataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOneByOrFail({ id: replay.id }),
    ).toMatchObject({ providerMessageId: null });
  });
});
