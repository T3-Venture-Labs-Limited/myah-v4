import { InboundEmailImportService } from 'src/modules/messaging/message-import-manager/drivers/inbound-email/services/inbound-email-import.service';

describe('InboundEmailImportService', () => {
  it('persists inbound email with a stable LIVE source generation', async () => {
    const saveMessagesAndEnqueueContactCreation = jest
      .fn()
      .mockResolvedValue(undefined);
    const service = new InboundEmailImportService(
      { isConfigured: () => true, getDomain: () => 'reply.test' } as never,
      {
        getRawMessage: jest.fn().mockResolvedValue(Buffer.from('raw')),
        deleteRawMessage: jest.fn(),
      } as never,
      {
        parse: jest
          .fn()
          .mockResolvedValue({ message: { externalId: 'message-id' } }),
      } as never,
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((callback) => callback()),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'channel-id',
          workspaceId: 'workspace-id',
          connectedAccountId: 'account-id',
        }),
      } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'account-id' }) } as never,
    );

    await service.importInboundMessage({
      s3Key: 'mail/key',
      envelopeRecipients: ['team@reply.test'],
    });

    expect(saveMessagesAndEnqueueContactCreation).toHaveBeenCalledWith(
      [{ externalId: 'message-id' }],
      expect.objectContaining({ id: 'channel-id' }),
      expect.objectContaining({ id: 'account-id' }),
      'workspace-id',
      { mode: 'LIVE', generationId: 'inbound-email:mail/key' },
    );
  });
});
