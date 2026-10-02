import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { getNamedType, isInputObjectType } from 'graphql';

import { SendEmailResolver } from 'src/modules/messaging/message-outbound-manager/resolvers/send-email.resolver';
import { type SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const channelId = '00000000-0000-4000-8000-000000000003';
const creatorId = '00000000-0000-4000-8000-000000000004';
const accountId = '00000000-0000-4000-8000-000000000005';
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId,
};

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: jest.fn(() => authContext),
  }),
);

const makeHarness = (messageChannelId: string | null = channelId) => {
  const events: string[] = [];
  const compose = jest.fn().mockResolvedValue({
    success: true,
    data: {
      recipients: { to: ['creator@example.test'], cc: [], bcc: [] },
      connectedAccount: { id: accountId, handle: 'sender@example.test' },
      messageChannelId: messageChannelId ?? undefined,
      shouldPersistMessage: Boolean(messageChannelId),
    },
  });
  const verifyCreatorOrigin = jest.fn().mockResolvedValue(creatorId);
  const recordAcceptedSend = jest.fn().mockImplementation(async () => {
    events.push('receipt');
    return 'receipt-id';
  });
  const bindThreadCreator = jest.fn().mockResolvedValue(undefined);
  const sendComposedEmail = jest.fn().mockImplementation(async () => {
    events.push('provider');
    return {
      headerMessageId: '<sent@example.test>',
      threadExternalId: 'provider-thread',
    };
  });
  const persistSentMessage = jest.fn().mockImplementation(async () => {
    events.push('persist');
    return { messageId: 'message-id', messageThreadId: 'thread-id' };
  });
  const resolver = new SendEmailResolver(
    {
      verifyOwnership: jest.fn().mockResolvedValue({ id: accountId }),
    } as never,
    { composeEmail: compose } as never,
    { deleteFiles: jest.fn() } as never,
    {
      sendComposedEmail,
      sendComposedDraft: jest.fn(),
      persistSentMessage,
      deleteSentDraft: jest.fn(),
      getSentMessageThreadId: jest.fn(),
    } as never,
    { verifyCreatorOrigin, recordAcceptedSend, bindThreadCreator } as never,
  );
  const input = {
    connectedAccountId: accountId,
    to: 'creator@example.test',
    subject: 'Hi',
    body: 'Hello',
    creatorId,
  } as SendEmailInput;
  const send = () =>
    resolver.sendEmail(input, { id: workspaceId } as never, userWorkspaceId);

  return {
    events,
    compose,
    verifyCreatorOrigin,
    recordAcceptedSend,
    bindThreadCreator,
    sendComposedEmail,
    persistSentMessage,
    send,
  };
};

describe('SendEmailResolver Compose receipt', () => {
  it('exposes the optional Creator origin on the real metadata GraphQL input', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    try {
      const schema = await moduleRef
        .get(GraphQLSchemaFactory)
        .create([SendEmailResolver], { skipCheck: true });
      const input = getNamedType(
        schema.getMutationType()!.getFields().sendEmail.args[0].type,
      );
      expect(isInputObjectType(input)).toBe(true);
      if (!isInputObjectType(input)) return;
      expect(String(input.getFields().creatorId.type)).toBe('String');
    } finally {
      await moduleRef.close();
    }
  });

  it('records the provider result before sent-message persistence and binds the persisted thread', async () => {
    const {
      send,
      events,
      verifyCreatorOrigin,
      recordAcceptedSend,
      bindThreadCreator,
    } = makeHarness();

    expect(await send()).toEqual(expect.objectContaining({ success: true }));
    expect(events).toEqual(['provider', 'receipt', 'persist']);
    expect(verifyCreatorOrigin).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId,
        to: ['creator@example.test'],
      }),
    );
    expect(recordAcceptedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        messageChannelId: channelId,
        creatorId,
        providerHeaderMessageId: '<sent@example.test>',
        resolvedThreadExternalId: 'provider-thread',
      }),
    );
    expect(bindThreadCreator).toHaveBeenCalledWith(
      workspaceId,
      'thread-id',
      creatorId,
    );
  });

  it('reports sent when local sent-message persistence fails after the receipt', async () => {
    const harness = makeHarness();
    harness.persistSentMessage.mockImplementationOnce(async () => {
      harness.events.push('persist');
      throw new Error('local persistence failed');
    });

    expect(await harness.send()).toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(harness.events).toEqual(['provider', 'receipt', 'persist']);
    expect(harness.bindThreadCreator).not.toHaveBeenCalled();
  });

  it('reports sent without retrying the provider when the receipt write fails', async () => {
    const harness = makeHarness();
    harness.recordAcceptedSend.mockRejectedValueOnce(
      new Error('receipt failed'),
    );

    expect(await harness.send()).toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(harness.sendComposedEmail).toHaveBeenCalledTimes(1);
    expect(harness.persistSentMessage).toHaveBeenCalledTimes(1);
  });

  it('does not record a receipt if the provider rejects the send', async () => {
    const harness = makeHarness();
    harness.sendComposedEmail.mockRejectedValueOnce(
      new Error('provider rejected'),
    );

    expect(await harness.send()).toEqual(
      expect.objectContaining({ success: false }),
    );
    expect(harness.recordAcceptedSend).not.toHaveBeenCalled();
  });

  it('does not record a receipt for SMTP-only sends without a channel', async () => {
    const harness = makeHarness(null);

    expect(await harness.send()).toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(harness.recordAcceptedSend).not.toHaveBeenCalled();
  });

  it('still sends for an application context, recording no Creator origin', async () => {
    const storage = jest.requireMock(
      'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
    ) as { getWorkspaceAuthContext: jest.Mock };
    const applicationContext = {
      type: 'application',
      workspace: { id: workspaceId },
      application: { id: 'app' },
      userWorkspaceId,
    };
    storage.getWorkspaceAuthContext.mockReturnValueOnce(applicationContext);
    const harness = makeHarness();

    expect(await harness.send()).toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(harness.sendComposedEmail).toHaveBeenCalledTimes(1);
    expect(harness.verifyCreatorOrigin).not.toHaveBeenCalled();
    expect(harness.recordAcceptedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: null,
        authContext: applicationContext,
      }),
    );
    expect(harness.bindThreadCreator).not.toHaveBeenCalled();
  });

  it('reports sent when binding fails without retrying the provider', async () => {
    const harness = makeHarness();
    harness.bindThreadCreator.mockRejectedValueOnce(new Error('bind failed'));

    expect(await harness.send()).toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(harness.sendComposedEmail).toHaveBeenCalledTimes(1);
  });
});
