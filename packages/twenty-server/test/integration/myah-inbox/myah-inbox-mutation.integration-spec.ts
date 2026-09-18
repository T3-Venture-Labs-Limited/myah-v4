import { setTimeout as sleep } from 'node:timers/promises';

import gql from 'graphql-tag';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

const schemaName = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);

const inboxThreadQuery = gql`
  query Task4InboxThread {
    myahInboxThreads(first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const updateThreadMutation = gql`
  mutation Task4UpdateThread($input: UpdateMyahInboxThreadInput!) {
    updateMyahInboxThread(input: $input) {
      id
      state
      snoozedUntil
      creator {
        id
      }
      campaign {
        id
      }
      inboxOwner {
        id
      }
    }
  }
`;

const saveDraftMutation = gql`
  mutation Task4SaveDraft($input: SaveMyahInboxDraftInput!) {
    saveMyahInboxDraft(input: $input) {
      status
      revision
      body {
        markdown
        blocknote
      }
    }
  }
`;

type ThreadSnapshot = {
  id: string;
  creatorId: string | null;
  myahCampaignId: string | null;
  inboxOwnerId: string | null;
  inboxState: string;
  snoozedUntil: Date | null;
};

const creatorId = '21200000-0000-4000-8000-000000000001';
const campaignId = '21200000-0000-4000-8000-000000000002';

// A reply drafted on this thread before it is linked to any Creator: the
// contact anchor is the thread itself, in the General (no-Campaign) context.
const draftTarget = (threadId: string) => ({
  expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
  target: {
    channel: 'EMAIL',
    contactId: encodeMyahInboxContactId({
      workspaceId: SEED_APPLE_WORKSPACE_ID,
      identity: { kind: 'email-thread', recordId: threadId },
    }),
    threadId,
  },
  replyContext: { kind: 'GENERAL' },
});

describe('Myah Inbox mutations (PostgreSQL)', () => {
  let threadId: string;
  let originalThread: ThreadSnapshot;

  beforeAll(async () => {
    const inboxResponse = await makeGraphqlAPIRequest({
      query: inboxThreadQuery,
    });

    expect(inboxResponse.status).toBe(200);
    expect(inboxResponse.body.errors).toBeUndefined();
    threadId = inboxResponse.body.data.myahInboxThreads.edges[0]?.node.id;
    expect(threadId).toBeDefined();

    const [thread] = (await global.testDataSource.query(
      `SELECT "id", "creatorId", "myahCampaignId", "inboxOwnerId",
              "inboxState", "snoozedUntil"
         FROM "${schemaName}"."messageThread"
        WHERE "id" = $1`,
      [threadId],
    )) as ThreadSnapshot[];
    await global.testDataSource.query(
      `INSERT INTO "${schemaName}"."creator" ("id", "name")
       VALUES ($1, 'MYAH-212 integration Creator')
       ON CONFLICT ("id") DO UPDATE SET "deletedAt" = NULL`,
      [creatorId],
    );
    await global.testDataSource.query(
      `INSERT INTO "${schemaName}"."campaign" ("id", "name")
       VALUES ($1, 'MYAH-212 integration Campaign')
       ON CONFLICT ("id") DO UPDATE SET "deletedAt" = NULL`,
      [campaignId],
    );

    expect(thread).toBeDefined();
    originalThread = thread;
  });

  beforeEach(async () => {
    await global.testDataSource.query(
      `UPDATE "${schemaName}"."messageThread"
          SET "creatorId" = NULL,
              "myahCampaignId" = NULL,
              "inboxOwnerId" = $2,
              "inboxState" = 'NEEDS_REPLY',
              "snoozedUntil" = NULL
        WHERE "id" = $1`,
      [threadId, WORKSPACE_MEMBER_DATA_SEED_IDS.JANE],
    );
    await global.testDataSource.query(
      `DELETE FROM core."myahInboxReplyContextDraft"
        WHERE "workspaceId" = $1 AND "contactAnchorKind" = 'EMAIL_THREAD'
          AND "contactAnchorId" = $2 AND "channel" = 'EMAIL'
          AND "deliveryTargetId" = $2 AND "contextKind" = 'GENERAL'`,
      [SEED_APPLE_WORKSPACE_ID, threadId],
    );
  });

  afterAll(async () => {
    await global.testDataSource.query(
      `UPDATE "${schemaName}"."messageThread"
          SET "creatorId" = $2,
              "myahCampaignId" = $3,
              "inboxOwnerId" = $4,
              "inboxState" = $5,
              "snoozedUntil" = $6
        WHERE "id" = $1`,
      [
        threadId,
        originalThread.creatorId,
        originalThread.myahCampaignId,
        originalThread.inboxOwnerId,
        originalThread.inboxState,
        originalThread.snoozedUntil,
      ],
    );
    await global.testDataSource.query(
      `DELETE FROM core."myahInboxReplyContextDraft"
        WHERE "workspaceId" = $1 AND "contactAnchorKind" = 'EMAIL_THREAD'
          AND "contactAnchorId" = $2 AND "channel" = 'EMAIL'
          AND "deliveryTargetId" = $2 AND "contextKind" = 'GENERAL'`,
      [SEED_APPLE_WORKSPACE_ID, threadId],
    );
    await global.testDataSource.query(
      `DELETE FROM "${schemaName}"."creator" WHERE "id" = $1`,
      [creatorId],
    );
    await global.testDataSource.query(
      `DELETE FROM "${schemaName}"."campaign" WHERE "id" = $1`,
      [campaignId],
    );
  });

  it('persists CAS saves for readable workspace members despite triage owner changes', async () => {
    const saved = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          ...draftTarget(threadId),
          expectedRevision: 0,
          body: { markdown: 'Jane current copy', blocknote: null },
        },
      },
    });

    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: 1,
      body: { markdown: 'Jane current copy', blocknote: null },
    });

    const stale = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          ...draftTarget(threadId),
          expectedRevision: 0,
          body: { markdown: 'Jane stale copy', blocknote: null },
        },
      },
    });

    expect(stale.body.errors).toBeUndefined();
    expect(stale.body.data.saveMyahInboxDraft).toEqual({
      status: 'CONFLICT',
      revision: 1,
      body: { markdown: 'Jane current copy', blocknote: null },
    });

    const reassigned = await makeGraphqlAPIRequest({
      query: updateThreadMutation,
      variables: {
        input: {
          threadId,
          inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
        },
      },
    });

    expect(reassigned.body.errors).toBeUndefined();
    expect(reassigned.body.data.updateMyahInboxThread.inboxOwner.id).toBe(
      WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    );

    const reassignedMemberWrite = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          ...draftTarget(threadId),
          expectedRevision: 1,
          body: {
            markdown: 'Jane can still edit after reassignment',
            blocknote: null,
          },
        },
      },
    });

    expect(reassignedMemberWrite.body.errors).toBeUndefined();
    expect(reassignedMemberWrite.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: 2,
      body: {
        markdown: 'Jane can still edit after reassignment',
        blocknote: null,
      },
    });

    const newOwnerWrite = await makeGraphqlAPIRequest(
      {
        query: saveDraftMutation,
        variables: {
          input: {
            ...draftTarget(threadId),
            expectedRevision: 2,
            body: { markdown: 'Jony current copy', blocknote: null },
          },
        },
      },
      APPLE_JONY_MEMBER_ACCESS_TOKEN,
    );

    expect(newOwnerWrite.body.errors).toBeUndefined();
    expect(newOwnerWrite.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'Jony current copy', blocknote: null },
    });

    const clearedOwner = await makeGraphqlAPIRequest(
      {
        query: updateThreadMutation,
        variables: { input: { threadId, inboxOwnerId: null } },
      },
      APPLE_JONY_MEMBER_ACCESS_TOKEN,
    );

    expect(clearedOwner.body.errors).toBeUndefined();
    expect(clearedOwner.body.data.updateMyahInboxThread.inboxOwner).toBeNull();

    const [persisted] = (await global.testDataSource.query(
      `SELECT "bodyMarkdown", "bodyBlocknote", "revision"
         FROM core."myahInboxReplyContextDraft"
        WHERE "workspaceId" = $1 AND "contactAnchorKind" = 'EMAIL_THREAD'
          AND "contactAnchorId" = $2 AND "channel" = 'EMAIL'
          AND "deliveryTargetId" = $2 AND "contextKind" = 'GENERAL'`,
      [SEED_APPLE_WORKSPACE_ID, threadId],
    )) as Array<{
      bodyMarkdown: string;
      bodyBlocknote: string | null;
      revision: number;
    }>;

    expect(persisted).toEqual({
      bodyMarkdown: 'Jony current copy',
      bodyBlocknote: null,
      revision: 3,
    });
  });
  it('returns the first saved draft to a stale second authenticated workspace member', async () => {
    const janeSave = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          ...draftTarget(threadId),
          expectedRevision: 0,
          body: { markdown: 'Jane background save', blocknote: null },
        },
      },
    });

    const jonyStaleSave = await makeGraphqlAPIRequest(
      {
        query: saveDraftMutation,
        variables: {
          input: {
            ...draftTarget(threadId),
            expectedRevision: 0,
            body: { markdown: 'Jony stale save', blocknote: null },
          },
        },
      },
      APPLE_JONY_MEMBER_ACCESS_TOKEN,
    );

    expect(janeSave.body.errors).toBeUndefined();
    expect(janeSave.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: 1,
      body: { markdown: 'Jane background save', blocknote: null },
    });
    expect(jonyStaleSave.body.errors).toBeUndefined();
    expect(jonyStaleSave.body.data.saveMyahInboxDraft).toEqual({
      status: 'CONFLICT',
      revision: 1,
      body: { markdown: 'Jane background save', blocknote: null },
    });

    const [persisted] = (await global.testDataSource.query(
      `SELECT "bodyMarkdown", "bodyBlocknote", "revision"
         FROM core."myahInboxReplyContextDraft"
        WHERE "workspaceId" = $1 AND "contactAnchorKind" = 'EMAIL_THREAD'
          AND "contactAnchorId" = $2 AND "channel" = 'EMAIL'
          AND "deliveryTargetId" = $2 AND "contextKind" = 'GENERAL'`,
      [SEED_APPLE_WORKSPACE_ID, threadId],
    )) as Array<{
      bodyMarkdown: string;
      bodyBlocknote: string | null;
      revision: number;
    }>;

    expect(persisted).toEqual({
      bodyMarkdown: 'Jane background save',
      bodyBlocknote: null,
      revision: 1,
    });
  });

  it('serializes relation-only triage with a concurrent SNOOZED transition', async () => {
    const queryRunner = global.testDataSource.createQueryRunner();
    const future = '2099-01-01T00:00:00.000Z';

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [{ blockerPid }] = (await queryRunner.query(
        'SELECT pg_backend_pid() AS "blockerPid"',
      )) as Array<{ blockerPid: number }>;

      await queryRunner.query(
        `SELECT "id" FROM "${schemaName}"."messageThread"
          WHERE "id" = $1 FOR UPDATE`,
        [threadId],
      );

      const mutationPromise = makeGraphqlAPIRequest({
        query: updateThreadMutation,
        variables: { input: { threadId, creatorId } },
      }).then((response) => response);

      let mutationIsBlocked = false;

      for (let attempt = 0; attempt < 100; attempt++) {
        const [{ blocked }] = (await global.testDataSource.query(
          `SELECT EXISTS (
             SELECT 1
               FROM pg_stat_activity
              WHERE $1 = ANY(pg_blocking_pids(pid))
           ) AS "blocked"`,
          [blockerPid],
        )) as Array<{ blocked: boolean }>;

        if (blocked) {
          mutationIsBlocked = true;
          break;
        }

        await sleep(20);
      }

      expect(mutationIsBlocked).toBe(true);

      await queryRunner.query(
        `UPDATE "${schemaName}"."messageThread"
            SET "inboxState" = 'SNOOZED', "snoozedUntil" = $2
          WHERE "id" = $1`,
        [threadId, future],
      );
      await queryRunner.commitTransaction();

      const response = await mutationPromise;

      expect(response.body.errors).toBeUndefined();

      const [persisted] = (await global.testDataSource.query(
        `SELECT "creatorId", "inboxState", "snoozedUntil"
           FROM "${schemaName}"."messageThread" WHERE "id" = $1`,
        [threadId],
      )) as Array<{
        creatorId: string | null;
        inboxState: string;
        snoozedUntil: Date | null;
      }>;

      expect(persisted).toMatchObject({
        creatorId,
        inboxState: 'SNOOZED',
      });
      expect(persisted.snoozedUntil?.toISOString()).toBe(future);
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      await queryRunner.release();
    }
  });

  it('links and clears Creator and Campaign independently in the real workspace schema', async () => {
    const linkedCreator = await makeGraphqlAPIRequest({
      query: updateThreadMutation,
      variables: { input: { threadId, creatorId } },
    });

    expect(linkedCreator.body.errors).toBeUndefined();
    expect(linkedCreator.body.data.updateMyahInboxThread.creator.id).toBe(
      creatorId,
    );
    expect(linkedCreator.body.data.updateMyahInboxThread.campaign).toBeNull();

    const linkedCampaign = await makeGraphqlAPIRequest({
      query: updateThreadMutation,
      variables: { input: { threadId, campaignId } },
    });

    expect(linkedCampaign.body.errors).toBeUndefined();
    expect(linkedCampaign.body.data.updateMyahInboxThread.creator.id).toBe(
      creatorId,
    );
    expect(linkedCampaign.body.data.updateMyahInboxThread.campaign.id).toBe(
      campaignId,
    );

    const clearedCampaign = await makeGraphqlAPIRequest({
      query: updateThreadMutation,
      variables: { input: { threadId, campaignId: null } },
    });

    expect(clearedCampaign.body.errors).toBeUndefined();
    expect(clearedCampaign.body.data.updateMyahInboxThread.creator.id).toBe(
      creatorId,
    );
    expect(clearedCampaign.body.data.updateMyahInboxThread.campaign).toBeNull();

    const clearedCreator = await makeGraphqlAPIRequest({
      query: updateThreadMutation,
      variables: { input: { threadId, creatorId: null } },
    });

    expect(clearedCreator.body.errors).toBeUndefined();
    expect(clearedCreator.body.data.updateMyahInboxThread.creator).toBeNull();
  });
});
