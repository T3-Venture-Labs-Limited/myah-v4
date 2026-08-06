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
