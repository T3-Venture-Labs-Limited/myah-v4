import { type EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/managed-email/managed-email-personas-proposed';
import { type IcemailClient } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.client';
import { ManagedEmailProposalService } from 'src/engine/core-modules/managed-email/services/managed-email-proposal.service';
import { type ManagedEmailProposalPolicy } from 'src/engine/core-modules/managed-email/types/managed-email-proposal.type';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';
const now = new Date('2026-08-05T10:00:00.000Z');

const personas = [
  {
    displayName: '  Maya   Chen ',
    localPartPreference: ' MÁYA.Chen ',
    roleTitle: ' Partnerships ',
    signature: ' Maya — Creator Partnerships ',
  },
  {
    displayName: 'Alex Rivera',
    localPartPreference: 'alex+growth',
    roleTitle: null,
    signature: 'Alex',
  },
  {
    displayName: 'Sam Lee',
    localPartPreference: 'sam',
    roleTitle: 'Growth',
    signature: 'Sam',
  },
  {
    displayName: 'Jordan Kim',
    localPartPreference: 'jordan',
    roleTitle: null,
    signature: 'Jordan',
  },
];

const policy: ManagedEmailProposalPolicy = {
  allowProviderAlternatives: true,
  candidateDomains: () => ['creator-partners.co', 'creator-collabs.co'],
  maxMailboxesPerDomain: 3,
  proposalTtlMs: 15 * 60 * 1000,
  version: 'deliverability-2026-08-test',
};

describe('ManagedEmailProposalService', () => {
  const createService = (
    proposalPolicy: ManagedEmailProposalPolicy = policy,
  ) => {
    const icemailClient = {
      checkDomainAvailability: jest.fn(async (domain: string) => ({
        alternatives:
          domain === 'creator-partners.co'
            ? [
                {
                  available: true,
                  domain: 'creator-network.co',
                  price: {
                    amountCents: 1100,
                    currency: 'USD' as const,
                    duration: 1,
                    durationUnit: 'YEAR' as const,
                  },
                },
              ]
            : [],
        available: domain !== 'creator-partners.co',
        domain,
        price: {
          amountCents: 1000,
          currency: 'USD' as const,
          duration: 1,
          durationUnit: 'YEAR' as const,
        },
      })),
      listPrewarmedBundles: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<IcemailClient, 'checkDomainAvailability' | 'listPrewarmedBundles'>
    >;
    const insertWorkspaceEvent = jest.fn(async () => ({ success: true }));
    const eventLogEmitterService = {
      createContext: jest.fn(() => ({ insertWorkspaceEvent })),
    };

    return {
      icemailClient,
      eventLogEmitterService,
      service: new ManagedEmailProposalService(
        icemailClient as unknown as IcemailClient,
        proposalPolicy,
        () => now,
        () => 'proposal-id',
        eventLogEmitterService as unknown as EventLogEmitterService,
      ),
    };
  };

  it('starts from mailbox count, applies versioned allocation, and normalizes personas', async () => {
    const { eventLogEmitterService, icemailClient, service } = createService();

    const proposal = await service.createProposal(
      {
        mailboxCount: 4,
        personas,
      },
      { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
    );

    expect(icemailClient.checkDomainAvailability).toHaveBeenNthCalledWith(
      1,
      'creator-partners.co',
    );
    expect(icemailClient.checkDomainAvailability).toHaveBeenNthCalledWith(
      2,
      'creator-collabs.co',
    );
    expect(proposal).toMatchObject({
      createdAt: now,
      expiresAt: new Date('2026-08-05T10:15:00.000Z'),
      id: 'proposal-id',
      mailboxCount: 4,
      policyVersion: 'deliverability-2026-08-test',
      workspaceId,
    });
    expect(proposal.domains).toEqual([
      expect.objectContaining({
        domain: 'creator-network.co',
        mailboxes: [
          expect.objectContaining({
            address: 'maya.chen@creator-network.co',
            firstName: 'Maya',
            lastName: 'Chen',
            localPart: 'maya.chen',
            roleTitle: 'Partnerships',
            signature: 'Maya — Creator Partnerships',
          }),
          expect.objectContaining({
            address: 'alexgrowth@creator-network.co',
            localPart: 'alexgrowth',
          }),
          expect.objectContaining({
            address: 'sam@creator-network.co',
            localPart: 'sam',
          }),
        ],
        providerQuote: expect.objectContaining({
          amountMinorUnits: 1100,
          currency: 'USD',
          termCount: 1,
          termUnit: 'YEAR',
        }),
      }),
      expect.objectContaining({
        domain: 'creator-collabs.co',
        mailboxes: [
          expect.objectContaining({
            address: 'jordan@creator-collabs.co',
          }),
        ],
      }),
    ]);
    expect(proposal.disclosures).toEqual({
      cancellation:
        'Domain, mailbox, and warmup renewals can be stopped independently and remain active through their paid-through dates.',
      managedServiceOwnership:
        'Managed sending domains are service assets for exclusive workspace use. Registrar ownership or transfer is not included.',
      prepaidBalance: 'Email services do not use your AI balance.',
    });
    expect(eventLogEmitterService.createContext).toHaveBeenCalledWith({
      workspaceId,
    });
    expect(
      eventLogEmitterService.createContext.mock.results[0].value
        .insertWorkspaceEvent,
    ).toHaveBeenCalledWith(MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT, {
      actorWorkspaceMemberId,
      personaCount: 4,
      personaVersions: [1, 1, 1, 1],
      policyVersion: policy.version,
      proposalId: 'proposal-id',
    });
    expect(JSON.stringify(proposal)).not.toMatch(
      /providerId|providerType|credential|password|raw/i,
    );
  });

  it('normalizes one explicit customer-owned domain without candidate or provider-domain quote work', async () => {
    const candidateDomains = jest.fn(() => ['must-not-be-used.test']);
    const { icemailClient, service } = createService({
      ...policy,
      candidateDomains,
    });

    const proposal = await service.createProposal(
      {
        acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
        customerOwnedDomain: '  Creator-Owned.Test.  ',
        mailboxCount: 2,
        personas: personas.slice(0, 2),
      } as never,
      { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
    );

    expect(candidateDomains).not.toHaveBeenCalled();
    expect(icemailClient.checkDomainAvailability).not.toHaveBeenCalled();
    expect(proposal).toMatchObject({
      acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
      customerOwnedDomain: 'creator-owned.test',
      domains: [
        expect.objectContaining({
          domain: 'creator-owned.test',
          mailboxes: [
            expect.objectContaining({
              address: 'maya.chen@creator-owned.test',
            }),
            expect.objectContaining({
              address: 'alexgrowth@creator-owned.test',
            }),
          ],
        }),
      ],
    });
    expect(proposal.domains).toHaveLength(1);
    expect(proposal.domains[0]).not.toHaveProperty('providerQuote');

    await service.revalidateProposal(proposal);

    expect(icemailClient.checkDomainAvailability).not.toHaveBeenCalled();
  });

  it.each([
    ['  MAIL.CREATOR.CO.UK.  ', 'mail.creator.co.uk'],
    ['CREATOR.IO', 'creator.io'],
  ])(
    'accepts normalized customer-owned import domain %s as %s outside purchased-domain grammar',
    async (customerOwnedDomain, normalizedDomain) => {
      const { icemailClient, service } = createService();

      const proposal = await service.createProposal(
        {
          acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
          customerOwnedDomain,
          mailboxCount: 1,
          personas: [personas[0]],
        } as never,
        { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
      );

      expect(proposal).toMatchObject({
        acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
        customerOwnedDomain: normalizedDomain,
        domains: [
          expect.objectContaining({
            domain: normalizedDomain,
            mailboxes: [
              expect.objectContaining({
                address: `maya.chen@${normalizedDomain}`,
              }),
            ],
          }),
        ],
      });
      expect(icemailClient.checkDomainAvailability).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing', undefined],
    ['blank', '  '],
    ['invalid', 'not a domain'],
    ['multiple', ['first.test', 'second.test']],
  ])(
    'fails closed when the customer-owned domain is %s',
    async (_reason, customerOwnedDomain) => {
      const { icemailClient, service } = createService();

      await expect(
        service.createProposal(
          {
            acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
            customerOwnedDomain,
            mailboxCount: 1,
            personas: [personas[0]],
          } as never,
          { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
        ),
      ).rejects.toThrow('Managed email proposal input is invalid');
      expect(icemailClient.checkDomainAvailability).not.toHaveBeenCalled();
    },
  );

  it('rejects provider alternatives when the proposal policy requires the exact candidate', async () => {
    const { icemailClient, service } = createService({
      ...policy,
      allowProviderAlternatives: false,
      candidateDomains: () => ['creator-partners.co'],
    });

    await expect(
      service.createProposal(
        {
          mailboxCount: 1,
          personas: [personas[0]],
        },
        { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
      ),
    ).rejects.toThrow('Managed email domain availability is insufficient');
    expect(icemailClient.checkDomainAvailability).toHaveBeenCalledWith(
      'creator-partners.co',
    );
  });

  it('builds a prewarmed proposal from server-resolved whole inventory', async () => {
    const { icemailClient, service } = createService();

    icemailClient.listPrewarmedBundles
      .mockResolvedValueOnce({
        items: [
          {
            domain: 'creator-partners.co',
            domainPriceCents: 1000,
            inventoryId: 'inventory-1',
            mailboxCount: 2,
            mailboxPriceCents: 250,
            mailboxes: [
              {
                address: 'maya@creator-partners.co',
                firstName: 'Maya',
                lastName: 'Chen',
                master: false,
                provider: 'GOOGLE',
              },
              {
                address: 'sam@creator-partners.co',
                firstName: 'Sam',
                lastName: 'Lee',
                master: false,
                provider: 'GOOGLE',
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ items: [] });

    const proposal = await service.createPrewarmedProposal(
      { inventoryIds: ['inventory-1'] },
      { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
    );

    expect(proposal.mailboxCount).toBe(2);
    expect(proposal.domains).toEqual([
      expect.objectContaining({
        domain: 'creator-partners.co',
        providerInventoryId: 'inventory-1',
        prewarmedProviderCosts: {
          domainPriceCents: 1000,
          mailboxPriceCents: 250,
        },
        mailboxes: [
          expect.objectContaining({
            address: 'maya@creator-partners.co',
            roleTitle: null,
            signature: 'Maya Chen',
          }),
          expect.objectContaining({
            address: 'sam@creator-partners.co',
            roleTitle: null,
            signature: 'Sam Lee',
          }),
        ],
      }),
    ]);
  });

  it('fails closed when prewarmed inventory pagination exceeds its bound', async () => {
    const { icemailClient, service } = createService();
    let pageCount = 0;

    icemailClient.listPrewarmedBundles.mockImplementation(async () => {
      pageCount += 1;

      return pageCount <= 101
        ? {
            items: [
              {
                domain: 'creator-partners.co',
                domainPriceCents: 1000,
                inventoryId: `inventory-${pageCount}`,
                mailboxCount: 1,
                mailboxPriceCents: 250,
                mailboxes: [
                  {
                    address: `maya-${pageCount}@creator-partners.co`,
                    firstName: 'Maya',
                    lastName: 'Chen',
                    master: false,
                    provider: 'GOOGLE',
                  },
                ],
              },
            ],
          }
        : { items: [] };
    });

    await expect(service.listPrewarmedBundles()).rejects.toThrow(
      'Managed email prewarmed inventory pagination exceeded its limit',
    );
    expect(icemailClient.listPrewarmedBundles).toHaveBeenCalledTimes(100);
  });

  it('rejects malformed counts, persona mismatches, and duplicate normalized addresses', async () => {
    const { service } = createService();

    await expect(
      service.createProposal(
        { mailboxCount: 0, personas: [] },
        { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
      ),
    ).rejects.toThrow('Managed email proposal input is invalid');

    await expect(
      service.createProposal(
        { mailboxCount: 2, personas: personas.slice(0, 1) },
        { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
      ),
    ).rejects.toThrow('Managed email proposal input is invalid');

    await expect(
      service.createProposal(
        {
          mailboxCount: 2,
          personas: [
            personas[0],
            { ...personas[1], localPartPreference: 'Maya.Chen' },
          ],
        },
        { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
      ),
    ).rejects.toThrow('Managed email proposal contains duplicate addresses');
  });

  it('expires and revalidates every exact selected domain with fresh quotes', async () => {
    const { icemailClient, service } = createService();
    const proposal = await service.createProposal(
      { mailboxCount: 4, personas },
      { actorWorkspaceMemberId, workspaceId, workspaceSlug: 'creator' },
    );

    await expect(
      service.revalidateProposal(
        proposal,
        new Date('2026-08-05T10:16:00.000Z'),
      ),
    ).rejects.toThrow('Managed email proposal has expired');

    icemailClient.checkDomainAvailability.mockClear();
    await service.revalidateProposal(
      proposal,
      new Date('2026-08-05T10:14:59.000Z'),
    );
    expect(icemailClient.checkDomainAvailability.mock.calls).toEqual([
      ['creator-network.co'],
      ['creator-collabs.co'],
    ]);
  });
});
