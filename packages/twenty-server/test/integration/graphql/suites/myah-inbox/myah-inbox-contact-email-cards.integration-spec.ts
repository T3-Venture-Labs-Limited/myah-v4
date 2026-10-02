import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type DocumentNode } from 'graphql';
import gql from 'graphql-tag';

import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { installMyahInboxInstagramMetadataBridge } from 'test/integration/myah-inbox/utils/install-myah-inbox-instagram-metadata-bridge.util';
import {
  cleanupMyahInboxTask7Fixture,
  seedMyahInboxTask7Fixture,
  type MyahInboxTask7Fixture,
} from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const oldCardQuery = gql`
  query OldInboxEmailCard(
    $contactId: String!
    $expectedWorkspaceId: UUID!
    $threadId: UUID!
  ) {
    myahInboxContactEmailCard(
      contactId: $contactId
      expectedWorkspaceId: $expectedWorkspaceId
      threadId: $threadId
    ) {
      snapshot
      card {
        threadId
        anchorKey
        rootMessageId
      }
    }
  }
`;
const keyedCardQuery = gql`
  query KeyedInboxEmailCard(
    $contactId: String!
    $expectedWorkspaceId: UUID!
    $threadId: UUID!
    $anchorKey: String
  ) {
    myahInboxContactEmailCard(
      contactId: $contactId
      expectedWorkspaceId: $expectedWorkspaceId
      threadId: $threadId
      anchorKey: $anchorKey
    ) {
      snapshot
      card {
        threadId
        anchorKey
        rootMessageId
      }
    }
  }
`;
const oldMessagesQuery = gql`
  query OldInboxEmailMessages(
    $contactId: String!
    $expectedWorkspaceId: UUID!
    $threadId: UUID!
    $snapshot: String!
    $cursor: String
  ) {
    myahInboxContactEmailCardMessages(
      contactId: $contactId
      expectedWorkspaceId: $expectedWorkspaceId
      threadId: $threadId
      snapshot: $snapshot
      cursor: $cursor
    ) {
      threadId
      anchorKey
      root {
        id
      }
      messages {
        id
      }
      olderCursor
      newerCursor
    }
  }
`;
const keyedMessagesQuery = gql`
  query KeyedInboxEmailMessages(
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
      threadId
      anchorKey
      root {
        id
      }
      messages {
        id
      }
      olderCursor
      newerCursor
    }
  }
`;

// The loaded new frontend bundle sends exactly these generated documents.
const loadNewClientDocument = (name: string): DocumentNode => {
  const generated = readFileSync(
    resolve(
      __dirname,
      '../../../../../../twenty-front/src/generated/graphql.ts',
    ),
    'utf8',
  );
  const match = generated.match(
    new RegExp(
      `export const ${name}Document = (\\{.*?\\}) as unknown as DocumentNode`,
    ),
  );
  if (!match) throw new Error(`Generated client document ${name} not found`);

  return JSON.parse(match[1]) as DocumentNode;
};

describe('Myah Inbox Email card old/new GraphQL compatibility', () => {
  let fixture: MyahInboxTask7Fixture;
  let evidenceMessageId: string | undefined;
  let token: string;
  let variables: {
    contactId: string;
    expectedWorkspaceId: string;
    threadId: string;
  };

  beforeAll(async () => {
    token = APPLE_JANE_ADMIN_ACCESS_TOKEN;
    await installMyahInboxInstagramMetadataBridge();
    fixture = await seedMyahInboxTask7Fixture({ operatorAccessToken: token });
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    // pi-lens-ignore: sql-injection
    const [inbound] = await global.testDataSource.query<
      Array<{ id: string; messageChannelId: string }>
    >(
      `SELECT message.id, association."messageChannelId"
       FROM "${schema}".message message
       JOIN "${schema}"."messageChannelMessageAssociation" association ON association."messageId"=message.id
       WHERE message."messageThreadId"=$1 AND message."isDraft"=FALSE
         AND association.direction='INCOMING' AND association."deletedAt" IS NULL
       ORDER BY message."receivedAt", message.id LIMIT 1`,
      [fixture.threadIds.tiedLinked],
    );
    expect(inbound).toBeDefined();
    await global.testDataSource.query(
      `INSERT INTO core."myahCampaignReplyEvidence"
       ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","creatorId","classification")
       VALUES ($1,$2,$3,$4,$5,$6,'THREAD')`,
      [
        SEED_APPLE_WORKSPACE_ID,
        inbound.id,
        inbound.messageChannelId,
        fixture.campaignId,
        randomUUID(),
        fixture.creatorId,
      ],
    );
    evidenceMessageId = inbound.id;
    variables = {
      contactId: encodeMyahInboxContactId({
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        identity: { kind: 'creator', recordId: fixture.creatorId },
      }),
      expectedWorkspaceId: SEED_APPLE_WORKSPACE_ID,
      threadId: fixture.threadIds.tiedLinked,
    };
  });

  afterAll(async () => {
    if (evidenceMessageId)
      await global.testDataSource.query(
        `DELETE FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, evidenceMessageId],
      );
    if (fixture)
      await cleanupMyahInboxTask7Fixture({ operatorAccessToken: token });
  });

  it('executes old thread-only and new keyed static operations with distinct legacy and THREAD windows', async () => {
    const old = await makeGraphqlAPIRequest(
      { query: oldCardQuery, variables },
      token,
    );
    expect(old.body.errors).toBeUndefined();
    const schema = getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID);
    // pi-lens-ignore: sql-injection
    const [earliest] = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "${schema}".message WHERE "messageThreadId"=$1 AND "isDraft"=FALSE
       AND "deletedAt" IS NULL ORDER BY "receivedAt", id LIMIT 1`,
      [variables.threadId],
    );
    expect(old.body.data.myahInboxContactEmailCard.card).toMatchObject({
      threadId: variables.threadId,
      anchorKey: `legacy:${variables.threadId}`,
      rootMessageId: earliest.id,
    });
    const keyed = await makeGraphqlAPIRequest(
      {
        query: keyedCardQuery,
        variables: { ...variables, anchorKey: `thread:${variables.threadId}` },
      },
      token,
    );
    expect(keyed.body.errors).toBeUndefined();
    expect(keyed.body.data.myahInboxContactEmailCard.card).toMatchObject({
      threadId: variables.threadId,
      anchorKey: `thread:${variables.threadId}`,
      rootMessageId: evidenceMessageId,
    });
    for (const [query, snapshot, anchorKey] of [
      [
        oldMessagesQuery,
        old.body.data.myahInboxContactEmailCard.snapshot,
        undefined,
      ],
      [
        keyedMessagesQuery,
        keyed.body.data.myahInboxContactEmailCard.snapshot,
        `thread:${variables.threadId}`,
      ],
    ] as const) {
      const response = await makeGraphqlAPIRequest(
        {
          query,
          variables: {
            ...variables,
            snapshot,
            ...(anchorKey ? { anchorKey } : {}),
          },
        },
        token,
      );
      expect(response.body.errors).toBeUndefined();
      expect(
        response.body.data.myahInboxContactEmailCardMessages.anchorKey,
      ).toBe(anchorKey ?? `legacy:${variables.threadId}`);
      const page = response.body.data.myahInboxContactEmailCardMessages;
      expect(page.root.id).toBe(anchorKey ? evidenceMessageId : earliest.id);
      expect(
        [page.root, ...page.messages].map(({ id }: { id: string }) => id),
      ).toContain(evidenceMessageId);
      if (!anchorKey && page.olderCursor) {
        const older = await makeGraphqlAPIRequest(
          {
            query: oldMessagesQuery,
            variables: { ...variables, snapshot, cursor: page.olderCursor },
          },
          token,
        );
        expect(older.body.errors).toBeUndefined();
        expect(older.body.data.myahInboxContactEmailCardMessages).toMatchObject(
          {
            anchorKey: `legacy:${variables.threadId}`,
            root: { id: earliest.id },
          },
        );
      }
    }
  });

  it('rejects unknown, mismatched-thread and unreadable supplied keys without falling back', async () => {
    for (const [contactId, anchorKey] of [
      [variables.contactId, `attempt:${randomUUID()}`],
      [variables.contactId, `thread:${fixture.threadIds.owner}`],
      [
        encodeMyahInboxContactId({
          workspaceId: SEED_APPLE_WORKSPACE_ID,
          identity: { kind: 'creator', recordId: fixture.foreignCreatorId },
        }),
        `thread:${variables.threadId}`,
      ],
    ]) {
      const response = await makeGraphqlAPIRequest(
        {
          query: keyedCardQuery,
          variables: { ...variables, contactId, anchorKey },
        },
        token,
      );
      expect(response.body.data?.myahInboxContactEmailCard).toBeFalsy();
      if (anchorKey.startsWith('attempt:'))
        expect(response.body.errors?.[0].message).toBe(
          'Inbox card is not readable',
        );
      else
        expect(response.body.errors?.[0].message).toMatch(
          /Inbox card is not readable|Invalid Inbox card key|not readable/,
        );
    }
  });

  it('executes the loaded new-client keyed documents against the additive compatibility server', async () => {
    const { contactId, expectedWorkspaceId, threadId } = variables;
    const run = async (name: string, input: Record<string, unknown>) => {
      const response = await makeGraphqlAPIRequest(
        { query: loadNewClientDocument(name), variables: input },
        token,
      );
      expect(response.body.errors).toBeUndefined();

      return response.body.data;
    };
    const anchorKey = `thread:${threadId}`;
    const list = await run('MyahInboxContactEmailCards', {
      contactId,
      expectedWorkspaceId,
    });
    expect(list.myahInboxContactEmailCards.cards).toContainEqual(
      expect.objectContaining({ threadId, anchorKey }),
    );
    const card = await run('MyahInboxContactEmailCard', {
      contactId,
      expectedWorkspaceId,
      threadId,
      anchorKey,
    });
    expect(card.myahInboxContactEmailCard.card).toMatchObject({
      anchorKey,
      rootMessageId: evidenceMessageId,
    });
    const page = await run('MyahInboxContactEmailCardMessages', {
      contactId,
      expectedWorkspaceId,
      threadId,
      anchorKey,
      snapshot: card.myahInboxContactEmailCard.snapshot,
    });
    expect(page.myahInboxContactEmailCardMessages).toMatchObject({
      anchorKey,
      root: { id: evidenceMessageId },
    });
    const location = await run('MyahInboxContactEmailMessageLocation', {
      contactId,
      expectedWorkspaceId,
      messageId: evidenceMessageId,
      snapshot: list.myahInboxContactEmailCards.snapshot,
    });
    expect(location.myahInboxContactEmailMessageLocation.card.anchorKey).toBe(
      anchorKey,
    );
  });

  it('does not expose response evidence assigned to another Creator on the linked thread', async () => {
    const [channel] = await global.testDataSource.query<
      [Array<{ messageChannelId: string; enrollmentId: string }>, number]
    >(
      `DELETE FROM core."myahCampaignReplyEvidence"
       WHERE "workspaceId"=$1 AND "inboundMessageId"=$2
       RETURNING "messageChannelId","enrollmentId"`,
      [SEED_APPLE_WORKSPACE_ID, evidenceMessageId],
    );
    expect(channel).toHaveLength(1);
    const evidence = channel[0];
    try {
      await global.testDataSource.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
         ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","creatorId","classification")
         VALUES ($1,$2,$3,$4,$5,$6,'THREAD')`,
        [
          SEED_APPLE_WORKSPACE_ID,
          evidenceMessageId,
          evidence.messageChannelId,
          fixture.campaignId,
          evidence.enrollmentId,
          fixture.foreignCreatorId,
        ],
      );
      const list = await makeGraphqlAPIRequest(
        {
          query: loadNewClientDocument('MyahInboxContactEmailCards'),
          variables: {
            contactId: variables.contactId,
            expectedWorkspaceId: variables.expectedWorkspaceId,
          },
        },
        token,
      );
      expect(list.body.errors).toBeUndefined();
      expect(
        list.body.data.myahInboxContactEmailCards.cards,
      ).not.toContainEqual(
        expect.objectContaining({ anchorKey: `thread:${variables.threadId}` }),
      );
      const keyed = await makeGraphqlAPIRequest(
        {
          query: keyedCardQuery,
          variables: {
            ...variables,
            anchorKey: `thread:${variables.threadId}`,
          },
        },
        token,
      );
      expect(keyed.body.data?.myahInboxContactEmailCard).toBeFalsy();
      expect(keyed.body.errors?.[0].message).toMatch(/not readable/);
    } finally {
      await global.testDataSource.query(
        `DELETE FROM core."myahCampaignReplyEvidence"
         WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, evidenceMessageId],
      );
      await global.testDataSource.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
         ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","creatorId","classification")
         VALUES ($1,$2,$3,$4,$5,$6,'THREAD')`,
        [
          SEED_APPLE_WORKSPACE_ID,
          evidenceMessageId,
          evidence.messageChannelId,
          fixture.campaignId,
          evidence.enrollmentId,
          fixture.creatorId,
        ],
      );
    }
  });
});
