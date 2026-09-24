import { randomUUID } from 'node:crypto';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import gql from 'graphql-tag';

import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

import {
  cleanupCampaignFixture,
  createCampaignFixtureIds,
  seedCampaignFixture,
} from 'test/integration/campaign-execution/utils/campaign-reply-evidence-fixture.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { installMyahInboxInstagramMetadataBridge } from 'test/integration/myah-inbox/utils/install-myah-inbox-instagram-metadata-bridge.util';
import {
  cleanupMyahInboxTask7Fixture,
  getDomainService,
  seedMyahInboxTask7Fixture,
  type MyahInboxTask7Fixture,
} from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const contactsQuery = gql`
  query ContactProjection($first: Int, $after: String, $search: String) {
    myahInboxContacts(first: $first, after: $after, search: $search) {
      edges {
        cursor
        node {
          id
          identityKind
          displayName
          lastActivityAt
          latestChannel
          initialSelection {
            channel
            emailThreadId
            instagramConversationId
          }
          preview
          needsAttention
          creator {
            id
            name
          }
          email {
            isAvailable
            threadCount
            threadIds
            latestThreadId
            needsAttention
          }
          instagram {
            isAvailable
            needsAttention
            conversations {
              id
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const contactDetailQuery = gql`
  query ContactDetail($contactId: String!) {
    myahInboxContact(contactId: $contactId) {
      id
      identityKind
      creator {
        id
      }
    }
  }
`;

const emailMessagesQuery = gql`
  query ContactEmailMessages($contactId: String!, $first: Int, $after: String) {
    myahInboxContactEmailMessages(
      contactId: $contactId
      first: $first
      after: $after
    ) {
      edges {
        cursor
        node {
          id
          messageThreadId
          subject
          text
          receivedAt
          direction
          visibility
          participants {
            role
            handle
            displayName
          }
          attachmentFileIds
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const emailCardsQuery = gql`
  query ProjectionEmailCards($contactId: String!, $expectedWorkspaceId: UUID!) {
    myahInboxContactEmailCards(
      contactId: $contactId
      expectedWorkspaceId: $expectedWorkspaceId
    ) {
      snapshot
      cards {
        threadId
        anchorKey
        rootMessageId
        historyBasis
      }
    }
  }
`;

const emailCardMessagesQuery = gql`
  query ProjectionEmailCardMessages(
    $contactId: String!
    $expectedWorkspaceId: UUID!
    $threadId: UUID!
    $anchorKey: String
    $snapshot: String!
  ) {
    myahInboxContactEmailCardMessages(
      contactId: $contactId
      expectedWorkspaceId: $expectedWorkspaceId
      threadId: $threadId
      anchorKey: $anchorKey
      snapshot: $snapshot
    ) {
      anchorKey
      root {
        id
      }
      messages {
        id
      }
    }
  }
`;

const linkContactMutation = gql`
  mutation LinkContact($input: LinkMyahInboxContactCreatorInput!) {
    linkMyahInboxContactCreator(input: $input)
  }
`;

type ContactNode = {
  id: string;
  identityKind: string;
  lastActivityAt: string;
  latestChannel: 'EMAIL' | 'INSTAGRAM';
  initialSelection: {
    channel: 'EMAIL' | 'INSTAGRAM';
    emailThreadId: string | null;
    instagramConversationId: string | null;
  };
  creator: { id: string; name: string | null } | null;
  email: {
    threadCount: number;
    threadIds: string[];
  };
};

type ContactConnection = {
  edges: Array<{ cursor: string; node: ContactNode }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type EmailMessageNode = {
  id: string;
  messageThreadId: string;
  subject: string | null;
  text: string | null;
  receivedAt: string;
  visibility: string;
};

type EmailConnection = {
  edges: Array<{ cursor: string; node: EmailMessageNode }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const fetchContacts = async (
  token: string,
  variables: Record<string, unknown>,
): Promise<ContactConnection> => {
  const response = await makeGraphqlAPIRequest(
    { query: contactsQuery, variables },
    token,
  );

  expect(response.status).toBe(200);
  expect(response.body.errors).toBeUndefined();

  return response.body.data.myahInboxContacts;
};

const fetchEmailMessages = async (
  token: string,
  variables: Record<string, unknown>,
): Promise<EmailConnection> => {
  const response = await makeGraphqlAPIRequest(
    { query: emailMessagesQuery, variables },
    token,
  );

  expect(response.status).toBe(200);
  expect(response.body.errors).toBeUndefined();

  return response.body.data.myahInboxContactEmailMessages;
};

describe('Myah Inbox contact-first projection (PostgreSQL)', () => {
  let fixture: MyahInboxTask7Fixture;
  let token: string;
  let seededEvidenceIds: string[] = [];

  beforeAll(async () => {
    token = APPLE_JANE_ADMIN_ACCESS_TOKEN;
    await installMyahInboxInstagramMetadataBridge();
    fixture = await seedMyahInboxTask7Fixture({ operatorAccessToken: token });
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    // Give the legacy projection fixture explicit qualifying response proof.
    // These are isolated test rows, not assertions about a real Campaign send.
    // pi-lens-ignore: sql-injection
    const seeded = await global.testDataSource.query<
      Array<{ inboundMessageId: string }>
    >(
      `INSERT INTO core."myahCampaignReplyEvidence"
         ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification")
       SELECT $1, message.id, association."messageChannelId", $2, $3, 'THREAD'
       FROM "${schema}".message message
       JOIN "${schema}"."messageChannelMessageAssociation" association
         ON association."messageId"=message.id
       WHERE message."messageThreadId"=ANY($4::uuid[]) AND message."isDraft"=false
         AND association."deletedAt" IS NULL AND association.direction='INCOMING'
       ON CONFLICT ("workspaceId","inboundMessageId") DO NOTHING
       RETURNING "inboundMessageId"`,
      [
        SEED_APPLE_WORKSPACE_ID,
        randomUUID(),
        randomUUID(),
        Object.values(fixture.threadIds),
      ],
    );
    seededEvidenceIds = seeded.map((row) => row.inboundMessageId);
  });

  afterAll(async () => {
    await global.testDataSource.query(
      `DELETE FROM core."myahCampaignReplyEvidence"
       WHERE "workspaceId"=$1 AND "inboundMessageId"=ANY($2::uuid[])`,
      [SEED_APPLE_WORKSPACE_ID, seededEvidenceIds],
    );
    await cleanupMyahInboxTask7Fixture({ operatorAccessToken: token });
  });

  it('keeps pending-only Email out of default contacts until resolved evidence commits, preserving exact history', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    // pi-lens-ignore: sql-injection
    const [source] = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "${schema}".message WHERE "messageThreadId"=$1 LIMIT 1`,
      [fixture.threadIds.tiedUnlinked],
    );
    expect(source).toBeDefined();
    const initial = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });
    const exactId = initial.edges.find(
      ({ node }) => node.identityKind === 'EMAIL_THREAD',
    )?.node.id;
    expect(exactId).toBeDefined();
    const [evidence] = await global.testDataSource.query<
      Array<{
        campaignId: string;
        enrollmentId: string;
        messageChannelId: string;
        createdAt: Date;
      }>
    >(
      `SELECT "campaignId","enrollmentId","messageChannelId","createdAt"
       FROM core."myahCampaignReplyEvidence"
       WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
      [SEED_APPLE_WORKSPACE_ID, source.id],
    );
    expect(evidence).toBeDefined();
    await global.testDataSource.query(
      `DELETE FROM core."myahCampaignReplyEvidence"
       WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
      [SEED_APPLE_WORKSPACE_ID, source.id],
    );
    try {
      await global.testDataSource.query(
        `INSERT INTO core."myahCampaignReplyPending"
          ("workspaceId","messageId","messageThreadId","messageChannelId","threadExternalId","normalizedSender")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          SEED_APPLE_WORKSPACE_ID,
          source.id,
          fixture.threadIds.tiedUnlinked,
          evidence.messageChannelId,
          'projection-fixture-pending',
          'pending@example.test',
        ],
      );
      const filtered = await fetchContacts(token, {
        first: 20,
        search: fixture.markers.tied,
      });
      expect(
        filtered.edges.some(({ node }) => node.identityKind === 'EMAIL_THREAD'),
      ).toBe(false);
      const detail = await makeGraphqlAPIRequest(
        { query: contactDetailQuery, variables: { contactId: exactId } },
        token,
      );
      expect(detail.body.errors).toBeUndefined();
      expect(detail.body.data.myahInboxContact).toMatchObject({
        id: exactId,
        identityKind: 'EMAIL_THREAD',
      });
      await global.testDataSource.transaction(async (manager) => {
        await manager.query(
          `DELETE FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2`,
          [SEED_APPLE_WORKSPACE_ID, source.id],
        );
        await manager.query(
          `INSERT INTO core."myahCampaignReplyEvidence"
            ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification","createdAt")
           VALUES ($1,$2,$3,$4,$5,'THREAD',$6)`,
          [
            SEED_APPLE_WORKSPACE_ID,
            source.id,
            evidence.messageChannelId,
            evidence.campaignId,
            evidence.enrollmentId,
            evidence.createdAt,
          ],
        );
      });
      const resolved = await fetchContacts(token, {
        first: 20,
        search: fixture.markers.tied,
      });
      expect(resolved.edges.some(({ node }) => node.id === exactId)).toBe(true);
    } finally {
      await global.testDataSource.query(
        `DELETE FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, source.id],
      );
      await global.testDataSource.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
          ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification","createdAt")
         VALUES ($1,$2,$3,$4,$5,'THREAD',$6) ON CONFLICT ("workspaceId","inboundMessageId") DO NOTHING`,
        [
          SEED_APPLE_WORKSPACE_ID,
          source.id,
          evidence.messageChannelId,
          evidence.campaignId,
          evidence.enrollmentId,
          evidence.createdAt,
        ],
      );
    }
  });

  it('promotes a recorded THREAD reply into its proven accepted-send group and resolves the PENDING root in place', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    const ids = createCampaignFixtureIds();
    const threadId = fixture.threadIds.tiedLinked;
    const firstReplyId = '21270000-2001-4000-8000-000000000001';
    const [secondReplyId, sendId] = [randomUUID(), randomUUID()];
    const insertedMessageIds = [secondReplyId, sendId];
    const contactVariables = {
      contactId: encodeMyahInboxContactId({
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        identity: { kind: 'creator', recordId: fixture.creatorId },
      }),
      expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
    };
    const readCards = async () => {
      const response = await makeGraphqlAPIRequest(
        { query: emailCardsQuery, variables: contactVariables },
        token,
      );
      expect(response.body.errors).toBeUndefined();

      return response.body.data.myahInboxContactEmailCards as {
        snapshot: string;
        cards: Array<{
          threadId: string;
          anchorKey: string;
          rootMessageId: string;
          historyBasis: string;
        }>;
      };
    };
    const readMessages = (anchorKey: string, snapshot: string) =>
      makeGraphqlAPIRequest(
        {
          query: emailCardMessagesQuery,
          variables: { ...contactVariables, threadId, anchorKey, snapshot },
        },
        token,
      );
    const [original] = await global.testDataSource.query<
      Array<Record<string, unknown>>
    >(
      `SELECT * FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
      [SEED_APPLE_WORKSPACE_ID, firstReplyId],
    );
    const runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      const [channel] = await runner.query(
        `SELECT "connectedAccountId" FROM core."messageChannel" WHERE id=$1`,
        ['21270000-5001-4000-8000-000000000001'],
      );
      const routing = {
        channelId: '21270000-5001-4000-8000-000000000001',
        accountId: channel.connectedAccountId,
        sender: 'operator@example.test',
        userWorkspaceId: (
          await runner.query(
            `SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1`,
            [SEED_APPLE_WORKSPACE_ID],
          )
        )[0].id,
      };
      await seedCampaignFixture(runner, {
        ids,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        schemaName: schema,
        routing,
        secondEnrollmentId: ids.enrollmentA,
        threadExternalId: 'task7-tied-linked-thread',
        recipient: fixture.markers.senderEmail.toLowerCase(),
      });
      // Only attempt A was accepted, before either reply arrived.
      await runner.query(
        `UPDATE core."outboundEmailAttempt" SET "providerAcceptedAt"='2000-01-01'
         WHERE "attemptId"=$1`,
        [ids.attemptA],
      );
      await runner.query(
        `UPDATE core."outboundEmailAttempt" SET "attemptState"='DEFINITELY_UNACCEPTED', "capacityState"='RELEASED'
         WHERE "attemptId"=$1`,
        [ids.attemptB],
      );
      for (const [messageId, receivedAt, direction] of [
        [secondReplyId, '2099-07-24T12:30:00.000Z', 'INCOMING'],
        [sendId, '2099-07-24T11:59:00.000Z', 'OUTGOING'],
      ]) {
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await runner.query(
          `INSERT INTO "${schema}".message (id,"messageThreadId","receivedAt",subject,text,"isDraft")
           VALUES ($1,$2,$3,$4,'promotion body',false)`,
          [
            messageId,
            threadId,
            receivedAt,
            `${fixture.markers.tied} promotion`,
          ],
        );
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await runner.query(
          `INSERT INTO "${schema}"."messageChannelMessageAssociation"
             (id,"messageId","messageChannelId","messageExternalId","messageThreadExternalId",direction)
           VALUES ($1,$2,$3,$4,'task7-tied-linked-thread',$5)`,
          [
            randomUUID(),
            messageId,
            routing.channelId,
            `promotion-${messageId}`,
            direction,
          ],
        );
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await runner.query(
          `INSERT INTO "${schema}"."messageParticipant" (id,"messageId",role,handle)
           VALUES ($1,$2,'FROM',$3)`,
          [
            randomUUID(),
            messageId,
            direction === 'INCOMING'
              ? fixture.markers.senderEmail
              : 'operator@example.test',
          ],
        );
      }
      await runner.query(
        `DELETE FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, firstReplyId],
      );
      // A historical THREAD record, then later EXACT proof for the same send.
      await runner.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
           ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification","matchedAttemptId")
         VALUES ($1,$2,$4,$5,$6,'THREAD',NULL),($1,$3,$4,$5,$6,'EXACT',$7)`,
        [
          SEED_APPLE_WORKSPACE_ID,
          firstReplyId,
          secondReplyId,
          routing.channelId,
          ids.campaign,
          ids.enrollmentA,
          ids.attemptA,
        ],
      );
      await runner.commitTransaction();

      const anchorKey = `attempt:${ids.attemptA}`;
      const pending = await readCards();
      expect(
        pending.cards.filter((card) => card.threadId === threadId),
      ).toEqual([
        expect.objectContaining({ anchorKey, historyBasis: 'PENDING' }),
      ]);
      const pendingPage = await readMessages(anchorKey, pending.snapshot);
      expect(pendingPage.body.errors).toBeUndefined();
      const { root, messages } =
        pendingPage.body.data.myahInboxContactEmailCardMessages;
      const shown = [root, ...messages].map(({ id }: { id: string }) => id);
      expect(shown.filter((id) => id === firstReplyId)).toHaveLength(1);
      expect(shown.filter((id) => id === secondReplyId)).toHaveLength(1);
      const contacts = await fetchContacts(token, { first: 50 });
      expect(
        contacts.edges.filter(
          ({ node }) => node.creator?.id === fixture.creatorId,
        ),
      ).toHaveLength(1);

      // The accepted send becomes readable: same group, new root, old snapshot invalid.
      await global.testDataSource.query(
        `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=$2,"projectedMessageThreadId"=$3
         WHERE "attemptId"=$1`,
        [ids.attemptA, sendId, threadId],
      );
      const stale = await readMessages(anchorKey, pending.snapshot);
      expect(stale.body.errors?.[0].message).toContain(
        'Inbox history changed; reload history',
      );
      const resolved = await readCards();
      expect(
        resolved.cards.filter((card) => card.threadId === threadId),
      ).toEqual([
        expect.objectContaining({
          anchorKey,
          rootMessageId: sendId,
          historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
        }),
      ]);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.startTransaction();
      try {
        await runner.query(
          `DELETE FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=ANY($2::uuid[])`,
          [SEED_APPLE_WORKSPACE_ID, [firstReplyId, secondReplyId]],
        );
        if (original)
          await runner.query(
            `INSERT INTO core."myahCampaignReplyEvidence"
               ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              original.workspaceId,
              original.inboundMessageId,
              original.messageChannelId,
              original.campaignId,
              original.enrollmentId,
              original.classification,
              original.createdAt,
            ],
          );
        for (const table of [
          'messageParticipant',
          'messageChannelMessageAssociation',
        ])
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `DELETE FROM "${schema}"."${table}" WHERE "messageId"=ANY($1::uuid[])`,
            [insertedMessageIds],
          );
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await runner.query(
          `DELETE FROM "${schema}".message WHERE id=ANY($1::uuid[])`,
          [insertedMessageIds],
        );
        await cleanupCampaignFixture(runner, {
          ids,
          workspaceId: SEED_APPLE_WORKSPACE_ID,
          schemaName: schema,
        });
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      } finally {
        await runner.release();
      }
    }
  });

  it('does not add or reorder a contact through hidden inbound evidence', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    // pi-lens-ignore: sql-injection
    const [hidden] = await global.testDataSource.query<
      Array<{
        id: string;
        channelId: string;
      }>
    >(
      `SELECT message.id,
         (SELECT channel.id FROM core."messageChannel" channel
           WHERE channel."workspaceId"=$2 AND channel.type='EMAIL' LIMIT 1) AS "channelId"
       FROM "${schema}".message message WHERE message.subject=$1`,
      [fixture.markers.hiddenSubject, SEED_APPLE_WORKSPACE_ID],
    );
    expect(hidden).toBeDefined();
    const before = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.sharedSubject,
    });
    try {
      await global.testDataSource.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
          ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification")
         VALUES ($1,$2,$3,$4,$5,'THREAD')`,
        [
          SEED_APPLE_WORKSPACE_ID,
          hidden.id,
          hidden.channelId,
          randomUUID(),
          randomUUID(),
        ],
      );
      expect(
        await fetchContacts(token, {
          first: 20,
          search: fixture.markers.sharedSubject,
        }),
      ).toEqual(before);
      expect(
        (
          await fetchContacts(token, {
            first: 20,
            search: fixture.markers.hiddenSubject,
          })
        ).edges,
      ).toEqual([]);
    } finally {
      await global.testDataSource.query(
        `DELETE FROM core."myahCampaignReplyEvidence"
         WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, hidden.id],
      );
    }
  });

  it('does not use a null-timestamp inbound proof to order default Email contacts', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    // pi-lens-ignore: sql-injection
    const [source] = await global.testDataSource.query<
      Array<{
        id: string;
        receivedAt: Date;
      }>
    >(
      `SELECT id,"receivedAt" FROM "${schema}".message
       WHERE "messageThreadId"=$1 AND subject ILIKE $2 LIMIT 1`,
      [fixture.threadIds.tiedLinked, `%${fixture.markers.tied}%`],
    );
    expect(source).toBeDefined();
    try {
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}".message SET "receivedAt"=NULL WHERE id=$1`,
        [source.id],
      );
      const list = await fetchContacts(token, {
        first: 20,
        search: fixture.markers.tied,
      });
      expect(
        list.edges.some(({ node }) => node.creator?.id === fixture.creatorId),
      ).toBe(false);
      expect(
        list.edges.some(({ node }) =>
          node.email.threadIds.includes(fixture.threadIds.tiedUnlinked),
        ),
      ).toBe(true);
    } finally {
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}".message SET "receivedAt"=$2 WHERE id=$1`,
        [source.id, source.receivedAt],
      );
    }
  });

  it('groups readable linked threads once, keeps unmatched Email exact, and emits stable opaque cursors', async () => {
    const firstRun = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });
    const secondRun = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });
    const linked = firstRun.edges.find(
      ({ node }) => node.identityKind === 'CREATOR',
    );
    const unmatched = firstRun.edges.find(
      ({ node }) => node.identityKind === 'EMAIL_THREAD',
    );

    expect(linked?.node.creator?.id).toBe(fixture.creatorId);
    expect(linked?.node.email.threadIds).toContain(
      fixture.threadIds.tiedLinked,
    );
    expect(linked?.node.email.threadCount).toBeGreaterThan(1);
    expect(unmatched?.node.email.threadIds).toEqual([
      fixture.threadIds.tiedUnlinked,
    ]);
    expect(unmatched?.node.id).not.toContain(fixture.threadIds.tiedUnlinked);
    expect(secondRun.edges.map(({ cursor }) => cursor)).toEqual(
      firstRun.edges.map(({ cursor }) => cursor),
    );
    const detail = await makeGraphqlAPIRequest(
      {
        query: contactDetailQuery,
        variables: { contactId: linked?.node.id },
      },
      token,
    );

    expect(detail.body.errors).toBeUndefined();
    expect(detail.body.data.myahInboxContact).toMatchObject({
      id: linked?.node.id,
      identityKind: 'CREATOR',
      creator: { id: fixture.creatorId },
    });
  });

  it('orders responding Email by latest readable incoming without changing Instagram ordering', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    const marker = `MYAH357-${randomUUID()}`;
    const conversationId = randomUUID();
    const secondConversationId = randomUUID();
    const instagramMessageId = randomUUID();
    const outboundMessageId = randomUUID();
    const outboundAssociationId = randomUUID();
    const oppositeDirectionAssociationId =
      '00000000-0000-0000-0000-000000000357';
    // pi-lens-ignore: sql-injection
    const sourceRows = await global.testDataSource.query<
      Array<{
        messageId: string;
        threadId: string;
        associationId: string | null;
        channelId: string | null;
        direction: string | null;
        receivedAt: string;
        subject: string | null;
        text: string | null;
      }>
    >(
      `SELECT message.id AS "messageId", message."messageThreadId" AS "threadId",
        association.id AS "associationId", association."messageChannelId" AS "channelId",
        association.direction::text, message."receivedAt", message.subject, message.text
       FROM "${schema}".message message
       LEFT JOIN "${schema}"."messageChannelMessageAssociation" association
         ON association."messageId" = message.id
       WHERE message."messageThreadId" = ANY($1::uuid[])`,
      [
        [
          fixture.threadIds.tiedLinked,
          fixture.threadIds.tiedUnlinked,
          fixture.threadIds.sharedFallback,
        ],
      ],
    );
    const linked = sourceRows.find(
      ({ threadId }) => threadId === fixture.threadIds.tiedLinked,
    );
    const unlinked = sourceRows.find(
      ({ threadId }) => threadId === fixture.threadIds.tiedUnlinked,
    );
    const hidden = sourceRows.find(
      ({ subject }) => subject === fixture.markers.hiddenSubject,
    );

    expect(linked).toBeDefined();
    expect(unlinked).toBeDefined();
    expect(hidden).toBeDefined();

    try {
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}".message
         SET "receivedAt" = '2099-10-05T11:00:00Z', subject = $2, text = $2
         WHERE id = $1::uuid`,
        [linked!.messageId, marker],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}"."messageChannelMessageAssociation"
         SET direction = 'INCOMING' WHERE id = $1::uuid`,
        [linked!.associationId],
      );
      // A message may be associated with multiple workspace mailboxes. Keep the
      // incoming association authoritative even when an outgoing row sorts first.
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."messageChannelMessageAssociation"
          (id, "messageId", "messageChannelId", direction)
         VALUES ($1, $2, $3, 'OUTGOING')`,
        [oppositeDirectionAssociationId, linked!.messageId, hidden!.channelId!],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${schema}".message
          (id, "messageThreadId", "receivedAt", subject, text)
         VALUES ($1, $2, '2099-10-05T12:00:00Z', $3, $3)`,
        [outboundMessageId, fixture.threadIds.tiedLinked, marker],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."messageChannelMessageAssociation"
          (id, "messageId", "messageChannelId", direction)
         VALUES ($1, $2, $3, 'OUTGOING')`,
        [outboundAssociationId, outboundMessageId, linked!.channelId!],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}".message
         SET "receivedAt" = '2099-10-05T13:00:00Z', subject = $2, text = $2
         WHERE id = $1::uuid`,
        [unlinked!.messageId, marker],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}"."messageChannelMessageAssociation"
         SET direction = 'OUTGOING' WHERE id = $1::uuid`,
        [unlinked!.associationId],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}".message
         SET "receivedAt" = '2099-10-05T15:00:00Z', subject = $2, text = $2
         WHERE id = $1::uuid`,
        [hidden!.messageId, marker],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."_myahSocialConversation"
          (id, provider, lifecycle, "providerConversationId", "recipientUsername",
           "recipientDisplayName", "creatorId", "createdAt", "updatedAt",
           "createdBySource", "createdByName", "createdByContext",
           "updatedBySource", "updatedByName", "updatedByContext")
         VALUES ($1, 'UNIPILE', 'ACTIVE', $2, $3, $3, $4,
           '2099-10-05T10:00:00Z', '2099-10-05T10:00:00Z',
           'SYSTEM', 'System', '{}'::jsonb, 'SYSTEM', 'System', '{}'::jsonb)`,
        [
          conversationId,
          `provider-${conversationId}`,
          marker,
          fixture.creatorId,
        ],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."_myahSocialMessage"
          (id, text, direction, provider, "providerMessageId",
           "providerCreatedAt", "conversationId", "createdAt",
           "createdBySource", "createdByName", "createdByContext",
           "updatedBySource", "updatedByName", "updatedByContext")
         VALUES ($1, $2, 'INBOUND', 'UNIPILE', $3,
           '2099-10-05T10:00:00Z', $4, '2099-10-05T10:00:00Z',
           'SYSTEM', 'System', '{}'::jsonb, 'SYSTEM', 'System', '{}'::jsonb)`,
        [
          instagramMessageId,
          marker,
          `message-${instagramMessageId}`,
          conversationId,
        ],
      );

      const beforeTie = await fetchContacts(token, {
        first: 20,
        search: marker,
      });
      const creatorBeforeTie = beforeTie.edges.find(
        ({ node }) => node.creator?.id === fixture.creatorId,
      )?.node;
      const noInbound = beforeTie.edges.find(
        ({ node }) => node.identityKind === 'EMAIL_THREAD',
      )?.node;

      expect(creatorBeforeTie).toMatchObject({
        latestChannel: 'EMAIL',
        lastActivityAt: '2099-10-05T11:00:00.000Z',
        initialSelection: {
          channel: 'EMAIL',
          emailThreadId: fixture.threadIds.tiedLinked,
          instagramConversationId: null,
        },
      });
      expect(noInbound).toBeUndefined();

      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}"."_myahSocialMessage"
         SET "providerCreatedAt" = '2099-10-05T11:00:00Z'
         WHERE id = $1`,
        [instagramMessageId],
      );
      const tied = await fetchContacts(token, { first: 20, search: marker });
      const tiedCreator = tied.edges.find(
        ({ node }) => node.creator?.id === fixture.creatorId,
      )?.node;

      expect(tiedCreator).toMatchObject({
        latestChannel: 'INSTAGRAM',
        lastActivityAt: '2099-10-05T11:00:00.000Z',
        initialSelection: {
          channel: 'INSTAGRAM',
          emailThreadId: null,
          instagramConversationId: conversationId,
        },
      });

      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${schema}"."_myahSocialConversation"
          (id, provider, lifecycle, "providerConversationId", "recipientUsername",
           "recipientDisplayName", "creatorId", "createdAt", "updatedAt",
           "createdBySource", "createdByName", "createdByContext",
           "updatedBySource", "updatedByName", "updatedByContext")
         VALUES ($1, 'UNIPILE', 'ACTIVE', $2, $3, $3, $4,
           '2099-10-05T09:00:00Z', '2099-10-05T09:00:00Z',
           'SYSTEM', 'System', '{}'::jsonb, 'SYSTEM', 'System', '{}'::jsonb)`,
        [
          secondConversationId,
          `provider-${secondConversationId}`,
          marker,
          fixture.creatorId,
        ],
      );
      const ambiguous = await fetchContacts(token, {
        first: 20,
        search: marker,
      });
      const ambiguousCreator = ambiguous.edges.find(
        ({ node }) => node.creator?.id === fixture.creatorId,
      )?.node;

      expect(ambiguousCreator?.initialSelection).toEqual({
        channel: 'INSTAGRAM',
        emailThreadId: null,
        instagramConversationId: null,
      });
    } finally {
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${schema}"."_myahSocialMessage" WHERE id = $1`,
        [instagramMessageId],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${schema}"."_myahSocialConversation"
         WHERE id = ANY($1::uuid[])`,
        [[conversationId, secondConversationId]],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${schema}"."messageChannelMessageAssociation"
         WHERE id = ANY($1::uuid[])`,
        [[outboundAssociationId, oppositeDirectionAssociationId]],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${schema}".message WHERE id = $1`,
        [outboundMessageId],
      );
      for (const row of [linked!, unlinked!, hidden!]) {
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `UPDATE "${schema}".message
           SET "receivedAt" = $1, subject = $2, text = $3 WHERE id = $4`,
          [row.receivedAt, row.subject, row.text, row.messageId],
        );
        if (row.associationId) {
          // pi-lens-ignore: sql-injection
          await global.testDataSource.query(
            `UPDATE "${schema}"."messageChannelMessageAssociation"
             SET direction = $1 WHERE id = $2`,
            [row.direction, row.associationId],
          );
        }
      }
    }
  });

  it('returns one chronological visibility-safe native Message connection across linked threads', async () => {
    const contacts = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });
    const linkedContactId = contacts.edges.find(
      ({ node }) => node.identityKind === 'CREATOR',
    )?.node.id;

    expect(linkedContactId).toBeDefined();
    const timeline = await fetchEmailMessages(token, {
      contactId: linkedContactId,
      first: 100,
    });
    const timestamps = timeline.edges.map(({ node }) => node.receivedAt);
    const subjectOnly = timeline.edges.find(
      ({ node }) => node.visibility === 'SUBJECT',
    );

    expect(timestamps).toEqual([...timestamps].sort());
    expect(
      new Set(timeline.edges.map(({ node }) => node.messageThreadId)).size,
    ).toBeGreaterThan(1);
    const fixtureThreadIds = new Set<string>(Object.values(fixture.threadIds));

    expect(
      timeline.edges.every(({ node }) =>
        fixtureThreadIds.has(node.messageThreadId),
      ),
    ).toBe(true);
    expect(subjectOnly?.node.text).toBe(
      FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    );

    const firstPage = await fetchEmailMessages(token, {
      contactId: linkedContactId,
      first: 1,
    });
    const secondPage = await fetchEmailMessages(token, {
      contactId: linkedContactId,
      first: 1,
      after: firstPage.pageInfo.endCursor,
    });

    expect(firstPage.pageInfo.hasNextPage).toBe(true);
    expect(secondPage.edges[0]?.node.id).not.toBe(firstPage.edges[0]?.node.id);
  });

  it('merges and splits an exact Email source immediately when linkage changes', async () => {
    const before = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });
    const unmatchedContactId = before.edges.find(
      ({ node }) => node.identityKind === 'EMAIL_THREAD',
    )?.node.id;

    expect(unmatchedContactId).toBeDefined();

    try {
      const linked = await makeGraphqlAPIRequest(
        {
          query: linkContactMutation,
          variables: {
            input: {
              contactId: unmatchedContactId,
              creatorId: fixture.creatorId,
            },
          },
        },
        token,
      );

      expect(linked.body.errors).toBeUndefined();
      const merged = await fetchContacts(token, {
        first: 20,
        search: fixture.markers.tied,
      });

      expect(merged.edges).toHaveLength(1);
      expect(merged.edges[0].node.identityKind).toBe('CREATOR');
      expect(merged.edges[0].node.email.threadIds).toEqual(
        expect.arrayContaining([
          fixture.threadIds.tiedLinked,
          fixture.threadIds.tiedUnlinked,
        ]),
      );
    } finally {
      const unlinked = await makeGraphqlAPIRequest(
        {
          query: linkContactMutation,
          variables: {
            input: { contactId: unmatchedContactId, creatorId: null },
          },
        },
        token,
      );

      expect(unlinked.body.errors).toBeUndefined();
    }

    const split = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });

    expect(split.edges.map(({ node }) => node.identityKind)).toEqual(
      expect.arrayContaining(['CREATOR', 'EMAIL_THREAD']),
    );
  });

  // Requires the parent-owned disposable PostgreSQL gate; never run against UAT.
  it('pages Contact microseconds and exact-time ID ties exactly once at page size one', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    const threadIds = [
      fixture.threadIds.tiedLinked,
      fixture.threadIds.tiedUnlinked,
      fixture.threadIds.sharedFallback,
    ];
    const search = 'MYAH314-EXACT-CONTACT-CURSOR';
    const originalMessages = await global.testDataSource.query<
      Array<{
        id: string;
        receivedAt: string | null;
        subject: string | null;
        text: string | null;
      }>
    >(
      `SELECT id, to_char("receivedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt", subject, text FROM "${schema}".message WHERE "messageThreadId" = ANY($1::uuid[])`,
      [threadIds],
    );
    const originalThreads = await global.testDataSource.query<
      Array<{ id: string; creatorId: string | null }>
    >(
      `SELECT id, "creatorId" FROM "${schema}"."messageThread" WHERE id = ANY($1::uuid[])`,
      [threadIds],
    );
    try {
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `UPDATE "${schema}"."messageThread" SET "creatorId" = NULL WHERE id = ANY($1::uuid[])`,
        [threadIds],
      );
      for (const [index, threadId] of threadIds.entries()) {
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `UPDATE "${schema}".message SET "receivedAt" = $1::timestamptz, subject = $2, text = $2 WHERE "messageThreadId" = $3::uuid`,
          [
            `2099-07-24T12:00:00.${index === 0 ? '000100' : '000900'}Z`,
            search,
            threadId,
          ],
        );
      }
      const seen: string[] = [];
      const cursors: string[] = [];
      let after: string | undefined;
      let hasNextPage = true;
      for (let page = 0; page < threadIds.length + 1 && hasNextPage; page++) {
        const connection = await fetchContacts(token, {
          first: 1,
          search,
          after,
        });
        expect(connection.edges).toHaveLength(1);
        const edge = connection.edges[0];
        expect(edge.node.identityKind).toBe('EMAIL_THREAD');
        expect(edge.node.email.threadIds).toHaveLength(1);
        seen.push(edge.node.email.threadIds[0]);
        cursors.push(edge.cursor);
        expect(connection.pageInfo.endCursor).toBe(edge.cursor);
        after = edge.cursor;
        hasNextPage = connection.pageInfo.hasNextPage;
      }
      expect(hasNextPage).toBe(false);
      expect(seen).toEqual([threadIds[2], threadIds[1], threadIds[0]]);
      expect(new Set(seen).size).toBe(threadIds.length);
      expect(new Set(cursors).size).toBe(threadIds.length);
      expect(
        (await fetchContacts(token, { first: 1, search, after })).edges,
      ).toEqual([]);
    } finally {
      for (const row of originalMessages) {
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `UPDATE "${schema}".message SET "receivedAt" = $1::timestamptz, subject = $2, text = $3 WHERE id = $4::uuid`,
          [row.receivedAt, row.subject, row.text, row.id],
        );
      }
      for (const row of originalThreads) {
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `UPDATE "${schema}"."messageThread" SET "creatorId" = $1::uuid WHERE id = $2::uuid`,
          [row.creatorId, row.id],
        );
      }
    }
  });

  it('pages legacy Email microseconds and exact-time message ID ties exactly once at page size one', async () => {
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    const contacts = await fetchContacts(token, {
      first: 20,
      search: fixture.markers.tied,
    });
    const contactId = contacts.edges.find(
      ({ node }) => node.creator?.id === fixture.creatorId,
    )?.node.id;
    expect(contactId).toBeDefined();
    const timeline = await fetchEmailMessages(token, { contactId, first: 100 });
    expect(timeline.pageInfo.hasNextPage).toBe(false);
    const ids = timeline.edges.map(({ node }) => node.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const originalMessages = await global.testDataSource.query<
      Array<{ id: string; receivedAt: string }>
    >(
      `SELECT id, to_char("receivedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt" FROM "${schema}".message WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    try {
      for (const [index, id] of ids.entries()) {
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `UPDATE "${schema}".message SET "receivedAt" = $1::timestamptz WHERE id = $2::uuid`,
          [`2099-07-24T12:00:00.${index === 0 ? '000100' : '000900'}Z`, id],
        );
      }
      const seen: string[] = [];
      const cursors: string[] = [];
      let after: string | undefined;
      let hasNextPage = true;
      for (let page = 0; page < ids.length + 1 && hasNextPage; page++) {
        const connection = await fetchEmailMessages(token, {
          contactId,
          first: 1,
          after,
        });
        expect(connection.edges).toHaveLength(1);
        const edge = connection.edges[0];
        seen.push(edge.node.id);
        cursors.push(edge.cursor);
        expect(connection.pageInfo.endCursor).toBe(edge.cursor);
        after = edge.cursor;
        hasNextPage = connection.pageInfo.hasNextPage;
      }
      expect(hasNextPage).toBe(false);
      expect(seen).toEqual([ids[0], ...ids.slice(1).sort()]);
      expect(new Set(seen).size).toBe(ids.length);
      expect(new Set(cursors).size).toBe(ids.length);
      expect(
        (await fetchEmailMessages(token, { contactId, first: 1, after })).edges,
      ).toEqual([]);
    } finally {
      for (const row of originalMessages) {
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `UPDATE "${schema}".message SET "receivedAt" = $1::timestamptz WHERE id = $2::uuid`,
          [row.receivedAt, row.id],
        );
      }
    }
  });

  it('keeps the outer contact page bounded in the measured PostgreSQL plan', async () => {
    type QueryCall = (
      sql: string,
      parameters?: unknown[],
      queryRunner?: unknown,
      options?: { shouldBypassPermissionChecks?: boolean },
    ) => Promise<unknown>;
    const manager = getDomainService<{
      getGlobalWorkspaceDataSource: () => Promise<unknown>;
    }>('GlobalWorkspaceOrmManager');
    const dataSource = (await manager.getGlobalWorkspaceDataSource()) as {
      query: QueryCall;
    };
    const originalQuery = dataSource.query.bind(dataSource);
    let capturedQuery: { sql: string; parameters: unknown[] } | undefined;

    dataSource.query = async (sql, parameters, queryRunner, options) => {
      if (sql.startsWith('WITH request_scope AS')) {
        capturedQuery = { sql, parameters: parameters ?? [] };
      }

      return originalQuery(sql, parameters, queryRunner, options);
    };

    try {
      await fetchContacts(token, {
        first: 2,
        search: fixture.markers.tied,
      });
    } finally {
      dataSource.query = originalQuery;
    }

    expect(capturedQuery).toBeDefined();
    // pi-lens-ignore: sql-injection
    const planRows = (await global.testDataSource.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${capturedQuery!.sql}`,
      capturedQuery!.parameters,
    )) as Array<{
      'QUERY PLAN': Array<{
        Plan: { 'Node Type': string; 'Actual Rows': number };
      }>;
    }>;
    const outerPlan = planRows[0]['QUERY PLAN'][0].Plan;
    const limitRows: number[] = [];
    const collectLimitRows = (node: {
      'Node Type': string;
      'Actual Rows': number;
      Plans?: unknown[];
    }): void => {
      if (node['Node Type'] === 'Limit') {
        limitRows.push(node['Actual Rows']);
      }

      (node.Plans ?? []).forEach((child) =>
        collectLimitRows(child as Parameters<typeof collectLimitRows>[0]),
      );
    };

    collectLimitRows(outerPlan);

    // The outer page must be bounded by a page LIMIT. The planner may keep the
    // redundant outer Sort above that Limit or eliminate it, so assert the
    // bound itself instead of one particular plan shape.
    expect(limitRows.length).toBeGreaterThan(0);
    expect(Math.max(...limitRows)).toBeLessThanOrEqual(3);
    expect(outerPlan['Actual Rows']).toBeLessThanOrEqual(3);
  });
});
