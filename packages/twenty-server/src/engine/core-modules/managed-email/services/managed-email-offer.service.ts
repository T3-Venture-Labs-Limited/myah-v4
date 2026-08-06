import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { ManagedEmailOfferEntity } from '../entities/managed-email-offer.entity';
import { type ManagedEmailProposal } from '../types/managed-email-proposal.type';
import { type ManagedEmailQuote } from '../types/managed-email-quote.type';
import {
  canonicalManagedEmailJson,
  validateManagedEmailProposalSnapshot,
  validateManagedEmailQuoteSnapshot,
} from '../utils/validate-managed-email-offer-json.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(canonicalManagedEmailJson(value)).digest('hex');

const BUNDLE_SELECTION_TTL_MS = 15 * 60 * 1000;

export const MANAGED_EMAIL_OFFER_CLOCK = Symbol('MANAGED_EMAIL_OFFER_CLOCK');

@Injectable()
export class ManagedEmailOfferService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailOfferEntity)
    private readonly repository: WorkspaceScopedRepository<ManagedEmailOfferEntity>,
    @Inject(MANAGED_EMAIL_OFFER_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async persistBundleSelection({
    actorWorkspaceMemberId,
    now = this.clock(),
    providerInventoryId,
    workspaceId,
  }: {
    actorWorkspaceMemberId: string;
    now?: Date;
    providerInventoryId: string;
    workspaceId: string;
  }): Promise<ManagedEmailOfferEntity> {
    if (
      actorWorkspaceMemberId.trim() === '' ||
      providerInventoryId.trim() === ''
    ) {
      throw new Error('Managed email bundle selection is invalid');
    }

    return this.repository.save(workspaceId, {
      actorWorkspaceMemberId,
      expiresAt: new Date(now.getTime() + BUNDLE_SELECTION_TTL_MS),
      kind: 'BUNDLE',
      providerInventoryId,
      proposalSnapshot: null,
      quoteSnapshot: null,
      state: 'ACTIVE',
    });
  }

  async resolveBundleSelection({
    actorWorkspaceMemberId,
    bundleId,
    now = this.clock(),
    workspaceId,
  }: {
    actorWorkspaceMemberId: string;
    bundleId: string;
    now?: Date;
    workspaceId: string;
  }): Promise<string> {
    const row = await this.repository.findOne(workspaceId, {
      where: { id: bundleId, kind: 'BUNDLE' },
    });

    if (
      !row ||
      row.state !== 'ACTIVE' ||
      row.workspaceId !== workspaceId ||
      row.actorWorkspaceMemberId !== actorWorkspaceMemberId ||
      !row.providerInventoryId ||
      now.getTime() >= new Date(row.expiresAt).getTime()
    ) {
      throw new Error('Managed email bundle selection is invalid');
    }

    return row.providerInventoryId;
  }

  async persistProposal({
    actorWorkspaceMemberId,
    proposal,
    workspaceId,
  }: {
    actorWorkspaceMemberId: string;
    proposal: ManagedEmailProposal;
    workspaceId: string;
  }): Promise<ManagedEmailOfferEntity> {
    const snapshot = validateManagedEmailProposalSnapshot(proposal);

    if (snapshot.workspaceId !== workspaceId || !actorWorkspaceMemberId) {
      throw new Error('Managed email proposal ownership mismatch');
    }

    return this.repository.save(workspaceId, {
      actorWorkspaceMemberId,
      expiresAt: new Date(snapshot.expiresAt),
      fingerprint: fingerprint(snapshot),
      kind: 'PROPOSAL',
      proposalId: snapshot.id,
      quoteSnapshot: null,
      proposalSnapshot: snapshot,
      state: 'ACTIVE',
    });
  }

  async loadProposalForQuote({
    actorWorkspaceMemberId,
    now = this.clock(),
    proposalId,
    workspaceId,
  }: {
    actorWorkspaceMemberId: string;
    now?: Date;
    proposalId: string;
    workspaceId: string;
  }): Promise<ManagedEmailProposal> {
    const row = await this.repository.findOne(workspaceId, {
      where: { proposalId, kind: 'PROPOSAL' },
    });

    if (
      !row ||
      row.state !== 'ACTIVE' ||
      row.workspaceId !== workspaceId ||
      row.actorWorkspaceMemberId !== actorWorkspaceMemberId ||
      !row.proposalSnapshot ||
      now.getTime() >= new Date(row.expiresAt).getTime()
    ) {
      throw new Error('Managed email proposal offer is invalid');
    }

    const snapshot = validateManagedEmailProposalSnapshot(row.proposalSnapshot);

    if (row.fingerprint !== fingerprint(snapshot)) {
      throw new Error('Managed email proposal offer was tampered');
    }

    return {
      ...snapshot,
      createdAt: new Date(snapshot.createdAt),
      expiresAt: new Date(snapshot.expiresAt),
    };
  }

  async persistQuote({
    actorWorkspaceMemberId,
    proposalId,
    quote,
    workspaceId,
  }: {
    actorWorkspaceMemberId: string;
    proposalId: string;
    quote: ManagedEmailQuote;
    workspaceId: string;
  }): Promise<ManagedEmailOfferEntity> {
    const snapshot = validateManagedEmailQuoteSnapshot(quote);

    if (snapshot.workspaceId !== workspaceId || !actorWorkspaceMemberId) {
      throw new Error('Managed email quote ownership mismatch');
    }

    return this.repository.save(workspaceId, {
      actorWorkspaceMemberId,
      expiresAt: new Date(snapshot.expiresAt),
      fingerprint: fingerprint(snapshot),
      proposalFingerprint: snapshot.proposalHash,
      quoteFingerprint: snapshot.quoteHash,
      kind: 'QUOTE',
      proposalId,
      quoteId: snapshot.id,
      proposalSnapshot: null,
      quoteSnapshot: snapshot,
      state: 'ACTIVE',
    });
  }

  async reserveQuoteForPurchase({
    actorWorkspaceMemberId,
    idempotencyKey,
    now = this.clock(),
    operationId,
    quoteFingerprint,
    quoteId,
    quoteVersion,
    workspaceId,
  }: {
    actorWorkspaceMemberId: string;
    idempotencyKey: string;
    now?: Date;
    operationId: string;
    quoteFingerprint: string;
    quoteId: string;
    quoteVersion: string;
    workspaceId: string;
  }): Promise<{
    operationId: string;
    quote: ManagedEmailQuote;
    replayed: boolean;
  }> {
    const row = await this.repository.findOne(workspaceId, {
      where: { quoteId, kind: 'QUOTE' },
    });
    const quote = this.validateQuoteReservation(row, {
      actorWorkspaceMemberId,
      quoteFingerprint,
      quoteVersion,
      workspaceId,
    });

    if (row?.state === 'CONSUMED') {
      if (row.idempotencyKey === idempotencyKey && row.consumedOperationId) {
        return {
          operationId: row.consumedOperationId,
          quote,
          replayed: true,
        };
      }

      throw new Error('Managed email quote offer is invalid');
    }

    if (
      row?.state !== 'ACTIVE' ||
      now.getTime() >= new Date(row.expiresAt).getTime()
    ) {
      throw new Error('Managed email quote offer is invalid');
    }

    const result = await this.repository.update(
      workspaceId,
      { quoteId, kind: 'QUOTE', state: 'ACTIVE' },
      { consumedOperationId: operationId, idempotencyKey, state: 'CONSUMED' },
    );

    if (result.affected === 1) {
      return { operationId, quote, replayed: false };
    }

    const winner = await this.repository.findOne(workspaceId, {
      where: { quoteId, kind: 'QUOTE' },
    });
    const winningQuote = this.validateQuoteReservation(winner, {
      actorWorkspaceMemberId,
      quoteFingerprint,
      quoteVersion,
      workspaceId,
    });

    if (
      winner?.state === 'CONSUMED' &&
      winner.idempotencyKey === idempotencyKey &&
      winner.consumedOperationId
    ) {
      return {
        operationId: winner.consumedOperationId,
        quote: winningQuote,
        replayed: true,
      };
    }

    throw new Error('Managed email quote offer is invalid');
  }

  private validateQuoteReservation(
    row: ManagedEmailOfferEntity | null,
    {
      actorWorkspaceMemberId,
      quoteFingerprint,
      quoteVersion,
      workspaceId,
    }: {
      actorWorkspaceMemberId: string;
      quoteFingerprint: string;
      quoteVersion: string;
      workspaceId: string;
    },
  ): ManagedEmailQuote {
    if (
      !row ||
      row.workspaceId !== workspaceId ||
      row.actorWorkspaceMemberId !== actorWorkspaceMemberId ||
      row.quoteFingerprint !== quoteFingerprint ||
      !row.quoteSnapshot
    ) {
      throw new Error('Managed email quote offer is invalid');
    }

    const snapshot = validateManagedEmailQuoteSnapshot(row.quoteSnapshot);

    if (
      row.fingerprint !== fingerprint(snapshot) ||
      snapshot.catalogVersion !== quoteVersion
    ) {
      throw new Error('Managed email quote offer is invalid');
    }

    return {
      ...snapshot,
      expiresAt: new Date(snapshot.expiresAt),
    };
  }
}
