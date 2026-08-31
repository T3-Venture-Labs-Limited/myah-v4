import { MessageParticipantRole } from 'twenty-shared/types';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

describe('SentMessagePersistenceService', () => {
  it('persists an approved alias as the sending connected-account identity', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const messageChannelId = '00000000-0000-4000-8000-000000000102';
    const primaryAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      handle: 'primary@brand.com',
    };
    const approvedAliasAccount = {
      ...primaryAccount,
      handle: 'brand-alias@brand.com',
    } as ConnectedAccountEntity;
    const messageChannelRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: messageChannelId,
        workspaceId,
        connectedAccount: primaryAccount,
      }),
    };
    const saveMessagesAndEnqueueContactCreation = jest.fn().mockResolvedValue({
      messageExternalIdsAndIdsMap: new Map([['provider-message-id', 'message-id']]),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['provider-message-id', 'message-thread-id'],
      ]),
    });
    const service = new SentMessagePersistenceService(
      messageChannelRepository as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await expect(
      service.persistSentMessage({
        sendResult: {
          headerMessageId: '<sent@example.com>',
          messageExternalId: 'provider-message-id',
        },
        subject: '',
        body: 'Thanks for the update',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount: approvedAliasAccount,
        messageChannelId,
        inReplyTo: '<incoming@example.com>',
        workspaceId,
      }),
    ).resolves.toEqual({
      messageId: 'message-id',
      messageThreadId: 'message-thread-id',
    });

    expect(saveMessagesAndEnqueueContactCreation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          subject: '',
          participants: expect.arrayContaining([
            expect.objectContaining({
              role: MessageParticipantRole.FROM,
              handle: 'brand-alias@brand.com',
            }),
          ]),
        }),
      ],
      expect.objectContaining({ id: messageChannelId }),
      approvedAliasAccount,
      workspaceId,
    );
  });
});
