import { type ManagedEmailProductKey } from './managed-email-catalog.type';
import { type ManagedEmailDisclosures } from './managed-email-proposal.type';
import { type ManagedEmailResourceSnapshot } from './managed-email-persistence.type';

export type ManagedEmailQuoteLine = Readonly<{
  amountCents: number;
  billingFrequency: 'MONTHLY' | 'ANNUAL';
  endingBefore: string;
  metronomeProductId: string;
  productKey: ManagedEmailProductKey;
  productTag: string;
  quantity: number;
  startingAt: string;
  unitPriceCents: number;
}>;

export type ManagedEmailQuote = Readonly<{
  catalogVersion: string;
  currency: 'USD';
  disclosures: ManagedEmailDisclosures;
  dueTodayCents: number;
  expiresAt: Date;
  id: string;
  lines: readonly ManagedEmailQuoteLine[];
  metronomeRateCardAlias: string;
  metronomeRateCardId: string;
  proposalHash: string;
  quoteHash: string;
  resourceSnapshot: ManagedEmailResourceSnapshot;
  workspaceId: string;
}>;

export type ManagedEmailMetronomeProducts = Readonly<
  Record<ManagedEmailProductKey, string>
>;
