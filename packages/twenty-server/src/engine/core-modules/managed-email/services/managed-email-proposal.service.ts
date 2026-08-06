import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/managed-email/managed-email-personas-proposed';
import { IcemailClient } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.client';
import {
  type IcemailDomainAvailabilityItem,
  type IcemailPrewarmedBundle,
} from 'src/engine/core-modules/managed-email/providers/icemail/icemail.types';
import {
  type CreateManagedEmailProposalInput,
  type CreatePrewarmedManagedEmailProposalInput,
  type ManagedEmailProposal,
  type ManagedEmailProposalContext,
  type ManagedEmailProposalDomain,
  type ManagedEmailProposalPersona,
  type ManagedEmailProposalPolicy,
} from 'src/engine/core-modules/managed-email/types/managed-email-proposal.type';
import { ManagedEmailOfferService } from './managed-email-offer.service';

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

const prewarmedQuoteFingerprint = (bundle: IcemailPrewarmedBundle): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        domain: bundle.domain,
        domainPriceCents: bundle.domainPriceCents,
        inventoryId: bundle.inventoryId,
        mailboxPriceCents: bundle.mailboxPriceCents,
        mailboxes: bundle.mailboxes.map(
          ({ address, firstName, lastName, provider }) => ({
            address,
            firstName,
            lastName,
            provider,
          }),
        ),
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
    @Optional()
    private readonly offerService?: ManagedEmailOfferService,
  ) {}
  async listPrewarmedBundles(): Promise<{
    bundles: IcemailPrewarmedBundle[];
    observedAt: Date;
  }> {
    const bundles: IcemailPrewarmedBundle[] = [];
    let page = 1;
    for (;;) {
      const result = await this.icemailClient.listPrewarmedBundles(page);
      if (result.items.length === 0) {
        break;
      }
      for (const bundle of result.items) {
        this.validatePrewarmedBundle(bundle);
        bundles.push(bundle);
      }
      page += 1;
    }

    return { bundles, observedAt: this.now() };
  }

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

    await this.offerService?.persistProposal({
      actorWorkspaceMemberId: context.actorWorkspaceMemberId,
      proposal,
      workspaceId: context.workspaceId,
    });

    return proposal;
  }

  async createPrewarmedProposal(
    input: CreatePrewarmedManagedEmailProposalInput,
    context: ManagedEmailProposalContext,
  ): Promise<ManagedEmailProposal> {
    this.validatePolicy();
    if (
      !Array.isArray(input.inventoryIds) ||
      input.inventoryIds.length < 1 ||
      input.inventoryIds.length > MAX_MAILBOX_COUNT ||
      new Set(input.inventoryIds).size !== input.inventoryIds.length ||
      input.inventoryIds.some((inventoryId) => !inventoryId.trim()) ||
      !context.workspaceId.trim() ||
      !context.actorWorkspaceMemberId.trim() ||
      !context.workspaceSlug.trim()
    ) {
      throw new Error('Managed email prewarmed proposal input is invalid');
    }
    const { bundles: availableBundles } = await this.listPrewarmedBundles();
    const bundles = input.inventoryIds.map((inventoryId) => {
      const matches = availableBundles.filter(
        (bundle) => bundle.inventoryId === inventoryId,
      );

      if (matches.length !== 1) {
        throw new Error('Managed email prewarmed inventory is unavailable');
      }
      return matches[0];
    });
    const createdAt = this.now();
    const domains = bundles.map((bundle) => {
      this.validatePrewarmedBundle(bundle);
      const domain = bundle.domain.trim().toLowerCase();

      if (
        domain !== bundle.domain ||
        bundle.mailboxCount !== bundle.mailboxes.length ||
        !Number.isSafeInteger(bundle.domainPriceCents) ||
        bundle.domainPriceCents <= 0 ||
        !Number.isSafeInteger(bundle.mailboxPriceCents) ||
        bundle.mailboxPriceCents < 0
      ) {
        throw new Error('Managed email prewarmed inventory is invalid');
      }
      const mailboxes = bundle.mailboxes.map((providerMailbox) => {
        const address = providerMailbox.address.trim().toLowerCase();
        const separator = address.lastIndexOf('@');
        const localPart = address.slice(0, separator);
        const addressDomain = address.slice(separator + 1);
        const firstName = this.normalizeWhitespace(providerMailbox.firstName);
        const lastName = this.normalizeWhitespace(providerMailbox.lastName);
        const signature = `${firstName} ${lastName}`;

        if (
          address !== providerMailbox.address ||
          separator < 1 ||
          addressDomain !== domain ||
          !firstName ||
          !lastName ||
          signature.length > MAX_NAME_LENGTH ||
          localPart.length > MAX_LOCAL_PART_LENGTH
        ) {
          throw new Error('Managed email prewarmed inventory is invalid');
        }
        return freezePersona({
          address,
          createdByWorkspaceMemberId: context.actorWorkspaceMemberId,
          firstName,
          lastName,
          localPart,
          roleTitle: null,
          signature,
          version: 1,
        });
      });

      return freezeDomain({
        domain,
        mailboxes,
        prewarmedProviderCosts: {
          domainPriceCents: bundle.domainPriceCents,
          mailboxPriceCents: bundle.mailboxPriceCents,
        },
        providerInventoryId: bundle.inventoryId,
        providerQuote: {
          amountMinorUnits: bundle.domainPriceCents,
          currency: 'USD',
          fingerprint: prewarmedQuoteFingerprint(bundle),
          observedAt: createdAt.toISOString(),
          termCount: 1,
          termUnit: 'YEAR',
        },
      });
    });
    const personas = domains.flatMap(({ mailboxes }) => mailboxes);

    if (
      personas.length < 1 ||
      personas.length > MAX_MAILBOX_COUNT ||
      new Set(domains.map(({ domain }) => domain)).size !== domains.length
    ) {
      throw new Error('Managed email prewarmed inventory is invalid');
    }
    const proposal = Object.freeze({
      createdAt: new Date(createdAt),
      disclosures: DISCLOSURES,
      domains: Object.freeze(domains),
      expiresAt: new Date(createdAt.getTime() + this.policy.proposalTtlMs),
      id: this.idFactory(),
      mailboxCount: personas.length,
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

    await this.offerService?.persistProposal({
      actorWorkspaceMemberId: context.actorWorkspaceMemberId,
      proposal,
      workspaceId: context.workspaceId,
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
  private validatePrewarmedBundle(bundle: IcemailPrewarmedBundle): void {
    const domain = bundle.domain.trim().toLowerCase();
    if (
      domain !== bundle.domain ||
      !Number.isSafeInteger(bundle.mailboxCount) ||
      bundle.mailboxCount !== bundle.mailboxes.length ||
      !Number.isSafeInteger(bundle.domainPriceCents) ||
      bundle.domainPriceCents <= 0 ||
      !Number.isSafeInteger(bundle.mailboxPriceCents) ||
      bundle.mailboxPriceCents < 0 ||
      bundle.mailboxes.length === 0
    ) {
      throw new Error('Managed email prewarmed inventory is invalid');
    }
    const provider = bundle.mailboxes[0].provider;
    const addresses = new Set<string>();
    for (const mailbox of bundle.mailboxes) {
      const address = mailbox.address.trim().toLowerCase();
      const separator = address.lastIndexOf('@');
      if (
        mailbox.provider !== provider ||
        address !== mailbox.address ||
        separator < 1 ||
        address.slice(separator + 1) !== domain ||
        addresses.has(address)
      ) {
        throw new Error('Managed email prewarmed inventory is invalid');
      }
      addresses.add(address);
    }
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
