import { type ValueTransformer } from 'typeorm';

import { ManagedEmailAcquisitionMode } from '../enums/managed-email-acquisition-mode.enum';
import { type ManagedEmailProposal } from '../types/managed-email-proposal.type';
import { type ManagedEmailQuote } from '../types/managed-email-quote.type';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (): never => {
  throw new Error('Unsafe managed email offer JSON');
};
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
};
const str = (v: unknown, max = 8192): string =>
  typeof v === 'string' && v.length <= max ? v : fail();
const nonempty = (v: unknown, max = 8192): string => {
  const value = str(v, max);

  return value.trim() === '' ? fail() : value;
};
const uuid = (v: unknown): string =>
  UUID.test(str(v, 64)) ? (v as string) : fail();
const instant = (v: unknown): string => {
  const s = v instanceof Date ? v.toISOString() : str(v, 64);
  return Number.isFinite(Date.parse(s)) ? s : fail();
};
const bounded = (v: unknown): unknown => {
  const s = JSON.stringify(v);
  if (!s || s.length > 64 * 1024) return fail();
  return v;
};

const NORMALIZED_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const normalizedDomain = (value: unknown): string => {
  const domain = nonempty(value, 253);

  if (
    domain !== domain.trim().toLowerCase() ||
    !NORMALIZED_DOMAIN_PATTERN.test(domain)
  ) {
    return fail();
  }

  return domain;
};

export const validateManagedEmailProposalSnapshot = (
  value: unknown,
): ManagedEmailProposal => {
  const v = record(bounded(value));
  str(v.id, 256);
  str(v.workspaceId, 128);
  instant(v.createdAt);
  instant(v.expiresAt);
  str(v.policyVersion, 256);
  const acquisitionMode = v.acquisitionMode;

  if (
    acquisitionMode !== undefined &&
    acquisitionMode !== ManagedEmailAcquisitionMode.NEW_MANAGED &&
    acquisitionMode !== ManagedEmailAcquisitionMode.PREWARMED_INVENTORY &&
    acquisitionMode !== ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
  ) {
    return fail();
  }
  if (
    !Number.isSafeInteger(v.mailboxCount) ||
    (v.mailboxCount as number) < 1 ||
    !Array.isArray(v.domains) ||
    !v.domains.length
  ) {
    return fail();
  }

  const customerOwnedDomain =
    acquisitionMode === ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
      ? normalizedDomain(v.customerOwnedDomain)
      : undefined;

  if (customerOwnedDomain !== undefined && v.domains.length !== 1) {
    return fail();
  }

  for (const d of v.domains) {
    const domain = record(d);
    const domainName = str(domain.domain, 253);
    if (!Array.isArray(domain.mailboxes)) return fail();
    for (const m of domain.mailboxes) {
      const p = record(m);
      str(p.address, 320);
      uuid(p.createdByWorkspaceMemberId);
      str(p.firstName, 128);
      str(p.lastName, 128);
      str(p.localPart, 128);
      str(p.signature, 4096);
      if (p.roleTitle !== null) str(p.roleTitle, 128);
      if (!Number.isSafeInteger(p.version)) return fail();
    }

    if (customerOwnedDomain !== undefined) {
      if (
        domainName !== customerOwnedDomain ||
        'providerQuote' in domain ||
        'providerInventoryId' in domain ||
        'prewarmedProviderCosts' in domain
      ) {
        return fail();
      }
      continue;
    }

    const q = record(domain.providerQuote);
    const amountMinorUnits = q.amountMinorUnits;
    if (
      typeof amountMinorUnits !== 'number' ||
      !Number.isSafeInteger(amountMinorUnits) ||
      amountMinorUnits < 0
    ) {
      return fail();
    }
    str(q.currency, 8);
    str(q.fingerprint, 256);
    instant(q.observedAt);
    if (q.termCount !== 1 || q.termUnit !== 'YEAR') return fail();
    if (domain.providerInventoryId !== undefined)
      str(domain.providerInventoryId, 256);
    if (domain.prewarmedProviderCosts !== undefined) {
      const c = record(domain.prewarmedProviderCosts);
      if (
        !Number.isSafeInteger(c.domainPriceCents) ||
        !Number.isSafeInteger(c.mailboxPriceCents)
      ) {
        return fail();
      }
    }
  }
  const disclosures = record(v.disclosures);
  str(disclosures.cancellation);
  str(disclosures.managedServiceOwnership);
  str(disclosures.prepaidBalance);
  return value as ManagedEmailProposal;
};

export const validateManagedEmailQuoteSnapshot = (
  value: unknown,
): ManagedEmailQuote => {
  const v = record(bounded(value));

  nonempty(v.id, 256);
  nonempty(v.workspaceId, 128);
  instant(v.expiresAt);
  nonempty(v.catalogVersion, 256);
  nonempty(v.metronomeRateCardAlias, 256);
  nonempty(v.metronomeRateCardId, 256);
  nonempty(v.proposalHash, 256);
  nonempty(v.quoteHash, 256);
  if (
    v.currency !== 'USD' ||
    !Number.isSafeInteger(v.dueTodayCents) ||
    (v.dueTodayCents as number) <= 0 ||
    !Array.isArray(v.lines) ||
    v.lines.length === 0
  ) {
    return fail();
  }

  let lineTotal = 0;

  for (const line of v.lines) {
    const l = record(line);

    for (const k of ['startingAt', 'endingBefore']) instant(l[k]);
    nonempty(l.metronomeProductId, 256);
    nonempty(l.productKey, 256);
    nonempty(l.productTag, 256);
    if (
      (l.billingFrequency !== 'MONTHLY' && l.billingFrequency !== 'ANNUAL') ||
      !Number.isSafeInteger(l.amountCents) ||
      (l.amountCents as number) < 0 ||
      !Number.isSafeInteger(l.quantity) ||
      (l.quantity as number) <= 0 ||
      !Number.isSafeInteger(l.unitPriceCents) ||
      (l.unitPriceCents as number) < 0
    ) {
      return fail();
    }
    lineTotal += l.amountCents as number;
  }

  if (lineTotal !== v.dueTodayCents) return fail();

  const disclosures = record(v.disclosures);

  nonempty(disclosures.cancellation);
  nonempty(disclosures.managedServiceOwnership);
  nonempty(disclosures.prepaidBalance);
  bounded(v.resourceSnapshot);

  if (
    v.resourceSnapshot &&
    typeof v.resourceSnapshot === 'object' &&
    !Array.isArray(v.resourceSnapshot)
  ) {
    const resourceSnapshot = record(v.resourceSnapshot);
    const proposal = resourceSnapshot.proposal;

    if (proposal && typeof proposal === 'object' && !Array.isArray(proposal)) {
      const resourceProposal = record(proposal);
      const acquisitionMode = resourceProposal.acquisitionMode;

      if (
        acquisitionMode !== undefined &&
        acquisitionMode !== ManagedEmailAcquisitionMode.NEW_MANAGED &&
        acquisitionMode !== ManagedEmailAcquisitionMode.PREWARMED_INVENTORY &&
        acquisitionMode !==
          ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
      ) {
        return fail();
      }

      if (
        acquisitionMode ===
        ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
      ) {
        const customerOwnedDomain = normalizedDomain(
          resourceProposal.customerOwnedDomain,
        );

        if (
          !Array.isArray(resourceSnapshot.domains) ||
          resourceSnapshot.domains.length !== 1
        ) {
          return fail();
        }

        const domain = record(resourceSnapshot.domains[0]);

        if (
          str(domain.domain, 253) !== customerOwnedDomain ||
          'providerQuote' in domain ||
          'providerInventoryId' in domain ||
          'prewarmedProviderCosts' in domain
        ) {
          return fail();
        }
      }
    }
  }

  return value as ManagedEmailQuote;
};

const proposalSnapshotToJson = (value: unknown): ManagedEmailProposal | null =>
  value === null ? null : validateManagedEmailProposalSnapshot(value);

const proposalSnapshotFromJson = (
  value: unknown,
): ManagedEmailProposal | null => {
  if (value === null) return null;

  const snapshot = validateManagedEmailProposalSnapshot(value);

  return {
    ...snapshot,
    createdAt: new Date(snapshot.createdAt),
    expiresAt: new Date(snapshot.expiresAt),
  };
};

const quoteSnapshotToJson = (value: unknown): ManagedEmailQuote | null =>
  value === null ? null : validateManagedEmailQuoteSnapshot(value);

const quoteSnapshotFromJson = (value: unknown): ManagedEmailQuote | null => {
  if (value === null) return null;

  const snapshot = validateManagedEmailQuoteSnapshot(value);

  return {
    ...snapshot,
    expiresAt: new Date(snapshot.expiresAt),
  };
};

export const managedEmailProposalSnapshotTransformer: ValueTransformer = {
  to: proposalSnapshotToJson,
  from: proposalSnapshotFromJson,
};
export const managedEmailQuoteSnapshotTransformer: ValueTransformer = {
  to: quoteSnapshotToJson,
  from: quoteSnapshotFromJson,
};

export const canonicalManagedEmailJson = (value: unknown): string => {
  const normalize = (v: unknown): unknown =>
    v instanceof Date
      ? v.toISOString()
      : Array.isArray(v)
        ? v.map(normalize)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, normalize(x)]),
            )
          : v;
  return JSON.stringify(normalize(value));
};
