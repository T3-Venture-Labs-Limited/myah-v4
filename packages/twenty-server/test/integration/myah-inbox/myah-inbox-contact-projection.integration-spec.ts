import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import gql from 'graphql-tag';

import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
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
            state
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

const linkContactMutation = gql`
  mutation LinkContact($input: LinkMyahInboxContactCreatorInput!) {
    linkMyahInboxContactCreator(input: $input)
  }
`;

type ContactNode = {
  id: string;
  identityKind: string;
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

  beforeAll(async () => {
    token = APPLE_JANE_ADMIN_ACCESS_TOKEN;
    fixture = await seedMyahInboxTask7Fixture({ operatorAccessToken: token });
  });

  afterAll(async () => {
    await cleanupMyahInboxTask7Fixture({ operatorAccessToken: token });
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
    const planRows = (await global.testDataSource.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${capturedQuery!.sql}`,
      capturedQuery!.parameters,
    )) as Array<{
      'QUERY PLAN': Array<{
        Plan: { 'Node Type': string; 'Actual Rows': number };
      }>;
    }>;
    const outerPlan = planRows[0]['QUERY PLAN'][0].Plan;

    expect(outerPlan['Node Type']).toBe('Limit');
    expect(outerPlan['Actual Rows']).toBeLessThanOrEqual(3);
  });
});
