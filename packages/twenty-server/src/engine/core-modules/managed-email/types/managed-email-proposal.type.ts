import { ManagedEmailAcquisitionMode } from '../enums/managed-email-acquisition-mode.enum';

type ManagedEmailProposalPersonasInput = {
  mailboxCount: number;
  personas: Array<{
    displayName: string;
    roleTitle: string | null;
    localPartPreference: string;
    signature: string;
  }>;
};

export type CreateManagedEmailProposalInput =
  | (ManagedEmailProposalPersonasInput & {
      acquisitionMode?: ManagedEmailAcquisitionMode.NEW_MANAGED;
      customerOwnedDomain?: never;
    })
  | (ManagedEmailProposalPersonasInput & {
      acquisitionMode: ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT;
      customerOwnedDomain: string;
    });

export type CreatePrewarmedManagedEmailProposalInput = {
  inventoryIds: string[];
};

export type ManagedEmailProposalPolicy = Readonly<{
  allowProviderAlternatives: boolean;
  candidateDomains: (workspaceSlug: string, domainCount: number) => string[];
  maxMailboxesPerDomain: number;
  proposalTtlMs: number;
  version: string;
}>;

export type ManagedEmailProposalContext = Readonly<{
  actorWorkspaceMemberId: string;
  workspaceId: string;
  workspaceSlug: string;
}>;

export type ManagedEmailProposalPersona = Readonly<{
  address: string;
  createdByWorkspaceMemberId: string;
  firstName: string;
  lastName: string;
  localPart: string;
  roleTitle: string | null;
  signature: string;
  version: number;
}>;

export type ManagedEmailProposalDomain = Readonly<{
  domain: string;
  mailboxes: readonly ManagedEmailProposalPersona[];
  providerInventoryId?: string;
  prewarmedProviderCosts?: Readonly<{
    domainPriceCents: number;
    mailboxPriceCents: number;
  }>;
  providerQuote?: Readonly<{
    amountMinorUnits: number;
    currency: 'USD';
    fingerprint: string;
    observedAt: string;
    termCount: 1;
    termUnit: 'YEAR';
  }>;
}>;

export type ManagedEmailDisclosures = Readonly<{
  cancellation: string;
  managedServiceOwnership: string;
  prepaidBalance: string;
}>;

export type ManagedEmailProposal = Readonly<{
  acquisitionMode: ManagedEmailAcquisitionMode;
  createdAt: Date;
  customerOwnedDomain?: string;
  disclosures: ManagedEmailDisclosures;
  domains: readonly ManagedEmailProposalDomain[];
  expiresAt: Date;
  id: string;
  mailboxCount: number;
  policyVersion: string;
  workspaceId: string;
}>;
