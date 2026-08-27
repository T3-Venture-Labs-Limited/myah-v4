import { ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ManagedEmailMailboxActivationService } from 'src/engine/core-modules/managed-email/services/managed-email-mailbox-activation.service';
import { type IcemailClient } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.client';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const mailboxId = '123e4567-e89b-42d3-a456-426614174001';
const managedEmailDomainId = '123e4567-e89b-42d3-a456-426614174002';
const fakeAppPassword = 'fake-app-password-only-in-memory';

const mailbox = {
  id: mailboxId,
  managedEmailDomainId,
  workspaceId,
  address: 'maya@creator-partners.test',
  normalizedAddress: 'maya@creator-partners.test',
  providerMailboxId: 'icemail-mailbox-1',
  infrastructureState: ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
  campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
  connectedAccountId: null,
  messageChannelId: null,
  nextReconciliationAt: null,
} as any;

const ordinaryDomain = {
  id: managedEmailDomainId,
  acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
  domain: 'creator-partners.test',
  normalizedDomain: 'creator-partners.test',
  workspaceId,
};

describe('ManagedEmailMailboxActivationService', () => {
  it('keeps a mailbox waiting and schedules bounded recovery when Icemail has no app password', async () => {
    const mailboxRepository = {
      findOneBy: jest.fn().mockResolvedValue(mailbox),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const domainRepository = {
      findOneBy: jest.fn().mockResolvedValue(ordinaryDomain),
    };
    const icemailClient = {
      getMailboxCredential: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<Pick<IcemailClient, 'getMailboxCredential'>>;
    const connectionService = { connectManagedWorkspaceMailbox: jest.fn() };
    const service = new ManagedEmailMailboxActivationService(
      mailboxRepository as never,
      domainRepository as never,
      icemailClient as unknown as IcemailClient,
      connectionService as never,
      () => new Date('2026-08-06T12:00:00.000Z'),
    );

    await expect(
      service.activateMailbox({ mailboxId, workspaceId }),
    ).resolves.toEqual({
      state: ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
      retryScheduled: true,
    });
    expect(icemailClient.getMailboxCredential).toHaveBeenCalledWith(
      mailbox.providerMailboxId,
    );
    expect(
      connectionService.connectManagedWorkspaceMailbox,
    ).not.toHaveBeenCalled();
    expect(mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId },
      expect.objectContaining({
        infrastructureState:
          ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
        nextReconciliationAt: new Date('2026-08-06T12:11:00.000Z'),
      }),
    );
  });

  it('schedules safe recovery without requesting credentials when provider mailbox identity is missing', async () => {
    const mailboxRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ ...mailbox, providerMailboxId: null }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const domainRepository = {
      findOneBy: jest.fn().mockResolvedValue(ordinaryDomain),
    };
    const icemailClient = { getMailboxCredential: jest.fn() };
    const connectionService = { connectManagedWorkspaceMailbox: jest.fn() };
    const service = new ManagedEmailMailboxActivationService(
      mailboxRepository as never,
      domainRepository as never,
      icemailClient as never,
      connectionService as never,
      () => new Date('2026-08-06T12:00:00.000Z'),
    );

    await expect(
      service.activateMailbox({ mailboxId, workspaceId }),
    ).resolves.toEqual(
      expect.objectContaining({
        state: ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
        retryScheduled: true,
      }),
    );
    expect(icemailClient.getMailboxCredential).not.toHaveBeenCalled();
    expect(
      connectionService.connectManagedWorkspaceMailbox,
    ).not.toHaveBeenCalled();
  });

  it('activates a customer-owned imported mailbox with a transient credential and no persisted password', async () => {
    const importedMailbox = {
      ...mailbox,
      address: 'maya@creator.io',
      normalizedAddress: 'maya@creator.io',
    };
    const mailboxRepository = {
      findOneBy: jest.fn().mockResolvedValue(importedMailbox),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const domainRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        ...ordinaryDomain,
        acquisitionMode:
          ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT,
        domain: 'creator.io',
        normalizedDomain: 'creator.io',
      }),
    };
    const icemailClient = {
      getMailboxCredential: jest.fn().mockResolvedValue({
        username: importedMailbox.address,
        appPassword: fakeAppPassword,
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
      }),
    } as unknown as jest.Mocked<Pick<IcemailClient, 'getMailboxCredential'>>;
    const connectionService = {
      connectManagedWorkspaceMailbox: jest.fn().mockResolvedValue({
        connectedAccountId: 'connected-account-1',
        messageChannelId: 'message-channel-1',
      }),
    };
    const service = new ManagedEmailMailboxActivationService(
      mailboxRepository as never,
      domainRepository as never,
      icemailClient as unknown as IcemailClient,
      connectionService as never,
      () => new Date('2026-08-06T12:00:00.000Z'),
    );

    const result = await service.activateMailbox({ mailboxId, workspaceId });

    expect(domainRepository.findOneBy).toHaveBeenCalledWith(workspaceId, {
      id: importedMailbox.managedEmailDomainId,
    });
    expect(icemailClient.getMailboxCredential).toHaveBeenCalledWith(
      importedMailbox.providerMailboxId,
      { customerOwnedDomain: 'creator.io' },
    );
    expect(
      connectionService.connectManagedWorkspaceMailbox,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        handle: importedMailbox.address,
        connectionParameters: expect.objectContaining({
          IMAP: expect.objectContaining({
            host: 'imap.gmail.com',
            port: 993,
            password: fakeAppPassword,
          }),
          SMTP: expect.objectContaining({
            host: 'smtp.gmail.com',
            port: 465,
            password: fakeAppPassword,
          }),
        }),
      }),
    );
    expect(mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId },
      expect.objectContaining({
        infrastructureState: ManagedEmailInfrastructureState.CONNECTING_TWENTY,
        nextReconciliationAt: new Date('2026-08-06T12:11:00.000Z'),
      }),
    );
    expect(JSON.stringify(mailboxRepository.update.mock.calls)).not.toContain(
      fakeAppPassword,
    );
    expect(JSON.stringify(result)).not.toContain(fakeAppPassword);
    expect(result).toEqual(
      expect.objectContaining({
        state: ManagedEmailInfrastructureState.ACTIVE,
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      }),
    );
    connectionService.connectManagedWorkspaceMailbox.mockRejectedValueOnce(
      new Error(`provider rejected ${fakeAppPassword}`),
    );
    const error = await service
      .activateMailbox({ mailboxId, workspaceId })
      .catch((caughtError: unknown) => caughtError);
    expect(JSON.stringify(error)).not.toContain(fakeAppPassword);
  });
  it('rejects activation from another workspace and never requests credentials', async () => {
    const mailboxRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const domainRepository = {
      findOneBy: jest.fn().mockResolvedValue(ordinaryDomain),
    };
    const icemailClient = { getMailboxCredential: jest.fn() };
    const connectionService = { connectManagedWorkspaceMailbox: jest.fn() };
    const service = new ManagedEmailMailboxActivationService(
      mailboxRepository as never,
      domainRepository as never,
      icemailClient as never,
      connectionService as never,
    );

    await expect(
      service.activateMailbox({ mailboxId, workspaceId: 'other-workspace-id' }),
    ).rejects.toMatchObject({ code: 'MAILBOX_NOT_FOUND' });
    expect(icemailClient.getMailboxCredential).not.toHaveBeenCalled();
    expect(
      connectionService.connectManagedWorkspaceMailbox,
    ).not.toHaveBeenCalled();
  });
});
