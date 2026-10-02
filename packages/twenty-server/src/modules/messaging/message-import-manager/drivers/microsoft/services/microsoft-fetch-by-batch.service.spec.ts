import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type MicrosoftOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/microsoft/microsoft-oauth2-client.provider';
import { MicrosoftFetchByBatchService } from 'src/modules/messaging/message-import-manager/drivers/microsoft/services/microsoft-fetch-by-batch.service';

describe('Microsoft message batch fetch', () => {
  it('requests reply headers alongside the fields needed by the importer', async () => {
    const post = jest.fn().mockResolvedValue({ responses: [] });
    const provider = {
      getClient: jest.fn().mockResolvedValue({
        api: jest.fn().mockReturnValue({ post }),
      }),
    } as unknown as MicrosoftOAuth2ClientProvider;
    const service = new MicrosoftFetchByBatchService(provider);

    await service.fetchAllByBatches(['message-id'], {
      id: 'account-id',
      provider: ConnectedAccountProvider.MICROSOFT,
    });

    const url = post.mock.calls[0][0].requests[0].url as string;
    const fields = new URL(url, 'https://graph.microsoft.com').searchParams
      .get('$select')
      ?.split(',');

    expect(fields).toEqual(
      expect.arrayContaining([
        'internetMessageHeaders',
        'internetMessageId',
        'conversationId',
        'body',
        'from',
        'toRecipients',
        'ccRecipients',
        'bccRecipients',
        'replyTo',
        'receivedDateTime',
        'parentFolderId',
        'isDraft',
      ]),
    );
  });
});
