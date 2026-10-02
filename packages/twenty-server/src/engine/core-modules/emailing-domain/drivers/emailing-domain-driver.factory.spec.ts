import { EmailingDomainDriverFactory } from 'src/engine/core-modules/emailing-domain/drivers/emailing-domain-driver.factory';
import { EmailingDomainDriver } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-driver.type';

const originalEnv = process.env.NODE_ENV;
const originalFlag = process.env.E2E_TEST_FIXTURES;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalFlag === undefined) delete process.env.E2E_TEST_FIXTURES;
  else process.env.E2E_TEST_FIXTURES = originalFlag;
});

it.each([EmailingDomainDriver.AWS_SES, EmailingDomainDriver.LOG])(
  'rejects sends for direct %s factory callers in fixture mode',
  async (configuredDriver) => {
    process.env.NODE_ENV = 'test';
    process.env.E2E_TEST_FIXTURES = 'true';
    const config = {
      get: jest.fn().mockReturnValue(configuredDriver),
    };
    const hash = { computeHash: jest.fn() };
    const logDriver = {
      sendEmail: jest.fn(),
      verifyDomain: jest
        .fn()
        .mockResolvedValue({ status: 'VERIFIED', verificationRecords: [] }),
    };
    const factory = new EmailingDomainDriverFactory(
      config as never,
      hash as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      logDriver as never,
      {} as never,
    );
    const driver = factory.getCurrentDriver();
    expect(driver).not.toBe(logDriver);
    await expect(driver.sendEmail({} as never)).rejects.toThrow(
      'E2E fixtures never send emailing-domain messages',
    );
    expect(logDriver.sendEmail).not.toHaveBeenCalled();
    await expect(
      driver.verifyDomain({
        domain: 'example.test',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({ status: 'VERIFIED' });
    expect(logDriver.verifyDomain).toHaveBeenCalledTimes(1);
    expect(hash.computeHash).not.toHaveBeenCalled();
    expect(config.get).not.toHaveBeenCalledWith('AWS_SES_SECRET_ACCESS_KEY');
  },
);

it('retains the SES driver when fixtures are absent', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.E2E_TEST_FIXTURES;
  const config = {
    get: jest.fn((key: string) =>
      key === 'EMAILING_DOMAIN_DRIVER'
        ? EmailingDomainDriver.AWS_SES
        : 'synthetic',
    ),
  };
  const hash = { computeHash: jest.fn().mockReturnValue('synthetic-hash') };
  const factory = new EmailingDomainDriverFactory(
    config as never,
    hash as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  expect(factory.getCurrentDriver().constructor.name).toBe('AwsSesDriver');
  expect(hash.computeHash).toHaveBeenCalledTimes(1);
});

it('does not replace unsupported drivers with a log driver', () => {
  process.env.NODE_ENV = 'test';
  process.env.E2E_TEST_FIXTURES = 'true';
  const factory = new EmailingDomainDriverFactory(
    { get: () => 'unknown' } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  expect(() => factory.getCurrentDriver()).toThrow(
    'Unsupported emailing domain driver',
  );
});
