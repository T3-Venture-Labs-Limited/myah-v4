import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { buildSchema, graphql, printSchema } from 'graphql';

import { MyahInboxContactResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-contact.resolver';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const threadId = '00000000-0000-4000-8000-000000000002';
const attemptId = '00000000-0000-4000-8000-000000000003';

// Execute static client operations against the schema generated from the real resolver
// metadata. PG service tests separately establish authorization and group selection.
describe('Myah Inbox Email GraphQL old/new operation compatibility', () => {
  it('validates and executes old thread-only and new keyed card/page operations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    try {
      const generated = await moduleRef
        .get(GraphQLSchemaFactory)
        .create([MyahInboxContactResolver]);
      const schema = buildSchema(printSchema(generated));
      const seen: Array<{ threadId: string; anchorKey?: string }> = [];
      const rootValue = {
        myahInboxContactEmailCard: (args: {
          threadId: string;
          anchorKey?: string;
        }) => {
          seen.push(args);
          return {
            snapshot: 'snapshot',
            card: {
              threadId: args.threadId,
              anchorKey: args.anchorKey ?? `legacy:${args.threadId}`,
              rootMessageId: args.threadId,
              startTimestamp: '2026-09-01T00:00:00.000001Z',
              historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
            },
          };
        },
        myahInboxContactEmailCardMessages: (args: {
          threadId: string;
          anchorKey?: string;
        }) => {
          seen.push(args);
          return {
            threadId: args.threadId,
            anchorKey: args.anchorKey ?? `legacy:${args.threadId}`,
            root: { id: args.threadId },
            messages: [],
          };
        },
      };
      const common = {
        contactId: 'contact',
        expectedWorkspaceId: workspaceId,
        threadId,
      };
      const oldCard = await graphql({
        schema,
        source: `query($contactId: String!, $expectedWorkspaceId: UUID!, $threadId: UUID!) {
          myahInboxContactEmailCard(contactId: $contactId, expectedWorkspaceId: $expectedWorkspaceId, threadId: $threadId) {
            card { threadId anchorKey rootMessageId historyBasis }
          }
        }`,
        variableValues: common,
        rootValue,
      });
      expect(oldCard.errors).toBeUndefined();
      expect(oldCard.data?.myahInboxContactEmailCard).toMatchObject({
        card: { anchorKey: `legacy:${threadId}`, rootMessageId: threadId },
      });
      const keyedCard = await graphql({
        schema,
        source: `query($contactId: String!, $expectedWorkspaceId: UUID!, $threadId: UUID!, $anchorKey: String) {
          myahInboxContactEmailCard(contactId: $contactId, expectedWorkspaceId: $expectedWorkspaceId, threadId: $threadId, anchorKey: $anchorKey) {
            card { threadId anchorKey rootMessageId }
          }
        }`,
        variableValues: { ...common, anchorKey: `attempt:${attemptId}` },
        rootValue,
      });
      expect(keyedCard.errors).toBeUndefined();
      expect(keyedCard.data?.myahInboxContactEmailCard).toMatchObject({
        card: { anchorKey: `attempt:${attemptId}` },
      });
      for (const anchorKey of [undefined, `attempt:${attemptId}`]) {
        const result = await graphql({
          schema,
          source: `query($contactId: String!, $expectedWorkspaceId: UUID!, $threadId: UUID!, $snapshot: String!${anchorKey ? ', $anchorKey: String' : ''}) {
            myahInboxContactEmailCardMessages(contactId: $contactId, expectedWorkspaceId: $expectedWorkspaceId, threadId: $threadId, snapshot: $snapshot${anchorKey ? ', anchorKey: $anchorKey' : ''}) {
              threadId anchorKey root { id }
            }
          }`,
          variableValues: { ...common, anchorKey, snapshot: 'snapshot' },
          rootValue,
        });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myahInboxContactEmailCardMessages).toMatchObject({
          anchorKey: anchorKey ?? `legacy:${threadId}`,
          root: { id: threadId },
        });
      }
      expect(seen.map(({ anchorKey }) => anchorKey)).toEqual([
        undefined,
        `attempt:${attemptId}`,
        undefined,
        `attempt:${attemptId}`,
      ]);
    } finally {
      await moduleRef.close();
    }
  });
});
