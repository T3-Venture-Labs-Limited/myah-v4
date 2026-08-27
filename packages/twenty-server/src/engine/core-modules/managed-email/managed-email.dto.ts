import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ManagedEmailOverview')
export class ManagedEmailOverviewDTO {
  @Field(() => Boolean)
  acquisitionAvailable: boolean;

  @Field(() => Int)
  actionRequiredCount: number;

  @Field(() => Int)
  domainCount: number;

  @Field(() => Int)
  mailboxCount: number;

  @Field(() => Int)
  readyCount: number;

  @Field(() => String)
  status: string;

  @Field(() => Int)
  warmingCount: number;
}

@ObjectType('ManagedEmailDomain')
export class ManagedEmailDomainDTO {
  @Field(() => Boolean)
  cancelAtPeriodEnd: boolean;

  @Field(() => String)
  acquisitionMode: string;

  @Field(() => Int)
  dependentMailboxCount: number;

  @Field(() => String)
  domain: string;

  @Field(() => String)
  id: string;

  @Field(() => String)
  infrastructureState: string;

  @Field(() => Date, { nullable: true })
  paidThrough: Date | null;

  @Field(() => [String])
  requiredNameservers: string[];

  @Field(() => Boolean)
  renewalEnabled: boolean;

  @Field(() => String, { nullable: true })
  safeFailureCode: string | null;
}

@ObjectType('ManagedEmailMailbox')
export class ManagedEmailMailboxDTO {
  @Field(() => String)
  address: string;

  @Field(() => Int, { nullable: true })
  adminDailyCap: number | null;

  @Field(() => String)
  campaignEligibility: string;

  @Field(() => String)
  domain: string;

  @Field(() => String)
  domainId: string;

  @Field(() => String)
  id: string;
  @Field(() => Boolean)
  infrastructureCancelAtPeriodEnd: boolean;

  @Field(() => String)
  infrastructureState: string;

  @Field(() => Date, { nullable: true })
  lastHealthEvaluatedAt: Date | null;

  @Field(() => String)
  personaDisplayName: string;

  @Field(() => String, { nullable: true })
  personaRole: string | null;

  @Field(() => Int)
  policySafeDailyCapacity: number;

  @Field(() => String, { nullable: true })
  safeFailureCode: string | null;

  @Field(() => Date, { nullable: true })
  servicePaidThrough: Date | null;
  @Field(() => Boolean)
  warmupCancelAtPeriodEnd: boolean;

  @Field(() => String)
  warmupState: string;

  @Field(() => Date, { nullable: true })
  warmupPaidThrough: Date | null;
}

@ObjectType('ManagedEmailBundleMailbox')
export class ManagedEmailBundleMailboxDTO {
  @Field(() => String)
  address: string;

  @Field(() => String)
  displayName: string;
}

@ObjectType('ManagedEmailBundle')
export class ManagedEmailBundleDTO {
  @Field(() => String)
  bundleId: string;

  @Field(() => String)
  domain: string;

  @Field(() => Boolean)
  exclusiveWorkspaceUse: boolean;

  @Field(() => [ManagedEmailBundleMailboxDTO])
  mailboxes: ManagedEmailBundleMailboxDTO[];

  @Field(() => Int)
  mailboxCount: number;

  @Field(() => Date)
  observedAt: Date;

  @Field(() => String)
  providerType: string;
}

@ObjectType('ManagedEmailDisclosures')
export class ManagedEmailDisclosuresDTO {
  @Field(() => String)
  cancellation: string;

  @Field(() => String)
  managedServiceOwnership: string;

  @Field(() => String)
  prepaidBalance: string;
}

@ObjectType('ManagedEmailProposalMailbox')
export class ManagedEmailProposalMailboxDTO {
  @Field(() => String)
  address: string;

  @Field(() => String)
  displayName: string;

  @Field(() => String, { nullable: true })
  roleTitle: string | null;
}

@ObjectType('ManagedEmailProposalDomain')
export class ManagedEmailProposalDomainDTO {
  @Field(() => String)
  domain: string;

  @Field(() => [ManagedEmailProposalMailboxDTO])
  mailboxes: ManagedEmailProposalMailboxDTO[];
}

@ObjectType('ManagedEmailProposal')
export class ManagedEmailProposalDTO {
  @Field(() => ManagedEmailDisclosuresDTO)
  disclosures: ManagedEmailDisclosuresDTO;

  @Field(() => [ManagedEmailProposalDomainDTO])
  domains: ManagedEmailProposalDomainDTO[];

  @Field(() => Date)
  expiresAt: Date;

  @Field(() => String)
  id: string;

  @Field(() => Int)
  mailboxCount: number;

  @Field(() => String)
  policyVersion: string;
}

@ObjectType('ManagedEmailQuoteLine')
export class ManagedEmailQuoteLineDTO {
  @Field(() => Int)
  amountCents: number;

  @Field(() => String)
  billingFrequency: string;

  @Field(() => Date)
  endingBefore: Date;

  @Field(() => String)
  productKey: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => Date)
  startingAt: Date;

  @Field(() => Int)
  unitPriceCents: number;
}

@ObjectType('ManagedEmailQuote')
export class ManagedEmailQuoteDTO {
  @Field(() => String)
  currency: string;

  @Field(() => ManagedEmailDisclosuresDTO)
  disclosures: ManagedEmailDisclosuresDTO;

  @Field(() => Int)
  dueTodayCents: number;

  @Field(() => Date)
  expiresAt: Date;

  @Field(() => String)
  id: string;

  @Field(() => [ManagedEmailQuoteLineDTO])
  lines: ManagedEmailQuoteLineDTO[];

  @Field(() => String)
  quoteFingerprint: string;

  @Field(() => String)
  quoteVersion: string;
  @Field(() => Boolean)
  isSandbox: boolean;
}

@ObjectType('ManagedEmailPaymentSetup')
export class ManagedEmailPaymentSetupDTO {
  @Field(() => String)
  clientSecret: string;

  @Field(() => String)
  publishableKey: string;

  @Field(() => String)
  setupIntentId: string;

  @Field(() => Boolean)
  ready: boolean;
}

@ObjectType('ManagedEmailPaymentMethodStatus')
export class ManagedEmailPaymentMethodStatusDTO {
  @Field(() => Boolean)
  ready: boolean;
}

@ObjectType('ManagedEmailSubscription')
export class ManagedEmailSubscriptionDTO {
  @Field(() => String, { nullable: true })
  action: string | null;

  @Field(() => String)
  billingInterval: string;

  @Field(() => String)
  currency: string;

  @Field(() => Date, { nullable: true })
  paidThrough: Date | null;

  @Field(() => String)
  productKey: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => Int)
  recurringAmountCents: number;

  @Field(() => [String])
  resourceIds: string[];

  @Field(() => [String])
  resourceLabels: string[];

  @Field(() => String)
  resourceType: string;

  @Field(() => String)
  service: string;

  @Field(() => String)
  status: string;

  @Field(() => Int)
  unitPriceCents: number;
}

@ObjectType('ManagedEmailOperation')
export class ManagedEmailOperationDTO {
  @Field(() => String)
  acquisitionMode: string;

  @Field(() => String)
  amountCents: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  id: string;

  @Field(() => String, { nullable: true })
  paymentStatus: string | null;

  @Field(() => String, { nullable: true })
  safeFailureCode: string | null;

  @Field(() => String)
  state: string;

  @Field(() => Date)
  updatedAt: Date;
}

@ObjectType('ManagedEmailHealthDetails')
export class ManagedEmailHealthDetailsDTO {
  @Field(() => Int, { nullable: true })
  adminDailyCap: number | null;

  @Field(() => String)
  campaignEligibility: string;

  @Field(() => Date, { nullable: true })
  lastEvaluatedAt: Date | null;

  @Field(() => Int)
  policySafeDailyCapacity: number;

  @Field(() => String, { nullable: true })
  safeFailureCode: string | null;
}

@ObjectType('ManagedEmailActionResult')
export class ManagedEmailActionResultDTO {
  @Field(() => Boolean)
  accepted: boolean;

  @Field(() => String)
  operationId: string;
}
