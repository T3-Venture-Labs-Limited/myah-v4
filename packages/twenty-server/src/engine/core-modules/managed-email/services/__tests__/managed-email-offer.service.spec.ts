import { ManagedEmailOfferService } from '../managed-email-offer.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const otherWorkspaceId = '123e4567-e89b-42d3-a456-426614174002';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';
const otherActorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174003';
const proposalId = '223e4567-e89b-42d3-a456-426614174000';
const quoteId = '323e4567-e89b-42d3-a456-426614174000';
const bundleHandleId = '323e4567-e89b-42d3-a456-426614174099';
const now = new Date('2026-08-06T12:00:00.000Z');
const operationId = '423e4567-e89b-42d3-a456-426614174000';
const competingOperationId = '523e4567-e89b-42d3-a456-426614174000';

const proposal = {
  id: proposalId,
  workspaceId,
  actorWorkspaceMemberId,
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
        currency: 'USD' as const,
        fingerprint: 'provider-fingerprint-1',
        observedAt: '2026-08-06T11:55:00.000Z',
        termCount: 1 as const,
        termUnit: 'YEAR' as const,
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
  id: quoteId,
  workspaceId,
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
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
  disclosures: proposal.disclosures,
  metronomeRateCardAlias: 'managed-email-test',
  metronomeRateCardId: '623e4567-e89b-42d3-a456-426614174000',
  proposalHash: 'proposal-fingerprint-1',
  quoteHash: 'quote-fingerprint-1',
  resourceSnapshot: { proposalId },
};

type Row = Record<string, unknown>;

const createRepository = () => {
  const rows = new Map<string, Row>();
  const repository = {
    save: jest.fn(async (_workspace: string, input: Row) => {
      const publicId =
        input.kind === 'PROPOSAL'
          ? input.proposalId
          : input.kind === 'QUOTE'
            ? input.quoteId
            : bundleHandleId;
      if (typeof publicId !== 'string')
        throw new Error('Missing public offer ID');
      const row = { ...input, id: publicId, workspaceId: _workspace };
      rows.set(publicId, row);
      return row;
    }),
    findOne: jest.fn(
      async (
        _workspace: string,
        options: {
          where: { id?: string; proposalId?: string; quoteId?: string };
        },
      ) => {
        const publicId =
          options.where.id ?? options.where.proposalId ?? options.where.quoteId;
        return typeof publicId === 'string'
          ? (rows.get(publicId) ?? null)
          : null;
      },
    ),
    update: jest.fn(
      async (
        _workspace: string,
        criteria: { kind?: string; quoteId?: string; state?: string },
        patch: Row,
      ) => {
        const row = criteria.quoteId ? rows.get(criteria.quoteId) : undefined;
        if (
          !row ||
          criteria.kind !== row.kind ||
          criteria.state !== row.state
        ) {
          return { affected: 0 };
        }
        Object.assign(row, patch);
        return { affected: 1 };
      },
    ),
  };
  return { repository, rows };
};

type LookupOverrides = {
  actorWorkspaceMemberId?: string;
  now?: Date;
  proposalId?: string;
  quoteFingerprint?: string;
  workspaceId?: string;
};

const proposalLookupCases: Array<[string, LookupOverrides]> = [
  ['wrong workspace', { workspaceId: otherWorkspaceId }],
  ['wrong actor', { actorWorkspaceMemberId: otherActorWorkspaceMemberId }],
  ['expired', { now: new Date('2026-08-06T12:15:00.000Z') }],
  ['unknown public ID', { proposalId: '423e4567-e89b-42d3-a456-426614174000' }],
];

const quoteLookupCases: Array<[string, LookupOverrides]> = [
  ['wrong workspace', { workspaceId: otherWorkspaceId }],
  ['wrong actor', { actorWorkspaceMemberId: otherActorWorkspaceMemberId }],
  ['wrong fingerprint', { quoteFingerprint: 'tampered' }],
  ['expired', { now: new Date('2026-08-06T12:15:00.000Z') }],
];

describe('ManagedEmailOfferService durable restart-safe contracts', () => {
  it('loads a persisted proposal by public ID and returns the durable snapshot without caller proposal data', async () => {
    const { repository } = createRepository();
    const service = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );
    await service.persistProposal({
      actorWorkspaceMemberId,
      proposal: proposal as never,
      workspaceId,
    });

    const loaded = await service.loadProposalForQuote({
      actorWorkspaceMemberId,
      proposalId,
      workspaceId,
    });

    expect(repository.findOne).toHaveBeenCalledWith(workspaceId, {
      where: { kind: 'PROPOSAL', proposalId },
    });
    expect(loaded.id).toBe(proposalId);
    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(loaded.expiresAt).toBeInstanceOf(Date);
    expect(loaded.mailboxCount).toBe(1);
  });

  it.each(proposalLookupCases)(
    'rejects proposal lookup with %s',
    async (_reason, overrides) => {
      const { repository } = createRepository();
      const service = new ManagedEmailOfferService(
        repository as never,
        () => now,
      );
      await service.persistProposal({
        actorWorkspaceMemberId,
        proposal: proposal as never,
        workspaceId,
      });

      await expect(
        service.loadProposalForQuote({
          actorWorkspaceMemberId:
            overrides.actorWorkspaceMemberId ?? actorWorkspaceMemberId,
          now: overrides.now,
          proposalId: overrides.proposalId ?? proposalId,
          workspaceId: overrides.workspaceId ?? workspaceId,
        }),
      ).rejects.toThrow();
    },
  );

  it('rejects a persisted proposal whose snapshot fingerprint no longer matches', async () => {
    const { repository, rows } = createRepository();
    const service = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );
    await service.persistProposal({
      actorWorkspaceMemberId,
      proposal: proposal as never,
      workspaceId,
    });
    rows.get(proposalId)!.proposalSnapshot = { ...proposal, mailboxCount: 2 };

    await expect(
      service.loadProposalForQuote({
        actorWorkspaceMemberId,
        proposalId,
        workspaceId,
      }),
    ).rejects.toThrow();
  });

  it('atomically reserves an exact active quote before purchase admission', async () => {
    const { repository } = createRepository();
    const service = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );
    await service.persistQuote({
      actorWorkspaceMemberId,
      proposalId,
      quote: quote as never,
      workspaceId,
    });

    await expect(
      service.reserveQuoteForPurchase({
        actorWorkspaceMemberId,
        idempotencyKey: 'purchase-1',
        operationId,
        quoteFingerprint: 'quote-fingerprint-1',
        quoteId,
        quoteVersion: 'test-catalog-v1',
        workspaceId,
      }),
    ).resolves.toEqual({
      operationId,
      quote: expect.objectContaining({
        catalogVersion: 'test-catalog-v1',
        id: quoteId,
        quoteHash: 'quote-fingerprint-1',
      }),
      replayed: false,
    });
    expect(repository.update).toHaveBeenCalledWith(
      workspaceId,
      { kind: 'QUOTE', quoteId, state: 'ACTIVE' },
      {
        consumedOperationId: operationId,
        idempotencyKey: 'purchase-1',
        state: 'CONSUMED',
      },
    );
  });

  it.each(quoteLookupCases)(
    'rejects quote reservation with %s',
    async (_reason, overrides) => {
      const { repository } = createRepository();
      const service = new ManagedEmailOfferService(
        repository as never,
        () => now,
      );
      await service.persistQuote({
        actorWorkspaceMemberId,
        proposalId,
        quote: quote as never,
        workspaceId,
      });

      await expect(
        service.reserveQuoteForPurchase({
          actorWorkspaceMemberId:
            overrides.actorWorkspaceMemberId ?? actorWorkspaceMemberId,
          idempotencyKey: 'purchase-1',
          now: overrides.now,
          operationId,
          quoteFingerprint: overrides.quoteFingerprint ?? 'quote-fingerprint-1',
          quoteId,
          quoteVersion: 'test-catalog-v1',
          workspaceId: overrides.workspaceId ?? workspaceId,
        }),
      ).rejects.toThrow();
    },
  );

  it('replays a consumed quote from durable storage after the service restarts', async () => {
    const { repository } = createRepository();
    const firstService = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );
    await firstService.persistQuote({
      actorWorkspaceMemberId,
      proposalId,
      quote: quote as never,
      workspaceId,
    });
    await firstService.reserveQuoteForPurchase({
      actorWorkspaceMemberId,
      idempotencyKey: 'purchase-1',
      operationId,
      quoteFingerprint: 'quote-fingerprint-1',
      quoteId,
      quoteVersion: 'test-catalog-v1',
      workspaceId,
    });

    const restartedService = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );
    await expect(
      restartedService.reserveQuoteForPurchase({
        actorWorkspaceMemberId,
        idempotencyKey: 'purchase-1',
        operationId: competingOperationId,
        quoteFingerprint: 'quote-fingerprint-1',
        quoteId,
        quoteVersion: 'test-catalog-v1',
        workspaceId,
      }),
    ).resolves.toEqual({
      operationId,
      quote: expect.objectContaining({ id: quoteId }),
      replayed: true,
    });
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('fails closed when another request wins the atomic quote reservation', async () => {
    const { repository, rows } = createRepository();
    const service = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );
    await service.persistQuote({
      actorWorkspaceMemberId,
      proposalId,
      quote: quote as never,
      workspaceId,
    });
    repository.update.mockImplementationOnce(async () => {
      Object.assign(rows.get(quoteId)!, {
        consumedOperationId: competingOperationId,
        idempotencyKey: 'competing-purchase',
        state: 'CONSUMED',
      });
      return { affected: 0 };
    });

    await expect(
      service.reserveQuoteForPurchase({
        actorWorkspaceMemberId,
        idempotencyKey: 'purchase-1',
        operationId,
        quoteFingerprint: 'quote-fingerprint-1',
        quoteId,
        quoteVersion: 'test-catalog-v1',
        workspaceId,
      }),
    ).rejects.toThrow('Managed email quote offer is invalid');
  });
  it('persists and resolves an opaque bundle selection within its actor, workspace, and lifetime', async () => {
    const { repository } = createRepository();
    const service = new ManagedEmailOfferService(
      repository as never,
      () => now,
    );

    await expect(
      service.persistBundleSelection({
        actorWorkspaceMemberId,
        providerInventoryId: 'provider-inventory-1',
        workspaceId,
      }),
    ).resolves.toMatchObject({
      actorWorkspaceMemberId,
      expiresAt: new Date('2026-08-06T12:15:00.000Z'),
      id: bundleHandleId,
      kind: 'BUNDLE',
      providerInventoryId: 'provider-inventory-1',
      state: 'ACTIVE',
      workspaceId,
    });

    await expect(
      service.resolveBundleSelection({
        actorWorkspaceMemberId,
        bundleId: bundleHandleId,
        workspaceId,
      }),
    ).resolves.toBe('provider-inventory-1');
    expect(repository.findOne).toHaveBeenCalledWith(workspaceId, {
      where: { id: bundleHandleId, kind: 'BUNDLE' },
    });
  });

  it.each([
    ['wrong workspace', otherWorkspaceId, actorWorkspaceMemberId, now],
    ['wrong actor', workspaceId, otherActorWorkspaceMemberId, now],
    [
      'expired',
      workspaceId,
      actorWorkspaceMemberId,
      new Date('2026-08-06T12:15:00.000Z'),
    ],
  ])(
    'rejects a bundle selection with %s',
    async (_reason, lookupWorkspaceId, lookupActorId, lookupNow) => {
      const { repository } = createRepository();
      const service = new ManagedEmailOfferService(
        repository as never,
        () => now,
      );
      await service.persistBundleSelection({
        actorWorkspaceMemberId,
        providerInventoryId: 'provider-inventory-1',
        workspaceId,
      });

      await expect(
        service.resolveBundleSelection({
          actorWorkspaceMemberId: lookupActorId,
          bundleId: bundleHandleId,
          now: lookupNow,
          workspaceId: lookupWorkspaceId,
        }),
      ).rejects.toThrow('Managed email bundle selection is invalid');
    },
  );
});
