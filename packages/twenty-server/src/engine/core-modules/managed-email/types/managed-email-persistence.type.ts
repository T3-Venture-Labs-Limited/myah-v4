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

export type ManagedEmailResourceSnapshot = {
  readonly domains: ReadonlyArray<{
    readonly domain: string;
    readonly mailboxes: readonly string[];
  }>;
};

export type ManagedEmailExpectedLineItem = {
  readonly productKey: ManagedEmailProductKey;
  readonly productAlias: string;
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
