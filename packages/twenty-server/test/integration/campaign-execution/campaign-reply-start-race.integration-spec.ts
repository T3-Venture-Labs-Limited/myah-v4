import { randomUUID } from 'node:crypto';

import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignExecutionApplicationService } from 'src/modules/campaign-execution/services/campaign-execution-application.service';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';

type ProviderWrapper = {
  instance?: unknown;
  metatype?: { name?: string };
};

const getDomainService = <T>(serviceName: string): T => {
  const appContainer = (
    global.app as typeof global.app & {
      container: {
        getModules: () => Map<
          unknown,
          { providers: Map<unknown, ProviderWrapper> }
        >;
      };
    }
  ).container;
  for (const moduleRef of appContainer.getModules().values()) {
    for (const [token, provider] of moduleRef.providers) {
      const tokenName =
        typeof token === 'function'
          ? token.name
          : typeof token === 'string'
            ? token
            : undefined;
      if (
        provider.instance &&
        (tokenName === serviceName || provider.metatype?.name === serviceName)
      )
        return provider.instance as T;
    }
  }
  throw new Error(`Integration provider ${serviceName} was not found`);
};

describe('Campaign matched reply / Start serialization', () => {
  it.each(['reply-first', 'start-first', 'reassigned-start-first'] as const)(
    '%s preserves accepted history and stops future outreach',
    async (order) => {
      const workspaceId = SEED_APPLE_WORKSPACE_ID;
      const schemaName = getWorkspaceSchemaName(workspaceId);
      const ids = {
        campaign: randomUUID(),
        creator: randomUUID(),
        reassignedCreator: randomUUID(),
        campaignCreator: randomUUID(),
        message: randomUUID(),
        followUpMessage: randomUUID(),
        attempt: randomUUID(),
        inboundEvidence: randomUUID(),
        campaignAccount: randomUUID(),
        connectedAccount: randomUUID(),
        messageChannel: randomUUID(),
        newKey: randomUUID(),
      };
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
      const audience = getDomainService<CampaignOutreachAudienceReviewService>(
        'CampaignOutreachAudienceReviewService',
      );
      const application = getDomainService<CampaignExecutionApplicationService>(
        'CampaignExecutionApplicationService',
      );
      const execution = getDomainService<CampaignExecutionService>(
        'CampaignExecutionService',
      );
      const orm = getDomainService<GlobalWorkspaceOrmManager>(
        'GlobalWorkspaceOrmManager',
      );
      let startPromise: ReturnType<typeof application.start> | undefined;
      let releaseStart: (() => void) | undefined;
      let spy: jest.SpyInstance | undefined;

      try {
        await global.testDataSource.transaction(async (manager) => {
          await manager.query(
            `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,'Reply-first race')`,
            [ids.campaign],
          );
          await manager.query(
            `INSERT INTO "${schemaName}".creator (id,name,email) VALUES ($1,'Synthetic reply race',$2)`,
            [ids.creator, `reply-${ids.creator}@example.test`],
          );
          await manager.query(
            `INSERT INTO "${schemaName}".creator (id,name,email) VALUES ($1,'Synthetic reassigned creator',$2)`,
            [
              ids.reassignedCreator,
              `reply-${ids.reassignedCreator}@example.test`,
            ],
          );
          await manager.query(
            `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage,"selectedContactMethod")
           VALUES ($1,$2,$3,'CONTACTED','EMAIL')`,
            [ids.campaignCreator, ids.campaign, ids.creator],
          );
          const sender = `reply-${ids.connectedAccount}@example.test`;
          await manager.query(
            `INSERT INTO core."connectedAccount"
           (id,"workspaceId","userWorkspaceId",handle,name,provider,visibility,scopes)
           VALUES ($1,$2,$3,$4,'Synthetic race sender',$5,'workspace',$6)`,
            [
              ids.connectedAccount,
              workspaceId,
              member.userWorkspaceId,
              sender,
              ConnectedAccountProvider.GOOGLE,
              ['https://www.googleapis.com/auth/gmail.send'],
            ],
          );
          await manager.query(
            `INSERT INTO core."messageChannel"
           (id,"workspaceId","connectedAccountId",handle,visibility,type,
            "pendingGroupEmailsAction","isSyncEnabled","syncStatus","syncStage","syncedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10)`,
            [
              ids.messageChannel,
              workspaceId,
              ids.connectedAccount,
              sender,
              MessageChannelVisibility.SHARE_EVERYTHING,
              MessageChannelType.EMAIL,
              MessageChannelPendingGroupEmailsAction.NONE,
              MessageChannelSyncStatus.ONGOING,
              MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
              new Date('2026-09-16T00:00:00.000Z'),
            ],
          );
          await manager.query(
            `INSERT INTO "${schemaName}"."campaignAccount"
           (id,"campaignId","connectedAccountId","messageChannelId",channel,"isDefault")
           VALUES ($1,$2,$3,$4,'EMAIL',true)`,
            [
              ids.campaignAccount,
              ids.campaign,
              ids.connectedAccount,
              ids.messageChannel,
            ],
          );
        });
        expect(
          (await audience.preview({ authContext, campaignId: ids.campaign }))
            .eligible,
        ).toEqual([
          expect.objectContaining({ campaignCreatorId: ids.campaignCreator }),
        ]);
        const sequence = getDomainService<CampaignSequenceService>(
          'CampaignSequenceService',
        );
        const scope = { workspaceId, campaignId: ids.campaign, authContext };
        const initial = await sequence.createInitial(scope);
        const saved = await sequence.save({
          ...scope,
          expectedVersionId: initial.versionId,
          sequence: {
            schemaVersion: 1,
            messages: [
              {
                id: ids.message,
                channel: 'EMAIL',
                subject: 'Synthetic reply-first race',
                body: JSON.stringify({
                  type: 'doc',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Synthetic' }],
                    },
                  ],
                }),
                files: [],
                replyToThread: false,
              },
              {
                id: ids.followUpMessage,
                channel: 'EMAIL',
                subject: 'Synthetic follow-up',
                body: JSON.stringify({
                  type: 'doc',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Synthetic' }],
                    },
                  ],
                }),
                files: [],
                replyToThread: true,
              },
            ],
            delaysSeconds: [3600],
          },
        });
        expect(saved.issues).toEqual([]);
        expect(
          await sequence.publish({
            ...scope,
            expectedVersionId: saved.versionId,
          }),
        ).toMatchObject({
          versionId: saved.versionId,
          versionStatus: 'ACTIVE',
        });
        expect(
          await application.start(ids.campaign, randomUUID(), authContext),
        ).toMatchObject({
          status: 'STARTED',
          lifecycleStatus: 'ACTIVE',
          changed: true,
          replayed: false,
        });
        const [graph] = await global.testDataSource.query(
          `SELECT e.id AS "enrollmentId", e."authorizationId", o."workflowVersionId",
                o.id AS "occurrenceId", o."messageId", o.state AS "occurrenceState"
           FROM core."campaignEnrollment" e
           JOIN core."campaignOccurrence" o ON o."enrollmentId"=e.id
          WHERE e."workspaceId"=$1 AND e."campaignId"=$2 AND e."campaignCreatorId"=$3`,
          [workspaceId, ids.campaign, ids.campaignCreator],
        );
        expect(graph).toMatchObject({
          messageId: ids.message,
          occurrenceState: 'PENDING',
        });
        const recipient = `reply-${ids.creator}@example.test`;
        const sender = `reply-${ids.connectedAccount}@example.test`;
        const thread = `synthetic-${ids.attempt}`;
        await global.testDataSource.transaction(async (manager) => {
          // Receipt is synthetic and tied to the real generated graph; no provider sends.
          await manager.query(
            `UPDATE core."campaignOccurrence"
             SET state='SUCCEEDED', "terminalReason"='PROVIDER_ACCEPTED', "terminalAt"=now()
           WHERE id=$1 AND state='PENDING'`,
            [graph.occurrenceId],
          );
          await manager.query(
            `INSERT INTO core."outboundEmailAttempt"
           ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
            provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
            "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
            "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
            "providerMessageId","providerMessageExternalId","providerAcceptedAt",retryable,"resolvedThreadExternalId")
           VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google',$5,$6,
            'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$7,$8,$9,$10,$11,$12,1,
            repeat('c',64),repeat('d',64),$13,$13,now(),false,$14)`,
            [
              ids.attempt,
              workspaceId,
              ids.connectedAccount,
              ids.messageChannel,
              sender,
              recipient,
              ids.campaign,
              graph.enrollmentId,
              graph.occurrenceId,
              graph.authorizationId,
              graph.workflowVersionId,
              graph.messageId,
              `provider-${ids.attempt}`,
              thread,
            ],
          );
        });
        expect(await application.stop(ids.campaign, authContext)).toMatchObject(
          {
            status: 'STOPPED',
            lifecycleStatus: 'STOPPED',
          },
        );
        expect(
          (await audience.preview({ authContext, campaignId: ids.campaign }))
            .eligible,
        ).toEqual([
          expect.objectContaining({ campaignCreatorId: ids.campaignCreator }),
        ]);
        const [before] = await global.testDataSource.query(
          `SELECT
           (SELECT count(*)::int FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS authorizations,
           (SELECT count(*)::int FROM core."campaignActivation" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS activations,
           (SELECT count(*)::int FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS enrollments,
           (SELECT count(*)::int FROM core."campaignOccurrence" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS occurrences`,
          [workspaceId, ids.campaign],
        );
        expect(before.enrollments).toBe(1);
        expect(before.occurrences).toBe(1);
        expect(
          (
            await global.testDataSource.query(
              `SELECT state FROM core."campaignEnrollment" WHERE id=$1`,
              [graph.enrollmentId],
            )
          )[0],
        ).toEqual({ state: 'ACTIVE' });

        if (order === 'reassigned-start-first') {
          // Membership identity is reused, but historical enrollment identity remains X.
          expect(
            await global.testDataSource.query(
              `UPDATE "${schemaName}"."campaignCreator" SET "creatorId"=$1
                WHERE id=$2 AND "campaignId"=$3 AND "creatorId"=$4 RETURNING id`,
              [
                ids.reassignedCreator,
                ids.campaignCreator,
                ids.campaign,
                ids.creator,
              ],
            ),
          ).toEqual([[{ id: ids.campaignCreator }], 1]);
          expect(
            (await audience.preview({ authContext, campaignId: ids.campaign }))
              .eligible,
          ).toEqual([
            expect.objectContaining({
              campaignCreatorId: ids.campaignCreator,
              creatorId: ids.reassignedCreator,
            }),
          ]);
        }

        if (order !== 'reply-first') {
          // This new-key Start commits its materialized occurrence before reply
          // even starts its transaction/workspace-lock acquisition.
          expect(
            await application.start(ids.campaign, ids.newKey, authContext),
          ).toMatchObject({
            status: 'STARTED',
            lifecycleStatus: 'ACTIVE',
            changed: true,
            replayed: false,
          });
          const [committed] = await global.testDataSource.query(
            `SELECT e.id AS "enrollmentId",e.state AS "enrollmentState",o.id AS "occurrenceId",o.state AS "occurrenceState",o."messageId"
             FROM core."campaignSequenceAuthorization" a
             JOIN core."campaignEnrollment" e ON e."authorizationId"=a."authorizationId"
             JOIN core."campaignOccurrence" o ON o."enrollmentId"=e.id
            WHERE a."workspaceId"=$1 AND a."campaignId"=$2 AND a."startIdempotencyKey"=$3`,
            [workspaceId, ids.campaign, ids.newKey],
          );
          expect(committed).toMatchObject({
            enrollmentState: 'ACTIVE',
            occurrenceState: 'PENDING',
            messageId:
              order === 'reassigned-start-first'
                ? ids.message
                : ids.followUpMessage,
          });
          expect(committed.enrollmentId).not.toBe(graph.enrollmentId);
          expect(committed.occurrenceId).not.toBe(graph.occurrenceId);
          if (order === 'reassigned-start-first') {
            expect(
              (
                await global.testDataSource.query(
                  `SELECT "creatorId" FROM core."campaignEnrollment" WHERE id=$1`,
                  [committed.enrollmentId],
                )
              )[0],
            ).toEqual({ creatorId: ids.reassignedCreator });
          }
        }

        let prepared!: () => void;
        const preparedSignal = new Promise<void>((resolve) => {
          prepared = resolve;
        });
        const releaseSignal = new Promise<void>((resolve) => {
          releaseStart = resolve;
        });
        const originalStart = execution.startCampaign.bind(execution);
        // This is after application preparation and after the real initial Start/Stop.
        // lookupStartReplay remains real and is not the deferred boundary.
        if (order === 'reply-first') {
          spy = jest
            .spyOn(execution, 'startCampaign')
            .mockImplementation(async (input) => {
              if (input.startIdempotencyKey !== ids.newKey)
                return originalStart(input);
              prepared();
              await releaseSignal;
              return originalStart(input);
            });
          startPromise = application.start(
            ids.campaign,
            ids.newKey,
            authContext,
          );
          // A resolved BLOCKED result before the spy is also an invalid fixture, not a hang.
          await Promise.race([
            preparedSignal,
            startPromise.then(
              () => {
                throw new Error(
                  'Start settled before reaching the deferred boundary',
                );
              },
              (error: unknown) => {
                throw error;
              },
            ),
          ]);
        }
        await orm.executeInWorkspaceContext(async () => {
          const dataSource = await orm.getGlobalWorkspaceDataSource();
          const runner = dataSource.createQueryRunner();
          await runner.connect();
          try {
            expect(runner.manager.constructor.name).toBe(
              'WorkspaceEntityManager',
            );
            await runner.startTransaction();
            await runner.query(
              'SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE',
              [workspaceId],
            );
            // Lock ownership is established; this does not measure the Start backend's
            // blocking PID. Its serialized result is asserted after reply COMMIT.
            if (order === 'reply-first') releaseStart?.();
            await new CampaignReplyService(
              new CampaignProgressionService(),
            ).reconcileInboundMessageInTransaction(
              {
                workspaceId,
                messageChannelId: ids.messageChannel,
                threadExternalId: thread,
                fromHandle: recipient,
                inboundEvidenceId: ids.inboundEvidence,
              },
              runner.manager as never,
            );
            await runner.commitTransaction();
          } finally {
            if (runner.isTransactionActive) await runner.rollbackTransaction();
            await runner.release();
          }
        }, buildSystemAuthContext(workspaceId));
        if (order === 'reply-first') {
          expect(await startPromise).toMatchObject({
            status: 'BLOCKED',
            reason: 'CURRENT_REVIEW_INVALID',
            changed: false,
            replayed: false,
          });
        }
        const [after] = await global.testDataSource.query(
          `SELECT
           (SELECT count(*)::int FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS authorizations,
           (SELECT count(*)::int FROM core."campaignActivation" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS activations,
           (SELECT count(*)::int FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS enrollments,
           (SELECT count(*)::int FROM core."campaignOccurrence" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS occurrences,
           (SELECT count(*)::int FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "startIdempotencyKey"=$3) AS "newAuthorizations"`,
          [workspaceId, ids.campaign, ids.newKey],
        );
        if (order === 'reply-first') {
          expect(after).toEqual({ ...before, newAuthorizations: 0 });
        } else {
          expect(after).toMatchObject({
            authorizations: before.authorizations + 1,
            activations: before.activations + 1,
            enrollments: before.enrollments + 1,
            occurrences: before.occurrences + 1,
            newAuthorizations: 1,
          });
          if (order === 'reassigned-start-first') {
            // The historical reply belongs to X, not Y, despite the reused membership.
            expect(
              await global.testDataSource.query(
                `SELECT e."creatorId",e.state AS "enrollmentState",o.state AS "occurrenceState"
                   FROM core."campaignSequenceAuthorization" a
                   JOIN core."campaignEnrollment" e ON e."authorizationId"=a."authorizationId"
                   JOIN core."campaignOccurrence" o ON o."enrollmentId"=e.id
                  WHERE a."workspaceId"=$1 AND a."campaignId"=$2 AND a."startIdempotencyKey"=$3`,
                [workspaceId, ids.campaign, ids.newKey],
              ),
            ).toEqual([
              {
                creatorId: ids.reassignedCreator,
                enrollmentState: 'ACTIVE',
                occurrenceState: 'PENDING',
              },
            ]);
          } else {
            // The earlier accepted receipt must stop even the follow-up that a
            // committed Start has already materialized, not merely future Starts.
            expect(
              await global.testDataSource.query(
                `SELECT e.state AS "enrollmentState",o.state AS "occurrenceState",o."terminalReason"
             FROM core."campaignSequenceAuthorization" a
             JOIN core."campaignEnrollment" e ON e."authorizationId"=a."authorizationId"
             JOIN core."campaignOccurrence" o ON o."enrollmentId"=e.id
            WHERE a."workspaceId"=$1 AND a."campaignId"=$2 AND a."startIdempotencyKey"=$3`,
                [workspaceId, ids.campaign, ids.newKey],
              ),
            ).toEqual([
              {
                enrollmentState: 'REPLIED',
                occurrenceState: 'CANCELLED',
                terminalReason: 'ENROLLMENT_REPLIED',
              },
            ]);
            // A still-ACTIVE Campaign blocks Start before review validation.
            // Stop the second activation first so the third key tests the
            // historical-reply exclusion rather than CAMPAIGN_ALREADY_ACTIVE.
            expect(
              await application.stop(ids.campaign, authContext),
            ).toMatchObject({
              status: 'STOPPED',
              lifecycleStatus: 'STOPPED',
            });
            const thirdKey = randomUUID();
            expect(
              await application.start(ids.campaign, thirdKey, authContext),
            ).toMatchObject({
              status: 'BLOCKED',
              reason: 'CURRENT_REVIEW_INVALID',
              changed: false,
              replayed: false,
            });
            const [afterThirdStart] = await global.testDataSource.query(
              `SELECT
               (SELECT count(*)::int FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS authorizations,
               (SELECT count(*)::int FROM core."campaignActivation" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS activations,
               (SELECT count(*)::int FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS enrollments,
               (SELECT count(*)::int FROM core."campaignOccurrence" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS occurrences,
               (SELECT count(*)::int FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "startIdempotencyKey"=$3) AS "thirdAuthorizations"`,
              [workspaceId, ids.campaign, thirdKey],
            );
            expect(afterThirdStart).toEqual({
              authorizations: after.authorizations,
              activations: after.activations,
              enrollments: after.enrollments,
              occurrences: after.occurrences,
              thirdAuthorizations: 0,
            });
          }
        }
        expect(
          (
            await global.testDataSource.query(
              `SELECT state,"terminalReason" FROM core."campaignEnrollment" WHERE id=$1`,
              [graph.enrollmentId],
            )
          )[0],
        ).toEqual({ state: 'REPLIED', terminalReason: 'REPLY_RECEIVED' });
        expect(
          (
            await global.testDataSource.query(
              `SELECT o.state,o."terminalReason",a."attemptState",a."resolvedThreadExternalId"
             FROM core."campaignOccurrence" o
             JOIN core."outboundEmailAttempt" a ON a."occurrenceId"=o.id
            WHERE o.id=$1 AND a."attemptId"=$2`,
              [graph.occurrenceId, ids.attempt],
            )
          )[0],
        ).toEqual({
          state: 'SUCCEEDED',
          terminalReason: 'PROVIDER_ACCEPTED',
          attemptState: 'ACCEPTED',
          resolvedThreadExternalId: thread,
        });
      } finally {
        releaseStart?.();
        spy?.mockRestore();
        if (startPromise) await Promise.allSettled([startPromise]);
        await global.testDataSource.transaction(async (manager) => {
          await manager.query(
            `DELETE FROM "${schemaName}"."timelineActivity" WHERE properties->'campaignEvent'->>'campaignId'=$1`,
            [ids.campaign],
          );
          for (const table of [
            'outboundEmailAttempt',
            'campaignOccurrence',
            'campaignEnrollment',
            'campaignActivation',
            'campaignSequenceAuthorization',
            'campaignExecution',
          ]) {
            // Allowlisted table names, scoped to the one synthetic Campaign UUID.
            await manager.query(
              `DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND "campaignId"=$2`,
              [workspaceId, ids.campaign],
            );
          }
          await manager.query(
            `DELETE FROM "${schemaName}"."workflowVersion"
           WHERE "workflowId" IN (SELECT id FROM "${schemaName}".workflow WHERE "outreachCampaignId"=$1)`,
            [ids.campaign],
          );
          await manager.query(
            `DELETE FROM "${schemaName}".workflow WHERE "outreachCampaignId"=$1`,
            [ids.campaign],
          );
          await manager.query(
            `DELETE FROM "${schemaName}"."campaignAccount" WHERE id=$1`,
            [ids.campaignAccount],
          );
          await manager.query(`DELETE FROM core."messageChannel" WHERE id=$1`, [
            ids.messageChannel,
          ]);
          await manager.query(
            `DELETE FROM core."connectedAccount" WHERE id=$1`,
            [ids.connectedAccount],
          );
          await manager.query(
            `DELETE FROM "${schemaName}"."campaignCreator" WHERE id=$1`,
            [ids.campaignCreator],
          );
          await manager.query(
            `DELETE FROM "${schemaName}".creator WHERE id=ANY($1::uuid[])`,
            [[ids.creator, ids.reassignedCreator]],
          );
          await manager.query(
            `DELETE FROM "${schemaName}".campaign WHERE id=$1`,
            [ids.campaign],
          );
        });
        const [remaining] = await global.testDataSource.query(
          `SELECT
           (SELECT count(*)::int FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS enrollments,
           (SELECT count(*)::int FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS attempts,
           (SELECT count(*)::int FROM core."campaignSequenceAuthorization" WHERE "workspaceId"=$1 AND "campaignId"=$2) AS authorizations`,
          [workspaceId, ids.campaign],
        );
        expect(remaining).toEqual({
          enrollments: 0,
          attempts: 0,
          authorizations: 0,
        });
      }
    },
  );
});
