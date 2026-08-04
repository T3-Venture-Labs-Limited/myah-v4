import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/managed-email/managed-email-personas-proposed';
import { IcemailClient } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.client';
import { type IcemailDomainAvailabilityItem } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.types';
import {
  type CreateManagedEmailProposalInput,
  type ManagedEmailProposal,
  type ManagedEmailProposalContext,
  type ManagedEmailProposalDomain,
  type ManagedEmailProposalPersona,
  type ManagedEmailProposalPolicy,
} from 'src/engine/core-modules/managed-email/types/managed-email-proposal.type';

export const MANAGED_EMAIL_PROPOSAL_POLICY = Symbol(
  'MANAGED_EMAIL_PROPOSAL_POLICY',
);
export const MANAGED_EMAIL_PROPOSAL_CLOCK = Symbol(
  'MANAGED_EMAIL_PROPOSAL_CLOCK',
);
export const MANAGED_EMAIL_PROPOSAL_ID_FACTORY = Symbol(
  'MANAGED_EMAIL_PROPOSAL_ID_FACTORY',
);

const MAX_MAILBOX_COUNT = 50;
const MAX_NAME_LENGTH = 128;
const MAX_ROLE_LENGTH = 128;
const MAX_SIGNATURE_LENGTH = 4096;
const MAX_LOCAL_PART_LENGTH = 64;

const DISCLOSURES = Object.freeze({
  cancellation:
    'Domain, mailbox, and warmup renewals can be stopped independently and remain active through their paid-through dates.',
  managedServiceOwnership:
    'Managed sending domains are service assets for exclusive workspace use. Registrar ownership or transfer is not included.',
  prepaidBalance: 'Email services do not use your AI balance.',
});

const quoteFingerprint = (quote: IcemailDomainAvailabilityItem): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        amountMinorUnits: quote.price.amountCents,
        currency: quote.price.currency,
        domain: quote.domain,
        termCount: quote.price.duration,
        termUnit: quote.price.durationUnit,
      }),
    )
    .digest('hex');

const freezePersona = (
  persona: ManagedEmailProposalPersona,
): ManagedEmailProposalPersona => Object.freeze(persona);

const freezeDomain = (
  domain: ManagedEmailProposalDomain,
): ManagedEmailProposalDomain =>
  Object.freeze({
    ...domain,
    mailboxes: Object.freeze([...domain.mailboxes]),
    providerQuote: Object.freeze(domain.providerQuote),
  });

@Injectable()
export class ManagedEmailProposalService {
  constructor(
    private readonly icemailClient: IcemailClient,
    @Inject(MANAGED_EMAIL_PROPOSAL_POLICY)
    private readonly policy: ManagedEmailProposalPolicy,
    @Inject(MANAGED_EMAIL_PROPOSAL_CLOCK)
    private readonly now: () => Date = () => new Date(),
    @Inject(MANAGED_EMAIL_PROPOSAL_ID_FACTORY)
    private readonly idFactory: () => string = randomUUID,
    @Optional()
    private readonly eventLogEmitterService?: EventLogEmitterService,
  ) {}

  async createProposal(
    input: CreateManagedEmailProposalInput,
    context: ManagedEmailProposalContext,
  ): Promise<ManagedEmailProposal> {
    this.validatePolicy();
    const personas = this.normalizePersonas(input, context);
    const domainCount = Math.ceil(
      input.mailboxCount / this.policy.maxMailboxesPerDomain,
    );
    const candidates = this.policy
      .candidateDomains(context.workspaceSlug, domainCount)
      .slice(0, domainCount);

    if (
      candidates.length < domainCount ||
      new Set(candidates.map((candidate) => candidate.trim().toLowerCase()))
        .size !== domainCount
    ) {
      throw new Error('Managed email proposal policy is unavailable');
    }

    const createdAt = this.now();
    const selectedDomains: Array<{
      domain: string;
      quote: IcemailDomainAvailabilityItem;
    }> = [];

    for (const candidate of candidates) {
      const availability =
        await this.icemailClient.checkDomainAvailability(candidate);
      const selected = availability.available
        ? availability
        : availability.alternatives.find(({ available }) => available);

      if (
        selected === undefined ||
        selectedDomains.some(({ domain }) => domain === selected.domain)
      ) {
        throw new Error('Managed email domain availability is insufficient');
      }
      selectedDomains.push({ domain: selected.domain, quote: selected });
    }

    const domains = selectedDomains.map(({ domain, quote }, index) => {
      const firstPersona = index * this.policy.maxMailboxesPerDomain;
      const domainPersonas = personas
        .slice(firstPersona, firstPersona + this.policy.maxMailboxesPerDomain)
        .map((persona) =>
          freezePersona({
            ...persona,
            address: `${persona.localPart}@${domain}`,
          }),
        );

      return freezeDomain({
        domain,
        mailboxes: domainPersonas,
        providerQuote: {
          amountMinorUnits: quote.price.amountCents,
          currency: 'USD',
          fingerprint: quoteFingerprint(quote),
          observedAt: createdAt.toISOString(),
          termCount: 1,
          termUnit: 'YEAR',
        },
      });
    });

    const addresses = domains.flatMap(({ mailboxes }) =>
      mailboxes.map(({ address }) => address),
    );

    if (new Set(addresses).size !== addresses.length) {
      throw new Error('Managed email proposal contains duplicate addresses');
    }

    const proposal = Object.freeze({
      createdAt: new Date(createdAt),
      disclosures: DISCLOSURES,
      domains: Object.freeze(domains),
      expiresAt: new Date(createdAt.getTime() + this.policy.proposalTtlMs),
      id: this.idFactory(),
      mailboxCount: input.mailboxCount,
      policyVersion: this.policy.version,
      workspaceId: context.workspaceId,
    });

    await this.eventLogEmitterService
      ?.createContext({ workspaceId: context.workspaceId })
      .insertWorkspaceEvent(MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT, {
        actorWorkspaceMemberId: context.actorWorkspaceMemberId,
        personaCount: personas.length,
        personaVersions: personas.map(({ version }) => version),
        policyVersion: this.policy.version,
        proposalId: proposal.id,
      });

    return proposal;
  }

  async revalidateProposal(
    proposal: ManagedEmailProposal,
    at = this.now(),
  ): Promise<ManagedEmailProposal> {
    if (at.getTime() >= proposal.expiresAt.getTime()) {
      throw new Error('Managed email proposal has expired');
    }

    const domains: ManagedEmailProposalDomain[] = [];

    for (const proposedDomain of proposal.domains) {
      const availability = await this.icemailClient.checkDomainAvailability(
        proposedDomain.domain,
      );

      if (
        !availability.available ||
        availability.domain !== proposedDomain.domain
      ) {
        throw new Error('Managed email proposal availability changed');
      }

      domains.push(
        freezeDomain({
          ...proposedDomain,
          providerQuote: {
            amountMinorUnits: availability.price.amountCents,
            currency: 'USD',
            fingerprint: quoteFingerprint(availability),
            observedAt: at.toISOString(),
            termCount: 1,
            termUnit: 'YEAR',
          },
        }),
      );
    }

    return Object.freeze({
      ...proposal,
      domains: Object.freeze(domains),
    });
  }

  private normalizePersonas(
    input: CreateManagedEmailProposalInput,
    context: ManagedEmailProposalContext,
  ): ManagedEmailProposalPersona[] {
    if (
      !Number.isSafeInteger(input.mailboxCount) ||
      input.mailboxCount < 1 ||
      input.mailboxCount > MAX_MAILBOX_COUNT ||
      !Array.isArray(input.personas) ||
      input.personas.length !== input.mailboxCount ||
      !context.workspaceId.trim() ||
      !context.actorWorkspaceMemberId.trim() ||
      !context.workspaceSlug.trim()
    ) {
      throw new Error('Managed email proposal input is invalid');
    }

    return input.personas.map((inputPersona) => {
      const displayName = this.normalizeWhitespace(inputPersona.displayName);
      const nameParts = displayName.split(' ');
      const firstName = nameParts.shift() ?? '';
      const lastName = nameParts.join(' ');
      const localPart = inputPersona.localPartPreference
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .replace(/^[._-]+|[._-]+$/g, '');
      const signature = inputPersona.signature.trim();
      const roleTitle = inputPersona.roleTitle?.trim() || null;

      if (
        !firstName ||
        !lastName ||
        displayName.length > MAX_NAME_LENGTH ||
        !localPart ||
        localPart.length > MAX_LOCAL_PART_LENGTH ||
        !signature ||
        signature.length > MAX_SIGNATURE_LENGTH ||
        (roleTitle !== null && roleTitle.length > MAX_ROLE_LENGTH)
      ) {
        throw new Error('Managed email proposal input is invalid');
      }

      return {
        address: '',
        createdByWorkspaceMemberId: context.actorWorkspaceMemberId,
        firstName,
        lastName,
        localPart,
        roleTitle,
        signature,
        version: 1,
      };
    });
  }

  private normalizeWhitespace(value: string): string {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  private validatePolicy(): void {
    if (
      !Number.isSafeInteger(this.policy.maxMailboxesPerDomain) ||
      this.policy.maxMailboxesPerDomain < 1 ||
      !Number.isSafeInteger(this.policy.proposalTtlMs) ||
      this.policy.proposalTtlMs < 1 ||
      !this.policy.version.trim()
    ) {
      throw new Error('Managed email proposal policy is unavailable');
    }
  }
}
