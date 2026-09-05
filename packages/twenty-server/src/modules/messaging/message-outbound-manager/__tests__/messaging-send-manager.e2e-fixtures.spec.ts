jest.mock('dotenv', () => ({ config: jest.fn() }));

const loadGmailProvider = (
  nodeEnv: string,
  fixtureFlag: string | undefined,
) => {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  if (fixtureFlag === undefined) {
    delete process.env.E2E_TEST_FIXTURES;
  } else {
    process.env.E2E_TEST_FIXTURES = fixtureFlag;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    MessagingSendManagerModule,
  } = require('src/modules/messaging/message-outbound-manager/messaging-send-manager.module');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    GmailMessageOutboundService,
  } = require('src/modules/messaging/message-outbound-manager/drivers/gmail/services/gmail-message-outbound.service');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    E2eFixtureGmailMessageOutboundService,
  } = require('src/modules/messaging/message-outbound-manager/drivers/gmail/services/e2e-fixture-gmail-message-outbound.service');

  const gmailProvider = (
    Reflect.getMetadata('providers', MessagingSendManagerModule) as unknown[]
  ).find(
    (provider) =>
      typeof provider === 'object' &&
      provider !== null &&
      'provide' in provider &&
      provider.provide === GmailMessageOutboundService,
  );

  return { gmailProvider, E2eFixtureGmailMessageOutboundService };
};

describe('MessagingSendManagerModule E2E fixture provider', () => {
  const nodeEnv = process.env.NODE_ENV;
  const fixtureFlag = process.env.E2E_TEST_FIXTURES;

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    if (fixtureFlag === undefined) {
      delete process.env.E2E_TEST_FIXTURES;
    } else {
      process.env.E2E_TEST_FIXTURES = fixtureFlag;
    }
  });

  it('replaces Gmail only for the isolated E2E fixture process', () => {
    expect(
      loadGmailProvider('production', 'true').gmailProvider,
    ).toBeUndefined();
    expect(
      loadGmailProvider('development', undefined).gmailProvider,
    ).toBeUndefined();
    const fixtureProvider = loadGmailProvider('development', 'true');

    expect(fixtureProvider.gmailProvider).toMatchObject({
      useClass: fixtureProvider.E2eFixtureGmailMessageOutboundService,
    });
  });
});
