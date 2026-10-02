import { ImapGetMessagesService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-get-messages.service';

describe('ImapGetMessagesService', () => {
  const createService = (inReplyTo?: string) => {
    const client = {};
    const imapClientProvider = {
      getClient: jest.fn().mockResolvedValue(client),
      closeClient: jest.fn(),
    };
    const messageParser = {
      parseMessagesFromFolder: jest.fn().mockResolvedValue({
        uidValidity: BigInt(1),
        messages: [
          {
            uid: 42,
            parsed: {
              from: [{ address: 'creator@example.com' }],
              messageId: '<reply@example.com>',
              inReplyTo,
              references: inReplyTo,
              text: 'reply',
            },
          },
        ],
      }),
    };
    const service = new ImapGetMessagesService(
      imapClientProvider as never,
      messageParser as never,
      { handleError: jest.fn() } as never,
    );

    return { service, imapClientProvider };
  };

  it.each([
    { header: undefined, expected: [] },
    { header: ' <parent@example.com> ', expected: ['<parent@example.com>'] },
    {
      header: ' <parent-one@example.com>\t<parent-two@example.com> ',
      expected: ['<parent-one@example.com>', '<parent-two@example.com>'],
    },
  ])(
    'preserves every complete normalized In-Reply-To token',
    async ({ header, expected }) => {
      const { service, imapClientProvider } = createService(header);

      const [message] = await service.getMessages(['INBOX:42'], {
        id: 'account-id',
        handle: 'inbox@example.com',
        handleAliases: [],
      });

      expect(
        (message as unknown as { inReplyToTokens?: string[] }).inReplyToTokens,
      ).toEqual(expected);
      expect(imapClientProvider.closeClient).toHaveBeenCalledTimes(1);
    },
  );
});
