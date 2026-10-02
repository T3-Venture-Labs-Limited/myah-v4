import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { isInputObjectType, isObjectType } from 'graphql';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxInstagramMessageResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-instagram-message.resolver';
import { MyahInboxContactResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-contact.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspace = { id: '00000000-0000-4000-8000-000000000001' };
const workspaceMemberId = '00000000-0000-4000-8000-000000000002';
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceMemberId,
  user: { id: 'user-id' },
  workspaceMember: { id: workspaceMemberId },
};

describe('MyahInboxInstagramMessageResolver', () => {
  it('generates the real reaction GraphQL fields and versioned mutation input', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    try {
      const schema = await moduleRef
        .get(GraphQLSchemaFactory)
        .create([MyahInboxInstagramMessageResolver, MyahInboxContactResolver]);
      const message = schema.getType('MyahInboxInstagramMessage');
      const instagram = schema.getType(
        'MyahInboxContactInstagramChannelSummary',
      );
      const input = schema.getType(
        'AcknowledgeMyahInboxInstagramReactionInput',
      );
      expect(isObjectType(message)).toBe(true);
      expect(isObjectType(instagram)).toBe(true);
      expect(isInputObjectType(input)).toBe(true);
      if (
        !isObjectType(message) ||
        !isObjectType(instagram) ||
        !isInputObjectType(input)
      )
        return;
      expect(Object.keys(message.getFields())).toEqual(
        expect.arrayContaining([
          'reactionEmoji',
          'reactionVersion',
          'reactionActorLabel',
        ]),
      );
      expect(instagram.getFields()).toHaveProperty('reactionNeedsAttention');
      expect(Object.keys(input.getFields())).toEqual(
        expect.arrayContaining([
          'expectedWorkspaceId',
          'conversationId',
          'messageId',
          'version',
        ]),
      );
      expect(schema.getMutationType()?.getFields()).toHaveProperty(
        'acknowledgeMyahInboxInstagramReaction',
      );
    } finally {
      await moduleRef.close();
    }
  });
  beforeEach(() => {
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);
  });

  it('passes only authenticated workspace-scoped input to the native message query', async () => {
    const listMessages = jest.fn().mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const resolver = new MyahInboxInstagramMessageResolver({
      listMessages,
    } as never);
    const input = {
      conversationId: '00000000-0000-4000-8000-000000000004',
      first: 100,
      after: 'cursor',
    };

    await expect(
      resolver.myahInboxInstagramMessages(
        input,
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(listMessages).toHaveBeenCalledWith({
      ...input,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
    });
  });

  it('guards reaction acknowledgement by the authenticated workspace and user', async () => {
    const acknowledgeReaction = jest.fn().mockResolvedValue(true);
    const resolver = new MyahInboxInstagramMessageResolver({
      acknowledgeReaction,
    } as never);
    const input = {
      expectedWorkspaceId: workspace.id,
      conversationId: '00000000-0000-4000-8000-000000000004',
      messageId: '00000000-0000-4000-8000-000000000005',
      version: 'a'.repeat(64),
    };
    await expect(
      resolver.acknowledgeMyahInboxInstagramReaction(input, workspace as never),
    ).resolves.toBe(true);
    expect(acknowledgeReaction).toHaveBeenCalledWith({
      ...input,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
    });

    await expect(
      resolver.acknowledgeMyahInboxInstagramReaction(
        {
          ...input,
          expectedWorkspaceId: '00000000-0000-4000-8000-000000000006',
        },
        workspace as never,
      ),
    ).rejects.toThrow();
    expect(acknowledgeReaction).toHaveBeenCalledTimes(1);
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue({ type: 'system', workspace } as never);
    await expect(
      resolver.acknowledgeMyahInboxInstagramReaction(input, workspace as never),
    ).rejects.toThrow(ForbiddenException);
    expect(acknowledgeReaction).toHaveBeenCalledTimes(1);
  });

  it('fails closed outside user auth even when directly invoked', async () => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      type: 'system',
      workspace,
    } as never);
    const listMessages = jest.fn();
    const resolver = new MyahInboxInstagramMessageResolver({
      listMessages,
    } as never);

    await expect(
      resolver.myahInboxInstagramMessages(
        { conversationId: '00000000-0000-4000-8000-000000000004' },
        workspace as never,
        workspaceMemberId,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(listMessages).not.toHaveBeenCalled();
  });
});
