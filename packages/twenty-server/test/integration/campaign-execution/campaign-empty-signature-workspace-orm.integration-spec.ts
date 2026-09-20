import { randomUUID } from 'node:crypto';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { type CampaignSignatureMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-signature-material.adapter';
import { type CampaignSequenceFixedMaterialService } from 'src/modules/myah-outreach/services/campaign-sequence-fixed-material.service';
import { type CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

describe('Campaign untouched signature workspace ORM boundary', () => {
  const workspaceId = SEED_APPLE_WORKSPACE_ID;
  // SQL identifiers come only from the UUID-derived seed workspace schema;
  // every data value remains a query parameter.
  const schemaName = getWorkspaceSchemaName(workspaceId);
  const campaignId = randomUUID();
  const messageId = randomUUID();
  const body = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello creator' }] },
    ],
  });

  afterAll(async () => {
    await global.testDataSource.transaction(async (manager) => {
      // pi-lens-ignore: sql-injection
      await manager.query(
        `DELETE FROM "${schemaName}"."workflowVersion"
         WHERE "workflowId" IN (SELECT id FROM "${schemaName}".workflow WHERE "outreachCampaignId"=$1)`,
        [campaignId],
      );
      // pi-lens-ignore: sql-injection
      await manager.query(
        `DELETE FROM "${schemaName}".workflow WHERE "outreachCampaignId"=$1`,
        [campaignId],
      );
      // pi-lens-ignore: sql-injection
      await manager.query(`DELETE FROM "${schemaName}".campaign WHERE id=$1`, [
        campaignId,
      ]);
    });
  });

  it('prepares the published sequence with a null signature digest without ever saving the signature', async () => {
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const sequence = getDomainService<CampaignSequenceService>(
      'CampaignSequenceService',
    );
    const signature = getDomainService<CampaignSignatureMaterialAdapter>(
      'CampaignSignatureMaterialAdapter',
    );
    const fixedMaterial =
      getDomainService<CampaignSequenceFixedMaterialService>(
        'CampaignSequenceFixedMaterialService',
      );
    // pi-lens-ignore: sql-injection
    const [member] = await global.testDataSource.query(
      `SELECT uw.id AS "userWorkspaceId", uw."userId", wm.id AS "workspaceMemberId"
       FROM core."userWorkspace" uw
       JOIN core."roleTarget" rt ON rt."userWorkspaceId"=uw.id
       JOIN core.role r ON r.id=rt."roleId" AND r.label='Admin'
       JOIN "${schemaName}"."workspaceMember" wm ON wm."userId"=uw."userId"
       WHERE uw."workspaceId"=$1 AND wm."deletedAt" IS NULL LIMIT 1`,
      [workspaceId],
    );
    expect(member).toBeDefined();
    const authContext = {
      type: 'user',
      workspace: { id: workspaceId },
      userWorkspaceId: member.userWorkspaceId,
      user: { id: member.userId },
      workspaceMemberId: member.workspaceMemberId,
      workspaceMember: { id: member.workspaceMemberId },
    } as UserWorkspaceAuthContext;
    const scope = { workspaceId, campaignId, authContext };

    const campaign = await orm.executeInWorkspaceContext(async () => {
      const repository = await orm.getRepository<{
        id: string;
        name: string;
        lifecycleStatus: string;
        emailSignature: unknown;
      }>(workspaceId, 'campaign', { shouldBypassPermissionChecks: true });
      await repository.insert({
        id: campaignId,
        name: 'Empty signature regression',
      });

      return repository.findOneOrFail({ where: { id: campaignId } });
    }, buildSystemAuthContext(workspaceId));
    expect(campaign.lifecycleStatus).toBe('DRAFT');
    expect(campaign.emailSignature).toEqual({ markdown: '', blocknote: null });

    const initial = await sequence.createInitial(scope);
    const saved = await sequence.save({
      ...scope,
      expectedVersionId: initial.versionId,
      sequence: {
        schemaVersion: 1,
        messages: [
          {
            id: messageId,
            channel: 'EMAIL',
            subject: 'Hello',
            body,
            files: [],
            replyToThread: false,
          },
        ],
        delaysSeconds: [],
      },
    });
    expect(saved.issues).toEqual([]);
    const published = await sequence.publish({
      ...scope,
      expectedVersionId: saved.versionId,
    });
    expect(published.versionStatus).toBe('ACTIVE');
    expect(published.issues).toEqual([]);
    // pi-lens-ignore: sql-injection
    expect(
      await global.testDataSource.query(
        `SELECT "emailSignatureMarkdown", "emailSignatureBlocknote"
       FROM "${schemaName}".campaign WHERE id=$1`,
        [campaignId],
      ),
    ).toEqual([
      { emailSignatureMarkdown: null, emailSignatureBlocknote: null },
    ]);

    const input = {
      ...scope,
      workflowVersionId: published.versionId,
      orderedMessageIds: [messageId],
    };
    const prepared = await fixedMaterial.loadSequenceFixedMaterial(input);
    expect(prepared).toEqual({
      kind: 'READY',
      value: {
        workspaceId,
        campaignId,
        workflowVersionId: published.versionId,
        signatureDigest: null,
        messages: [
          {
            messageId,
            subject: 'Hello',
            body,
            replyToThread: false,
            orderedFileRefs: [],
            orderedAttachmentProofs: [],
          },
        ],
      },
    });
    await expect(signature.load(scope)).resolves.toEqual({
      kind: 'READY',
      value: { html: null },
    });
    await expect(
      fixedMaterial.loadMessageFixedMaterial({
        ...scope,
        messageId,
        files: [],
      }),
    ).resolves.toEqual({ signature: null, attachments: [], blockers: [] });
    await global.testDataSource.transaction(async (manager) => {
      expect(
        await fixedMaterial.loadSequenceFixedMaterial(
          input,
          manager as WorkspaceEntityManager,
        ),
      ).toEqual(prepared);
    });
  });
});
