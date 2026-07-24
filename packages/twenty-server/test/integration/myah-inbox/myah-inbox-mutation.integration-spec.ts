import { setTimeout as sleep } from 'node:timers/promises';

import gql from 'graphql-tag';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

const schemaName = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
const baselineDraft = { markdown: 'Task 4 baseline', blocknote: null };

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
  myahReplyDraftBodyMarkdown: string | null;
  myahReplyDraftBodyBlocknote: string | null;
  myahReplyDraftRevision: number;
};

const creatorId = '21200000-0000-4000-8000-000000000001';
const campaignId = '21200000-0000-4000-8000-000000000002';

describe('Myah Inbox mutations (PostgreSQL)', () => {
  let threadId: string;
  let originalThread: ThreadSnapshot;

  beforeAll(async () => {
    const inboxResponse = await makeGraphqlAPIRequest({ query: inboxThreadQuery });

    expect(inboxResponse.status).toBe(200);
    expect(inboxResponse.body.errors).toBeUndefined();
    threadId = inboxResponse.body.data.myahInboxThreads.edges[0]?.node.id;
    expect(threadId).toBeDefined();

    const [thread] = (await global.testDataSource.query(
      `SELECT "id", "creatorId", "myahCampaignId", "inboxOwnerId",
              "inboxState", "snoozedUntil", "myahReplyDraftBodyMarkdown",
              "myahReplyDraftBodyBlocknote", "myahReplyDraftRevision"
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
              "snoozedUntil" = NULL,
              "myahReplyDraftBodyMarkdown" = $3,
              "myahReplyDraftBodyBlocknote" = $4,
              "myahReplyDraftRevision" = 2
        WHERE "id" = $1`,
      [threadId, WORKSPACE_MEMBER_DATA_SEED_IDS.JANE, baselineDraft.markdown, baselineDraft.blocknote],
    );
  });

  afterAll(async () => {
    await global.testDataSource.query(
      `UPDATE "${schemaName}"."messageThread"
          SET "creatorId" = $2,
              "myahCampaignId" = $3,
              "inboxOwnerId" = $4,
              "inboxState" = $5,
              "snoozedUntil" = $6,
              "myahReplyDraftBodyMarkdown" = $7,
              "myahReplyDraftBodyBlocknote" = $8,
              "myahReplyDraftRevision" = $9
        WHERE "id" = $1`,
      [
        threadId,
        originalThread.creatorId,
        originalThread.myahCampaignId,
        originalThread.inboxOwnerId,
        originalThread.inboxState,
        originalThread.snoozedUntil,
        originalThread.myahReplyDraftBodyMarkdown,
        originalThread.myahReplyDraftBodyBlocknote,
        originalThread.myahReplyDraftRevision,
      ],
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

  it('persists one CAS save, returns the current row on stale save, and transfers then removes owner authority without changing the draft', async () => {
    const saved = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          threadId,
          expectedRevision: 2,
          body: { markdown: 'Jane current copy', blocknote: null },
        },
      },
    });

    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'Jane current copy', blocknote: null },
    });

    const stale = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          threadId,
          expectedRevision: 2,
          body: { markdown: 'Jane stale copy', blocknote: null },
        },
      },
    });

    expect(stale.body.errors).toBeUndefined();
    expect(stale.body.data.saveMyahInboxDraft).toEqual({
      status: 'CONFLICT',
      revision: 3,
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

    const oldOwnerWrite = await makeGraphqlAPIRequest({
      query: saveDraftMutation,
      variables: {
        input: {
          threadId,
          expectedRevision: 3,
          body: { markdown: 'Jane no longer owns this', blocknote: null },
        },
      },
    });

    expect(oldOwnerWrite.body.errors).toBeDefined();

    const newOwnerWrite = await makeGraphqlAPIRequest(
      {
        query: saveDraftMutation,
        variables: {
          input: {
            threadId,
            expectedRevision: 3,
            body: { markdown: 'Jony current copy', blocknote: null },
          },
        },
      },
      APPLE_JONY_MEMBER_ACCESS_TOKEN,
    );

    expect(newOwnerWrite.body.errors).toBeUndefined();
    expect(newOwnerWrite.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: 4,
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
      `SELECT "inboxOwnerId", "myahReplyDraftBodyMarkdown",
              "myahReplyDraftBodyBlocknote", "myahReplyDraftRevision"
         FROM "${schemaName}"."messageThread" WHERE "id" = $1`,
      [threadId],
    )) as Array<{
      inboxOwnerId: string | null;
      myahReplyDraftBodyMarkdown: string;
      myahReplyDraftBodyBlocknote: string | null;
      myahReplyDraftRevision: number;
    }>;

    expect(persisted).toEqual({
      inboxOwnerId: null,
      myahReplyDraftBodyMarkdown: 'Jony current copy',
      myahReplyDraftBodyBlocknote: null,
      myahReplyDraftRevision: 4,
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
