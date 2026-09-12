import {
  MessageChannelType,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

describe('SentMessagePersistenceService', () => {
  it('persists the channel alias with its canonical connected account', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const messageChannelId = '00000000-0000-4000-8000-000000000102';
    const primaryAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'primary@brand.com',
      handleAliases: ['brand-alias@brand.com'],
    } as ConnectedAccountEntity;
    const messageChannelRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: messageChannelId,
        workspaceId,
        connectedAccountId: primaryAccount.id,
        handle: 'brand-alias@brand.com',
        connectedAccount: primaryAccount,
      }),
    };
    const saveMessagesAndEnqueueContactCreation = jest.fn().mockResolvedValue({
      messageExternalIdsAndIdsMap: new Map([
        ['provider-message-id', '00000000-0000-4000-8000-000000000104'],
      ]),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['provider-message-id', 'message-thread-id'],
      ]),
    });
    const service = new SentMessagePersistenceService(
      messageChannelRepository as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );
    const providerAcceptedAt = new Date('2026-09-11T10:00:00.000Z');
    const expectedMessageId = '00000000-0000-4000-8000-000000000104';

    await expect(
      service.persistSentMessage({
        sendResult: {
          headerMessageId: '<sent@example.com>',
          messageExternalId: 'provider-message-id',
        },
        subject: '',
        body: 'Thanks for the update',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount: primaryAccount,
        messageChannelId,
        inReplyTo: '<incoming@example.com>',
        workspaceId,
        expectedMessageId,
        providerAcceptedAt,
      }),
    ).resolves.toEqual({
      messageId: '00000000-0000-4000-8000-000000000104',
      messageThreadId: 'message-thread-id',
    });

    expect(saveMessagesAndEnqueueContactCreation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          subject: '',
          expectedMessageId,
          receivedAt: providerAcceptedAt,
          participants: expect.arrayContaining([
            expect.objectContaining({
              role: MessageParticipantRole.FROM,
              handle: 'brand-alias@brand.com',
            }),
          ]),
        }),
      ],
      expect.objectContaining({ id: messageChannelId }),
      primaryAccount,
      workspaceId,
      undefined,
    );
  });

  it('rejects a deterministic Message collision returned by the canonical save chain', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const connectedAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'sender@brand.com',
      handleAliases: [],
    } as unknown as ConnectedAccountEntity;
    const saveMessagesAndEnqueueContactCreation = jest
      .fn()
      .mockRejectedValue(
        new Error('Expected Message identity conflicts with header identity'),
      );
    const service = new SentMessagePersistenceService(
      {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000102',
          workspaceId,
          connectedAccountId: connectedAccount.id,
          handle: connectedAccount.handle,
          connectedAccount,
        }),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await expect(
      service.persistSentMessage({
        sendResult: {
          headerMessageId: '<sent@example.com>',
          messageExternalId: 'provider-message-id',
        },
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount,
        messageChannelId: '00000000-0000-4000-8000-000000000102',
        workspaceId,
        expectedMessageId: '00000000-0000-4000-8000-000000000104',
        providerAcceptedAt: new Date('2026-09-11T10:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'Expected Message identity conflicts with header identity',
    );
  });

  it('rejects a connected account that does not own the workspace channel', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const canonicalAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'primary@brand.com',
    } as ConnectedAccountEntity;
    const saveMessagesAndEnqueueContactCreation = jest.fn();
    const service = new SentMessagePersistenceService(
      {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000102',
          workspaceId,
          connectedAccountId: canonicalAccount.id,
          handle: canonicalAccount.handle,
          connectedAccount: canonicalAccount,
        }),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await expect(
      service.persistSentMessage({
        sendResult: { headerMessageId: '<sent@example.com>' },
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount: {
          ...canonicalAccount,
          id: '00000000-0000-4000-8000-000000000104',
        },
        messageChannelId: '00000000-0000-4000-8000-000000000102',
        workspaceId,
      }),
    ).rejects.toThrow('Connected account does not own the message channel');
    expect(saveMessagesAndEnqueueContactCreation).not.toHaveBeenCalled();
  });

  it('persists the public Email Group handle instead of its forwarding address', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const connectedAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'team@brand.com',
      handleAliases: [],
    } as unknown as ConnectedAccountEntity;
    const saveMessagesAndEnqueueContactCreation = jest.fn().mockResolvedValue({
      messageExternalIdsAndIdsMap: new Map([
        ['<sent@example.com>', 'message-id'],
      ]),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['<sent@example.com>', 'message-thread-id'],
      ]),
    });
    const service = new SentMessagePersistenceService(
      {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000102',
          workspaceId,
          connectedAccountId: connectedAccount.id,
          handle: 'myah-inbound-123@reply.brand.test',
          type: MessageChannelType.EMAIL_GROUP,
          connectedAccount,
        }),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await service.persistSentMessage({
      sendResult: { headerMessageId: '<sent@example.com>' },
      subject: 'Re: Subject',
      body: 'Body',
      recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
      connectedAccount,
      messageChannelId: '00000000-0000-4000-8000-000000000102',
      workspaceId,
    });

    expect(saveMessagesAndEnqueueContactCreation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({
              role: MessageParticipantRole.FROM,
              handle: 'team@brand.com',
            }),
          ]),
        }),
      ],
      expect.anything(),
      connectedAccount,
      workspaceId,
      undefined,
    );
  });
});
