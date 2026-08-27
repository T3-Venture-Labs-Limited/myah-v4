import {
  managedEmailProposalSnapshotTransformer,
  managedEmailQuoteSnapshotTransformer,
} from '../validate-managed-email-offer-json.util';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';

const proposal = {
  id: '223e4567-e89b-42d3-a456-426614174000',
  workspaceId,
  createdAt: new Date('2026-08-06T11:55:00.000Z'),
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  mailboxCount: 1,
  policyVersion: 'deliverability-test-v1',
  domains: [
    {
      domain: 'creator-partners.test',
      mailboxes: [
        {
          address: 'maya@creator-partners.test',
          createdByWorkspaceMemberId: actorWorkspaceMemberId,
          firstName: 'Maya',
          lastName: 'Chen',
          localPart: 'maya',
          roleTitle: null,
          signature: 'Maya',
          version: 1,
        },
      ],
      providerQuote: {
        amountMinorUnits: 1_000,
        currency: 'USD',
        fingerprint: 'provider-fingerprint-1',
        observedAt: '2026-08-06T11:55:00.000Z',
        termCount: 1,
        termUnit: 'YEAR',
      },
    },
  ],
  disclosures: {
    cancellation: 'Renewals can be stopped independently.',
    managedServiceOwnership: 'Managed sending domains are service assets.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
};

const quote = {
  catalogVersion: 'test-catalog-v1',
  id: '323e4567-e89b-42d3-a456-426614174000',
  workspaceId,
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  disclosures: proposal.disclosures,
  dueTodayCents: 1_000,
  currency: 'USD',
  lines: [
    {
      billingFrequency: 'ANNUAL',
      productKey: 'managed_sending_domain_year',
      metronomeProductId: 'metronome-product-domain',
      quantity: 1,
      unitPriceCents: 1_000,
      amountCents: 1_000,
      startingAt: '2026-08-06T12:00:00.000Z',
      endingBefore: '2027-08-06T12:00:00.000Z',
      productTag: 'myah-managed-sending-domain-year',
    },
  ],
  metronomeRateCardAlias: 'managed-email-test',
  metronomeRateCardId: '423e4567-e89b-42d3-a456-426614174000',
  proposalHash: 'proposal-fingerprint-1',
  quoteHash: 'quote-fingerprint-1',
  resourceSnapshot: { proposalId: proposal.id },
};

const customerOwnedProposal = {
  ...proposal,
  acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
  customerOwnedDomain: 'creator-owned.test',
  domains: [
    {
      domain: 'creator-owned.test',
      mailboxes: [
        {
          ...proposal.domains[0].mailboxes[0],
          address: 'maya@creator-owned.test',
        },
      ],
    },
  ],
};

const customerOwnedQuote = {
  ...quote,
  dueTodayCents: 4_720,
  lines: [
    {
      amountCents: 650,
      billingFrequency: 'MONTHLY',
      endingBefore: '2026-09-06T12:00:00.000Z',
      metronomeProductId: 'metronome-product-mailbox',
      productKey: 'managed_mailbox_month',
      productTag: 'myah-managed-mailbox-month',
      quantity: 1,
      startingAt: '2026-08-06T12:00:00.000Z',
      unitPriceCents: 650,
    },
    {
      amountCents: 4_070,
      billingFrequency: 'MONTHLY',
      endingBefore: '2026-09-06T12:00:00.000Z',
      metronomeProductId: 'metronome-product-warmup',
      productKey: 'managed_warmup_month',
      productTag: 'myah-managed-warmup-month',
      quantity: 1,
      startingAt: '2026-08-06T12:00:00.000Z',
      unitPriceCents: 4_070,
    },
  ],
  resourceSnapshot: {
    domains: [
      {
        domain: 'creator-owned.test',
        mailboxes: ['maya@creator-owned.test'],
      },
    ],
    personas: [
      {
        ...proposal.domains[0].mailboxes[0],
        address: 'maya@creator-owned.test',
      },
    ],
    proposal: {
      acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
      createdAt: proposal.createdAt.toISOString(),
      customerOwnedDomain: 'creator-owned.test',
      expiresAt: proposal.expiresAt.toISOString(),
      policyVersion: proposal.policyVersion,
    },
  },
};

const requiredQuoteFields = [
  'catalogVersion',
  'disclosures',
  'dueTodayCents',
  'metronomeRateCardAlias',
  'metronomeRateCardId',
  'proposalHash',
  'quoteHash',
] as const;

describe('managed email offer snapshot transformers', () => {
  it('reconstructs proposal Date fields after a JSON round trip', () => {
    const persistedJson = JSON.stringify(proposal);
    const restored = managedEmailProposalSnapshotTransformer.from(
      JSON.parse(persistedJson),
    );

    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.expiresAt).toBeInstanceOf(Date);
    expect(restored.createdAt.toISOString()).toBe('2026-08-06T11:55:00.000Z');
    expect(restored.expiresAt.toISOString()).toBe('2026-08-06T12:15:00.000Z');
  });

  it('reconstructs quote expiry after a JSON round trip', () => {
    const persistedJson = JSON.stringify(quote);
    const restored = managedEmailQuoteSnapshotTransformer.from(
      JSON.parse(persistedJson),
    );

    expect(restored.expiresAt).toBeInstanceOf(Date);
    expect(restored.expiresAt.toISOString()).toBe('2026-08-06T12:15:00.000Z');
  });

  it('persists only a normalized mode-bound customer-owned import snapshot', () => {
    const restored = managedEmailProposalSnapshotTransformer.from(
      JSON.parse(JSON.stringify(customerOwnedProposal)),
    );

    expect(restored).toMatchObject({
      acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
      customerOwnedDomain: 'creator-owned.test',
      domains: [
        expect.objectContaining({
          domain: 'creator-owned.test',
        }),
      ],
    });
    expect(restored.domains[0]).not.toHaveProperty('providerQuote');
    expect(() =>
      managedEmailQuoteSnapshotTransformer.to({
        ...customerOwnedQuote,
        resourceSnapshot: {
          ...customerOwnedQuote.resourceSnapshot,
          proposal: {
            ...customerOwnedQuote.resourceSnapshot.proposal,
            customerOwnedDomain: undefined,
          },
        },
      }),
    ).toThrow('Unsafe managed email offer JSON');
  });

  it('preserves null snapshots for nullable offer columns', () => {
    expect(managedEmailProposalSnapshotTransformer.to(null)).toBeNull();
    expect(managedEmailProposalSnapshotTransformer.from(null)).toBeNull();
    expect(managedEmailQuoteSnapshotTransformer.to(null)).toBeNull();
    expect(managedEmailQuoteSnapshotTransformer.from(null)).toBeNull();
  });

  it.each(requiredQuoteFields)('rejects a quote missing %s', (field) => {
    const invalid = { ...quote } as Record<string, unknown>;

    delete invalid[field];

    expect(() => managedEmailQuoteSnapshotTransformer.to(invalid)).toThrow(
      'Unsafe managed email offer JSON',
    );
  });

  it('rejects malformed quote lines through the safe JSON boundary', () => {
    expect(() =>
      managedEmailQuoteSnapshotTransformer.to({ ...quote, lines: {} }),
    ).toThrow('Unsafe managed email offer JSON');
  });
});
