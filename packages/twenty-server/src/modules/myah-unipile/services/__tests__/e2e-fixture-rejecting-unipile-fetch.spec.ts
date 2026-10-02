import { e2eFixtureRejectingUnipileFetch } from 'src/modules/myah-unipile/services/e2e-fixture-rejecting-unipile-fetch';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

const createClient = (
  fixtureFetch: typeof fetch = e2eFixtureRejectingUnipileFetch,
) =>
  new UnipileV1ClientService(
    {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://example.invalid/api/v1/' },
    } as never,
    { get: jest.fn().mockReturnValue('synthetic-key') } as never,
    fixtureFetch,
  );

it('rejects startChat and sendMessage deterministically after beforeDispatch, without network or acceptance', async () => {
  const order: string[] = [];
  const fixtureFetch: typeof fetch = async (input, init) => {
    order.push('fetch');
    return e2eFixtureRejectingUnipileFetch(input, init);
  };
  const client = createClient(fixtureFetch);
  const beforeDispatch = jest.fn(async () => {
    order.push('beforeDispatch');
  });
  await expect(
    client.startChat(
      { accountId: 'account-1', attendeeId: 'person-1', text: 'synthetic' },
      { beforeDispatch },
    ),
  ).resolves.toMatchObject({ kind: 'KNOWN_REJECTION', status: 403 });
  await expect(
    client.sendMessage(
      { accountId: 'account-1', chatId: 'chat-1', text: 'synthetic' },
      { beforeDispatch },
    ),
  ).resolves.toMatchObject({ kind: 'KNOWN_REJECTION', status: 403 });
  expect(beforeDispatch).toHaveBeenCalledTimes(2);
  expect(order).toEqual(['beforeDispatch', 'fetch', 'beforeDispatch', 'fetch']);
});

it('rejects hosted-auth creation and account deletion locally without acceptance', async () => {
  const client = createClient();
  await expect(
    client.createHostedAuthLink({
      expiresOn: new Date('2026-01-01'),
      successRedirectUrl: 'https://example.invalid/ok',
      failureRedirectUrl: 'https://example.invalid/fail',
      notifyUrl: 'https://example.invalid/notify',
      name: 'synthetic',
    }),
  ).rejects.toThrow('Unable to create an Instagram Hosted Auth link');
  const beforeDispatch = jest.fn().mockResolvedValue(undefined);
  await expect(
    client.deleteAccount('account-1', { beforeDispatch }),
  ).resolves.toMatchObject({ kind: 'KNOWN_REJECTION', status: 403 });
  expect(beforeDispatch).toHaveBeenCalledTimes(1);
});

it('never consults global fetch and rejects unmatched reads locally', async () => {
  const globalFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('global fetch must not be called');
  });
  try {
    await expect(
      e2eFixtureRejectingUnipileFetch('https://example.invalid/api/v1/chats', {
        method: 'GET',
      }),
    ).rejects.toThrow('E2E fixtures never contact Unipile');
    await expect(
      e2eFixtureRejectingUnipileFetch('https://example.invalid/api/v1/other', {
        method: 'PATCH',
      }),
    ).rejects.toThrow('E2E fixtures never contact Unipile');
    await expect(
      e2eFixtureRejectingUnipileFetch('https://example.invalid/api/v1/other', {
        method: 'POST',
      }),
    ).rejects.toThrow('E2E fixtures never contact Unipile');
    expect(globalFetch).not.toHaveBeenCalled();
  } finally {
    globalFetch.mockRestore();
  }
});
