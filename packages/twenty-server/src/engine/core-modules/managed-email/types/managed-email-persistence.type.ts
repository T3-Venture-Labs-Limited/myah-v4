import { type ManagedEmailAcquisitionMode } from '../enums/managed-email-acquisition-mode.enum';
import { type ManagedEmailProductKey } from './managed-email-catalog.type';

export type ManagedEmailSafeScalar = boolean | number | string;

export type ManagedEmailSafeFact = {
  readonly name: string;
  readonly value: ManagedEmailSafeScalar;
};

export type ManagedEmailSafeFacts = {
  readonly schemaVersion: 1;
  readonly facts: readonly ManagedEmailSafeFact[];
};

export type ManagedEmailProviderReceipt = {
  readonly domains: ReadonlyArray<{
    readonly mailboxes: ReadonlyArray<{
      readonly normalizedAddress: string;
      readonly providerMailboxId: string;
    }>;
    readonly normalizedDomain: string;
    readonly providerDomainId: string;
    readonly providerOrderId: string | null;
  }>;
  readonly failedInventoryIds: readonly string[];
  readonly orderIds: readonly string[];
  readonly schemaVersion: 1;
  readonly totalCostCents: number | null;
};

export type ManagedEmailResourceSnapshot = {
  readonly proposal: {
    readonly acquisitionMode?: ManagedEmailAcquisitionMode;
    readonly createdAt: string;
    readonly customerOwnedDomain?: string;
    readonly expiresAt: string;
    readonly policyVersion: string;
  };
  readonly domains: ReadonlyArray<{
    readonly domain: string;
    readonly providerInventoryId?: string;
    readonly prewarmedProviderCosts?: {
      readonly domainPriceCents: number;
      readonly mailboxPriceCents: number;
    };
    readonly mailboxes: readonly string[];
    readonly providerQuote?: {
      readonly amountMinorUnits: number;
      readonly currency: 'USD';
      readonly fingerprint: string;
      readonly observedAt: string;
      readonly termCount: 1;
      readonly termUnit: 'YEAR';
    };
  }>;
  readonly personas: ReadonlyArray<{
    readonly address: string;
    readonly createdByWorkspaceMemberId: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly localPart: string;
    readonly roleTitle: string | null;
    readonly signature: string;
    readonly version: number;
  }>;
};

export type ManagedEmailExpectedLineItem = {
  readonly billingFrequency: 'ANNUAL' | 'MONTHLY';
  readonly productKey: ManagedEmailProductKey;
  readonly productTag: string;
  readonly metronomeProductId: string;
  readonly currency: 'USD';
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly totalCents: number;
  readonly periodStart: string;
  readonly periodEnd: string;
};

export type ManagedEmailCorrelatedSubscriptionLine = {
  readonly subscriptionId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly total: number;
  readonly unitPrice: number;
  readonly startingAt: string;
  readonly endingBefore: string;
  readonly isProrated: boolean;
};
export type ManagedEmailPaymentReceipt = {
  readonly externalInvoiceId: string;
  readonly externalPaymentId: string;
  readonly metronomeInvoiceId: string;
};

export type ManagedEmailRenewalProjection = {
  readonly receipts: readonly ManagedEmailPaymentReceipt[];
  readonly resources: ReadonlyArray<{
    readonly kind: 'domain' | 'mailbox' | 'warmup';
    readonly resourceId: string;
    readonly paidThrough: string;
  }>;
};
