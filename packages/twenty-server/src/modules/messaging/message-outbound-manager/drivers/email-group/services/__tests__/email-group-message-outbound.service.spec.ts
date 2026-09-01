import { EmailingDomainStatus } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-status.type';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { EmailGroupMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/email-group/services/email-group-message-outbound.service';

describe('EmailGroupMessageOutboundService', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000101';
  const connectedAccount = {
    id: '00000000-0000-4000-8000-000000000102',
    workspaceId,
    handle: 'team@brand.com',
  } as ConnectedAccountEntity;
  const emailingDomain = {
    id: '00000000-0000-4000-8000-000000000103',
    domain: 'brand.com',
    status: EmailingDomainStatus.VERIFIED,
  };
  const findOne = jest.fn().mockResolvedValue(emailingDomain);
  const sendEmail = jest.fn().mockResolvedValue({
    messageId: '<sent@brand.com>',
    deliveredRecipients: ['creator@example.com'],
  });
  const service = new EmailGroupMessageOutboundService(
    { findOne } as never,
    { sendEmail } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findOne.mockResolvedValue(emailingDomain);
  });

  it('forwards reply headers through the emailing-domain sender', async () => {
    await service.sendMessage(
      {
        to: ['creator@example.com'],
        subject: 'Re: Partnership',
        body: 'Thanks for the update',
        html: 'Thanks for the update',
        attachments: [],
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
      },
      connectedAccount,
    );

    expect(sendEmail).toHaveBeenCalledWith(
      workspaceId,
      emailingDomain.id,
      expect.objectContaining({
        headers: [
          { name: 'In-Reply-To', value: '<parent@example.com>' },
          {
            name: 'References',
            value: '<root@example.com> <parent@example.com>',
          },
        ],
      }),
    );
  });

  it('rejects an unverified outbound domain during readiness preflight', async () => {
    findOne.mockResolvedValue({
      ...emailingDomain,
      status: EmailingDomainStatus.PENDING,
    });

    await expect(service.assertSendable(connectedAccount)).rejects.toThrow(
      'is not verified for outbound',
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
