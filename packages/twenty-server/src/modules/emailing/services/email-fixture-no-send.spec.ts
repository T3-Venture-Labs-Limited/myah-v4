import { CAMPAIGN_MESSAGE_DELIVERY_STATUS } from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import { EmailingDomainDriverFactory } from 'src/engine/core-modules/emailing-domain/drivers/emailing-domain-driver.factory';
import { EmailingDomainDriver } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-driver.type';
import { EmailingDomainStatus } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-status.type';
import { EmailingDomainTenantStatus } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-tenant-status.type';
import { EmailingSendResolver } from 'src/modules/emailing/resolvers/emailing-send.resolver';
import { EmailingDomainSenderService } from 'src/modules/emailing/services/emailing-domain-sender.service';
import { MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';

const originalEnv = process.env.NODE_ENV;
const originalFlag = process.env.E2E_TEST_FIXTURES;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalFlag === undefined) delete process.env.E2E_TEST_FIXTURES;
  else process.env.E2E_TEST_FIXTURES = originalFlag;
});

const setup = () => {
  process.env.NODE_ENV = 'test';
  process.env.E2E_TEST_FIXTURES = 'true';
  const domain = {
    id: 'domain-1',
    domain: 'example.test',
    status: EmailingDomainStatus.VERIFIED,
    tenantStatus: EmailingDomainTenantStatus.ACTIVE,
  };
  const logDriver = {
    sendEmail: jest.fn().mockResolvedValue({
      messageId: 'fake-success',
      deliveredRecipients: {
        to: ['recipient@example.test'],
        cc: [],
        bcc: [],
      },
    }),
  };
  const factory = new EmailingDomainDriverFactory(
    { get: jest.fn().mockReturnValue(EmailingDomainDriver.AWS_SES) } as never,
    { computeHash: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    logDriver as never,
    {} as never,
  );
  const sender = new EmailingDomainSenderService(
    { findOne: jest.fn().mockResolvedValue(domain) } as never,
    factory,
    { getSuppressedAddresses: jest.fn().mockResolvedValue(new Set()) } as never,
    { findOne: jest.fn().mockResolvedValue(null) } as never,
  );
  const billing = {
    validateEmailCreditsOrThrow: jest.fn().mockResolvedValue(undefined),
    hasEmailCredits: jest.fn().mockResolvedValue(true),
    billSentEmails: jest.fn(),
  };
  return { sender, billing, logDriver };
};

it('cannot bill a direct email-domain send as delivered by a local fixture', async () => {
  const { sender, billing, logDriver } = setup();
  const resolver = new EmailingSendResolver(
    sender,
    {} as never,
    { validateEmailGroupAccessOrThrow: jest.fn() } as never,
    billing as never,
  );
  await expect(
    resolver.sendEmailViaEmailingDomain(
      {
        emailingDomainId: 'domain-1',
        from: 'sender@example.test',
        to: ['recipient@example.test'],
        subject: 'Synthetic',
        text: 'Synthetic',
      } as never,
      { id: 'workspace-1' } as never,
    ),
  ).rejects.toThrow('E2E fixtures never send emailing-domain messages');
  expect(logDriver.sendEmail).not.toHaveBeenCalled();
  expect(billing.billSentEmails).not.toHaveBeenCalled();
});

it('cannot mark a campaign message SENT or bill after fixture rejection', async () => {
  const { sender, billing, logDriver } = setup();
  const messageRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'message-1',
      deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.QUEUED,
    }),
    update: jest.fn(),
    count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
  };
  const campaignRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'campaign-1',
      subject: 'Synthetic',
      bodyTemplate: 'Hi',
      fromAddress: { primaryEmail: 'sender@example.test' },
    }),
    update: jest.fn(),
  };
  const orm = {
    executeInWorkspaceContext: jest.fn((callback: () => Promise<void>) =>
      callback(),
    ),
    getRepository: jest.fn((_workspaceId: string, entity: { name: string }) => {
      if (entity.name === 'MessageWorkspaceEntity') return messageRepository;
      if (entity.name === 'MessageCampaignWorkspaceEntity')
        return campaignRepository;
      return { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
    }),
  };
  const campaign = new MessageCampaignService(
    {} as never,
    sender,
    orm as never,
    {} as never,
    {} as never,
    {} as never,
    billing as never,
  );
  await campaign.processSendJob({
    workspaceId: 'workspace-1',
    campaignId: 'campaign-1',
    messageId: 'message-1',
    personId: 'person-1',
    recipientEmail: 'recipient@example.test',
    emailingDomainId: 'domain-1',
  });
  expect(messageRepository.update).toHaveBeenCalledWith('message-1', {
    deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.FAILED,
  });
  expect(messageRepository.update).not.toHaveBeenCalledWith(
    'message-1',
    expect.objectContaining({
      deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.SENT,
    }),
  );
  expect(logDriver.sendEmail).not.toHaveBeenCalled();
  expect(billing.billSentEmails).not.toHaveBeenCalled();
});
