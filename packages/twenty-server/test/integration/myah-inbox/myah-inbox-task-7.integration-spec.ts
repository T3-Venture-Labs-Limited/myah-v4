import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import gql from 'graphql-tag';

import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import {
  cleanupMyahInboxTask7Fixture,
  seedMyahInboxTask7Fixture,
  type MyahInboxTask7CleanupEvidence,
  type MyahInboxTask7Fixture,
} from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const inboxThreadsQuery = gql`
  query Task7InboxThreads(
    $first: Int
    $after: String
    $owner: String
    $campaignId: String
    $states: [MyahInboxState!]
    $search: String
    $threadId: String
  ) {
    myahInboxThreads(
      first: $first
      after: $after
      owner: $owner
      campaignId: $campaignId
      states: $states
      search: $search
      threadId: $threadId
    ) {
      edges {
        cursor
        node {
          id
          lastActivityAt
          subject
          lastMessagePreview
          lastMessageSender
          state
          snoozedUntil
          creator {
            id
            name
          }
          campaign {
            id
            name
          }
          inboxOwner {
            id
            name
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

const updateThreadMutation = gql`
  mutation Task7UpdateThread($input: UpdateMyahInboxThreadInput!) {
    updateMyahInboxThread(input: $input) {
      id
      state
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
  mutation Task7SaveDraft($input: SaveMyahInboxDraftInput!) {
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

type InboxNode = {
  id: string;
  lastActivityAt: string;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  state: string;
  creator: { id: string; name: string | null } | null;
  campaign: { id: string; name: string | null } | null;
  inboxOwner: { id: string; name: string | null } | null;
};

type InboxResponse = {
  edges: Array<{ cursor: string; node: InboxNode }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const fetchInbox = async (
  token: string,
  variables: Record<string, unknown>,
): Promise<InboxResponse> => {
  const response = await makeGraphqlAPIRequest(
    { query: inboxThreadsQuery, variables },
    token,
  );

  expect(response.status).toBe(200);
  expect(response.body.errors).toBeUndefined();

  return response.body.data.myahInboxThreads;
};

const fetchNativeMessages = async (token: string, threadId: string) => {
  const response = await makeGraphqlAPIRequest(
    findManyOperationFactory({
      objectMetadataSingularName: 'message',
      objectMetadataPluralName: 'messages',
      gqlFields: 'id subject text receivedAt',
      filter: { messageThreadId: { eq: threadId } },
      orderBy: { receivedAt: 'AscNullsLast' },
      first: 100,
    }),
    token,
  );

  expect(response.status).toBe(200);
  expect(response.body.errors).toBeUndefined();

  return response.body.data.messages.edges.map(
    ({ node }: { node: Record<string, unknown> }) => node,
  );
};

const expectFixtureAbsent = (
  cleanupEvidence: MyahInboxTask7CleanupEvidence,
) => {
  expect(cleanupEvidence).toEqual({
    fixtureGraphqlRecordsRemaining: [],
    fixtureChannelIdsRemaining: [],
    foreignCreatorRemaining: false,
  });
};

describe('Myah Inbox Task 7 fixture failure cleanup', () => {
  it('removes every partially seeded fixture resource after setup fails', async () => {
    const operatorAccessToken = APPLE_JANE_ADMIN_ACCESS_TOKEN;
    const injectedFailure = new Error('Injected Task 7 seed failure');

    try {
      await seedMyahInboxTask7Fixture({
        operatorAccessToken,
        afterNativeRecordsSeeded: () => {
          throw injectedFailure;
        },
      });
      throw new Error('Expected Task 7 fixture seeding to fail');
    } catch (error) {
      expect(error).toBe(injectedFailure);
    } finally {
      expectFixtureAbsent(
        await cleanupMyahInboxTask7Fixture({ operatorAccessToken }),
      );
    }
  });
});

describe('Myah Inbox Task 7 isolated integration', () => {
  let cleanupFixture: () => Promise<MyahInboxTask7CleanupEvidence>;
  let fixture: MyahInboxTask7Fixture;
  let operatorAccessToken: string;

  beforeAll(async () => {
    operatorAccessToken = APPLE_JANE_ADMIN_ACCESS_TOKEN;
    cleanupFixture = () =>
      cleanupMyahInboxTask7Fixture({ operatorAccessToken });
    fixture = await seedMyahInboxTask7Fixture({ operatorAccessToken });
  });

  afterAll(async () => {
    expectFixtureAbsent(await cleanupFixture());
  });

  it('keeps one readable collection cursor-stable while owner, campaign, state, and search constrain it', async () => {
    const defaultCollection = await fetchInbox(operatorAccessToken, {
      first: 20,
    });
    const firstPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.tied,
    });
    const repeatedFirstPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.tied,
    });
    const secondPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      after: firstPage.pageInfo.endCursor,
      search: fixture.markers.tied,
    });

    expect(defaultCollection.edges.map(({ node }) => node.id)).toEqual(
      expect.arrayContaining([
        fixture.threadIds.tiedLinked,
        fixture.threadIds.tiedUnlinked,
      ]),
    );
    expect(
      defaultCollection.edges.find(
        ({ node }) => node.id === fixture.threadIds.tiedUnlinked,
      )?.node,
    ).toMatchObject({
      creator: null,
      campaign: { id: fixture.campaignId, name: fixture.campaignName },
    });
    expect(firstPage.pageInfo.hasNextPage).toBe(true);
    expect(repeatedFirstPage).toEqual(firstPage);
    expect(
      [firstPage.edges[0].node.id, secondPage.edges[0].node.id].sort(),
    ).toEqual(
      [fixture.threadIds.tiedLinked, fixture.threadIds.tiedUnlinked].sort(),
    );
    expect(secondPage.edges[0].node.id).not.toBe(firstPage.edges[0].node.id);
    expect(secondPage.pageInfo.hasNextPage).toBe(false);
    expect(firstPage.edges[0].node.lastActivityAt).toBe(
      secondPage.edges[0].node.lastActivityAt,
    );

    const mine = await fetchInbox(operatorAccessToken, {
      first: 20,
      owner: 'ME',
      search: fixture.markers.prefix,
    });
    const unassigned = await fetchInbox(operatorAccessToken, {
      first: 20,
      owner: 'UNASSIGNED',
      campaignId: fixture.campaignId,
    });
    const campaign = await fetchInbox(operatorAccessToken, {
      first: 20,
      campaignId: fixture.campaignId,
      search: fixture.markers.prefix,
    });
    const waiting = await fetchInbox(operatorAccessToken, {
      first: 20,
      states: ['WAITING_ON_CREATOR'],
      search: fixture.markers.prefix,
    });

    expect(mine.edges.map(({ node }) => node.id)).toEqual([
      fixture.threadIds.owner,
      fixture.threadIds.draft,
    ]);
    expect(unassigned.edges.map(({ node }) => node.id)).toEqual([
      fixture.threadIds.tiedUnlinked,
      fixture.threadIds.sharedFallback,
      fixture.threadIds.metadata,
    ]);
    expect(campaign.edges.map(({ node }) => node.id)).toEqual([
      fixture.threadIds.tiedUnlinked,
      fixture.threadIds.tiedLinked,
      fixture.threadIds.sharedFallback,
      fixture.threadIds.draft,
    ]);
    expect(waiting.edges.map(({ node }) => node.id)).toContain(
      fixture.threadIds.tiedUnlinked,
    );
  });

  it('searches readable senders by email and participant display name', async () => {
    const firstPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.senderEmail,
    });
    const repeatedFirstPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.senderEmail,
    });
    const secondPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      after: firstPage.pageInfo.endCursor,
      search: fixture.markers.senderEmail,
    });
    const caseOnlyEmail = await fetchInbox(operatorAccessToken, {
      first: 20,
      search: fixture.markers.senderEmail.toUpperCase(),
    });
    const displayName = await fetchInbox(operatorAccessToken, {
      first: 20,
      search: fixture.markers.senderDisplayName,
    });
    const subjectSender = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.subjectSenderEmail,
    });
    const metadataSender = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.metadataSenderEmail,
    });

    expect(firstPage.pageInfo.hasNextPage).toBe(true);
    expect(repeatedFirstPage).toEqual(firstPage);
    expect(
      [firstPage.edges[0].node.id, secondPage.edges[0].node.id].sort(),
    ).toEqual(
      [fixture.threadIds.tiedLinked, fixture.threadIds.tiedUnlinked].sort(),
    );
    expect(secondPage.pageInfo.hasNextPage).toBe(false);
    expect(caseOnlyEmail.edges.map(({ node }) => node.id).sort()).toEqual(
      [fixture.threadIds.tiedLinked, fixture.threadIds.tiedUnlinked].sort(),
    );
    expect(displayName.edges.map(({ node }) => node.id)).toEqual([
      fixture.threadIds.tiedLinked,
    ]);
    expect(displayName.edges[0].node).toMatchObject({
      lastMessageSender: fixture.markers.senderEmail,
      creator: { id: fixture.creatorId, name: 'Task 7 Creator' },
    });
    expect(subjectSender.edges[0].node).toMatchObject({
      id: fixture.threadIds.subject,
      lastMessageSender: fixture.markers.subjectSenderEmail,
    });
    expect(metadataSender.edges[0].node).toMatchObject({
      id: fixture.threadIds.metadata,
      lastMessageSender: fixture.markers.metadataSenderEmail,
    });
  });

  it('keeps the unlinked readable thread selectable and links it only to the existing Creator', async () => {
    const unlinked = await fetchInbox(operatorAccessToken, {
      first: 20,
      search: fixture.markers.tied,
    });
    const unlinkedNode = unlinked.edges.find(
      ({ node }) => node.id === fixture.threadIds.tiedUnlinked,
    )?.node;

    expect(unlinkedNode).toMatchObject({
      id: fixture.threadIds.tiedUnlinked,
      creator: null,
      campaign: { id: fixture.campaignId },
    });

    const linked = await makeGraphqlAPIRequest(
      {
        query: updateThreadMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.tiedUnlinked,
            creatorId: fixture.creatorId,
          },
        },
      },
      operatorAccessToken,
    );

    expect(linked.status).toBe(200);
    expect(linked.body.errors).toBeUndefined();
    expect(linked.body.data.updateMyahInboxThread).toMatchObject({
      id: fixture.threadIds.tiedUnlinked,
      creator: { id: fixture.creatorId },
      campaign: { id: fixture.campaignId },
    });
  });

  it('returns a selected readable thread only when its filters match', async () => {
    const selected = await fetchInbox(operatorAccessToken, {
      first: 1,
      threadId: fixture.threadIds.tiedUnlinked,
      campaignId: fixture.campaignId,
      search: fixture.markers.senderEmail,
    });
    const selectedClosed = await fetchInbox(operatorAccessToken, {
      first: 1,
      threadId: fixture.threadIds.tiedUnlinked,
      states: ['CLOSED'],
    });

    expect(selected.edges.map(({ node }) => node.id)).toEqual([
      fixture.threadIds.tiedUnlinked,
    ]);
    expect(selected.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: selected.edges[0].cursor,
    });
    expect(selectedClosed).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it('matches native selected-thread visibility and exposes no hidden or masked-content search oracle', async () => {
    const ownerThread = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.ownerSubject,
    });
    const sharedThread = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.sharedSubject,
    });
    const subjectThread = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.subjectVisible,
    });
    const metadataThread = await fetchInbox(operatorAccessToken, {
      first: 20,
      states: ['CLOSED'],
    });

    expect(ownerThread.edges[0].node).toMatchObject({
      id: fixture.threadIds.owner,
      subject: fixture.markers.ownerSubject,
      lastMessagePreview: fixture.markers.ownerBody,
    });
    expect(sharedThread.edges[0].node).toMatchObject({
      id: fixture.threadIds.sharedFallback,
      subject: fixture.markers.sharedSubject,
      lastMessagePreview: fixture.markers.sharedBody,
    });
    expect(subjectThread.edges[0].node).toMatchObject({
      id: fixture.threadIds.subject,
      subject: fixture.markers.subjectVisible,
      lastMessagePreview: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    });

    const metadataNode = metadataThread.edges
      .map(({ node }) => node)
      .find(({ id }) => id === fixture.threadIds.metadata);

    expect(metadataNode).toMatchObject({
      subject: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      lastMessagePreview: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    });

    const [ownerNative] = await fetchNativeMessages(
      operatorAccessToken,
      fixture.threadIds.owner,
    );
    const [sharedNative] = await fetchNativeMessages(
      operatorAccessToken,
      fixture.threadIds.sharedFallback,
    );
    const [subjectNative] = await fetchNativeMessages(
      operatorAccessToken,
      fixture.threadIds.subject,
    );
    const [metadataNative] = await fetchNativeMessages(
      operatorAccessToken,
      fixture.threadIds.metadata,
    );

    expect(ownerNative).toMatchObject({
      subject: fixture.markers.ownerSubject,
      text: fixture.markers.ownerBody,
    });
    expect(sharedNative).toMatchObject({
      subject: fixture.markers.sharedSubject,
      text: fixture.markers.sharedBody,
    });
    expect(subjectNative).toMatchObject({
      subject: fixture.markers.subjectVisible,
      text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    });
    expect(metadataNative).toMatchObject({
      subject: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    });

    for (const forbiddenSearch of [
      fixture.markers.subjectMaskedBody,
      fixture.markers.metadataMaskedSubject,
      fixture.markers.metadataMaskedBody,
      fixture.markers.hiddenSubject,
      fixture.markers.hiddenBody,
      fixture.markers.hiddenOnly,
      fixture.markers.hiddenSenderEmail,
    ]) {
      const result = await fetchInbox(operatorAccessToken, {
        first: 20,
        search: forbiddenSearch,
      });

      expect(result.edges).toEqual([]);
      expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
    }

    const hiddenSelection = await fetchInbox(operatorAccessToken, {
      first: 1,
      threadId: fixture.threadIds.hiddenOnly,
    });
    const invalidSelection = await makeGraphqlAPIRequest(
      {
        query: inboxThreadsQuery,
        variables: { first: 1, threadId: 'myah245-invalid-thread-id' },
      },
      operatorAccessToken,
    );

    expect(hiddenSelection).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(invalidSelection.status).toBe(200);
    expect(invalidSelection.body.errors).toBeDefined();
    expect(invalidSelection.body.data?.myahInboxThreads).toBeUndefined();

    const visibleFallback = sharedThread.edges[0].node;

    expect(visibleFallback.lastActivityAt).toBe(
      fixture.timestamps.visibleFallback,
    );
    expect(
      await fetchNativeMessages(
        operatorAccessToken,
        fixture.threadIds.sharedFallback,
      ),
    ).toHaveLength(1);
    expect(
      await fetchNativeMessages(
        operatorAccessToken,
        fixture.threadIds.hiddenOnly,
      ),
    ).toEqual([]);

    const hiddenWindow = await fetchInbox(operatorAccessToken, {
      first: 20,
      search: fixture.markers.hiddenWindow,
    });
    const hiddenWindowFirstPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      search: fixture.markers.hiddenWindow,
    });
    const hiddenWindowSecondPage = await fetchInbox(operatorAccessToken, {
      first: 1,
      after: hiddenWindowFirstPage.pageInfo.endCursor,
      search: fixture.markers.hiddenWindow,
    });
    const afterHiddenWindow = await fetchInbox(operatorAccessToken, {
      first: 1,
      after: hiddenWindowSecondPage.pageInfo.endCursor,
      search: fixture.markers.hiddenWindow,
    });

    expect(hiddenWindow.edges.map(({ node }) => node.id)).toEqual([
      fixture.threadIds.hiddenVisibleAfter,
      fixture.threadIds.hiddenVisibleBefore,
    ]);
    expect(hiddenWindow.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: hiddenWindow.edges[1].cursor,
    });
    expect(hiddenWindowFirstPage.edges[0].node.id).toBe(
      fixture.threadIds.hiddenVisibleAfter,
    );
    expect(hiddenWindowFirstPage.pageInfo.hasNextPage).toBe(true);
    expect(hiddenWindowSecondPage.edges[0].node.id).toBe(
      fixture.threadIds.hiddenVisibleBefore,
    );
    expect(hiddenWindowSecondPage.pageInfo.hasNextPage).toBe(false);
    expect(afterHiddenWindow).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it('keeps relations workspace-scoped, reassigns owner, preserves a newer draft on stale save, and creates no Message', async () => {
    const beforeMessages = await fetchNativeMessages(
      operatorAccessToken,
      fixture.threadIds.draft,
    );
    const invalidRelation = await makeGraphqlAPIRequest(
      {
        query: updateThreadMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.draft,
            creatorId: fixture.foreignCreatorId,
          },
        },
      },
      operatorAccessToken,
    );

    expect(invalidRelation.status).toBe(200);
    expect(invalidRelation.body.errors).toBeDefined();

    const reassigned = await makeGraphqlAPIRequest(
      {
        query: updateThreadMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.draft,
            inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
          },
        },
      },
      operatorAccessToken,
    );

    expect(reassigned.body.errors).toBeUndefined();
    expect(reassigned.body.data.updateMyahInboxThread.inboxOwner.id).toBe(
      WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    );
    expect(reassigned.body.data.updateMyahInboxThread.campaign.id).toBe(
      fixture.campaignId,
    );

    const returnedToOperator = await makeGraphqlAPIRequest(
      {
        query: updateThreadMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.draft,
            inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
          },
        },
      },
      operatorAccessToken,
    );

    expect(returnedToOperator.body.errors).toBeUndefined();
    expect(returnedToOperator.body.data.updateMyahInboxThread.campaign.id).toBe(
      fixture.campaignId,
    );

    const saved = await makeGraphqlAPIRequest(
      {
        query: saveDraftMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.draft,
            expectedRevision: fixture.draftRevision,
            body: { markdown: 'Task 7 current writer', blocknote: null },
          },
        },
      },
      operatorAccessToken,
    );
    const stale = await makeGraphqlAPIRequest(
      {
        query: saveDraftMutation,
        variables: {
          input: {
            threadId: fixture.threadIds.draft,
            expectedRevision: fixture.draftRevision,
            body: { markdown: 'Task 7 stale writer', blocknote: null },
          },
        },
      },
      operatorAccessToken,
    );

    expect(saved.body.data.saveMyahInboxDraft).toEqual({
      status: 'SAVED',
      revision: fixture.draftRevision + 1,
      body: { markdown: 'Task 7 current writer', blocknote: null },
    });
    expect(stale.body.data.saveMyahInboxDraft).toEqual({
      status: 'CONFLICT',
      revision: fixture.draftRevision + 1,
      body: { markdown: 'Task 7 current writer', blocknote: null },
    });

    const persistedDraft = await makeGraphqlAPIRequest(
      findOneOperationFactory({
        objectMetadataSingularName: 'messageThread',
        gqlFields:
          'id myahReplyDraftRevision myahReplyDraftBody { markdown blocknote } creator { id } myahCampaign { id } inboxOwner { id }',
        filter: { id: { eq: fixture.threadIds.draft } },
      }),
      operatorAccessToken,
    );
    expect(persistedDraft.body.errors).toBeUndefined();
    expect(persistedDraft.body.data.messageThread).toMatchObject({
      myahReplyDraftRevision: fixture.draftRevision + 1,
      myahReplyDraftBody: {
        markdown: 'Task 7 current writer',
        blocknote: null,
      },
      creator: { id: fixture.creatorId },
      myahCampaign: { id: fixture.campaignId },
      inboxOwner: { id: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE },
    });

    const taskTargets = await makeGraphqlAPIRequest(
      findManyOperationFactory({
        objectMetadataSingularName: 'taskTarget',
        objectMetadataPluralName: 'taskTargets',
        gqlFields: 'id task { id title } targetCreator { id }',
        filter: { targetCreatorId: { eq: fixture.creatorId } },
        first: 20,
      }),
      operatorAccessToken,
    );
    const noteTargets = await makeGraphqlAPIRequest(
      findManyOperationFactory({
        objectMetadataSingularName: 'noteTarget',
        objectMetadataPluralName: 'noteTargets',
        gqlFields: 'id note { id title } targetCreator { id }',
        filter: { targetCreatorId: { eq: fixture.creatorId } },
        first: 20,
      }),
      operatorAccessToken,
    );

    expect(taskTargets.body.errors).toBeUndefined();
    expect(taskTargets.body.data.taskTargets.edges).toContainEqual(
      expect.objectContaining({
        node: expect.objectContaining({
          task: expect.objectContaining({ id: fixture.taskId }),
          targetCreator: { id: fixture.creatorId },
        }),
      }),
    );
    expect(noteTargets.body.errors).toBeUndefined();
    expect(noteTargets.body.data.noteTargets.edges).toContainEqual(
      expect.objectContaining({
        node: expect.objectContaining({
          note: expect.objectContaining({ id: fixture.noteId }),
          targetCreator: { id: fixture.creatorId },
        }),
      }),
    );

    expect(
      await fetchNativeMessages(operatorAccessToken, fixture.threadIds.draft),
    ).toHaveLength(beforeMessages.length);
  });
});
