import { classifyMessageOutboundError } from 'src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util';

jest.mock('dotenv', () => ({ config: jest.fn() }));

const originalEnv = process.env.NODE_ENV;
const originalFlag = process.env.E2E_TEST_FIXTURES;

const loadProviders = (environment: string, flag?: string) => {
  jest.resetModules();
  process.env.NODE_ENV = environment;
  if (flag === undefined) delete process.env.E2E_TEST_FIXTURES;
  else process.env.E2E_TEST_FIXTURES = flag;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    MessagingSendManagerModule,
  } = require('src/modules/messaging/message-outbound-manager/messaging-send-manager.module');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    MyahUnipileModule,
  } = require('src/modules/myah-unipile/myah-unipile.module');
  return {
    messaging: Reflect.getMetadata(
      'providers',
      MessagingSendManagerModule,
    ) as unknown[],
    unipile: Reflect.getMetadata('providers', MyahUnipileModule) as unknown[],
  };
};

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalFlag === undefined) delete process.env.E2E_TEST_FIXTURES;
  else process.env.E2E_TEST_FIXTURES = originalFlag;
});

it.each(['development', 'test'])(
  'rejects all outbound providers with fixture enabled in %s',
  async (environment) => {
    const { messaging, unipile } = loadProviders(environment, 'true');
    for (const name of [
      'MicrosoftMessageOutboundService',
      'ImapSmtpMessageOutboundService',
      'EmailGroupMessageOutboundService',
    ]) {
      const provider = messaging.find(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          'provide' in entry &&
          (entry.provide as { name?: string }).name === name,
      ) as
        | {
            useClass: new () => {
              assertSendable: (account: unknown) => Promise<void>;
              sendMessage: (
                message: unknown,
                account: unknown,
              ) => Promise<unknown>;
              createDraft: (
                message: unknown,
                account: unknown,
              ) => Promise<unknown>;
              sendDraft: (
                id: string,
                message: unknown,
                account: unknown,
              ) => Promise<unknown>;
              deleteDraft: (id: string, account: unknown) => Promise<void>;
            };
          }
        | undefined;
      expect(provider?.useClass.name).toBe(
        'E2eFixtureRejectingMessageOutboundService',
      );
      const driver = new provider!.useClass();
      await expect(driver.assertSendable({})).rejects.toThrow(
        'E2E fixtures never contact outbound email providers',
      );
      await expect(driver.sendMessage({}, {})).rejects.toMatchObject({
        message: 'E2E fixtures never contact outbound email providers',
        responseCode: 403,
      });
      try {
        await driver.sendMessage({}, {});
      } catch (error) {
        expect(classifyMessageOutboundError(error)).toEqual({
          kind: 'rejected',
          code: 'provider_rejected',
        });
      }
      await expect(driver.createDraft({}, {})).rejects.toThrow(
        'E2E fixtures never contact outbound email providers',
      );
      await expect(driver.sendDraft('draft', {}, {})).rejects.toThrow(
        'E2E fixtures never contact outbound email providers',
      );
      await expect(driver.deleteDraft('draft', {})).rejects.toThrow(
        'E2E fixtures never contact outbound email providers',
      );
    }
    const fetchProvider = unipile.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'provide' in entry &&
        (entry.provide as { description?: string }).description ===
          'UNIPILE_FETCH',
    ) as { useValue: typeof fetch };
    await expect(
      fetchProvider.useValue('https://example.invalid'),
    ).rejects.toThrow('E2E fixtures never contact Unipile');
  },
);

it.each(['production', 'staging'])(
  'refuses explicit fixture opt-in in %s instead of selecting live providers',
  (environment) => {
    expect(() => loadProviders(environment, 'true')).toThrow(
      'E2E_TEST_FIXTURES cannot be enabled',
    );
  },
);

it('uses real providers when the fixture flag is absent', () => {
  const { messaging, unipile } = loadProviders('production');
  for (const name of [
    'MicrosoftMessageOutboundService',
    'ImapSmtpMessageOutboundService',
    'EmailGroupMessageOutboundService',
  ]) {
    expect(
      messaging.some(
        (provider) => typeof provider === 'function' && provider.name === name,
      ),
    ).toBe(true);
  }
  expect(
    unipile.some(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        (provider.provide as { description?: string }).description ===
          'UNIPILE_FETCH' &&
        'useValue' in provider &&
        provider.useValue === globalThis.fetch,
    ),
  ).toBe(true);
});
