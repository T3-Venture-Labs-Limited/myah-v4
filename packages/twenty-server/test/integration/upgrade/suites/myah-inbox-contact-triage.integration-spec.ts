import { randomUUID } from 'node:crypto';

import {
  InitializeMyahInboxContactTriageWorkspaceCommand,
  setAfterMyahInboxContactTriageBaselineMarkerLockedForTest,
  setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest,
  setAfterMyahInboxContactTriageCaptureInstalledForTest,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748001-initialize-myah-inbox-contact-triage.command';
import {
  CatchUpMyahInboxContactTriageWorkspaceCommand,
  setAfterMyahInboxContactTriageFinalMarkerLockedForTest,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748002-catch-up-myah-inbox-contact-triage.command';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const ownerOld = '20202020-0000-4000-8000-000000000011';
const ownerNew = '20202020-0000-4000-8000-000000000012';
const mixedCreator = '20202020-0000-4000-8000-000000000021';
const inboundCreator = '20202020-0000-4000-8000-000000000022';
const snoozeCreator = '20202020-0000-4000-8000-000000000023';
const expiredSnoozeCreator = '20202020-0000-4000-8000-000000000028';
const tieCreator = '20202020-0000-4000-8000-000000000024';
const emailDirectionCreator = '20202020-0000-4000-8000-000000000025';
const emailNullReceivedAtCreator = '20202020-0000-4000-8000-000000000026';
const instagramLatestDirectionCreator = '20202020-0000-4000-8000-000000000027';
const receiptThreadId = '20202020-0000-4000-8000-000000000151';
const receiptMessageChannelId = '20202020-0000-4000-8000-000000000152';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
};

const commandArgs = {
  workspaceId,
  dataSource: global.testDataSource,
  options: {},
  index: 0,
  total: 1,
};

const runInitialize = () =>
  new InitializeMyahInboxContactTriageWorkspaceCommand(
    {} as never,
    new MyahInboxContactTriageSchemaService(),
  ).runOnWorkspace(commandArgs as never);

// Email channels live in the `core` schema, never in a workspace schema. These
// fixtures reproduce the real shape so the upgrade path cannot pass by
// accident against a hand-made workspace-level `messageChannel` table.
const coreApplicationId = '20202020-0000-4000-8000-000000000007';
const coreUserId = '20202020-0000-4000-8000-000000000008';
const coreUserWorkspaceId = '20202020-0000-4000-8000-000000000009';
const coreConnectedAccountId = '20202020-0000-4000-8000-00000000000a';

const createCoreMessagingFixtures = async (): Promise<void> => {
  // `workspace.workspaceCustomApplicationId` and `application.workspaceId` are
  // DEFERRABLE INITIALLY DEFERRED, so both rows may be inserted together.
  await global.testDataSource.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO core."application" (
         id, "universalIdentifier", name, "sourceType", "sourcePath", "workspaceId"
       ) VALUES ($1, $1, 'Myah triage upgrade test', 'local', 'local', $2)
       ON CONFLICT DO NOTHING`,
      [coreApplicationId, workspaceId],
    );
    await manager.query(
      `INSERT INTO core."workspace" (
         id, "displayName", subdomain, "activationStatus", "workspaceCustomApplicationId"
       ) VALUES ($1, 'Myah triage upgrade test', 'myah-triage-upgrade-test', 'PENDING_CREATION', $2)
       ON CONFLICT DO NOTHING`,
      [workspaceId, coreApplicationId],
    );
  });
  await global.testDataSource.query(
    `INSERT INTO core."user" (id, email)
     VALUES ($1, 'myah-triage-upgrade-test@example.test')
     ON CONFLICT DO NOTHING`,
    [coreUserId],
  );
  await global.testDataSource.query(
    `INSERT INTO core."userWorkspace" (id, "userId", "workspaceId")
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [coreUserWorkspaceId, coreUserId, workspaceId],
  );
  await global.testDataSource.query(
    `INSERT INTO core."connectedAccount" (
       id, "workspaceId", handle, provider, "userWorkspaceId", visibility,
       "dailySendLimit", "minimumSendIntervalMs"
     ) VALUES ($1, $2, 'myah-triage-upgrade-test@example.test', 'google', $3, 'user', 50, 300000)
     ON CONFLICT DO NOTHING`,
    [coreConnectedAccountId, workspaceId, coreUserWorkspaceId],
  );
};

const insertCoreMessageChannel = async ({
  id,
  synced = false,
  syncStatus = 'NOT_SYNCED',
}: {
  id: string;
  synced?: boolean;
  syncStatus?: string;
}): Promise<void> => {
  await global.testDataSource.query(
    `INSERT INTO core."messageChannel" (
       id, "workspaceId", visibility, handle, type, "isContactAutoCreationEnabled",
       "contactAutoCreationPolicy", "messageFolderImportPolicy", "excludeNonProfessionalEmails",
       "excludeGroupEmails", "pendingGroupEmailsAction", "isSyncEnabled", "syncStatus",
       "syncStage", "throttleFailureCount", "connectedAccountId", "syncedAt",
       "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, 'SHARE_EVERYTHING', 'myah-triage-upgrade-test@example.test', 'EMAIL', true,
       'SENT_AND_RECEIVED', 'ALL_FOLDERS', false,
       false, 'NONE', true, $3,
       'MESSAGE_LIST_FETCH_PENDING', 0, $4, CASE WHEN $5 THEN now() ELSE NULL END,
       now(), now()
     )`,
    [id, workspaceId, syncStatus, coreConnectedAccountId, synced],
  );
};

const insertPersistedEmailMessageAndReceipt = async (label: string) => {
  const persistedMessageId = randomUUID();
  const occurredAt = '2099-09-15T10:00:00.000Z';
  const orderKey = `${occurredAt}|EMAIL|${persistedMessageId}`;

  await global.testDataSource.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."message" (id,"messageThreadId","receivedAt","createdAt")
       VALUES ($1,$2,$3::timestamptz,$3::timestamptz)`,
      [persistedMessageId, receiptThreadId, occurredAt],
    );
    await manager.query(
      `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageChannelMessageAssociation" (
         id,"messageId","messageChannelId",direction
       ) VALUES ($1,$2,$3,'INCOMING')`,
      [randomUUID(), persistedMessageId, receiptMessageChannelId],
    );
    await manager.query(
      `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
       SET "inboxState"='NEEDS_REPLY', "updatedAt"=$2::timestamptz
       WHERE id=$1`,
      [receiptThreadId, occurredAt],
    );
    await manager.query(
      `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" (
        channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId", mode,
        direction, "providerOccurredAt", "originalCreatedAt", "normalizedOccurredAt", "orderKey", status
      ) VALUES ('EMAIL', $1, $2, $3, 'LIVE', 'INBOUND', $4::timestamptz, $4::timestamptz, $4::timestamptz, $5, 'PENDING')`,
      [
        persistedMessageId,
        receiptThreadId,
        `integration:${label}`,
        occurredAt,
        orderKey,
      ],
    );
  });

  return { persistedMessageId, orderKey };
};

const insertReceipt = async (label: string) => {
  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" (
      channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId", mode,
      direction, "providerOccurredAt", "originalCreatedAt", "normalizedOccurredAt", "orderKey", status
    ) VALUES ('EMAIL', $1, $2, $3, 'LIVE', 'INBOUND', now(), now(), now(), $4, 'PENDING')`,
    [
      randomUUID(),
      receiptThreadId,
      `integration:${label}`,
      `2026-09-15T10:00:00.000Z|EMAIL|${label}`,
    ],
  );
};

const insertThread = async ({
  id,
  creatorId,
  ownerId,
  state,
  snoozedUntil,
  updatedAt,
}: {
  id: string;
  creatorId: string | null;
  ownerId: string | null;
  state: string;
  snoozedUntil: string | null;
  updatedAt: string;
}) =>
  global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread" (
      id, "creatorId", "inboxOwnerId", "inboxState", "snoozedUntil", "updatedAt", "createdAt"
    ) VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$6::timestamptz)`,
    [id, creatorId, ownerId, state, snoozedUntil, updatedAt],
  );

const insertConversation = async ({
  id,
  creatorId,
  updatedAt,
}: {
  id: string;
  creatorId: string | null;
  updatedAt: string;
}) =>
  global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialConversation" (id,"creatorId","updatedAt","createdAt")
     VALUES ($1,$2,$3::timestamptz,$3::timestamptz)`,
    [id, creatorId, updatedAt],
  );

const insertSocialMessage = async ({
  id,
  conversationId,
  direction,
  occurredAt,
  createdAt = occurredAt,
}: {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';
  occurredAt: string;
  createdAt?: string;
}) =>
  global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialMessage" (
      id,"conversationId",direction,"providerCreatedAt","createdAt"
    ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz)`,
    [id, conversationId, direction, occurredAt, createdAt],
  );

const insertEmailMessage = async ({
  id,
  threadId,
  direction,
  occurredAt,
  receivedAt = occurredAt,
  createdAt = occurredAt,
}: {
  id: string;
  threadId: string;
  direction: 'INCOMING' | 'OUTGOING';
  occurredAt: string;
  receivedAt?: string | null;
  createdAt?: string;
}) => {
  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."message" (id,"messageThreadId","receivedAt","createdAt")
     VALUES ($1,$2,$3::timestamptz,$4::timestamptz)`,
    [id, threadId, receivedAt, createdAt],
  );
  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageChannelMessageAssociation" (id,"messageId",direction)
     VALUES ($1,$2,$3)`,
    [randomUUID(), id, direction],
  );
};

const triageFor = (identity: string) =>
  global.testDataSource.query<
    Array<{
      inboxOwnerId: string | null;
      inboxState: string;
      snoozedUntil: Date | string | null;
      revision: number;
      hasStateDecision: boolean;
      stateDecisionAt: string;
      lastInboundOccurredAt: string | null;
      lastInboundOrderKey: string | null;
    }>
  >(
    `SELECT "inboxOwnerId", "inboxState", "snoozedUntil", revision,
            "hasStateDecision", "stateDecisionAt", "lastInboundOccurredAt", "lastInboundOrderKey"
       FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
      WHERE "contactIdentityKey"=$1`,
    [identity],
  );

describe('Myah Inbox contact triage workspace upgrade (postgres)', () => {
  beforeAll(async () => {
    await global.testDataSource.query(
      `CREATE SCHEMA "workspace_1wgvd1ht5ajtgz36va8w3nc3l"`,
    );
    await global.testDataSource.query(
      `CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."workspaceMember" (id uuid PRIMARY KEY)`,
    );
    await createCoreMessagingFixtures();
    await global.testDataSource
      .query(`CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread" (
      id uuid PRIMARY KEY, "creatorId" uuid, "inboxOwnerId" uuid, "inboxState" text NOT NULL,
      "snoozedUntil" timestamptz, "updatedAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL,
      "deletedAt" timestamptz
    )`);
    await global.testDataSource
      .query(`CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."message" (
      id uuid PRIMARY KEY, "messageThreadId" uuid NOT NULL, "receivedAt" timestamptz,
      "createdAt" timestamptz NOT NULL, "deletedAt" timestamptz
    )`);
    await global.testDataSource.query(
      `CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageChannelMessageAssociation" (
        id uuid PRIMARY KEY, "messageId" uuid NOT NULL, "messageChannelId" uuid, direction text NOT NULL,
        "deletedAt" timestamptz
      )`,
    );
    await global.testDataSource
      .query(`CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialConversation" (
      id uuid PRIMARY KEY, "creatorId" uuid, "updatedAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL, "deletedAt" timestamptz
    )`);
    await global.testDataSource
      .query(`CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialMessage" (
      id uuid PRIMARY KEY, "conversationId" uuid NOT NULL, direction text NOT NULL,
      "providerCreatedAt" timestamptz, "createdAt" timestamptz NOT NULL, "deletedAt" timestamptz
    )`);
    await global.testDataSource.query(
      `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."workspaceMember" (id) VALUES ($1),($2)`,
      [ownerOld, ownerNew],
    );
    await insertCoreMessageChannel({ id: receiptMessageChannelId });
    await insertThread({
      id: receiptThreadId,
      creatorId: null,
      ownerId: null,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T07:00:00.000Z',
    });

    // NEEDS_REPLY wins state while the newest Email tuple independently supplies owner.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000101',
      creatorId: mixedCreator,
      ownerId: ownerOld,
      state: 'NEEDS_REPLY',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertThread({
      id: '20202020-0000-4000-8000-000000000102',
      creatorId: mixedCreator,
      ownerId: ownerNew,
      state: 'SNOOZED',
      snoozedUntil: '2026-09-20T08:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z',
    });
    await insertConversation({
      id: '20202020-0000-4000-8000-000000000103',
      creatorId: mixedCreator,
      updatedAt: '2026-09-15T10:00:00.000Z',
    });
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000104',
      conversationId: '20202020-0000-4000-8000-000000000103',
      direction: 'OUTBOUND',
      occurredAt: '2026-09-15T10:00:00.000Z',
    });

    // Instagram inbound also wins over a non-actionable Email tuple.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000111',
      creatorId: inboundCreator,
      ownerId: ownerOld,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertConversation({
      id: '20202020-0000-4000-8000-000000000112',
      creatorId: inboundCreator,
      updatedAt: '2026-09-15T09:00:00.000Z',
    });
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000113',
      conversationId: '20202020-0000-4000-8000-000000000112',
      direction: 'INBOUND',
      occurredAt: '2026-09-15T12:00:00.000Z',
    });
    await insertEmailMessage({
      id: '20202020-0000-4000-8000-000000000114',
      threadId: '20202020-0000-4000-8000-000000000111',
      direction: 'INCOMING',
      occurredAt: '2026-09-15T11:00:00.000Z',
    });

    // Email ordering must exclude an outgoing association even when it is newer.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000115',
      creatorId: emailDirectionCreator,
      ownerId: null,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertEmailMessage({
      id: '20202020-0000-4000-8000-000000000116',
      threadId: '20202020-0000-4000-8000-000000000115',
      direction: 'INCOMING',
      occurredAt: '2026-09-15T10:00:00.000Z',
    });
    await insertEmailMessage({
      id: '20202020-0000-4000-8000-000000000117',
      threadId: '20202020-0000-4000-8000-000000000115',
      direction: 'OUTGOING',
      occurredAt: '2026-09-15T11:00:00.000Z',
    });

    // An incoming Email without receivedAt uses immutable createdAt as its baseline occurrence.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000118',
      creatorId: emailNullReceivedAtCreator,
      ownerId: null,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertEmailMessage({
      id: '20202020-0000-4000-8000-000000000119',
      threadId: '20202020-0000-4000-8000-000000000118',
      direction: 'INCOMING',
      occurredAt: '2026-09-15T10:30:00.456Z',
      receivedAt: null,
    });

    // The newer creation key wins an equal normalized Instagram occurrence,
    // even when UUID ordering points to the older opposite-direction message.
    await insertConversation({
      id: '20202020-0000-4000-8000-000000000147',
      creatorId: instagramLatestDirectionCreator,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000149',
      conversationId: '20202020-0000-4000-8000-000000000147',
      direction: 'OUTBOUND',
      occurredAt: '2026-09-15T10:00:00.000Z',
      createdAt: '2026-09-15T10:00:00.000Z',
    });
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000148',
      conversationId: '20202020-0000-4000-8000-000000000147',
      direction: 'INBOUND',
      occurredAt: '2026-09-15T10:00:00.000Z',
      createdAt: '2026-09-15T10:01:00.000Z',
    });

    // A newer UNKNOWN Instagram row cannot displace the older actionable outbound.
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000146',
      conversationId: '20202020-0000-4000-8000-000000000142',
      direction: 'UNKNOWN',
      occurredAt: '2026-09-15T11:00:00.000Z',
    });

    // Latest Email tuple retains its complete snooze state when no attention exists.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000121',
      creatorId: snoozeCreator,
      ownerId: ownerOld,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertThread({
      id: '20202020-0000-4000-8000-000000000122',
      creatorId: snoozeCreator,
      ownerId: ownerNew,
      state: 'SNOOZED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T09:00:00.000Z',
    });
    await global.testDataSource.query(
      `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
       SET "snoozedUntil"=now() + interval '1 day'
       WHERE id='20202020-0000-4000-8000-000000000122'`,
    );

    // An expired legacy snooze is immediately actionable during migration.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000128',
      creatorId: expiredSnoozeCreator,
      ownerId: ownerOld,
      state: 'SNOOZED',
      snoozedUntil: '2000-01-01T00:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z',
    });

    // Exact update ties resolve lexically by thread ID.
    await insertThread({
      id: '20202020-0000-4000-8000-000000000131',
      creatorId: tieCreator,
      ownerId: ownerOld,
      state: 'WAITING_ON_CREATOR',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertThread({
      id: '20202020-0000-4000-8000-000000000132',
      creatorId: tieCreator,
      ownerId: ownerNew,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });

    await insertConversation({
      id: '20202020-0000-4000-8000-000000000141',
      creatorId: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertConversation({
      id: '20202020-0000-4000-8000-000000000142',
      creatorId: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertConversation({
      id: '20202020-0000-4000-8000-000000000143',
      creatorId: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000144',
      conversationId: '20202020-0000-4000-8000-000000000141',
      direction: 'INBOUND',
      occurredAt: '2026-09-15T10:00:00.000Z',
    });
    await insertSocialMessage({
      id: '20202020-0000-4000-8000-000000000145',
      conversationId: '20202020-0000-4000-8000-000000000142',
      direction: 'OUTBOUND',
      occurredAt: '2026-09-15T10:00:00.000Z',
    });
  });

  afterEach(() => {
    setAfterMyahInboxContactTriageCaptureInstalledForTest(undefined);
    setAfterMyahInboxContactTriageBaselineMarkerLockedForTest(undefined);
    setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest(undefined);
  });

  afterAll(async () => {
    await global.testDataSource.query(
      `DROP SCHEMA IF EXISTS "workspace_1wgvd1ht5ajtgz36va8w3nc3l" CASCADE`,
    );
    await global.testDataSource.query(
      `DELETE FROM core."messageChannel" WHERE "workspaceId"=$1`,
      [workspaceId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."connectedAccount" WHERE "workspaceId"=$1`,
      [workspaceId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1`,
      [workspaceId],
    );
    await global.testDataSource.query(`DELETE FROM core."user" WHERE id=$1`, [
      coreUserId,
    ]);
    await global.testDataSource.query(`DELETE FROM core."workspace" WHERE id=$1`, [
      workspaceId,
    ]);
    await global.testDataSource.query(`DELETE FROM core."application" WHERE id=$1`, [
      coreApplicationId,
    ]);
  });

  it('uses the millisecond future-clamped baseline expression in UTC and Asia/Kathmandu', async () => {
    const normalize = async (timezone: 'UTC' | 'Asia/Kathmandu') =>
      global.testDataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('TimeZone', $1, true)", [
          timezone,
        ]);
        const [row] = await manager.query<
          Array<{ occurredAt: string; orderKey: string }>
        >(
          `SELECT to_char(
             LEAST(
               COALESCE(
                 date_trunc('milliseconds', $1::timestamptz),
                 date_trunc('milliseconds', $2::timestamptz)
               ),
               date_trunc('milliseconds', $2::timestamptz)
             ) AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           ) AS "occurredAt",
           to_char(
             date_trunc('milliseconds', $2::timestamptz) AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           ) || '|EMAIL|message-id' AS "orderKey"`,
          ['2099-09-15T10:00:00.123Z', '2026-09-15T10:00:00.456Z'],
        );
        return row;
      });

    await expect(normalize('UTC')).resolves.toEqual({
      occurredAt: '2026-09-15T10:00:00.456Z',
      orderKey: '2026-09-15T10:00:00.456Z|EMAIL|message-id',
    });
    await expect(normalize('Asia/Kathmandu')).resolves.toEqual({
      occurredAt: '2026-09-15T10:00:00.456Z',
      orderKey: '2026-09-15T10:00:00.456Z|EMAIL|message-id',
    });
  });

  it.each(['UTC', 'Asia/Kathmandu'] as const)(
    'passes canonical timestamp text to receipt application in %s',
    async (timezone) => {
      await runInitialize();
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"
         SET status='READY' WHERE id=true`,
      );
      const persistedMessageId = randomUUID();
      const [{ sequence }] = await global.testDataSource.query<
        Array<{ sequence: string }>
      >(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" (
          channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId", mode,
          direction, "providerOccurredAt", "originalCreatedAt", "normalizedOccurredAt", "orderKey", status
        ) VALUES ('EMAIL', $1, $2, 'integration:timestamp-text', 'LIVE', 'INBOUND',
                  $3::timestamptz, $4::timestamptz, $5::timestamptz, $6, 'PENDING')
        RETURNING sequence::text AS sequence`,
        [
          persistedMessageId,
          receiptThreadId,
          '2026-09-15T09:00:00.123Z',
          '2026-09-15T10:00:00.456Z',
          '2026-09-15T09:00:00.123Z',
          '2026-09-15T10:00:00.456Z|EMAIL|' + persistedMessageId,
        ],
      );
      const applyReceiptInTransaction = jest.fn().mockResolvedValue(undefined);
      const workspaceDataSource = {
        manager: {
          ...global.testDataSource.manager,
          internalContext: { workspaceId },
        },
        query: (...args: Parameters<typeof global.testDataSource.query>) =>
          global.testDataSource.query(...args),
        transaction: async (
          callback: (manager: {
            internalContext: { workspaceId: string };
          }) => Promise<unknown>,
        ) =>
          global.testDataSource.transaction(async (manager) => {
            await manager.query("SELECT set_config('TimeZone', $1, true)", [
              timezone,
            ]);
            Object.assign(manager, { internalContext: { workspaceId } });
            return callback(manager as never);
          }),
      };
      const receiptService = new MyahInboxContactTriageReceiptService(
        {
          executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
            callback(),
          getGlobalWorkspaceDataSource: async () => workspaceDataSource,
        } as never,
        undefined,
        {
          lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
          applyReceiptInTransaction,
          resolveDueSnoozesInTransaction: jest.fn().mockResolvedValue(0),
        } as never,
      );

      await expect(
        receiptService.drain({
          workspaceId,
          throughSequence: sequence,
          purpose: 'READY_RECOVERY',
        }),
      ).resolves.toBe(1);

      expect(applyReceiptInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOccurredAt: '2026-09-15T09:00:00.123Z',
          originalCreatedAt: '2026-09-15T10:00:00.456Z',
          normalizedOccurredAt: '2026-09-15T09:00:00.123Z',
        }),
        expect.anything(),
      );
      const [receipt] = applyReceiptInTransaction.mock.calls[0];
      expect(typeof receipt.providerOccurredAt).toBe('string');
      expect(typeof receipt.originalCreatedAt).toBe('string');
      expect(typeof receipt.normalizedOccurredAt).toBe('string');
    },
  );

  it.each(['UTC', 'Asia/Kathmandu'] as const)(
    'truncates sub-millisecond provider evidence and rejects timezone-less evidence in %s',
    async (timezone) => {
      await runInitialize();
      const receiptService = new MyahInboxContactTriageReceiptService();
      const subMillisecondMessageId = randomUUID();
      const timezoneLessMessageId = randomUUID();

      await global.testDataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('TimeZone', $1, true)", [
          timezone,
        ]);
        Object.assign(manager, { internalContext: { workspaceId } });
        for (const [persistedMessageId, providerOccurredAt] of [
          [subMillisecondMessageId, '2026-09-15T09:00:00.123987Z'],
          [timezoneLessMessageId, '2026-09-15T09:00:00.123987'],
        ]) {
          await receiptService.recordInTransaction(
            {
              channel: 'EMAIL',
              persistedMessageId,
              sourceRecordId: receiptThreadId,
              sourceGenerationId: `integration:precision:${timezone}`,
              mode: 'LIVE',
              direction: 'INBOUND',
              providerOccurredAt,
              originalCreatedAt: '2026-09-15T10:00:00.456789Z',
              firstPersistence: true,
            },
            manager as never,
          );
        }
      });

      await expect(
        global.testDataSource.query(
          `SELECT "persistedMessageId",
                  to_char("providerOccurredAt" AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "providerOccurredAt",
                  to_char("normalizedOccurredAt" AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "normalizedOccurredAt"
             FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt"
            WHERE "persistedMessageId" = ANY($1::uuid[])
            ORDER BY "persistedMessageId"`,
          [[subMillisecondMessageId, timezoneLessMessageId]],
        ),
      ).resolves.toEqual(
        [
          {
            persistedMessageId: subMillisecondMessageId,
            providerOccurredAt: '2026-09-15T09:00:00.123Z',
            normalizedOccurredAt: '2026-09-15T09:00:00.123Z',
          },
          {
            persistedMessageId: timezoneLessMessageId,
            providerOccurredAt: null,
            normalizedOccurredAt: '2026-09-15T10:00:00.456Z',
          },
        ].sort((left, right) =>
          left.persistedMessageId.localeCompare(right.persistedMessageId),
        ),
      );
    },
  );

  it('falls back to originalCreatedAt when PostgreSQL cannot represent provider time', async () => {
    await runInitialize();
    const receiptService = new MyahInboxContactTriageReceiptService();
    const persistedMessageId = randomUUID();
    await global.testDataSource.transaction(async (manager) => {
      Object.assign(manager, { internalContext: { workspaceId } });
      await receiptService.recordInTransaction(
        {
          channel: 'EMAIL',
          persistedMessageId,
          sourceRecordId: receiptThreadId,
          sourceGenerationId: 'integration:out-of-range-provider-time',
          mode: 'LIVE',
          direction: 'INBOUND',
          providerOccurredAt: '0000-01-01T00:00:00.000Z',
          originalCreatedAt: '2026-09-15T10:00:00.456Z',
          firstPersistence: true,
        },
        manager as never,
      );
    });

    await expect(
      global.testDataSource.query(
        `SELECT "providerOccurredAt",
                to_char("normalizedOccurredAt" AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "normalizedOccurredAt"
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt"
          WHERE "persistedMessageId"=$1`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([
      {
        providerOccurredAt: null,
        normalizedOccurredAt: '2026-09-15T10:00:00.456Z',
      },
    ]);
  });

  it('initializes source-only Email and Instagram tuples from their first persisted direction', async () => {
    await runInitialize();
    const triageService = new MyahInboxContactTriageService();
    const cases = [
      {
        sourceType: 'EMAIL_THREAD' as const,
        channel: 'EMAIL' as const,
        sourceRecordId: '20202020-0000-4000-8000-000000000201',
        direction: 'INBOUND' as const,
        expectedState: 'NEEDS_REPLY',
      },
      {
        sourceType: 'EMAIL_THREAD' as const,
        channel: 'EMAIL' as const,
        sourceRecordId: '20202020-0000-4000-8000-000000000202',
        direction: 'OUTBOUND' as const,
        expectedState: 'WAITING_ON_CREATOR',
      },
      {
        sourceType: 'INSTAGRAM_CONVERSATION' as const,
        channel: 'INSTAGRAM' as const,
        sourceRecordId: '20202020-0000-4000-8000-000000000203',
        direction: 'INBOUND' as const,
        expectedState: 'NEEDS_REPLY',
      },
      {
        sourceType: 'INSTAGRAM_CONVERSATION' as const,
        channel: 'INSTAGRAM' as const,
        sourceRecordId: '20202020-0000-4000-8000-000000000204',
        direction: 'OUTBOUND' as const,
        expectedState: 'WAITING_ON_CREATOR',
      },
    ];

    for (const testCase of cases) {
      if (testCase.sourceType === 'EMAIL_THREAD') {
        await insertThread({
          id: testCase.sourceRecordId,
          creatorId: null,
          ownerId: null,
          state: 'CLOSED',
          snoozedUntil: null,
          updatedAt: '2026-09-15T08:00:00.000Z',
        });
      } else {
        await insertConversation({
          id: testCase.sourceRecordId,
          creatorId: null,
          updatedAt: '2026-09-15T08:00:00.000Z',
        });
      }
      await global.testDataSource.transaction(async (manager) => {
        await triageService.ensureSourceContactInTransaction({
          workspaceId,
          sourceType: testCase.sourceType,
          sourceRecordId: testCase.sourceRecordId,
          manager: manager as never,
        });
        await triageService.ensureSourceContactInTransaction({
          workspaceId,
          sourceType: testCase.sourceType,
          sourceRecordId: testCase.sourceRecordId,
          initialDirection: testCase.direction,
          manager: manager as never,
        });
      });
      const identity =
        testCase.sourceType === 'EMAIL_THREAD'
          ? `email-thread:${testCase.sourceRecordId}`
          : `instagram-conversation:${testCase.sourceRecordId}`;
      await expect(triageFor(identity)).resolves.toEqual([
        expect.objectContaining({ inboxState: testCase.expectedState }),
      ]);
    }
  });

  it('applies ordered LIVE inbound evidence after fresh outbound initialization without replaying it', async () => {
    await runInitialize();
    const sourceRecordId = randomUUID();
    const identity = `instagram-conversation:${sourceRecordId}`;
    const outboundOccurredAt = '2026-09-15T09:00:00.000Z';
    const inboundOccurredAt = '2026-09-15T10:00:00.000Z';
    const inboundOrderKey = `2026-09-15T10:00:00.000Z|INSTAGRAM|${sourceRecordId}:inbound`;
    const triageService = new MyahInboxContactTriageService();

    await insertConversation({
      id: sourceRecordId,
      creatorId: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await global.testDataSource.transaction(async (manager) => {
      const workspaceManager = Object.assign(manager, {
        internalContext: { workspaceId },
      });
      await triageService.ensureSourceContactInTransaction({
        workspaceId,
        sourceType: 'INSTAGRAM_CONVERSATION',
        sourceRecordId,
        manager: manager as never,
      });
      await manager.query(
        `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
            SET "inboxOwnerId"=$2, revision=revision+1, "triageChangedAt"=now()
          WHERE "contactIdentityKey"=$1
            AND revision=1
            AND "identityGeneration"=1`,
        [identity, ownerNew],
      );
      await triageService.applyReceiptInTransaction(
        {
          sequence: '1',
          channel: 'INSTAGRAM',
          persistedMessageId: randomUUID(),
          sourceRecordId,
          sourceGenerationId: 'webhook:first-outbound',
          mode: 'LIVE',
          direction: 'OUTBOUND',
          providerOccurredAt: outboundOccurredAt,
          originalCreatedAt: outboundOccurredAt,
          normalizedOccurredAt: outboundOccurredAt,
          orderKey: `2026-09-15T09:00:00.000Z|INSTAGRAM|${sourceRecordId}:outbound`,
        },
        workspaceManager as never,
      );
      const inboundReceipt = {
        sequence: '2',
        channel: 'INSTAGRAM' as const,
        persistedMessageId: randomUUID(),
        sourceRecordId,
        sourceGenerationId: 'webhook:first-inbound',
        mode: 'LIVE' as const,
        direction: 'INBOUND' as const,
        providerOccurredAt: inboundOccurredAt,
        originalCreatedAt: inboundOccurredAt,
        normalizedOccurredAt: inboundOccurredAt,
        orderKey: inboundOrderKey,
      };
      await triageService.applyReceiptInTransaction(
        inboundReceipt,
        workspaceManager as never,
      );
      await triageService.applyReceiptInTransaction(
        inboundReceipt,
        workspaceManager as never,
      );
    });

    const [triage] = await triageFor(identity);

    expect(triage).toMatchObject({
      inboxOwnerId: ownerNew,
      inboxState: 'NEEDS_REPLY',
      lastInboundOrderKey: inboundOrderKey,
      revision: 4,
    });
    expect(triage.lastInboundOccurredAt).toEqual(new Date(inboundOccurredAt));
    expect(triage.stateDecisionAt).toEqual(new Date(inboundOccurredAt));
  });

  it('linearizes baseline snapshots with Email linking in both source-row lock orders', async () => {
    const sourceRecordId = randomUUID();
    const creatorId = randomUUID();
    const messageId = randomUUID();
    const sourceIdentity = `email-thread:${sourceRecordId}`;
    const creatorIdentity = `creator:${creatorId}`;
    const sourceOrderKey = `2026-09-15T10:00:00.000Z|EMAIL|${messageId}`;
    const triageService = new MyahInboxContactTriageService();

    await insertThread({
      id: sourceRecordId,
      creatorId: null,
      ownerId: ownerNew,
      state: 'NEEDS_REPLY',
      snoozedUntil: null,
      updatedAt: '2026-09-15T10:00:00.000Z',
    });
    await insertEmailMessage({
      id: messageId,
      threadId: sourceRecordId,
      direction: 'INCOMING',
      occurredAt: '2026-09-15T10:00:00.000Z',
    });

    const resetBaseline = async () => {
      await global.testDataSource.query(
        `TRUNCATE TABLE
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt",
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage",
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity",
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
      );
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
         SET "creatorId"=NULL WHERE id=$1`,
        [sourceRecordId],
      );
    };

    const linkSource = async (
      pauseAfterSourceRowLock?: () => Promise<void>,
    ) => {
      const runner = global.testDataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
          buildMyahInboxSourceKey('EMAIL_THREAD', sourceRecordId),
        ]);
        const [source] = (await runner.query(
          `SELECT "creatorId" FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
           WHERE id=$1 FOR UPDATE`,
          [sourceRecordId],
        )) as Array<{ creatorId: string | null }>;
        await pauseAfterSourceRowLock?.();
        await runner.query(
          `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
           SET "creatorId"=$2 WHERE id=$1`,
          [sourceRecordId, creatorId],
        );
        Object.assign(runner.manager, { internalContext: { workspaceId } });
        await triageService.ensureSourceContactInTransaction({
          workspaceId,
          sourceType: 'EMAIL_THREAD',
          sourceRecordId,
          previousCreatorId: source.creatorId,
          manager: runner.manager as never,
        });
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      } finally {
        await runner.release();
      }
    };

    const expectPostLinkTriage = async () => {
      await expect(
        global.testDataSource.query(
          `SELECT "contactIdentityKey", "isActive"
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity"
           WHERE "contactIdentityKey" = ANY($1::text[])
           ORDER BY "contactIdentityKey"`,
          [[creatorIdentity, sourceIdentity]],
        ),
      ).resolves.toEqual([
        { contactIdentityKey: creatorIdentity, isActive: true },
        { contactIdentityKey: sourceIdentity, isActive: false },
      ]);
      await expect(triageFor(sourceIdentity)).resolves.toEqual([]);
      await expect(triageFor(creatorIdentity)).resolves.toEqual([
        expect.objectContaining({
          inboxOwnerId: ownerNew,
          inboxState: 'NEEDS_REPLY',
          lastInboundOrderKey: sourceOrderKey,
        }),
      ]);
    };

    await resetBaseline();
    const baselineSourceLocksAcquired = deferred();
    const releaseBaseline = deferred();
    setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest(
      async () => {
        baselineSourceLocksAcquired.resolve();
        await releaseBaseline.promise;
      },
    );
    const baselineFirst = runInitialize();
    await baselineSourceLocksAcquired.promise;
    let linkAfterBaselineCompleted = false;
    const linkAfterBaseline = linkSource().then(() => {
      linkAfterBaselineCompleted = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(linkAfterBaselineCompleted).toBe(false);
    releaseBaseline.resolve();
    await Promise.all([baselineFirst, linkAfterBaseline]);
    await expectPostLinkTriage();

    await resetBaseline();
    const linkSourceRowLocked = deferred();
    const releaseLink = deferred();
    const linkFirst = linkSource(async () => {
      linkSourceRowLocked.resolve();
      await releaseLink.promise;
    });
    await linkSourceRowLocked.promise;
    const baselineMarkerLocked = deferred();
    setAfterMyahInboxContactTriageBaselineMarkerLockedForTest(async () => {
      baselineMarkerLocked.resolve();
    });
    let baselineAfterLinkCompleted = false;
    const baselineAfterLink = runInitialize().then(() => {
      baselineAfterLinkCompleted = true;
    });
    await baselineMarkerLocked.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(baselineAfterLinkCompleted).toBe(false);
    releaseLink.resolve();
    await Promise.all([linkFirst, baselineAfterLink]);
    await expectPostLinkTriage();
  });

  it('reactivates a retired Creator identity when its final source is relinked', async () => {
    const sourceRecordId = randomUUID();
    const creatorId = randomUUID();
    const creatorIdentity = `creator:${creatorId}`;
    const fallbackIdentity = `email-thread:${sourceRecordId}`;
    const triageService = new MyahInboxContactTriageService();

    await insertThread({
      id: sourceRecordId,
      creatorId,
      ownerId: null,
      state: 'CLOSED',
      snoozedUntil: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    });
    await global.testDataSource.transaction(async (manager) => {
      Object.assign(manager, { internalContext: { workspaceId } });
      await triageService.ensureSourceContactInTransaction({
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        sourceRecordId,
        manager: manager as never,
      });
    });
    const [beforeRetirement] = (await global.testDataSource.query(
      `SELECT revision, "identityGeneration"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
        WHERE "contactIdentityKey"=$1`,
      [creatorIdentity],
    )) as Array<{ revision: number; identityGeneration: string }>;

    await global.testDataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
         SET "creatorId"=NULL WHERE id=$1`,
        [sourceRecordId],
      );
      Object.assign(manager, { internalContext: { workspaceId } });
      await triageService.ensureSourceContactInTransaction({
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        sourceRecordId,
        previousCreatorId: creatorId,
        manager: manager as never,
      });
    });
    await expect(
      global.testDataSource.query(
        `SELECT "isActive"
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity"
          WHERE "contactIdentityKey"=$1`,
        [creatorIdentity],
      ),
    ).resolves.toEqual([{ isActive: false }]);
    await expect(triageFor(creatorIdentity)).resolves.toEqual([]);

    await global.testDataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
         SET "creatorId"=$2 WHERE id=$1`,
        [sourceRecordId, creatorId],
      );
      Object.assign(manager, { internalContext: { workspaceId } });
      await triageService.ensureSourceContactInTransaction({
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        sourceRecordId,
        manager: manager as never,
      });
    });

    const activeTuples = await global.testDataSource.query(
      `SELECT triage."contactIdentityKey", identity."isActive", triage."identityGeneration"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage" triage
         JOIN "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity" identity
           ON identity."contactIdentityKey"=triage."contactIdentityKey"
        WHERE triage."contactIdentityKey" = ANY($1::text[])
        ORDER BY triage."contactIdentityKey"`,
      [[creatorIdentity, fallbackIdentity]],
    );
    expect(activeTuples).toEqual([
      expect.objectContaining({
        contactIdentityKey: creatorIdentity,
        isActive: true,
      }),
    ]);
    const currentTuple = activeTuples[0] as {
      identityGeneration: string;
    };
    expect(currentTuple.identityGeneration).not.toBe(
      beforeRetirement.identityGeneration,
    );

    await expect(
      global.testDataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('search_path', $1, true)", [
          'workspace_1wgvd1ht5ajtgz36va8w3nc3l',
        ]);
        return triageService.updateTupleInTransaction({
          contactIdentityKey: creatorIdentity,
          expectedRevision: beforeRetirement.revision,
          expectedIdentityGeneration: beforeRetirement.identityGeneration,
          patch: { inboxOwnerId: null },
          manager: manager as never,
        });
      }),
    ).rejects.toMatchObject({
      extensions: {
        triage: expect.objectContaining({
          identityGeneration: currentTuple.identityGeneration,
        }),
      },
    });
  });

  it('keeps state-decision fields from the exact triageChangedAt merge winner while independently preserving greatest inbound evidence', async () => {
    const triageService = new MyahInboxContactTriageService();
    const fallbackInboundAt = '2026-09-15T12:00:00.000Z';

    const merge = async ({
      creatorChangedAt,
      fallbackChangedAt,
      creatorStateDecisionAt,
      expectedOwnerId,
      expectedInboxState,
      expectedStateDecisionAt,
      expectedHasStateDecision,
    }: {
      creatorChangedAt: string;
      fallbackChangedAt: string;
      creatorStateDecisionAt: string;
      expectedOwnerId: string;
      expectedInboxState: 'CLOSED' | 'NEEDS_REPLY';
      expectedStateDecisionAt: string;
      expectedHasStateDecision: boolean;
    }) => {
      const sourceRecordId = randomUUID();
      const creatorId = randomUUID();
      const creatorIdentity = `creator:${creatorId}`;
      const fallbackIdentity = `email-thread:${sourceRecordId}`;
      const fallbackOrderKey = `${fallbackInboundAt}|EMAIL|${randomUUID()}`;

      await insertThread({
        id: sourceRecordId,
        creatorId,
        ownerId: null,
        state: 'CLOSED',
        snoozedUntil: null,
        updatedAt: '2026-09-15T08:00:00.000Z',
      });
      await global.testDataSource.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity" ("contactIdentityKey")
         VALUES ($1), ($2)`,
        [creatorIdentity, fallbackIdentity],
      );
      await global.testDataSource.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage" (
          "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState", "snoozedUntil", revision,
          "hasStateDecision", "stateDecisionAt", "lastInboundOccurredAt", "lastInboundOrderKey", "triageChangedAt"
        ) VALUES
          ($1, 1, $2, 'CLOSED', NULL, 1, true, $3::timestamptz,
           '2026-09-15T08:00:00.000Z'::timestamptz, 'creator-inbound', $4::timestamptz),
          ($5, 1, $6, 'NEEDS_REPLY', NULL, 1, false, '2026-09-15T09:00:00.000Z'::timestamptz,
           $7::timestamptz, $8, $9::timestamptz)`,
        [
          creatorIdentity,
          ownerOld,
          creatorStateDecisionAt,
          creatorChangedAt,
          fallbackIdentity,
          ownerNew,
          fallbackInboundAt,
          fallbackOrderKey,
          fallbackChangedAt,
        ],
      );
      await global.testDataSource.transaction(async (manager) => {
        Object.assign(manager, { internalContext: { workspaceId } });
        await triageService.ensureSourceContactInTransaction({
          workspaceId,
          sourceType: 'EMAIL_THREAD',
          sourceRecordId,
          manager: manager as never,
        });
      });

      await expect(triageFor(fallbackIdentity)).resolves.toEqual([]);
      await expect(
        global.testDataSource.query(
          `SELECT "inboxOwnerId", "inboxState", "snoozedUntil", "hasStateDecision",
                  to_char("stateDecisionAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "stateDecisionAt",
                  to_char("lastInboundOccurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastInboundOccurredAt",
                  "lastInboundOrderKey",
                  to_char("triageChangedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "triageChangedAt"
             FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
            WHERE "contactIdentityKey"=$1`,
          [creatorIdentity],
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          inboxOwnerId: expectedOwnerId,
          inboxState: expectedInboxState,
          snoozedUntil: null,
          hasStateDecision: expectedHasStateDecision,
          stateDecisionAt: expectedStateDecisionAt,
          lastInboundOccurredAt: fallbackInboundAt,
          lastInboundOrderKey: fallbackOrderKey,
          triageChangedAt:
            creatorChangedAt > fallbackChangedAt
              ? creatorChangedAt
              : fallbackChangedAt,
        }),
      ]);
    };

    // The automatic fallback changed later than the Creator's explicit CLOSED
    // tuple. Its complete state tuple therefore wins, even though its decision
    // timestamp is older; the newer inbound evidence remains independent.
    await merge({
      creatorChangedAt: '2026-09-15T10:00:00.000Z',
      fallbackChangedAt: '2026-09-15T11:00:00.000Z',
      creatorStateDecisionAt: '2026-09-15T10:00:00.000Z',
      expectedOwnerId: ownerNew,
      expectedInboxState: 'NEEDS_REPLY',
      expectedStateDecisionAt: '2026-09-15T09:00:00.000Z',
      expectedHasStateDecision: false,
    });

    // Conversely, when the Creator tuple changed later, all of its decision
    // fields remain together while fallback inbound evidence is still maxed.
    await merge({
      creatorChangedAt: '2026-09-15T12:00:00.000Z',
      fallbackChangedAt: '2026-09-15T11:00:00.000Z',
      creatorStateDecisionAt: '2026-09-15T12:00:00.000Z',
      expectedOwnerId: ownerOld,
      expectedInboxState: 'CLOSED',
      expectedStateDecisionAt: '2026-09-15T12:00:00.000Z',
      expectedHasStateDecision: true,
    });
  });

  it('replaces provisional producer tuples with the restart-safe legacy baseline', async () => {
    await runInitialize();
    await global.testDataSource.query(
      `TRUNCATE TABLE
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
    );
    let provisionalInserted = false;
    setAfterMyahInboxContactTriageCaptureInstalledForTest(async () => {
      if (provisionalInserted) return;
      provisionalInserted = true;
      await global.testDataSource.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity" (
           "contactIdentityKey", generation, "isActive"
         ) VALUES ($1, 1, true)`,
        [`creator:${snoozeCreator}`],
      );
      await global.testDataSource.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage" (
           "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState",
           "snoozedUntil", revision, "hasStateDecision", "stateDecisionAt",
           "lastInboundOccurredAt", "lastInboundOrderKey", "triageChangedAt"
         ) VALUES (
           $1, 1, NULL, 'NEEDS_REPLY', NULL, 7, false,
           '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z',
           '2099-01-01T00:00:00.000Z|EMAIL|provisional', '2099-01-01T00:00:00.000Z'
         )`,
        [`creator:${snoozeCreator}`],
      );
    });
    let failBaselineOnce = true;
    setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest(
      async () => {
        if (!failBaselineOnce) return;
        failBaselineOnce = false;
        throw new Error('forced baseline rollback');
      },
    );

    await expect(runInitialize()).rejects.toThrow('forced baseline rollback');
    await expect(
      global.testDataSource.query(
        `SELECT "baselineStartedAt" FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" WHERE id=true`,
      ),
    ).resolves.toEqual([{ baselineStartedAt: null }]);
    await expect(triageFor(`creator:${snoozeCreator}`)).resolves.toEqual([
      expect.objectContaining({
        inboxOwnerId: null,
        inboxState: 'NEEDS_REPLY',
        revision: 7,
        hasStateDecision: false,
        lastInboundOrderKey: '2099-01-01T00:00:00.000Z|EMAIL|provisional',
      }),
    ]);

    setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest(undefined);
    await runInitialize();

    const [restoredSnooze] = await triageFor(`creator:${snoozeCreator}`);
    expect(restoredSnooze).toEqual(
      expect.objectContaining({
        inboxOwnerId: ownerNew,
        inboxState: 'SNOOZED',
        revision: 1,
        hasStateDecision: true,
        lastInboundOccurredAt: null,
        lastInboundOrderKey: null,
      }),
    );
    await expect(
      global.testDataSource.query(
        `SELECT "snoozedUntil" > now() AS "isFuture"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
         WHERE "contactIdentityKey"=$1`,
        [`creator:${snoozeCreator}`],
      ),
    ).resolves.toEqual([{ isFuture: true }]);
    expect(new Date(restoredSnooze.stateDecisionAt).toISOString()).not.toBe(
      '2099-01-01T00:00:00.000Z',
    );
    await expect(triageFor(`creator:${expiredSnoozeCreator}`)).resolves.toEqual(
      [
        expect.objectContaining({
          inboxOwnerId: ownerOld,
          inboxState: 'NEEDS_REPLY',
          snoozedUntil: null,
        }),
      ],
    );
    await expect(
      global.testDataSource.query(
        `SELECT "baselineStartedAt" IS NOT NULL AS "baselineCommitted"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" WHERE id=true`,
      ),
    ).resolves.toEqual([{ baselineCommitted: true }]);
  });

  it('snapshots every legacy precedence branch, handles each fence injection, retries, and becomes READY', async () => {
    await global.testDataSource.query(
      `TRUNCATE TABLE
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
    );
    let captureCommitted = false;
    let persistedCaptureReceipt!: {
      persistedMessageId: string;
      orderKey: string;
    };
    setAfterMyahInboxContactTriageCaptureInstalledForTest(async () => {
      if (captureCommitted) return;

      captureCommitted = true;
      persistedCaptureReceipt = await insertPersistedEmailMessageAndReceipt(
        'capture-before-baseline',
      );
    });
    await runInitialize();
    expect(captureCommitted).toBe(true);

    await expect(triageFor(`creator:${mixedCreator}`)).resolves.toEqual([
      expect.objectContaining({
        inboxState: 'NEEDS_REPLY',
        inboxOwnerId: ownerNew,
        snoozedUntil: null,
        revision: 1,
        stateDecisionAt: expect.anything(),
      }),
    ]);
    const [inboundTriage] = await triageFor(`creator:${inboundCreator}`);
    expect(inboundTriage).toEqual(
      expect.objectContaining({
        inboxState: 'NEEDS_REPLY',
        inboxOwnerId: ownerOld,
        snoozedUntil: null,
        revision: 1,
        lastInboundOrderKey: expect.stringContaining(
          '|INSTAGRAM|20202020-0000-4000-8000-000000000113',
        ),
      }),
    );
    expect(
      new Date(inboundTriage.lastInboundOccurredAt ?? '').toISOString(),
    ).toBe('2026-09-15T12:00:00.000Z');
    const [emailDirectionTriage] = await triageFor(
      `creator:${emailDirectionCreator}`,
    );
    expect(emailDirectionTriage).toEqual(
      expect.objectContaining({
        lastInboundOrderKey: expect.stringContaining(
          '|EMAIL|20202020-0000-4000-8000-000000000116',
        ),
      }),
    );
    expect(
      new Date(emailDirectionTriage.lastInboundOccurredAt ?? '').toISOString(),
    ).toBe('2026-09-15T10:00:00.000Z');
    const [emailNullReceivedAtTriage] = await triageFor(
      `creator:${emailNullReceivedAtCreator}`,
    );
    expect(emailNullReceivedAtTriage).toEqual(
      expect.objectContaining({
        lastInboundOrderKey: expect.stringContaining(
          '|EMAIL|20202020-0000-4000-8000-000000000119',
        ),
      }),
    );
    expect(
      new Date(
        emailNullReceivedAtTriage.lastInboundOccurredAt ?? '',
      ).toISOString(),
    ).toBe('2026-09-15T10:30:00.456Z');
    await expect(
      triageFor(`creator:${instagramLatestDirectionCreator}`),
    ).resolves.toEqual([
      expect.objectContaining({ inboxState: 'NEEDS_REPLY' }),
    ]);
    const [snoozeTriage] = await triageFor(`creator:${snoozeCreator}`);
    expect(snoozeTriage).toEqual(
      expect.objectContaining({
        inboxState: 'SNOOZED',
        inboxOwnerId: ownerNew,
      }),
    );
    await expect(
      global.testDataSource.query(
        `SELECT "snoozedUntil" > now() AS "isFuture"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
         WHERE "contactIdentityKey"=$1`,
        [`creator:${snoozeCreator}`],
      ),
    ).resolves.toEqual([{ isFuture: true }]);
    await expect(triageFor(`creator:${tieCreator}`)).resolves.toEqual([
      expect.objectContaining({ inboxState: 'CLOSED', inboxOwnerId: ownerNew }),
    ]);
    await expect(
      triageFor('instagram-conversation:20202020-0000-4000-8000-000000000141'),
    ).resolves.toEqual([
      expect.objectContaining({
        inboxState: 'NEEDS_REPLY',
        inboxOwnerId: null,
      }),
    ]);
    await expect(
      triageFor('instagram-conversation:20202020-0000-4000-8000-000000000142'),
    ).resolves.toEqual([
      expect.objectContaining({
        inboxState: 'WAITING_ON_CREATOR',
        inboxOwnerId: null,
      }),
    ]);
    await expect(
      triageFor('instagram-conversation:20202020-0000-4000-8000-000000000143'),
    ).resolves.toEqual([
      expect.objectContaining({ inboxState: 'CLOSED', inboxOwnerId: null }),
    ]);

    const [beforeRerun] = await triageFor(`creator:${snoozeCreator}`);
    await runInitialize();
    await expect(triageFor(`creator:${snoozeCreator}`)).resolves.toEqual([
      beforeRerun,
    ]);
    await insertReceipt('baseline-before-fence');

    const triageService = new MyahInboxContactTriageService();
    const workspaceDataSource = {
      manager: {
        ...global.testDataSource.manager,
        internalContext: { workspaceId },
      },
      query: (...args: Parameters<typeof global.testDataSource.query>) =>
        global.testDataSource.query(...args),
      transaction: async (
        callback: (manager: {
          internalContext: { workspaceId: string };
        }) => Promise<unknown>,
      ) =>
        global.testDataSource.transaction(async (manager) => {
          Object.assign(manager, { internalContext: { workspaceId } });
          return callback(manager as never);
        }),
    };
    const receiptService = new MyahInboxContactTriageReceiptService(
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => workspaceDataSource,
      } as never,
      undefined,
      triageService,
    );
    let failOnce = true;
    let finalRecheckInjected = false;
    const realDrain = receiptService.drain.bind(receiptService);
    jest.spyOn(receiptService, 'drain').mockImplementation(async (scope) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('forced mid-catch-up failure');
      }
      const drained = await realDrain(scope);
      if (drained === 0 && !finalRecheckInjected) {
        finalRecheckInjected = true;
        await insertReceipt('final-recheck');
      }
      return drained;
    });
    const catchUp = new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      receiptService,
    );
    await expect(catchUp.runOnWorkspace(commandArgs as never)).rejects.toThrow(
      'forced mid-catch-up failure',
    );
    await catchUp.runOnWorkspace(commandArgs as never);

    const [marker] = await global.testDataSource.query(
      `SELECT status FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" WHERE id=true`,
    );
    const [pending] = await global.testDataSource.query(
      `SELECT count(*)::int AS count FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" WHERE status='PENDING'`,
    );
    expect(marker.status).toBe('READY');
    expect(finalRecheckInjected).toBe(true);
    expect(pending.count).toBe(0);
    await expect(
      global.testDataSource.query(
        `SELECT status, "completedAt" FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt"
         WHERE "persistedMessageId"=$1`,
        [persistedCaptureReceipt.persistedMessageId],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'COMPLETE',
        completedAt: expect.anything(),
      }),
    ]);
    await expect(triageFor(`email-thread:${receiptThreadId}`)).resolves.toEqual(
      [
        expect.objectContaining({
          inboxState: 'NEEDS_REPLY',
          lastInboundOrderKey: persistedCaptureReceipt.orderKey,
        }),
      ],
    );

    const readyMarker = await global.testDataSource.query(
      `SELECT status, "baselineFenceSequence", "baselineStartedAt", version, "updatedAt"
       FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"
       WHERE id=true`,
    );
    const readyTuples = await global.testDataSource.query(
      `SELECT "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState",
              "snoozedUntil", revision, "stateDecisionAt", "lastInboundOccurredAt",
              "lastInboundOrderKey", "triageChangedAt"
       FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
       ORDER BY "contactIdentityKey"`,
    );
    await runInitialize();
    const drainAfterReady = jest
      .fn()
      .mockRejectedValue(new Error('must not drain'));
    const retryAfterReady = new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      { drain: drainAfterReady } as never,
    );
    await expect(
      retryAfterReady.runOnWorkspace(commandArgs as never),
    ).resolves.toBeUndefined();
    expect(drainAfterReady).not.toHaveBeenCalled();

    await expect(
      global.testDataSource.query(
        `SELECT status, "baselineFenceSequence", "baselineStartedAt", version, "updatedAt"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"
         WHERE id=true`,
      ),
    ).resolves.toEqual(readyMarker);
    await expect(
      global.testDataSource.query(
        `SELECT "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState",
                "snoozedUntil", revision, "stateDecisionAt", "lastInboundOccurredAt",
                "lastInboundOrderKey", "triageChangedAt"
         FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage"
         ORDER BY "contactIdentityKey"`,
      ),
    ).resolves.toEqual(readyTuples);
  });

  it('makes a receipt producer wait on the final READY fence', async () => {
    await global.testDataSource.query(
      `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"
       SET status='MIGRATING' WHERE id=true`,
    );
    const producerRunner = global.testDataSource.createQueryRunner();
    const receiptService = new MyahInboxContactTriageReceiptService();
    const persistedMessageId = randomUUID();
    let resolveMarkerLockAttempted: () => void;
    const markerLockAttempted = new Promise<void>((resolve) => {
      resolveMarkerLockAttempted = resolve;
    });
    const recordReceiptAfterReadyFence = async () => {
      await producerRunner.connect();
      await producerRunner.startTransaction();
      try {
        await receiptService.recordInTransaction(
          {
            channel: 'EMAIL',
            persistedMessageId,
            sourceRecordId: receiptThreadId,
            sourceGenerationId: 'integration:final-fence',
            mode: 'LIVE',
            direction: 'INBOUND',
            providerOccurredAt: null,
            originalCreatedAt: '2026-09-15T10:00:00.000Z',
            firstPersistence: true,
          },
          {
            internalContext: { workspaceId },
            queryRunner: {
              query: async (sql: string, parameters?: unknown[]) => {
                if (
                  sql.includes('myahInboxTriageMigration') &&
                  (sql.includes('FOR KEY SHARE') || sql.includes('FOR UPDATE'))
                ) {
                  resolveMarkerLockAttempted();
                }
                return producerRunner.query(sql, parameters);
              },
            },
          } as never,
        );
        await producerRunner.commitTransaction();
      } catch (error) {
        await producerRunner.rollbackTransaction();
        throw error;
      } finally {
        await producerRunner.release();
      }
    };
    let producer: Promise<void> | undefined;

    setAfterMyahInboxContactTriageFinalMarkerLockedForTest(async () => {
      producer = recordReceiptAfterReadyFence();
      await markerLockAttempted;
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
    try {
      const catchUp = new CatchUpMyahInboxContactTriageWorkspaceCommand(
        {} as never,
        { drain: jest.fn().mockResolvedValue(0) } as never,
      );
      await catchUp.runOnWorkspace(commandArgs as never);
      await producer;
    } finally {
      setAfterMyahInboxContactTriageFinalMarkerLockedForTest(undefined);
    }

    await expect(
      global.testDataSource.query(
        `SELECT status FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" WHERE id=true`,
      ),
    ).resolves.toEqual([{ status: 'READY' }]);
    await expect(
      global.testDataSource.query(
        `SELECT receipt.status,
                receipt.sequence > marker."baselineFenceSequence" AS "afterFence"
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" receipt
           CROSS JOIN "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" marker
          WHERE receipt."persistedMessageId"=$1`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([{ status: 'PENDING', afterFence: true }]);
  });

  it('serializes an Instagram first-persistence transaction before the baseline without deadlock', async () => {
    await global.testDataSource.query(
      `ALTER TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialMessage"
       ADD CONSTRAINT "myahInboxTriageInstagramMessageConversationFk"
       FOREIGN KEY ("conversationId")
       REFERENCES "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialConversation"(id)`,
    );
    await global.testDataSource.query(
      `TRUNCATE TABLE
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
    );
    await global.testDataSource.query(
      `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" (id, status)
       VALUES (true, 'MIGRATING')`,
    );

    const conversationId = randomUUID();
    const persistedMessageId = randomUUID();
    const occurredAt = '2026-09-15T10:00:00.000Z';
    await insertConversation({
      id: conversationId,
      creatorId: null,
      updatedAt: occurredAt,
    });

    const producerAfterMessageInsert = deferred();
    const producer = global.testDataSource.createQueryRunner();
    await producer.connect();
    await producer.startTransaction();
    try {
      await producer.query("SELECT set_config('search_path', $1, true)", [
        'workspace_1wgvd1ht5ajtgz36va8w3nc3l',
      ]);
      // A MIGRATING producer owns the marker's write lock before its source
      // write, matching the projection's canonical marker/source order.
      await producer.query(
        'SELECT id FROM "myahInboxTriageMigration" WHERE id=true FOR UPDATE',
      );
      await producer.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialMessage" (
          id, "conversationId", direction, "providerCreatedAt", "createdAt"
        ) VALUES ($1, $2, 'INBOUND', $3::timestamptz, $3::timestamptz)`,
        [persistedMessageId, conversationId, occurredAt],
      );
      producerAfterMessageInsert.resolve();

      const baseline = runInitialize();
      await producerAfterMessageInsert.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));

      await producer.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" (
          channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId", mode,
          direction, "providerOccurredAt", "originalCreatedAt", "normalizedOccurredAt", "orderKey", status
        ) VALUES ('INSTAGRAM', $1, $2, 'producer:instagram-baseline-lock-order', 'LIVE', 'INBOUND',
                  $3::timestamptz, $3::timestamptz, $3::timestamptz, $4, 'PENDING')`,
        [
          persistedMessageId,
          conversationId,
          occurredAt,
          `${occurredAt}|INSTAGRAM|${persistedMessageId}`,
        ],
      );
      await producer.commitTransaction();
      await expect(baseline).resolves.toBeUndefined();
    } catch (error) {
      await producer.rollbackTransaction();
      throw error;
    } finally {
      await producer.release();
    }

    await expect(
      global.testDataSource.query(
        `SELECT receipt.status, count(*) OVER ()::int AS count,
                receipt.sequence <= marker."baselineFenceSequence" AS "included"
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" receipt
           CROSS JOIN "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" marker
          WHERE receipt."persistedMessageId"=$1`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([{ status: 'PENDING', count: 1, included: true }]);

    const triageService = new MyahInboxContactTriageService();
    const workspaceDataSource = {
      manager: {
        ...global.testDataSource.manager,
        internalContext: { workspaceId },
      },
      query: (...args: Parameters<typeof global.testDataSource.query>) =>
        global.testDataSource.query(...args),
      transaction: async (
        callback: (manager: {
          internalContext: { workspaceId: string };
        }) => Promise<unknown>,
      ) =>
        global.testDataSource.transaction(async (manager) => {
          Object.assign(manager, { internalContext: { workspaceId } });
          return callback(manager as never);
        }),
    };
    const receiptService = new MyahInboxContactTriageReceiptService(
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => workspaceDataSource,
      } as never,
      undefined,
      triageService,
    );
    await new CatchUpMyahInboxContactTriageWorkspaceCommand(
      {} as never,
      receiptService,
    ).runOnWorkspace(commandArgs as never);

    await expect(
      global.testDataSource.query(
        `SELECT status, count(*) OVER ()::int AS count
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt"
          WHERE "persistedMessageId"=$1`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([{ status: 'COMPLETE', count: 1 }]);
    await expect(
      triageFor(`instagram-conversation:${conversationId}`),
    ).resolves.toEqual([
      expect.objectContaining({
        inboxState: 'NEEDS_REPLY',
        lastInboundOrderKey: `${occurredAt}|INSTAGRAM|${persistedMessageId}`,
      }),
    ]);
  });

  it.each(['producer-first', 'baseline-first'] as const)(
    'uses the actual Instagram producer and canonical marker/source lock order when %s',
    async (order) => {
      await global.testDataSource.query(
        `ALTER TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialConversation"
           ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'UNIPILE',
           ADD COLUMN IF NOT EXISTS "instagramAccountId" uuid,
           ADD COLUMN IF NOT EXISTS "providerConversationId" text`,
      );
      await global.testDataSource.query(
        `ALTER TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialMessage"
           ADD COLUMN IF NOT EXISTS text text,
           ADD COLUMN IF NOT EXISTS "sentVia" text,
           ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'UNIPILE',
           ADD COLUMN IF NOT EXISTS "providerMessageId" text,
           ADD COLUMN IF NOT EXISTS "deliveryState" text,
           ADD COLUMN IF NOT EXISTS "deliveryStateUpdatedAt" timestamptz,
           ADD COLUMN IF NOT EXISTS "hasAttachments" boolean NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS "attachmentCount" integer NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS "createdBySource" text,
           ADD COLUMN IF NOT EXISTS "createdByWorkspaceMemberId" uuid,
           ADD COLUMN IF NOT EXISTS "createdByName" text,
           ADD COLUMN IF NOT EXISTS "createdByContext" jsonb,
           ADD COLUMN IF NOT EXISTS "updatedBySource" text,
           ADD COLUMN IF NOT EXISTS "updatedByWorkspaceMemberId" uuid,
           ADD COLUMN IF NOT EXISTS "updatedByName" text,
           ADD COLUMN IF NOT EXISTS "updatedByContext" jsonb,
           ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now()`,
      );
      await global.testDataSource.query(
        'ALTER TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialMessage" ALTER COLUMN "createdAt" SET DEFAULT now()',
      );
      const schemaRunner = global.testDataSource.createQueryRunner();
      await schemaRunner.connect();
      try {
        await new MyahInboxContactTriageSchemaService().ensureWorkspaceTables(
          schemaRunner,
          workspaceId,
        );
      } finally {
        await schemaRunner.release();
      }
      await global.testDataSource.query(
        `TRUNCATE TABLE
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt",
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage",
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity",
           "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
      );
      await global.testDataSource.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" (id, status)
         VALUES (true, 'MIGRATING')`,
      );

      const conversationId = randomUUID();
      const accountRecordId = randomUUID();
      const occurredAt = '2099-09-15T15:00:00.000Z';
      await global.testDataSource.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."_myahSocialConversation" (
           id, "creatorId", provider, "instagramAccountId", "providerConversationId", "updatedAt", "createdAt"
         ) VALUES ($1, NULL, 'UNIPILE', $2, $3, $4::timestamptz, $4::timestamptz)`,
        [conversationId, accountRecordId, `race:${order}`, occurredAt],
      );

      const sourceLockEntered = deferred();
      const releaseSourceLock = deferred();
      const markerLockAttempted = deferred();
      const triage = new MyahInboxContactTriageService();
      const observeProducerLock = async (statement: string) => {
        if (
          statement.includes('myahInboxTriageMigration') &&
          (statement.includes('FOR KEY SHARE') ||
            statement.includes('FOR UPDATE'))
        ) {
          markerLockAttempted.resolve();
        }
        if (statement.includes("hashtextextended('myah-inbox-source:")) {
          sourceLockEntered.resolve();
          await releaseSourceLock.promise;
        }
      };
      const workspaceDataSource = {
        manager: global.testDataSource.manager,
        query: async (
          statement: string,
          parameters?: unknown[],
          queryRunner?: {
            query: (sql: string, values?: unknown[]) => Promise<unknown>;
          },
        ) => {
          await observeProducerLock(statement);

          return queryRunner
            ? queryRunner.query(statement, parameters)
            : global.testDataSource.query(statement, parameters);
        },
        transaction: async (
          callback: (manager: {
            internalContext?: { workspaceId: string };
          }) => Promise<unknown>,
        ) =>
          global.testDataSource.transaction(async (manager) => {
            const queryRunner = manager.queryRunner;
            const query = queryRunner?.query.bind(queryRunner);
            if (!queryRunner || !query) {
              throw new Error(
                'Instagram race requires a transaction query runner',
              );
            }
            queryRunner.query = async (statement, parameters) => {
              await observeProducerLock(statement);

              return query(statement, parameters);
            };
            try {
              return await callback(
                Object.assign(manager, {
                  internalContext: { workspaceId },
                }),
              );
            } finally {
              queryRunner.query = query;
            }
          }),
      };
      const globalWorkspaceOrmManager = {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => workspaceDataSource,
      };
      const receiptService = new MyahInboxContactTriageReceiptService(
        globalWorkspaceOrmManager as never,
        undefined,
        triage,
      );
      const projection = new UnipileInstagramProjectionService(
        globalWorkspaceOrmManager as never,
        {
          withLock: async (
            _scope: unknown,
            callback: (manager: {
              getRepository: () => { findOne: () => Promise<unknown> };
            }) => Promise<unknown>,
          ) =>
            callback({
              getRepository: () => ({ findOne: async () => binding }),
            }),
        } as never,
        triage,
        receiptService,
      );
      const binding = {
        id: randomUUID(),
        workspaceId,
        workspaceInstagramAccountRecordId: accountRecordId,
        unipileAccountId: `unipile:${order}`,
        instagramUserId: '17841400000000001',
        status: 'ACTIVE' as const,
        deactivatedAt: null,
      };
      const producer = () =>
        projection.upsertVerifiedMessage({
          workspace: { id: workspaceId },
          binding: binding as never,
          chat: {
            chatId: `race:${order}`,
            accountId: binding.unipileAccountId,
            accountType: 'INSTAGRAM',
            type: 'ONE_TO_ONE',
            attendeeProviderId: '17841400000000002',
            name: 'Race creator',
            timestamp: occurredAt,
          },
          conversationRecordId: conversationId,
          message: {
            messageId: randomUUID(),
            accountId: binding.unipileAccountId,
            chatId: `race:${order}`,
            senderId: '17841400000000002',
            text: 'race evidence',
            timestamp: occurredAt,
            hasAttachments: false,
            attachmentCount: 0,
            seen: false,
            delivered: false,
            hidden: false,
            deleted: false,
            isEvent: false,
          } as never,
          sourceGenerationId: `race:${order}`,
          triageMode: 'LIVE',
        });

      const baselineMarkerLocked = deferred();
      const releaseBaseline = deferred();
      if (order === 'producer-first') {
        setAfterMyahInboxContactTriageBaselineMarkerLockedForTest(async () => {
          baselineMarkerLocked.resolve();
        });
        const projected = producer();
        await sourceLockEntered.promise;
        const baseline = runInitialize();
        releaseSourceLock.resolve();
        await projected;
        await baselineMarkerLocked.promise;
        await baseline;
      } else {
        setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest(
          async () => {
            baselineMarkerLocked.resolve();
            await releaseBaseline.promise;
          },
        );
        const baseline = runInitialize();
        await baselineMarkerLocked.promise;
        const projected = producer();
        await markerLockAttempted.promise;
        releaseBaseline.resolve();
        await sourceLockEntered.promise;
        releaseSourceLock.resolve();
        await Promise.all([baseline, projected]);
      }
      setAfterMyahInboxContactTriageBaselineMarkerLockedForTest(undefined);
      setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest(
        undefined,
      );

      await new CatchUpMyahInboxContactTriageWorkspaceCommand(
        {} as never,
        receiptService,
      ).runOnWorkspace(commandArgs as never);

      await expect(
        global.testDataSource.query(
          `SELECT marker.status, receipt.status AS "receiptStatus", tuple."inboxState",
                  tuple."lastInboundOrderKey"
             FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" marker
             JOIN "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" receipt ON true
             JOIN "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage" tuple
               ON tuple."contactIdentityKey"=$1`,
          [`instagram-conversation:${conversationId}`],
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          status: 'READY',
          receiptStatus: 'COMPLETE',
          inboxState: 'NEEDS_REPLY',
        }),
      ]);
    },
  );

  it('initializes, catches up, and reconciles Email-only sources without optional Instagram relations', async () => {
    const emailOnlyWorkspaceId = randomUUID();
    const emailOnlySchema = escapeIdentifier(
      getWorkspaceSchemaName(emailOnlyWorkspaceId),
    );
    const creatorId = randomUUID();
    const threadId = randomUUID();
    const commandArgs = {
      workspaceId: emailOnlyWorkspaceId,
      dataSource: global.testDataSource,
      options: {},
      index: 0,
      total: 1,
    };

    try {
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(`CREATE SCHEMA ${emailOnlySchema}`);
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `CREATE TABLE ${emailOnlySchema}."workspaceMember" (id uuid PRIMARY KEY)`,
      );
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `CREATE TABLE ${emailOnlySchema}."messageThread" (
          id uuid PRIMARY KEY, "creatorId" uuid, "inboxOwnerId" uuid, "inboxState" text NOT NULL,
          "snoozedUntil" timestamptz, "updatedAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL,
          "deletedAt" timestamptz
        )`,
      );
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `CREATE TABLE ${emailOnlySchema}."message" (
          id uuid PRIMARY KEY, "messageThreadId" uuid NOT NULL, "receivedAt" timestamptz,
          "createdAt" timestamptz NOT NULL, "deletedAt" timestamptz
        )`,
      );
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `CREATE TABLE ${emailOnlySchema}."messageChannelMessageAssociation" (
          id uuid PRIMARY KEY, "messageId" uuid NOT NULL, "messageChannelId" uuid,
          direction text NOT NULL, "deletedAt" timestamptz
        )`,
      );
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `INSERT INTO ${emailOnlySchema}."messageThread" (
          id, "creatorId", "inboxState", "updatedAt", "createdAt"
        ) VALUES ($1, $2, 'CLOSED', now(), now())`,
        [threadId, creatorId],
      );

      const initialize = new InitializeMyahInboxContactTriageWorkspaceCommand(
        {} as never,
        new MyahInboxContactTriageSchemaService(),
      );
      await initialize.runOnWorkspace(commandArgs as never);
      await initialize.runOnWorkspace(commandArgs as never);
      const catchUp = new CatchUpMyahInboxContactTriageWorkspaceCommand(
        {} as never,
        { drain: jest.fn().mockResolvedValue(0) } as never,
      );
      await catchUp.runOnWorkspace(commandArgs as never);

      const lifecycle = new MyahInboxContactTriageLifecycleService(
        new MyahInboxContactTriageService(),
      );
      await global.testDataSource.transaction(async (manager) => {
        Object.assign(manager, {
          internalContext: { workspaceId: emailOnlyWorkspaceId },
        });
        await lifecycle.withPreparedCreatorMutationInTransaction({
          workspaceId: emailOnlyWorkspaceId,
          creatorIds: [creatorId],
          manager: manager as never,
          mutate: async () => {
            // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await manager.query(
              `UPDATE ${emailOnlySchema}."messageThread" SET "updatedAt"=now() WHERE id=$1`,
              [threadId],
            );
          },
        });
      });
      await global.testDataSource.transaction(async (manager) => {
        Object.assign(manager, {
          internalContext: { workspaceId: emailOnlyWorkspaceId },
        });
        await lifecycle.withPreparedSourceMutationInTransaction({
          workspaceId: emailOnlyWorkspaceId,
          sourceType: 'EMAIL_THREAD',
          sourceRecordIds: [threadId],
          manager: manager as never,
          mutate: async () => {
            // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await manager.query(
              `UPDATE ${emailOnlySchema}."messageThread" SET "creatorId"=NULL WHERE id=$1`,
              [threadId],
            );
          },
        });
      });

      await expect(
        // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        global.testDataSource.query(
          `SELECT status FROM ${emailOnlySchema}."myahInboxTriageMigration" WHERE id=true`,
        ),
      ).resolves.toEqual([{ status: 'READY' }]);
      await expect(
        // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        global.testDataSource.query(
          `SELECT "creatorId" FROM ${emailOnlySchema}."messageThread" WHERE id=$1`,
          [threadId],
        ),
      ).resolves.toEqual([{ creatorId: null }]);
    } finally {
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await global.testDataSource.query(
        `DROP SCHEMA IF EXISTS ${emailOnlySchema} CASCADE`,
      );
    }
  });

  it('serializes an existing-thread Email persistence transaction before the baseline without deadlock', async () => {
    await global.testDataSource.query(
      `TRUNCATE TABLE
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactTriage",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxContactIdentity",
         "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
    );
    await global.testDataSource.query(
      `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" (id, status)
       VALUES (true, 'MIGRATING')`,
    );

    const persistedMessageId = randomUUID();
    const producerAfterThreadUpsert = deferred();
    const producer = global.testDataSource.createQueryRunner();
    await producer.connect();
    await producer.startTransaction();
    try {
      await producer.query("SELECT set_config('search_path', $1, true)", [
        'workspace_1wgvd1ht5ajtgz36va8w3nc3l',
      ]);
      await producer.query(
        'SELECT id FROM "myahInboxTriageMigration" WHERE id=true FOR UPDATE',
      );
      await producer.query(
        `UPDATE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."messageThread"
         SET "updatedAt"=now() WHERE id=$1`,
        [receiptThreadId],
      );
      producerAfterThreadUpsert.resolve();

      const baseline = (async () => runInitialize())();
      await producerAfterThreadUpsert.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));

      await producer.query(
        `INSERT INTO "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt" (
          channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId", mode,
          direction, "providerOccurredAt", "originalCreatedAt", "normalizedOccurredAt", "orderKey", status
        ) VALUES ('EMAIL', $1, $2, 'producer:baseline-lock-order', 'LIVE', 'INBOUND',
                  now(), now(), now(), $3, 'PENDING')`,
        [
          persistedMessageId,
          receiptThreadId,
          `2026-09-15T10:00:00.000Z|EMAIL|${persistedMessageId}`,
        ],
      );
      await producer.commitTransaction();
      await expect(baseline).resolves.toBeUndefined();
    } catch (error) {
      await producer.rollbackTransaction();
      throw error;
    } finally {
      await producer.release();
    }

    await expect(
      global.testDataSource.query(
        `SELECT count(*)::int AS count, min(sequence) <= marker."baselineFenceSequence" AS "included"
           FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageTransitionReceipt"
           CROSS JOIN "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration" marker
          WHERE "persistedMessageId"=$1
          GROUP BY marker."baselineFenceSequence"`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([{ count: 1, included: true }]);
  });
});
