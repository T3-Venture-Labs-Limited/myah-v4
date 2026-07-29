import { type ManagedEmailProductKey } from './managed-email-catalog.type';

export type ManagedEmailSafeScalar = boolean | number | string;

export type ManagedEmailSafeFacts = Record<string, ManagedEmailSafeScalar>;

export type ManagedEmailResourceSnapshot = {
  domains: Array<{
    domain: string;
    mailboxes: string[];
  }>;
};

export type ManagedEmailExpectedLineItem = {
  productKey: ManagedEmailProductKey;
  productAlias: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  periodStart: string;
  periodEnd: string;
};

export type ManagedEmailCorrelatedSubscriptionLine = {
  subscriptionId: string;
  productId: string;
  quantity: number;
  total: number;
  unitPrice: number;
  startingAt: string;
  endingBefore: string;
  isProrated: boolean;
};
