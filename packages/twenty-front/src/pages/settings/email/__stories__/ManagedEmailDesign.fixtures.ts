import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { type ThemeColor } from 'twenty-ui/theme';

export type ManagedEmailDesignDomainSource =
  | 'managed'
  | 'external'
  | 'prewarmed';

export type ManagedEmailDesignDomainVerification =
  | 'verified'
  | 'verification-required'
  | 'checking-dns'
  | 'action-required'
  | 'mailbox-connected';

export type ManagedEmailDesignDnsStatus =
  | 'verified'
  | 'verification-required'
  | 'checking-dns'
  | 'action-required';

export type ManagedEmailDesignMailboxSource =
  | 'managed'
  | 'connected'
  | 'prewarmed';

export type ManagedEmailDesignRecurringProduct =
  | 'managed-domain'
  | 'managed-mailbox'
  | 'managed-warmup';

export type ManagedEmailDesignResourceSnapshot = {
  id: string;
  kind: 'domain' | 'mailbox' | 'warmup-capacity';
  label: string;
};

export type ManagedEmailDesignSubscriptionCommercialShape =
  | { product: 'managed-domain'; cadence: 'annual'; quantity: 1 }
  | {
      product: 'managed-mailbox' | 'managed-warmup';
      cadence: 'monthly';
      quantity: number;
    };

export type ManagedEmailDesignNonQuantitySubscriptionLifecycle =
  | {
      status: 'active';
      renewsAt: string;
      pendingQuantity?: never;
      changeEffectiveAt?: never;
      cancelAt?: never;
      canceledAt?: never;
    }
  | {
      status: 'pending-cancel';
      renewsAt: string;
      pendingQuantity?: never;
      changeEffectiveAt?: never;
      cancelAt: string;
      canceledAt?: never;
    }
  | {
      status: 'canceled';
      renewsAt: null;
      pendingQuantity?: never;
      changeEffectiveAt?: never;
      cancelAt?: never;
      canceledAt: string;
    };

export type ManagedEmailDesignQuantitySubscriptionLifecycle =
  | ManagedEmailDesignNonQuantitySubscriptionLifecycle
  | {
      status: 'pending-change';
      renewsAt: string;
      pendingQuantity: number;
      changeEffectiveAt: string;
      cancelAt?: never;
      canceledAt?: never;
    };

export type ManagedEmailDesignRecurringSubscriptionBase = {
  id: string;
  workspaceId: string;
  linkedResources: ManagedEmailDesignResourceSnapshot[];
  unitPriceCents: number;
};

export type ManagedEmailDesignRecurringSubscription =
  ManagedEmailDesignRecurringSubscriptionBase &
    (
      | ({
          product: 'managed-domain';
          cadence: 'annual';
          quantity: 1;
        } & ManagedEmailDesignNonQuantitySubscriptionLifecycle)
      | ({
          product: 'managed-mailbox' | 'managed-warmup';
          cadence: 'monthly';
          quantity: number;
        } & ManagedEmailDesignQuantitySubscriptionLifecycle)
    );

export type ManagedEmailDesignQuoteLine = {
  id: string;
  resourceLabel: string;
  unitPriceCents: number;
  amountCents: number;
  startsAt: string;
  renewsAt: string;
} & ManagedEmailDesignSubscriptionCommercialShape;

export type ManagedEmailDesignQuoteTotals = {
  dueTodayCents: number;
  monthlyRecurringCents: number;
  annualRecurringCents: number;
};

export type ManagedEmailDesignQuoteSnapshot = {
  id: string;
  lines: ManagedEmailDesignQuoteLine[];
  totals: ManagedEmailDesignQuoteTotals;
};

export type ManagedEmailDesignQuote = {
  id: string;
  expiresAt: string;
  acceptedQuoteId: string | null;
  lines: ManagedEmailDesignQuoteLine[];
  totals: ManagedEmailDesignQuoteTotals;
  capacityRequest?: ManagedEmailDesignCapacityRequest;
} & (
  | { status: 'valid'; previousQuote?: never }
  | { status: 'expired'; previousQuote?: never }
  | {
      status: 'price-changed';
      previousQuote: ManagedEmailDesignQuoteSnapshot;
    }
);

export type ManagedEmailDesignSubscriptionIntent =
  | {
      product: 'managed-domain';
      mode: 'create';
      targetSubscriptionId: string;
      quantityDelta: 1;
      resourceSnapshotIds: [string];
    }
  | {
      product: 'managed-mailbox';
      mode: 'create' | 'increment-existing' | 'attach-existing-capacity';
      targetSubscriptionId: string;
      quantityDelta: number;
      resourceSnapshotIds: [string, ...string[]];
    }
  | {
      product: 'managed-warmup';
      mode: 'create' | 'increment-existing';
      targetSubscriptionId: string;
      quantityDelta: number;
      resourceSnapshotIds: [string, ...string[]];
    };

export type ManagedEmailDesignCapacityRequest = {
  id: string;
  resourceHistoryCount: number;
  requestKey: string;
  intent: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-mailbox' | 'managed-warmup' }
  >;
};

export type ManagedEmailDesignAcquisitionSubscriptionOperation = {
  id: string;
  intent: ManagedEmailDesignSubscriptionIntent;
  outcome: 'blocked' | 'pending' | 'completed' | 'failed' | 'unknown';
};

export type ManagedEmailDesignAcquisitionLine = {
  id: string;
  quoteLineId: string;
  resourceSnapshotId: string;
  dependsOnLineIds: string[];
  resourceOperationId: string;
  subscriptionOperationId: string;
  paymentEvidenceId: string;
  resourceOutcome: 'blocked' | 'pending' | 'completed' | 'failed' | 'unknown';
  paymentOutcome: 'pending' | 'completed' | 'failed' | 'unknown';
};

export type ManagedEmailDesignAcquisitionStatus =
  | 'pending'
  | 'failed'
  | 'succeeded'
  | 'partial'
  | 'reconciliation-required';

export type ManagedEmailDesignAcquisitionSource =
  | 'managed-domain'
  | 'managed-mailbox'
  | 'managed-warmup'
  | 'prewarmed';

export type ManagedEmailDesignAcquisitionOperation =
  | {
      status: 'idle';
      id: null;
      acceptedQuoteId: null;
      source: null;
      lines: [];
      subscriptionOperations: [];
    }
  | {
      status: ManagedEmailDesignAcquisitionStatus;
      id: string;
      acceptedQuoteId: string;
      source: ManagedEmailDesignAcquisitionSource;
      lines: ManagedEmailDesignAcquisitionLine[];
      subscriptionOperations: ManagedEmailDesignAcquisitionSubscriptionOperation[];
    };

export type ManagedEmailDesignMailboxWarmupOperation =
  | {
      status: 'idle';
      action?: never;
      operationId?: never;
      safeDiagnostic?: never;
    }
  | {
      status: 'pending' | 'failed' | 'unknown';
      action: 'start' | 'pause' | 'resume' | 'stop';
      operationId: string;
      safeDiagnostic?: string;
    };

export type ManagedEmailDesignMailboxWarmupState = {
  assignment: 'unassigned' | 'assigned';
  lastConfirmedProviderState: 'inactive' | 'warming' | 'paused';
  operation: ManagedEmailDesignMailboxWarmupOperation;
};

export type ManagedEmailDesignMailboxConnectionProtocol =
  | 'IMAP'
  | 'SMTP'
  | 'CALDAV';

export type ManagedEmailDesignMailboxConnectionSecurity =
  | 'NONE'
  | 'STARTTLS'
  | 'SSL_TLS';

export const managedEmailDesignMailboxConnectionSafeDiagnostics = [
  'Authentication failed. Re-enter the password and try again.',
  'The TLS certificate could not be verified. Check the connection security setting.',
  'The mail server could not be reached. Check the host and port.',
  'The provider did not respond.',
  'The connection result is unknown. Reconcile it before trying again.',
] as const;

export type ManagedEmailDesignMailboxConnectionSafeDiagnostic =
  (typeof managedEmailDesignMailboxConnectionSafeDiagnostics)[number];

const managedEmailDesignMailboxConnectionSafeDiagnosticMessages: Record<
  ManagedEmailDesignMailboxConnectionSafeDiagnostic,
  MessageDescriptor
> = {
  'Authentication failed. Re-enter the password and try again.': msg`Authentication failed. Re-enter the password and try again.`,
  'The TLS certificate could not be verified. Check the connection security setting.': msg`The TLS certificate could not be verified. Check the connection security setting.`,
  'The mail server could not be reached. Check the host and port.': msg`The mail server could not be reached. Check the host and port.`,
  'The provider did not respond.': msg`The provider did not respond.`,
  'The connection result is unknown. Reconcile it before trying again.': msg`The connection result is unknown. Reconcile it before trying again.`,
};

export const getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage = (
  diagnostic: ManagedEmailDesignMailboxConnectionSafeDiagnostic,
): MessageDescriptor =>
  managedEmailDesignMailboxConnectionSafeDiagnosticMessages[diagnostic];

export type ManagedEmailDesignMailboxSendingCapabilityReason =
  | 'SMTP is not configured, so this mailbox cannot send mail.'
  | 'Complete the SMTP host and password before this mailbox can send mail.';

const managedEmailDesignMailboxSendingCapabilityReasonMessages: Record<
  ManagedEmailDesignMailboxSendingCapabilityReason,
  MessageDescriptor
> = {
  'SMTP is not configured, so this mailbox cannot send mail.': msg`SMTP is not configured, so this mailbox cannot send mail.`,
  'Complete the SMTP host and password before this mailbox can send mail.': msg`Complete the SMTP host and password before this mailbox can send mail.`,
};

export const getManagedEmailDesignMailboxSendingCapabilityReasonMessage = (
  reason: ManagedEmailDesignMailboxSendingCapabilityReason,
): MessageDescriptor =>
  managedEmailDesignMailboxSendingCapabilityReasonMessages[reason];

export type ManagedEmailDesignConnectionDraft = {
  address: string;
  selectedProtocol?: ManagedEmailDesignMailboxConnectionProtocol | null;
  host?: string;
  port?: number;
  connectionSecurity?: ManagedEmailDesignMailboxConnectionSecurity;
  username?: string;
};

export type ManagedEmailDesignMailboxConnectionMode = 'add' | 'edit' | 'retest';

export type ManagedEmailDesignMailboxConnectionConfiguredOutcome =
  | 'failed'
  | 'connected'
  | 'unknown';

export type ManagedEmailDesignMailboxConnectionOperation =
  | {
      status: 'idle';
      operationId?: never;
      configuredOutcome?: never;
      safeDiagnostic?: never;
    }
  | {
      status: 'testing' | 'failed' | 'connected' | 'unknown';
      operationId: string;
      configuredOutcome: ManagedEmailDesignMailboxConnectionConfiguredOutcome;
      safeDiagnostic?: ManagedEmailDesignMailboxConnectionSafeDiagnostic;
    };

export type ManagedEmailDesignMailboxConnection = {
  draft: ManagedEmailDesignConnectionDraft;
  capabilities: Array<'imap' | 'smtp' | 'caldav'>;
  canSend?: boolean;
  sendingCapabilityReason?: ManagedEmailDesignMailboxSendingCapabilityReason | null;
  mode?: ManagedEmailDesignMailboxConnectionMode;
  mailboxId?: string | null;
  operation: ManagedEmailDesignMailboxConnectionOperation;
};

export type ManagedEmailDesignMailboxConnectionLifecycle = {
  mode: ManagedEmailDesignMailboxConnectionMode;
  mailboxId: string | null;
  draft: ManagedEmailDesignConnectionDraft;
  capabilities: ManagedEmailDesignMailboxConnection['capabilities'];
  canSend: boolean;
  sendingCapabilityReason: ManagedEmailDesignMailboxSendingCapabilityReason | null;
  operation: ManagedEmailDesignMailboxConnectionOperation;
  operationId: string | null;
  configuredOutcome: ManagedEmailDesignMailboxConnectionConfiguredOutcome;
  reconcileOutcome: Extract<
    ManagedEmailDesignMailboxConnectionConfiguredOutcome,
    'failed' | 'connected'
  >;
  formEpoch: number;
  requiresFreshPassword: boolean;
};

/**
 * These fixtures model only Storybook-local state. They intentionally do not
 * represent production providers, billing, DNS, or mailbox credentials.
 */
export type ManagedEmailDesignDomain = {
  id: string;
  name: string;
  source: ManagedEmailDesignDomainSource;
  verification: ManagedEmailDesignDomainVerification;
  subscriptionId: string | null;
};

export type ManagedEmailDesignMailbox = {
  id: string;
  identity: string;
  address: string;
  domain: string;
  source: ManagedEmailDesignMailboxSource;
  subscriptionId: string | null;
  readiness: 'not-ready' | 'ready';
  warmupState: ManagedEmailDesignMailboxWarmupState;
  connection?: ManagedEmailDesignMailboxConnection;
};

export type ManagedEmailDesignPrewarmedBundle = {
  id: string;
  domain: string;
  mailboxIdentities: Array<{
    identity: string;
    address: string;
  }>;
};

export type ManagedEmailDesignWorkspace = {
  domains: ManagedEmailDesignDomain[];
  mailboxes: ManagedEmailDesignMailbox[];
  prewarmedBundles: ManagedEmailDesignPrewarmedBundle[];
  subscriptions: ManagedEmailDesignRecurringSubscription[];
};

export type ManagedEmailDesignManagedDomainSubscription =
  ManagedEmailDesignRecurringSubscriptionBase & {
    product: 'managed-domain';
    cadence: 'annual';
    quantity: 1;
  } & ManagedEmailDesignNonQuantitySubscriptionLifecycle;

export const getManagedEmailDesignDomainSubscription = ({
  domain,
  subscriptions,
}: {
  domain: ManagedEmailDesignDomain;
  subscriptions: ManagedEmailDesignRecurringSubscription[];
}): ManagedEmailDesignManagedDomainSubscription | null => {
  if (domain.source === 'external' || domain.subscriptionId === null) {
    return null;
  }

  return (
    subscriptions.find(
      (
        subscription,
      ): subscription is ManagedEmailDesignManagedDomainSubscription =>
        subscription.id === domain.subscriptionId &&
        subscription.product === 'managed-domain' &&
        subscription.linkedResources.some(
          (resource) => resource.kind === 'domain' && resource.id === domain.id,
        ),
    ) ?? null
  );
};

export type ManagedEmailDesignDomainSearchResult = {
  domain: string;
  available: boolean;
  annualCents: number;
};

export type ManagedEmailDesignDomainSearchStatus =
  | 'idle'
  | 'loading'
  | 'failed'
  | 'results'
  | 'no-results';

export type ManagedEmailDesignDomainSearchOperation =
  | {
      status: 'idle';
      operationId?: never;
      configuredOutcome: 'results' | 'no-results';
      safeDiagnostic?: never;
    }
  | {
      status: 'loading' | 'results' | 'no-results';
      operationId: string;
      configuredOutcome: 'results' | 'no-results';
      safeDiagnostic?: never;
    }
  | {
      status: 'failed';
      operationId: string;
      configuredOutcome: 'results' | 'no-results';
      safeDiagnostic?: string;
    };

export type ManagedEmailDesignDomainSearchLifecycle = {
  operation: ManagedEmailDesignDomainSearchOperation;
  configuredResults: ManagedEmailDesignDomainSearchResult[];
  nextOperationIds?: string[];
  nextOperationIdIndex?: number;
};

export type ManagedEmailDesignDnsOperationStatus =
  | 'idle'
  | 'checking'
  | 'completed'
  | 'check-failed'
  | 'unknown';

export type ManagedEmailDesignDnsCheckOperation =
  | {
      status: 'idle';
      operationId?: never;
      configuredOutcome?: 'completed' | 'check-failed' | 'unknown';
      safeDiagnostic?: never;
    }
  | {
      status: 'checking' | 'completed';
      operationId: string;
      configuredOutcome?: 'completed' | 'check-failed' | 'unknown';
      safeDiagnostic?: never;
    }
  | {
      status: 'check-failed' | 'unknown';
      operationId: string;
      configuredOutcome?: 'completed' | 'check-failed' | 'unknown';
      safeDiagnostic: string;
    };

export type ManagedEmailDesignDnsLifecycleOperation =
  ManagedEmailDesignDnsCheckOperation & {
    configuredOutcome: 'completed' | 'check-failed' | 'unknown';
  };

export type ManagedEmailDesignDnsRecord = {
  id: string;
  status: 'pending' | 'verified' | 'action-required';
  statusColor?: ThemeColor;
  type: string;
  key: string;
  value: string;
  priority?: number;
  ttl?: string;
  observedValue?: string;
  safeProblem?: string;
};

export type ManagedEmailDesignDnsLifecyclePurpose =
  | 'verify'
  | 'view'
  | 'repair'
  | 'reverify';

export type ManagedEmailDesignDnsLifecycle = {
  domain: {
    id: string;
    name: string;
  };
  purpose?: ManagedEmailDesignDnsLifecyclePurpose;
  operation: ManagedEmailDesignDnsLifecycleOperation;
  records: ManagedEmailDesignDnsRecord[];
  completedRecords?: ManagedEmailDesignDnsRecord[];
  nextOperationIds?: string[];
  nextOperationIdIndex?: number;
};

export type ManagedEmailDesignReviewKind =
  | 'domain-only'
  | 'mailbox-only'
  | 'prewarmed-bundle';

export type ManagedEmailDesignReviewLine = {
  id: string;
  product: ManagedEmailDesignRecurringProduct;
  category: 'Domain' | 'Mailbox';
  service: string;
  resource: string;
  recurrence: 'Annual' | 'Monthly';
  unitPriceCents: number;
  quantity: number;
  amountCents: number;
  dueTodayCents: number;
};

export type ManagedEmailDesignCompletion =
  | {
      type: 'add-managed-domain';
      domain: ManagedEmailDesignDomain;
    }
  | {
      type: 'add-managed-mailbox';
      mailbox: ManagedEmailDesignMailbox;
    }
  | {
      type: 'add-prewarmed-bundle';
      bundleId: string;
    };

export type ManagedEmailDesignReviewDraft = {
  kind: ManagedEmailDesignReviewKind;
  title: MessageDescriptor;
  description: MessageDescriptor;
  selectedDomain: string | null;
  selectedMailbox: string | null;
  lines: ManagedEmailDesignReviewLine[];
  dueTodayCents: number;
  completion: ManagedEmailDesignCompletion;
};

export const normalizeManagedEmailDesignDomain = (value: string) =>
  value.trim().toLowerCase();

export const normalizeManagedEmailDesignMailboxAddress = (value: string) =>
  value.trim().toLowerCase();

const managedEmailDesignDomainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const managedEmailDesignLocalPartPattern =
  /^(?!.*\.\.)[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/i;
const managedEmailDesignEmailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isManagedEmailDesignDomain = (value: string) =>
  managedEmailDesignDomainPattern.test(
    normalizeManagedEmailDesignDomain(value),
  );

export const isManagedEmailDesignLocalPart = (value: string) =>
  managedEmailDesignLocalPartPattern.test(value.trim());

export const isManagedEmailDesignEmailAddress = (value: string) =>
  managedEmailDesignEmailAddressPattern.test(
    normalizeManagedEmailDesignMailboxAddress(value),
  );

export const getManagedEmailDesignDomainValidationMessage = ({
  domain,
  domains,
}: {
  domain: string;
  domains: ManagedEmailDesignDomain[];
}) => {
  const normalizedDomain = normalizeManagedEmailDesignDomain(domain);

  if (normalizedDomain === '') {
    return i18n._(msg`Enter a domain name.`);
  }

  if (!isManagedEmailDesignDomain(normalizedDomain)) {
    return i18n._(msg`Enter a valid domain name, such as example.com.`);
  }

  if (
    domains.some(
      (candidate) =>
        normalizeManagedEmailDesignDomain(candidate.name) === normalizedDomain,
    )
  ) {
    return i18n._(
      msg`${normalizedDomain} already exists in this local domain inventory.`,
    );
  }

  return null;
};

export const getManagedEmailDesignMailboxValidationMessage = ({
  address,
  mailboxes,
}: {
  address: string;
  mailboxes: ManagedEmailDesignMailbox[];
}) => {
  const normalizedAddress = normalizeManagedEmailDesignMailboxAddress(address);

  if (!isManagedEmailDesignEmailAddress(normalizedAddress)) {
    return i18n._(msg`Enter a full email address, such as name@example.com.`);
  }

  if (
    mailboxes.some(
      (mailbox) =>
        normalizeManagedEmailDesignMailboxAddress(mailbox.address) ===
        normalizedAddress,
    )
  ) {
    return i18n._(msg`That mailbox already exists in this local inventory.`);
  }

  return null;
};

export const isManagedEmailDesignWarmupAssigned = (
  warmupState: ManagedEmailDesignMailboxWarmupState,
) => warmupState.assignment === 'assigned';

export const getManagedEmailDesignAssignedWarmupCount = (
  mailboxes: ManagedEmailDesignMailbox[],
) =>
  mailboxes.filter((mailbox) =>
    isManagedEmailDesignWarmupAssigned(mailbox.warmupState),
  ).length;

export const getManagedEmailDesignEffectiveSubscriptionQuantity = (
  subscription: ManagedEmailDesignRecurringSubscription | null | undefined,
) => {
  if (
    subscription === null ||
    subscription === undefined ||
    subscription.status === 'canceled' ||
    subscription.status === 'pending-cancel'
  ) {
    return 0;
  }

  return subscription.status === 'pending-change'
    ? Math.min(subscription.quantity, subscription.pendingQuantity)
    : subscription.quantity;
};

export const getManagedEmailDesignAvailableWarmupCount = ({
  subscriptions,
  mailboxes,
}: Pick<ManagedEmailDesignWorkspace, 'subscriptions' | 'mailboxes'>) => {
  const currentSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.product === 'managed-warmup' &&
      subscription.status !== 'canceled',
  );

  if (currentSubscriptions.length > 1) {
    throw new Error('Only one current warmup subscription is allowed.');
  }

  return Math.max(
    getManagedEmailDesignEffectiveSubscriptionQuantity(
      currentSubscriptions[0],
    ) - getManagedEmailDesignAssignedWarmupCount(mailboxes),
    0,
  );
};

export const getManagedEmailDesignLinkedMailboxCount = (
  domainName: string,
  mailboxes: ManagedEmailDesignMailbox[],
) =>
  mailboxes.filter(
    (mailbox) =>
      normalizeManagedEmailDesignDomain(mailbox.domain) ===
      normalizeManagedEmailDesignDomain(domainName),
  ).length;

export const getManagedEmailDesignDomainSearchResults = (
  query: string,
): ManagedEmailDesignDomainSearchResult[] => {
  const normalizedQuery = normalizeManagedEmailDesignDomain(query);

  if (normalizedQuery === 'mooreland') {
    return [
      { domain: 'mooreland.com', available: true, annualCents: 1429 },
      {
        domain: 'mooreland-outreach.com',
        available: true,
        annualCents: 1429,
      },
      { domain: 'getmooreland.com', available: true, annualCents: 1799 },
    ];
  }

  if (normalizedQuery === 'fleetwave-mail.com') {
    return [
      { domain: 'fleetwave-mail.com', available: false, annualCents: 1429 },
      { domain: 'getfleetwave.com', available: true, annualCents: 1799 },
      { domain: 'fleetwave-outreach.com', available: true, annualCents: 1429 },
    ];
  }

  if (normalizedQuery === 'zzzz-nomatch') {
    return [];
  }

  return [];
};

export const managedEmailDesignPricing = {
  managedDomainAnnualCents: 1429,
  managedMailboxMonthlyCents: 500,
  managedWarmupMonthlyCents: 299,
};

export const managedEmailDesignDnsRecords = [
  {
    id: 'dns-record-spf',
    status: 'action-required',
    type: 'TXT',
    key: '@',
    value: 'v=spf1 include:storybook.local ~all',
    ttl: '1 hour',
  },
  {
    id: 'dns-record-dkim',
    status: 'pending',
    type: 'CNAME',
    key: 'myah._domainkey',
    value: 'myah-dkim.storybook.local',
    ttl: '1 hour',
  },
  {
    id: 'dns-record-mx',
    status: 'verified',
    type: 'MX',
    key: '@',
    value: 'inbound.storybook.local',
    priority: 10,
    ttl: '1 hour',
  },
] satisfies ManagedEmailDesignDnsRecord[];

export const createManagedEmailDesignDomain = ({
  name,
  source,
  verification = 'verified',
  subscriptionId,
}: {
  name: string;
  source: ManagedEmailDesignDomainSource;
  verification?: ManagedEmailDesignDomainVerification;
  subscriptionId?: string | null;
}): ManagedEmailDesignDomain => {
  const normalizedName = normalizeManagedEmailDesignDomain(name);

  return {
    id: `story-domain-${normalizedName}`,
    name: normalizedName,
    source,
    verification,
    subscriptionId:
      source === 'external'
        ? null
        : (subscriptionId ?? `subscription-managed-domain-${normalizedName}`),
  };
};
const retainManagedEmailDesignWarmupOperation = (
  operation: ManagedEmailDesignMailboxWarmupOperation,
): ManagedEmailDesignMailboxWarmupOperation => {
  if (operation.status === 'idle') {
    return { status: 'idle' };
  }

  return {
    status: operation.status,
    action: operation.action,
    operationId: operation.operationId,
    ...(operation.safeDiagnostic !== undefined
      ? { safeDiagnostic: operation.safeDiagnostic }
      : {}),
  };
};

const assertManagedEmailDesignMailboxWarmupState = (
  warmupState: ManagedEmailDesignMailboxWarmupState,
) => {
  const { assignment, lastConfirmedProviderState, operation } = warmupState;
  const isIdle = operation.status === 'idle';
  const isStartFailure =
    operation.status === 'failed' && operation.action === 'start';
  const isPendingOrUnknownStart =
    (operation.status === 'pending' || operation.status === 'unknown') &&
    operation.action === 'start';
  const isPendingFailedOrUnknown =
    operation.status === 'pending' ||
    operation.status === 'failed' ||
    operation.status === 'unknown';
  const isWarmingAction =
    isPendingFailedOrUnknown &&
    (operation.action === 'pause' || operation.action === 'stop');
  const isPausedAction =
    isPendingFailedOrUnknown &&
    (operation.action === 'resume' || operation.action === 'stop');

  if (
    (assignment === 'unassigned' &&
      lastConfirmedProviderState === 'inactive' &&
      (isIdle || isStartFailure)) ||
    (assignment === 'assigned' &&
      lastConfirmedProviderState === 'inactive' &&
      isPendingOrUnknownStart) ||
    (assignment === 'assigned' &&
      lastConfirmedProviderState === 'warming' &&
      (isIdle || isWarmingAction)) ||
    (assignment === 'assigned' &&
      lastConfirmedProviderState === 'paused' &&
      (isIdle || isPausedAction))
  ) {
    return;
  }

  throw new Error(
    'Warmup assignment, confirmed provider state, and operation do not form a supported lifecycle state.',
  );
};

const retainManagedEmailDesignConnectionOperation = (
  operation: ManagedEmailDesignMailboxConnectionOperation,
): ManagedEmailDesignMailboxConnectionOperation => {
  if (operation.status === 'idle') {
    return { status: 'idle' };
  }

  const safeDiagnostic =
    operation.safeDiagnostic === undefined
      ? undefined
      : managedEmailDesignMailboxConnectionSafeDiagnostics.find(
          (candidate) => candidate === operation.safeDiagnostic,
        );

  return {
    status: operation.status,
    operationId: operation.operationId,
    configuredOutcome: operation.configuredOutcome,
    ...(safeDiagnostic === undefined ? {} : { safeDiagnostic }),
  };
};

const retainManagedEmailDesignConnectionDraft = (
  draft: ManagedEmailDesignConnectionDraft,
): Required<
  Pick<
    ManagedEmailDesignConnectionDraft,
    'address' | 'selectedProtocol' | 'host' | 'port' | 'connectionSecurity'
  >
> &
  Pick<ManagedEmailDesignConnectionDraft, 'username'> => {
  const selectedProtocol = draft.selectedProtocol ?? 'IMAP';
  const defaultPort =
    selectedProtocol === 'SMTP'
      ? 587
      : selectedProtocol === 'CALDAV'
        ? 443
        : 993;
  const defaultConnectionSecurity =
    selectedProtocol === 'SMTP' ? 'STARTTLS' : 'SSL_TLS';
  const connectionSecurity =
    draft.connectionSecurity === 'NONE' ||
    draft.connectionSecurity === 'STARTTLS' ||
    draft.connectionSecurity === 'SSL_TLS'
      ? draft.connectionSecurity
      : defaultConnectionSecurity;
  const username = draft.username?.trim();

  return {
    address: normalizeManagedEmailDesignMailboxAddress(draft.address),
    selectedProtocol,
    host: draft.host?.trim() ?? '',
    port:
      draft.port !== undefined && Number.isInteger(draft.port) && draft.port > 0
        ? draft.port
        : defaultPort,
    connectionSecurity,
    ...(username ? { username } : {}),
  };
};

export const createManagedEmailDesignMailboxConnection = ({
  draft,
  capabilities,
  canSend = capabilities.includes('smtp'),
  sendingCapabilityReason,
  mode = 'add',
  mailboxId = null,
  operation,
}: {
  draft: ManagedEmailDesignConnectionDraft;
  capabilities: ManagedEmailDesignMailboxConnection['capabilities'];
  canSend?: boolean;
  sendingCapabilityReason?: ManagedEmailDesignMailboxSendingCapabilityReason | null;
  mode?: ManagedEmailDesignMailboxConnectionMode;
  mailboxId?: string | null;
  operation: ManagedEmailDesignMailboxConnectionOperation;
}): Required<
  Pick<
    ManagedEmailDesignMailboxConnection,
    | 'draft'
    | 'capabilities'
    | 'canSend'
    | 'sendingCapabilityReason'
    | 'mode'
    | 'mailboxId'
    | 'operation'
  >
> => {
  const retainedCapabilities = capabilities.filter(
    (
      capability,
    ): capability is ManagedEmailDesignMailboxConnection['capabilities'][number] =>
      capability === 'imap' || capability === 'smtp' || capability === 'caldav',
  );

  return {
    draft: retainManagedEmailDesignConnectionDraft(draft),
    capabilities: retainedCapabilities,
    canSend,
    sendingCapabilityReason: canSend
      ? null
      : (sendingCapabilityReason ??
        'SMTP is not configured, so this mailbox cannot send mail.'),
    mode,
    mailboxId,
    operation: retainManagedEmailDesignConnectionOperation(operation),
  };
};

export const createManagedEmailDesignMailbox = ({
  id,
  identity,
  address,
  domain,
  source,
  subscriptionId,
  readiness = 'not-ready',
  warmupState,
  connection,
}: {
  id?: string;
  identity: string;
  address: string;
  domain: string;
  source: ManagedEmailDesignMailboxSource;
  subscriptionId?: string | null;
  readiness?: ManagedEmailDesignMailbox['readiness'];
  warmupState: ManagedEmailDesignMailboxWarmupState;
  connection?: ManagedEmailDesignMailboxConnection;
}): ManagedEmailDesignMailbox => {
  const retainedWarmupState: ManagedEmailDesignMailboxWarmupState = {
    assignment: warmupState.assignment,
    lastConfirmedProviderState: warmupState.lastConfirmedProviderState,
    operation: retainManagedEmailDesignWarmupOperation(warmupState.operation),
  };
  assertManagedEmailDesignMailboxWarmupState(retainedWarmupState);
  const isExtendedConnection =
    connection?.draft.selectedProtocol !== undefined ||
    connection?.canSend !== undefined ||
    connection?.sendingCapabilityReason !== undefined ||
    connection?.mode !== undefined ||
    connection?.mailboxId !== undefined;
  const retainedConnection =
    source === 'connected' && connection
      ? {
          draft: isExtendedConnection
            ? retainManagedEmailDesignConnectionDraft(connection.draft)
            : {
                address: normalizeManagedEmailDesignMailboxAddress(
                  connection.draft.address,
                ),
              },
          capabilities: connection.capabilities.filter(
            (
              capability,
            ): capability is ManagedEmailDesignMailboxConnection['capabilities'][number] =>
              capability === 'imap' ||
              capability === 'smtp' ||
              capability === 'caldav',
          ),
          operation: retainManagedEmailDesignConnectionOperation(
            connection.operation,
          ),
          ...(isExtendedConnection
            ? {
                canSend:
                  connection.canSend ??
                  connection.capabilities.includes('smtp'),
                sendingCapabilityReason:
                  connection.canSend === false
                    ? (connection.sendingCapabilityReason ??
                      'SMTP is not configured, so this mailbox cannot send mail.')
                    : null,
                mode: connection.mode ?? 'add',
                mailboxId: connection.mailboxId ?? id ?? null,
              }
            : {}),
        }
      : undefined;

  return {
    id:
      id ??
      `story-mailbox-${normalizeManagedEmailDesignMailboxAddress(address)}`,
    identity: identity.trim(),
    address: normalizeManagedEmailDesignMailboxAddress(address),
    domain: normalizeManagedEmailDesignDomain(domain),
    source,
    subscriptionId:
      source === 'connected'
        ? null
        : (subscriptionId ?? 'subscription-managed-mailbox'),
    readiness,
    warmupState: retainedWarmupState,
    ...(retainedConnection ? { connection: retainedConnection } : {}),
  };
};

export type ManagedEmailDesignQuantityChangeResult =
  | {
      status: 'scheduled';
      subscription: ManagedEmailDesignRecurringSubscription;
    }
  | {
      status: 'blocked';
      reason:
        | 'mailbox-quantity-below-live-mailbox-count'
        | 'warmup-quantity-below-assigned-mailbox-count';
    };

export type ManagedEmailDesignCapacityResolution =
  | {
      status: 'ready' | 'requires-acceptance';
      intent: ManagedEmailDesignSubscriptionIntent;
      quote: ManagedEmailDesignQuote;
      subscription?: ManagedEmailDesignRecurringSubscription;
      sourceCanceledSubscriptionId?: string;
    }
  | {
      status: 'blocked';
      reason:
        | 'subscription-change-pending'
        | 'subscription-cancel-pending'
        | 'warmup-capacity-still-available';
      intent?: never;
      quote?: never;
      subscription?: never;
    };

const assertManagedEmailDesignPositiveInteger = (
  value: number,
  label: string,
) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
};

const assertManagedEmailDesignNonNegativeInteger = (
  value: number,
  label: string,
) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
};

const assertManagedEmailDesignUniqueIds = (
  values: Array<{ id: string }>,
  label: string,
) => {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    throw new Error(`${label} ids must be unique.`);
  }
};

export const getManagedEmailDesignTupleIdentity = (
  terms: readonly (string | number)[],
) => {
  let identity = '';

  for (const term of terms) {
    const value = String(term);
    identity += `${value.length}:${value}`;
  }

  return identity;
};

const getManagedEmailDesignSnapshotKind = (
  product: ManagedEmailDesignRecurringProduct,
) =>
  product === 'managed-domain'
    ? 'domain'
    : product === 'managed-mailbox'
      ? 'mailbox'
      : 'warmup-capacity';

const getManagedEmailDesignRenewal = (value: string, months: number) => {
  const renewal = new Date(value);
  const originalDay = renewal.getUTCDate();

  renewal.setUTCDate(1);
  renewal.setUTCMonth(renewal.getUTCMonth() + months);
  const lastDestinationDay = new Date(
    Date.UTC(renewal.getUTCFullYear(), renewal.getUTCMonth() + 1, 0),
  ).getUTCDate();
  renewal.setUTCDate(Math.min(originalDay, lastDestinationDay));

  return renewal.toISOString();
};

const getManagedEmailDesignMailboxSnapshot = (
  mailbox: ManagedEmailDesignMailbox,
): ManagedEmailDesignResourceSnapshot => ({
  id: mailbox.id,
  kind: 'mailbox',
  label: `${mailbox.identity} <${mailbox.address}>`,
});

export const getManagedEmailDesignWarmupSnapshots = ({
  prefix,
  quantity,
}: {
  prefix: string;
  quantity: number;
}): ManagedEmailDesignResourceSnapshot[] =>
  Array.from({ length: quantity }, (_, index) => ({
    id: `${prefix}-warmup-capacity-${index + 1}`,
    kind: 'warmup-capacity',
    label: `Warmup capacity slot ${index + 1}`,
  }));

const getManagedEmailDesignCurrentSubscription = ({
  subscriptions,
  product,
}: {
  subscriptions: ManagedEmailDesignRecurringSubscription[];
  product: 'managed-mailbox' | 'managed-warmup';
}) => {
  const currentSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.product === product && subscription.status !== 'canceled',
  );

  if (currentSubscriptions.length > 1) {
    throw new Error(`Only one current ${product} subscription is allowed.`);
  }

  return currentSubscriptions[0] ?? null;
};

export const getManagedEmailDesignLiveMailboxCount = (
  mailboxes: ManagedEmailDesignMailbox[],
) =>
  mailboxes.filter(
    (mailbox) => mailbox.source === 'managed' || mailbox.source === 'prewarmed',
  ).length;

const getManagedEmailDesignQuoteTotals = ({
  lines,
  fixtureNow,
}: {
  lines: ManagedEmailDesignQuoteLine[];
  fixtureNow: string;
}): ManagedEmailDesignQuoteTotals => ({
  dueTodayCents: lines
    .filter((line) => line.startsAt === fixtureNow)
    .reduce((total, line) => total + line.amountCents, 0),
  monthlyRecurringCents: lines
    .filter((line) => line.cadence === 'monthly')
    .reduce((total, line) => total + line.amountCents, 0),
  annualRecurringCents: lines
    .filter((line) => line.cadence === 'annual')
    .reduce((total, line) => total + line.amountCents, 0),
});

export const createManagedEmailDesignRecurringSubscription = (
  subscription: ManagedEmailDesignRecurringSubscription,
): ManagedEmailDesignRecurringSubscription => {
  assertManagedEmailDesignPositiveInteger(
    subscription.quantity,
    'Subscription quantity',
  );
  assertManagedEmailDesignNonNegativeInteger(
    subscription.unitPriceCents,
    'Subscription unit price',
  );
  assertManagedEmailDesignUniqueIds(
    subscription.linkedResources,
    'Subscription resource snapshot',
  );
  const lifecycleStatus: string = subscription.status;

  const expectedSnapshotKind = getManagedEmailDesignSnapshotKind(
    subscription.product,
  );
  if (
    subscription.linkedResources.length === 0 ||
    subscription.linkedResources.some(
      (snapshot) => snapshot.kind !== expectedSnapshotKind,
    )
  ) {
    throw new Error(
      'Subscription resource snapshots do not match its product.',
    );
  }

  if (subscription.product === 'managed-domain') {
    if (
      subscription.cadence !== 'annual' ||
      subscription.quantity !== 1 ||
      subscription.linkedResources.length !== 1 ||
      lifecycleStatus === 'pending-change'
    ) {
      throw new Error(
        'Managed domains are annual, quantity-one subscriptions.',
      );
    }
  } else if (subscription.cadence !== 'monthly') {
    throw new Error('Mailbox and warmup subscriptions are monthly.');
  }

  if (lifecycleStatus === 'active') {
    if (
      subscription.renewsAt === null ||
      subscription.cancelAt !== undefined ||
      subscription.canceledAt !== undefined ||
      subscription.pendingQuantity !== undefined ||
      subscription.changeEffectiveAt !== undefined
    ) {
      throw new Error('Active subscription lifecycle fields are invalid.');
    }
  }

  if (lifecycleStatus === 'pending-cancel') {
    if (
      subscription.renewsAt === null ||
      subscription.cancelAt === undefined ||
      subscription.canceledAt !== undefined ||
      subscription.pendingQuantity !== undefined ||
      subscription.changeEffectiveAt !== undefined
    ) {
      throw new Error('Pending cancellation lifecycle fields are invalid.');
    }
  }

  if (lifecycleStatus === 'canceled') {
    if (
      subscription.renewsAt !== null ||
      subscription.canceledAt === undefined ||
      subscription.cancelAt !== undefined ||
      subscription.pendingQuantity !== undefined ||
      subscription.changeEffectiveAt !== undefined
    ) {
      throw new Error('Canceled subscription lifecycle fields are invalid.');
    }
  }

  if (lifecycleStatus === 'pending-change') {
    if (
      subscription.product === 'managed-domain' ||
      subscription.renewsAt === null ||
      subscription.cancelAt !== undefined ||
      subscription.canceledAt !== undefined ||
      subscription.changeEffectiveAt === undefined
    ) {
      throw new Error('Pending quantity change lifecycle fields are invalid.');
    }
    assertManagedEmailDesignPositiveInteger(
      subscription.pendingQuantity,
      'Pending subscription quantity',
    );
    if (subscription.pendingQuantity >= subscription.quantity) {
      throw new Error(
        'Pending subscription quantity must be a strict reduction.',
      );
    }
  }

  return subscription;
};

export const createManagedEmailDesignDomainSubscription = ({
  domain,
  workspaceId,
  renewsAt,
  unitPriceCents = managedEmailDesignPricing.managedDomainAnnualCents,
}: {
  domain: ManagedEmailDesignDomain;
  workspaceId: string;
  renewsAt: string;
  unitPriceCents?: number;
}): ManagedEmailDesignRecurringSubscription => {
  if (domain.source === 'external' || domain.subscriptionId === null) {
    throw new Error(
      'Only managed and prewarmed domains can have managed-domain subscriptions.',
    );
  }

  return createManagedEmailDesignRecurringSubscription({
    id: domain.subscriptionId,
    workspaceId,
    linkedResources: [
      {
        id: domain.id,
        kind: 'domain',
        label: domain.name,
      },
    ],
    unitPriceCents,
    product: 'managed-domain',
    cadence: 'annual',
    quantity: 1,
    status: 'active',
    renewsAt,
  });
};

const assertManagedEmailDesignQuoteLine = (
  line: ManagedEmailDesignQuoteLine,
) => {
  assertManagedEmailDesignNonNegativeInteger(
    line.unitPriceCents,
    'Quote line unit price',
  );
  assertManagedEmailDesignNonNegativeInteger(
    line.quantity,
    'Quote line quantity',
  );
  assertManagedEmailDesignNonNegativeInteger(
    line.amountCents,
    'Quote line amount',
  );

  if (line.amountCents !== line.unitPriceCents * line.quantity) {
    throw new Error('Quote line amount must equal unit price times quantity.');
  }

  if (
    (line.product === 'managed-domain' &&
      (line.cadence !== 'annual' || line.quantity !== 1)) ||
    (line.product !== 'managed-domain' && line.cadence !== 'monthly')
  ) {
    throw new Error('Quote line product, cadence, and quantity do not agree.');
  }
};

export const createManagedEmailDesignQuote = ({
  quote,
  fixtureNow,
}: {
  quote: ManagedEmailDesignQuote;
  fixtureNow: string;
}): ManagedEmailDesignQuote => {
  assertManagedEmailDesignUniqueIds(quote.lines, 'Quote line');
  quote.lines.forEach(assertManagedEmailDesignQuoteLine);

  if (
    quote.status === 'price-changed' &&
    (quote.acceptedQuoteId !== null ||
      quote.previousQuote === undefined ||
      quote.id === quote.previousQuote.id)
  ) {
    throw new Error(
      'Repriced quotes keep a prior snapshot and require acceptance.',
    );
  }

  const totals = getManagedEmailDesignQuoteTotals({
    lines: quote.lines,
    fixtureNow,
  });
  assertManagedEmailDesignNonNegativeInteger(
    totals.dueTodayCents,
    'Quote due today total',
  );
  assertManagedEmailDesignNonNegativeInteger(
    totals.monthlyRecurringCents,
    'Quote monthly recurring total',
  );
  assertManagedEmailDesignNonNegativeInteger(
    totals.annualRecurringCents,
    'Quote annual recurring total',
  );
  if (
    totals.dueTodayCents !== quote.totals.dueTodayCents ||
    totals.monthlyRecurringCents !== quote.totals.monthlyRecurringCents ||
    totals.annualRecurringCents !== quote.totals.annualRecurringCents
  ) {
    throw new Error('Quote totals must be derived from quote lines.');
  }

  return quote;
};

export const isManagedEmailDesignQuoteCompletable = ({
  quote,
  fixtureNow,
}: {
  quote: ManagedEmailDesignQuote;
  fixtureNow: string;
}) =>
  quote.status === 'valid' &&
  fixtureNow < quote.expiresAt &&
  quote.acceptedQuoteId === quote.id;

export const requestManagedEmailDesignSubscriptionCancellation = ({
  subscription,
  cancelAt,
}: {
  subscription: ManagedEmailDesignRecurringSubscription;
  cancelAt: string;
}): ManagedEmailDesignRecurringSubscription => {
  if (subscription.status !== 'active') {
    throw new Error('Only active subscriptions can be canceled.');
  }

  return createManagedEmailDesignRecurringSubscription({
    ...subscription,
    status: 'pending-cancel',
    cancelAt,
  } as ManagedEmailDesignRecurringSubscription);
};

export const undoManagedEmailDesignSubscriptionCancellation = ({
  subscription,
  fixtureNow,
}: {
  subscription: ManagedEmailDesignRecurringSubscription;
  fixtureNow: string;
}): ManagedEmailDesignRecurringSubscription => {
  if (
    subscription.status !== 'pending-cancel' ||
    fixtureNow >= subscription.cancelAt
  ) {
    throw new Error('Only an effective future cancellation can be undone.');
  }

  const { cancelAt: _cancelAt, ...activeSubscription } = subscription;

  return createManagedEmailDesignRecurringSubscription({
    ...activeSubscription,
    status: 'active',
  } as ManagedEmailDesignRecurringSubscription);
};

export const applyManagedEmailDesignSubscriptionCancellation = ({
  subscription,
  fixtureNow,
}: {
  subscription: ManagedEmailDesignRecurringSubscription;
  fixtureNow: string;
}): ManagedEmailDesignRecurringSubscription => {
  if (
    subscription.status !== 'pending-cancel' ||
    fixtureNow < subscription.cancelAt
  ) {
    throw new Error('Cancellation is not effective yet.');
  }

  const {
    cancelAt: _cancelAt,
    renewsAt: _renewsAt,
    ...canceledSubscription
  } = subscription;

  return createManagedEmailDesignRecurringSubscription({
    ...canceledSubscription,
    status: 'canceled',
    renewsAt: null,
    canceledAt: fixtureNow,
  } as ManagedEmailDesignRecurringSubscription);
};

export const getManagedEmailDesignMailboxPoolCapacity = ({
  subscription,
  mailboxes,
}: {
  subscription: ManagedEmailDesignRecurringSubscription;
  mailboxes: ManagedEmailDesignMailbox[];
}) => {
  if (subscription.product !== 'managed-mailbox') {
    throw new Error('Mailbox capacity requires a mailbox subscription.');
  }

  const liveMailboxCount = getManagedEmailDesignLiveMailboxCount(mailboxes);
  const effectiveQuantity =
    getManagedEmailDesignEffectiveSubscriptionQuantity(subscription);

  return {
    liveMailboxCount,
    effectiveQuantity,
    availableCapacity: Math.max(effectiveQuantity - liveMailboxCount, 0),
  };
};

export const scheduleManagedEmailDesignSubscriptionQuantityChange = ({
  subscription,
  quantity,
  effectiveAt,
  mailboxes,
}: {
  subscription: ManagedEmailDesignRecurringSubscription;
  quantity: number;
  effectiveAt: string;
  mailboxes: ManagedEmailDesignMailbox[];
}): ManagedEmailDesignQuantityChangeResult => {
  if (
    subscription.product === 'managed-domain' ||
    subscription.status !== 'active'
  ) {
    throw new Error('This subscription cannot schedule a quantity change.');
  }
  assertManagedEmailDesignPositiveInteger(quantity, 'Requested quantity');
  if (quantity >= subscription.quantity) {
    throw new Error('Requested quantity must be a strict reduction.');
  }

  const minimumQuantity =
    subscription.product === 'managed-mailbox'
      ? getManagedEmailDesignLiveMailboxCount(mailboxes)
      : getManagedEmailDesignAssignedWarmupCount(mailboxes);
  if (quantity < minimumQuantity) {
    return {
      status: 'blocked',
      reason:
        subscription.product === 'managed-mailbox'
          ? 'mailbox-quantity-below-live-mailbox-count'
          : 'warmup-quantity-below-assigned-mailbox-count',
    };
  }

  return {
    status: 'scheduled',
    subscription: createManagedEmailDesignRecurringSubscription({
      ...subscription,
      status: 'pending-change',
      pendingQuantity: quantity,
      changeEffectiveAt: effectiveAt,
    } as ManagedEmailDesignRecurringSubscription),
  };
};

export const applyManagedEmailDesignSubscriptionQuantityChange = ({
  subscription,
  fixtureNow,
}: {
  subscription: ManagedEmailDesignRecurringSubscription;
  fixtureNow: string;
}): ManagedEmailDesignRecurringSubscription => {
  if (
    subscription.status !== 'pending-change' ||
    fixtureNow < subscription.changeEffectiveAt
  ) {
    throw new Error('Quantity change is not effective yet.');
  }

  const {
    pendingQuantity,
    changeEffectiveAt: _changeEffectiveAt,
    ...activeSubscription
  } = subscription;

  return createManagedEmailDesignRecurringSubscription({
    ...activeSubscription,
    status: 'active',
    quantity: pendingQuantity,
  } as ManagedEmailDesignRecurringSubscription);
};

const getManagedEmailDesignQuoteLineIdentity = (
  line: ManagedEmailDesignQuoteLine,
) =>
  getManagedEmailDesignTupleIdentity([
    line.id,
    line.resourceLabel,
    line.unitPriceCents,
    line.amountCents,
    line.startsAt,
    line.renewsAt,
    line.product,
    line.cadence,
    line.quantity,
  ]);

const getManagedEmailDesignPrewarmedQuoteId = ({
  bundleId,
  expiresAt,
  lines,
  totals,
}: {
  bundleId: string;
  expiresAt: string;
  lines: ManagedEmailDesignQuoteLine[];
  totals: ManagedEmailDesignQuoteTotals;
}) =>
  `quote-${getManagedEmailDesignTupleIdentity([
    'prewarmed',
    bundleId,
    expiresAt,
    lines.length,
    ...lines.map(getManagedEmailDesignQuoteLineIdentity),
    totals.dueTodayCents,
    totals.monthlyRecurringCents,
    totals.annualRecurringCents,
    'valid',
  ])}`;

export const createManagedEmailDesignPrewarmedOffer = ({
  bundle,
  fixtureNow,
  expiresAt,
}: {
  bundle: ManagedEmailDesignPrewarmedBundle;
  fixtureNow: string;
  expiresAt: string;
}) => {
  const domainSnapshot: ManagedEmailDesignResourceSnapshot = {
    id: `${bundle.id}-domain`,
    kind: 'domain',
    label: bundle.domain,
  };
  const mailboxSnapshots = bundle.mailboxIdentities.map((mailbox) => ({
    id: `${bundle.id}-mailbox-${normalizeManagedEmailDesignMailboxAddress(
      mailbox.address,
    )}`,
    kind: 'mailbox' as const,
    label: `${mailbox.identity} <${normalizeManagedEmailDesignMailboxAddress(
      mailbox.address,
    )}>`,
  }));
  const domainLine: ManagedEmailDesignQuoteLine = {
    id: `${bundle.id}-quote-domain`,
    resourceLabel: bundle.domain,
    unitPriceCents: managedEmailDesignPricing.managedDomainAnnualCents,
    amountCents: managedEmailDesignPricing.managedDomainAnnualCents,
    startsAt: fixtureNow,
    renewsAt: getManagedEmailDesignRenewal(fixtureNow, 12),
    product: 'managed-domain',
    cadence: 'annual',
    quantity: 1,
  };
  const mailboxLines: ManagedEmailDesignQuoteLine[] = mailboxSnapshots.map(
    (snapshot) => ({
      id: `${snapshot.id}-quote`,
      resourceLabel: snapshot.label,
      unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      amountCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      startsAt: fixtureNow,
      renewsAt: getManagedEmailDesignRenewal(fixtureNow, 1),
      product: 'managed-mailbox',
      cadence: 'monthly',
      quantity: 1,
    }),
  );
  const lines = [domainLine, ...mailboxLines];
  const totals = getManagedEmailDesignQuoteTotals({ lines, fixtureNow });
  const quote = createManagedEmailDesignQuote({
    fixtureNow,
    quote: {
      id: getManagedEmailDesignPrewarmedQuoteId({
        bundleId: bundle.id,
        expiresAt,
        lines,
        totals,
      }),
      expiresAt,
      acceptedQuoteId: null,
      lines,
      totals,
      status: 'valid',
    },
  });
  const subscriptions = [
    createManagedEmailDesignRecurringSubscription({
      id: `subscription-${bundle.id}-domain`,
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [domainSnapshot],
      unitPriceCents: domainLine.unitPriceCents,
      product: 'managed-domain',
      cadence: 'annual',
      quantity: 1,
      status: 'active',
      renewsAt: domainLine.renewsAt,
    }),
    createManagedEmailDesignRecurringSubscription({
      id: `subscription-${bundle.id}-mailbox`,
      workspaceId: 'workspace-managed-email-design',
      linkedResources: mailboxSnapshots,
      unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      product: 'managed-mailbox',
      cadence: 'monthly',
      quantity: mailboxSnapshots.length,
      status: 'active',
      renewsAt: getManagedEmailDesignRenewal(fixtureNow, 1),
    }),
  ];

  return { quote, subscriptions };
};

const getManagedEmailDesignCapacityRequestId = ({
  product,
  targetSubscriptionId,
  resourceHistoryCount,
  requestKey,
  mode,
  quantityDelta,
}: {
  product: 'managed-mailbox' | 'managed-warmup';
  targetSubscriptionId: string;
  resourceHistoryCount: number;
  requestKey: string;
  mode: ManagedEmailDesignCapacityRequest['intent']['mode'];
  quantityDelta: number;
}) =>
  getManagedEmailDesignTupleIdentity([
    'capacity-request',
    product,
    targetSubscriptionId,
    resourceHistoryCount,
    requestKey,
    mode,
    quantityDelta,
  ]);

type ManagedEmailDesignCapacityQuoteLine = Omit<
  ManagedEmailDesignQuoteLine,
  'product' | 'cadence' | 'quantity'
> & {
  product: 'managed-mailbox' | 'managed-warmup';
  cadence: 'monthly';
  quantity: number;
};

const getManagedEmailDesignCapacityQuoteId = ({
  capacityRequest,
  expiresAt,
  line,
  totals,
}: {
  capacityRequest: ManagedEmailDesignCapacityRequest;
  expiresAt: string;
  line: Omit<ManagedEmailDesignCapacityQuoteLine, 'id'>;
  totals: ManagedEmailDesignQuoteTotals;
}) =>
  getManagedEmailDesignTupleIdentity([
    'quote',
    capacityRequest.id,
    capacityRequest.resourceHistoryCount,
    capacityRequest.requestKey,
    capacityRequest.intent.product,
    capacityRequest.intent.mode,
    capacityRequest.intent.targetSubscriptionId,
    capacityRequest.intent.quantityDelta,
    capacityRequest.intent.resourceSnapshotIds.length,
    ...capacityRequest.intent.resourceSnapshotIds,
    line.product,
    line.resourceLabel,
    line.unitPriceCents,
    line.amountCents,
    line.startsAt,
    line.renewsAt,
    line.cadence,
    line.quantity,
    expiresAt,
    totals.dueTodayCents,
    totals.monthlyRecurringCents,
    totals.annualRecurringCents,
    'valid',
  ]);

const createManagedEmailDesignCapacityQuote = ({
  capacityRequest,
  product,
  resourceLabel,
  unitPriceCents,
  quantity,
  fixtureNow,
}: {
  capacityRequest: ManagedEmailDesignCapacityRequest;
  product: 'managed-mailbox' | 'managed-warmup';
  resourceLabel: string;
  unitPriceCents: number;
  quantity: number;
  fixtureNow: string;
}) => {
  const expiresAt = getManagedEmailDesignRenewal(fixtureNow, 1);
  const draftLine: Omit<ManagedEmailDesignCapacityQuoteLine, 'id'> = {
    resourceLabel,
    unitPriceCents,
    amountCents: unitPriceCents * quantity,
    startsAt: fixtureNow,
    renewsAt: expiresAt,
    product,
    cadence: 'monthly',
    quantity,
  };
  const totals = getManagedEmailDesignQuoteTotals({
    lines: [{ id: '', ...draftLine }],
    fixtureNow,
  });
  const id = getManagedEmailDesignCapacityQuoteId({
    capacityRequest,
    expiresAt,
    line: draftLine,
    totals,
  });
  const line: ManagedEmailDesignCapacityQuoteLine = {
    id: `${id}-line`,
    ...draftLine,
  };

  return createManagedEmailDesignQuote({
    fixtureNow,
    quote: {
      id,
      expiresAt,
      acceptedQuoteId: null,
      capacityRequest,
      lines: [line],
      totals,
      status: 'valid',
    },
  });
};

const getManagedEmailDesignCapacityBlock = (
  subscription: ManagedEmailDesignRecurringSubscription | null,
) => {
  if (subscription?.status === 'pending-change') {
    return 'subscription-change-pending' as const;
  }

  if (subscription?.status === 'pending-cancel') {
    return 'subscription-cancel-pending' as const;
  }

  return null;
};

const isManagedEmailDesignSameSubscriptionIntent = (
  left: ManagedEmailDesignSubscriptionIntent,
  right: ManagedEmailDesignSubscriptionIntent,
) =>
  left.product === right.product &&
  left.mode === right.mode &&
  left.targetSubscriptionId === right.targetSubscriptionId &&
  left.quantityDelta === right.quantityDelta &&
  left.resourceSnapshotIds.length === right.resourceSnapshotIds.length &&
  left.resourceSnapshotIds.every(
    (snapshotId, index) => snapshotId === right.resourceSnapshotIds[index],
  );

const isManagedEmailDesignSameCapacityRequest = (
  left: ManagedEmailDesignCapacityRequest | undefined,
  right: ManagedEmailDesignCapacityRequest | undefined,
) => {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.resourceHistoryCount === right.resourceHistoryCount &&
    left.requestKey === right.requestKey &&
    isManagedEmailDesignSameSubscriptionIntent(left.intent, right.intent)
  );
};

const assertManagedEmailDesignAcceptedCapacityQuote = ({
  quote,
  expectedQuote,
  fixtureNow,
}: {
  quote: ManagedEmailDesignQuote;
  expectedQuote: ManagedEmailDesignQuote;
  fixtureNow: string;
}) => {
  const quoteLine = quote.lines[0];
  const expectedLine = expectedQuote.lines[0];

  if (
    !isManagedEmailDesignQuoteCompletable({ quote, fixtureNow }) ||
    quote.id !== expectedQuote.id ||
    quote.expiresAt !== expectedQuote.expiresAt ||
    !isManagedEmailDesignSameCapacityRequest(
      quote.capacityRequest,
      expectedQuote.capacityRequest,
    ) ||
    quote.lines.length !== expectedQuote.lines.length ||
    quoteLine.id !== expectedLine.id ||
    quoteLine.resourceLabel !== expectedLine.resourceLabel ||
    quoteLine.unitPriceCents !== expectedLine.unitPriceCents ||
    quoteLine.amountCents !== expectedLine.amountCents ||
    quoteLine.startsAt !== expectedLine.startsAt ||
    quoteLine.renewsAt !== expectedLine.renewsAt ||
    quoteLine.product !== expectedLine.product ||
    quoteLine.cadence !== expectedLine.cadence ||
    quoteLine.quantity !== expectedLine.quantity ||
    quote.totals.dueTodayCents !== expectedQuote.totals.dueTodayCents ||
    quote.totals.monthlyRecurringCents !==
      expectedQuote.totals.monthlyRecurringCents ||
    quote.totals.annualRecurringCents !==
      expectedQuote.totals.annualRecurringCents
  ) {
    throw new Error('A current accepted capacity quote is required.');
  }
};

const getManagedEmailDesignMailboxSnapshotAddress = (
  snapshot: ManagedEmailDesignResourceSnapshot,
) => {
  if (snapshot.kind !== 'mailbox') {
    return null;
  }

  const address = snapshot.label.match(/<([^<>]+)>$/)?.[1];

  return address ? normalizeManagedEmailDesignMailboxAddress(address) : null;
};

export const findManagedEmailDesignHistoricalMailboxSnapshot = ({
  snapshots,
  mailbox,
  retainedSnapshotIds,
}: {
  snapshots: ManagedEmailDesignResourceSnapshot[];
  mailbox: ManagedEmailDesignMailbox;
  retainedSnapshotIds: Set<string>;
}) => {
  const normalizedAddress = normalizeManagedEmailDesignMailboxAddress(
    mailbox.address,
  );

  return (
    snapshots.find(
      (snapshot) =>
        snapshot.kind === 'mailbox' &&
        !retainedSnapshotIds.has(snapshot.id) &&
        snapshot.id === mailbox.id,
    ) ??
    snapshots.find(
      (snapshot) =>
        snapshot.kind === 'mailbox' &&
        !retainedSnapshotIds.has(snapshot.id) &&
        getManagedEmailDesignMailboxSnapshotAddress(snapshot) ===
          normalizedAddress,
    )
  );
};

const getManagedEmailDesignHistoricalMailboxSnapshots = ({
  subscriptions,
  mailboxes,
}: {
  subscriptions: ManagedEmailDesignRecurringSubscription[];
  mailboxes: ManagedEmailDesignMailbox[];
}) => {
  const canceledMailboxSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.product === 'managed-mailbox' &&
      subscription.status === 'canceled',
  );
  const historicalSnapshots = canceledMailboxSubscriptions.flatMap(
    (subscription) => subscription.linkedResources,
  );
  const retainedSnapshotIds = new Set<string>();

  return mailboxes.map((mailbox) => {
    const linkedCanceledSubscription =
      mailbox.subscriptionId === null
        ? undefined
        : canceledMailboxSubscriptions.find(
            (subscription) => subscription.id === mailbox.subscriptionId,
          );
    const linkedSnapshot =
      linkedCanceledSubscription &&
      findManagedEmailDesignHistoricalMailboxSnapshot({
        snapshots: linkedCanceledSubscription.linkedResources,
        mailbox,
        retainedSnapshotIds,
      });
    const retainedSnapshot =
      linkedSnapshot ??
      findManagedEmailDesignHistoricalMailboxSnapshot({
        snapshots: historicalSnapshots,
        mailbox,
        retainedSnapshotIds,
      });

    if (retainedSnapshot) {
      retainedSnapshotIds.add(retainedSnapshot.id);
    }

    return retainedSnapshot ?? getManagedEmailDesignMailboxSnapshot(mailbox);
  });
};

export const resolveManagedEmailDesignMailboxPoolAcquisition = ({
  workspaceId,
  subscriptions,
  mailboxes,
  selectedMailboxes,
  sourceCanceledSubscriptionId,
  targetSubscriptionId,
  fixtureNow,
  quote,
}: {
  workspaceId: string;
  subscriptions: ManagedEmailDesignRecurringSubscription[];
  mailboxes: ManagedEmailDesignMailbox[];
  selectedMailboxes: ManagedEmailDesignMailbox[];
  sourceCanceledSubscriptionId?: string;
  targetSubscriptionId: string;
  fixtureNow: string;
  quote?: ManagedEmailDesignQuote;
}): ManagedEmailDesignCapacityResolution => {
  if (selectedMailboxes.length === 0) {
    throw new Error('Select at least one mailbox.');
  }
  const selectedMailboxAddresses = selectedMailboxes.map(({ address }) =>
    normalizeManagedEmailDesignMailboxAddress(address),
  );
  if (
    selectedMailboxes.some((mailbox) => mailbox.source === 'connected') ||
    new Set(selectedMailboxes.map(({ id }) => id)).size !==
      selectedMailboxes.length ||
    new Set(selectedMailboxAddresses).size !== selectedMailboxAddresses.length
  ) {
    throw new Error(
      'Only unique managed or prewarmed mailboxes can be billed.',
    );
  }

  const activeMailboxSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.product === 'managed-mailbox' &&
      subscription.status !== 'canceled',
  );
  if (activeMailboxSubscriptions.length > 1) {
    throw new Error('Expected at most one current managed-mailbox pool.');
  }
  const currentSubscription =
    activeMailboxSubscriptions.find(
      (subscription) => subscription.id === targetSubscriptionId,
    ) ?? null;
  const canceledMailboxSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.product === 'managed-mailbox' &&
      subscription.status === 'canceled',
  );
  const sourceCanceledSubscription =
    sourceCanceledSubscriptionId === undefined
      ? undefined
      : canceledMailboxSubscriptions.find(
          (subscription) => subscription.id === sourceCanceledSubscriptionId,
        );
  const isRecoveredSourceAlreadyActive =
    sourceCanceledSubscriptionId !== undefined &&
    currentSubscription?.id === sourceCanceledSubscriptionId;
  if (
    sourceCanceledSubscriptionId !== undefined &&
    sourceCanceledSubscription === undefined &&
    !isRecoveredSourceAlreadyActive
  ) {
    throw new Error(
      'Source subscription does not identify a canceled mailbox pool.',
    );
  }
  const replacementCanceledSubscriptions =
    sourceCanceledSubscription === undefined
      ? []
      : [sourceCanceledSubscription];
  const hasCanceledHistory = replacementCanceledSubscriptions.length > 0;
  const reactivatesSourceCanceledSubscription =
    sourceCanceledSubscription?.id === targetSubscriptionId;
  if (
    currentSubscription === null &&
    subscriptions.some(
      (subscription) => subscription.id === targetSubscriptionId,
    ) &&
    !reactivatesSourceCanceledSubscription
  ) {
    throw new Error('Target subscription ID is already in use.');
  }
  if (currentSubscription === null && activeMailboxSubscriptions.length > 0) {
    throw new Error(
      'Target subscription does not identify the active mailbox pool.',
    );
  }
  const block = getManagedEmailDesignCapacityBlock(currentSubscription);
  if (block) {
    return { status: 'blocked', reason: block };
  }

  const selectedSnapshots = selectedMailboxes.map(
    getManagedEmailDesignMailboxSnapshot,
  );
  const requestKey = getManagedEmailDesignTupleIdentity([
    ...selectedSnapshots.map(({ id }) => id),
    ...(sourceCanceledSubscriptionId === undefined
      ? []
      : [sourceCanceledSubscriptionId]),
  ]);
  const existingAcceptedTarget =
    quote &&
    subscriptions.find(
      (subscription) =>
        subscription.id === targetSubscriptionId &&
        subscription.product === 'managed-mailbox' &&
        subscription.status !== 'canceled',
    );
  const retryIntent = quote?.capacityRequest?.intent;
  if (
    quote &&
    existingAcceptedTarget &&
    quote.capacityRequest?.requestKey === requestKey &&
    retryIntent?.product === 'managed-mailbox' &&
    retryIntent.targetSubscriptionId === targetSubscriptionId &&
    retryIntent.resourceSnapshotIds.every((snapshotId) =>
      existingAcceptedTarget.linkedResources.some(
        (linkedResource) => linkedResource.id === snapshotId,
      ),
    )
  ) {
    assertManagedEmailDesignAcceptedCapacityRetry({
      quote,
      subscription: existingAcceptedTarget,
      product: 'managed-mailbox',
      targetSubscriptionId,
      requestKey,
      fixtureNow,
    });

    return {
      status: 'ready',
      intent: retryIntent,
      quote,
      subscription: existingAcceptedTarget,
      sourceCanceledSubscriptionId,
    };
  }

  if (
    currentSubscription !== null &&
    selectedSnapshots.some((snapshot) =>
      currentSubscription.linkedResources.some(
        (linkedResource) => linkedResource.id === snapshot.id,
      ),
    )
  ) {
    throw new Error(
      'Selected mailbox is already linked to the active mailbox pool.',
    );
  }

  const liveMailboxes = mailboxes.filter(
    (mailbox) => mailbox.source === 'managed' || mailbox.source === 'prewarmed',
  );
  const currentPoolMailboxes =
    currentSubscription === null
      ? []
      : liveMailboxes.filter(
          (mailbox) =>
            mailbox.subscriptionId === currentSubscription.id ||
            currentSubscription.linkedResources.some(
              (linkedResource) =>
                linkedResource.id === mailbox.id ||
                getManagedEmailDesignMailboxSnapshotAddress(linkedResource) ===
                  normalizeManagedEmailDesignMailboxAddress(mailbox.address),
            ),
        );
  if (
    selectedMailboxes.some((selectedMailbox) => {
      const selectedAddress = normalizeManagedEmailDesignMailboxAddress(
        selectedMailbox.address,
      );

      return (
        liveMailboxes.some(
          (liveMailbox) =>
            liveMailbox.id !== selectedMailbox.id &&
            normalizeManagedEmailDesignMailboxAddress(liveMailbox.address) ===
              selectedAddress,
        ) ||
        (currentSubscription !== null &&
          currentSubscription.linkedResources.some(
            (linkedResource) =>
              getManagedEmailDesignMailboxSnapshotAddress(linkedResource) ===
              selectedAddress,
          ))
      );
    })
  ) {
    throw new Error(
      'Selected mailbox address collides with a live mailbox resource.',
    );
  }
  const unitPriceCents =
    currentSubscription?.unitPriceCents ??
    managedEmailDesignPricing.managedMailboxMonthlyCents;
  const canceledSubscriptionIds = new Set(
    replacementCanceledSubscriptions.map(({ id }) => id),
  );
  const canceledPoolMailboxes = liveMailboxes.filter((mailbox) => {
    if (mailbox.subscriptionId !== null) {
      return canceledSubscriptionIds.has(mailbox.subscriptionId);
    }

    return replacementCanceledSubscriptions.some((subscription) =>
      subscription.linkedResources.some(
        (linkedResource) =>
          linkedResource.id === mailbox.id ||
          getManagedEmailDesignMailboxSnapshotAddress(linkedResource) ===
            normalizeManagedEmailDesignMailboxAddress(mailbox.address),
      ),
    );
  });
  const uncoveredSnapshots =
    hasCanceledHistory && canceledPoolMailboxes.length > 0
      ? getManagedEmailDesignHistoricalMailboxSnapshots({
          subscriptions: replacementCanceledSubscriptions,
          mailboxes: canceledPoolMailboxes,
        })
      : [];
  const allSnapshots: ManagedEmailDesignResourceSnapshot[] = [];
  [...uncoveredSnapshots, ...selectedSnapshots].forEach((snapshot) => {
    if (!allSnapshots.some(({ id }) => id === snapshot.id)) {
      allSnapshots.push(snapshot);
    }
  });
  const quantityDelta =
    currentSubscription === null
      ? allSnapshots.length
      : Math.max(
          0,
          allSnapshots.length -
            getManagedEmailDesignMailboxPoolCapacity({
              subscription: currentSubscription,
              mailboxes: currentPoolMailboxes,
            }).availableCapacity,
        );
  const mode: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-mailbox' }
  >['mode'] =
    currentSubscription === null
      ? 'create'
      : quantityDelta === 0
        ? 'attach-existing-capacity'
        : 'increment-existing';
  const intent: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-mailbox' }
  > = {
    product: 'managed-mailbox',
    mode,
    targetSubscriptionId,
    quantityDelta,
    resourceSnapshotIds: allSnapshots.map(({ id }) => id) as [
      string,
      ...string[],
    ],
  };
  const resourceHistoryCount = currentSubscription?.linkedResources.length ?? 0;
  const capacityRequest: ManagedEmailDesignCapacityRequest = {
    id: getManagedEmailDesignCapacityRequestId({
      product: 'managed-mailbox',
      targetSubscriptionId,
      resourceHistoryCount,
      requestKey,
      mode: intent.mode,
      quantityDelta: intent.quantityDelta,
    }),
    resourceHistoryCount,
    requestKey,
    intent,
  };
  const capacityQuote = createManagedEmailDesignCapacityQuote({
    capacityRequest,
    product: 'managed-mailbox',
    resourceLabel: allSnapshots.map(({ label }) => label).join(', '),
    unitPriceCents,
    quantity: quantityDelta,
    fixtureNow,
  });
  const requiresRefreshedAcceptance = uncoveredSnapshots.length > 0;

  if (!quote) {
    return {
      status: requiresRefreshedAcceptance ? 'requires-acceptance' : 'ready',
      intent,
      quote: capacityQuote,
      sourceCanceledSubscriptionId,
    };
  }
  assertManagedEmailDesignAcceptedCapacityQuote({
    quote,
    expectedQuote: capacityQuote,
    fixtureNow,
  });
  const subscription =
    currentSubscription === null
      ? createManagedEmailDesignRecurringSubscription({
          id: targetSubscriptionId,
          workspaceId,
          linkedResources: allSnapshots,
          unitPriceCents,
          product: 'managed-mailbox',
          cadence: 'monthly',
          quantity: allSnapshots.length,
          status: 'active',
          renewsAt: getManagedEmailDesignRenewal(fixtureNow, 1),
        })
      : createManagedEmailDesignRecurringSubscription({
          ...currentSubscription,
          quantity: currentSubscription.quantity + quantityDelta,
          linkedResources: [
            ...currentSubscription.linkedResources,
            ...allSnapshots,
          ],
        } as ManagedEmailDesignRecurringSubscription);

  return {
    status: 'ready',
    intent,
    quote,
    subscription,
    sourceCanceledSubscriptionId,
  };
};

export const resolveManagedEmailDesignWarmupCapacityAcquisition = ({
  workspaceId,
  subscriptions,
  mailboxes,
  requestedQuantity,
  targetSubscriptionId,
  fixtureNow,
  quote,
}: {
  workspaceId: string;
  subscriptions: ManagedEmailDesignRecurringSubscription[];
  mailboxes: ManagedEmailDesignMailbox[];
  requestedQuantity: number;
  targetSubscriptionId: string;
  fixtureNow: string;
  quote?: ManagedEmailDesignQuote;
}): ManagedEmailDesignCapacityResolution => {
  assertManagedEmailDesignPositiveInteger(
    requestedQuantity,
    'Requested warmup capacity',
  );

  const currentSubscription = getManagedEmailDesignCurrentSubscription({
    subscriptions,
    product: 'managed-warmup',
  });
  if (
    currentSubscription !== null &&
    targetSubscriptionId !== currentSubscription.id
  ) {
    throw new Error(
      'Target subscription does not identify the active warmup pool.',
    );
  }

  if (
    currentSubscription === null &&
    subscriptions.some(
      (subscription) => subscription.id === targetSubscriptionId,
    )
  ) {
    throw new Error('Target subscription ID is already in use.');
  }
  const block = getManagedEmailDesignCapacityBlock(currentSubscription);
  if (block) {
    return { status: 'blocked', reason: block };
  }

  const requestKey = getManagedEmailDesignTupleIdentity([
    'quantity',
    requestedQuantity,
  ]);
  const assignedMailboxes = mailboxes.filter(
    (mailbox) => mailbox.warmupState.assignment === 'assigned',
  );
  const capacityResourceLabel = [
    ...assignedMailboxes.map((mailbox) => mailbox.address),
    `${requestedQuantity} new warmup slot${requestedQuantity === 1 ? '' : 's'}`,
  ].join(', ');
  const existingAcceptedTarget =
    quote &&
    subscriptions.find(
      (subscription) =>
        subscription.id === targetSubscriptionId &&
        subscription.product === 'managed-warmup' &&
        subscription.status !== 'canceled',
    );
  const retryIntent = quote?.capacityRequest?.intent;
  if (
    quote &&
    existingAcceptedTarget &&
    quote.capacityRequest?.requestKey === requestKey &&
    retryIntent?.product === 'managed-warmup' &&
    retryIntent.targetSubscriptionId === targetSubscriptionId &&
    retryIntent.resourceSnapshotIds.every((snapshotId) =>
      existingAcceptedTarget.linkedResources.some(
        (linkedResource) => linkedResource.id === snapshotId,
      ),
    )
  ) {
    assertManagedEmailDesignAcceptedCapacityRetry({
      quote,
      subscription: existingAcceptedTarget,
      product: 'managed-warmup',
      targetSubscriptionId,
      requestKey,
      fixtureNow,
      resourceLabel: capacityResourceLabel,
    });

    return {
      status: 'ready',
      intent: retryIntent,
      quote,
      subscription: existingAcceptedTarget,
    };
  }
  if (
    getManagedEmailDesignEffectiveSubscriptionQuantity(currentSubscription) >
    assignedMailboxes.length
  ) {
    return { status: 'blocked', reason: 'warmup-capacity-still-available' };
  }

  const hasCanceledHistory = subscriptions.some(
    (subscription) =>
      subscription.product === 'managed-warmup' &&
      subscription.status === 'canceled',
  );
  const totalQuantity =
    currentSubscription === null &&
    hasCanceledHistory &&
    assignedMailboxes.length > 0
      ? assignedMailboxes.length + requestedQuantity
      : requestedQuantity;
  const mode: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-warmup' }
  >['mode'] = currentSubscription === null ? 'create' : 'increment-existing';
  const quantityDelta =
    currentSubscription === null ? totalQuantity : requestedQuantity;
  const resourceHistoryCount = currentSubscription?.linkedResources.length ?? 0;
  const capacityRequestId = getManagedEmailDesignCapacityRequestId({
    product: 'managed-warmup',
    targetSubscriptionId,
    resourceHistoryCount,
    requestKey,
    mode,
    quantityDelta,
  });
  const newSnapshots = getManagedEmailDesignWarmupSnapshots({
    prefix: capacityRequestId,
    quantity: quantityDelta,
  });
  const intent: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-warmup' }
  > = {
    product: 'managed-warmup',
    mode,
    targetSubscriptionId,
    quantityDelta,
    resourceSnapshotIds: newSnapshots.map(({ id }) => id) as [
      string,
      ...string[],
    ],
  };
  const capacityRequest: ManagedEmailDesignCapacityRequest = {
    id: capacityRequestId,
    resourceHistoryCount,
    requestKey,
    intent,
  };
  const unitPriceCents =
    currentSubscription?.unitPriceCents ??
    managedEmailDesignPricing.managedWarmupMonthlyCents;
  const capacityQuote = createManagedEmailDesignCapacityQuote({
    capacityRequest,
    product: 'managed-warmup',
    resourceLabel: capacityResourceLabel,
    unitPriceCents,
    quantity: currentSubscription === null ? totalQuantity : requestedQuantity,
    fixtureNow,
  });

  if (!quote) {
    return {
      status: 'requires-acceptance',
      intent,
      quote: capacityQuote,
    };
  }

  assertManagedEmailDesignAcceptedCapacityQuote({
    quote,
    expectedQuote: capacityQuote,
    fixtureNow,
  });
  const subscription =
    currentSubscription === null
      ? createManagedEmailDesignRecurringSubscription({
          id: targetSubscriptionId,
          workspaceId,
          linkedResources: newSnapshots,
          unitPriceCents,
          product: 'managed-warmup',
          cadence: 'monthly',
          quantity: totalQuantity,
          status: 'active',
          renewsAt: getManagedEmailDesignRenewal(fixtureNow, 1),
        })
      : createManagedEmailDesignRecurringSubscription({
          ...currentSubscription,
          quantity: currentSubscription.quantity + requestedQuantity,
          linkedResources: [
            ...currentSubscription.linkedResources,
            ...newSnapshots,
          ],
        } as ManagedEmailDesignRecurringSubscription);

  return { status: 'ready', intent, quote, subscription };
};

type ManagedEmailDesignNonIdleAcquisitionOperation = Extract<
  ManagedEmailDesignAcquisitionOperation,
  { id: string }
>;

const getManagedEmailDesignAcquisitionOutcomes = (
  operation: ManagedEmailDesignNonIdleAcquisitionOperation,
) => [
  ...operation.lines.map(({ paymentOutcome }) => paymentOutcome),
  ...operation.lines.map(({ resourceOutcome }) => resourceOutcome),
  ...operation.subscriptionOperations.map(({ outcome }) => outcome),
];

export const getManagedEmailDesignAcquisitionStatus = (
  operation: ManagedEmailDesignAcquisitionOperation,
): ManagedEmailDesignAcquisitionOperation['status'] => {
  if (operation.status === 'idle') {
    return 'idle';
  }

  const outcomes = getManagedEmailDesignAcquisitionOutcomes(operation);
  if (outcomes.includes('unknown')) {
    return 'reconciliation-required';
  }
  if (outcomes.includes('pending')) {
    return 'pending';
  }
  if (outcomes.includes('failed')) {
    return outcomes.includes('completed') ? 'partial' : 'failed';
  }

  return outcomes.every((outcome) => outcome === 'completed')
    ? 'succeeded'
    : 'failed';
};

const assertManagedEmailDesignSubscriptionIntent = ({
  intent,
  resourceSnapshots,
}: {
  intent: ManagedEmailDesignSubscriptionIntent;
  resourceSnapshots: Map<string, ManagedEmailDesignResourceSnapshot>;
}) => {
  if (
    new Set(intent.resourceSnapshotIds).size !==
    intent.resourceSnapshotIds.length
  ) {
    throw new Error('Subscription intent snapshots must be unique.');
  }
  const expectedKind = getManagedEmailDesignSnapshotKind(intent.product);
  const snapshots = intent.resourceSnapshotIds.map((id) => {
    const snapshot = resourceSnapshots.get(id);
    if (!snapshot || snapshot.kind !== expectedKind) {
      throw new Error(
        'Subscription intent snapshot kind does not match product.',
      );
    }

    return snapshot;
  });

  if (snapshots.length === 0) {
    throw new Error('Subscription intent requires resource snapshots.');
  }

  const intentMode: string = intent.mode;
  const hasPositiveIntegerDelta =
    Number.isSafeInteger(intent.quantityDelta) && intent.quantityDelta > 0;

  if (intent.product === 'managed-domain') {
    if (
      intentMode !== 'create' ||
      intent.quantityDelta !== 1 ||
      snapshots.length !== 1
    ) {
      throw new Error(
        'Subscription intent mode and quantity delta are invalid.',
      );
    }

    return;
  }

  if (intent.product === 'managed-mailbox') {
    if (intentMode === 'attach-existing-capacity') {
      if (intent.quantityDelta !== 0) {
        throw new Error(
          'Subscription intent mode and quantity delta are invalid.',
        );
      }

      return;
    }

    if (
      (intentMode !== 'create' && intentMode !== 'increment-existing') ||
      !hasPositiveIntegerDelta ||
      (intentMode === 'create' && snapshots.length !== intent.quantityDelta) ||
      (intentMode === 'increment-existing' &&
        snapshots.length < intent.quantityDelta)
    ) {
      throw new Error(
        'Subscription intent mode and quantity delta are invalid.',
      );
    }

    return;
  }

  if (
    (intentMode !== 'create' && intentMode !== 'increment-existing') ||
    !hasPositiveIntegerDelta ||
    snapshots.length !== intent.quantityDelta
  ) {
    throw new Error('Subscription intent mode and quantity delta are invalid.');
  }
};

function assertManagedEmailDesignAcceptedCapacityRetry({
  quote,
  subscription,
  product,
  targetSubscriptionId,
  requestKey,
  fixtureNow,
  resourceLabel,
}: {
  quote: ManagedEmailDesignQuote;
  subscription: ManagedEmailDesignRecurringSubscription;
  product: 'managed-mailbox' | 'managed-warmup';
  targetSubscriptionId: string;
  requestKey: string;
  fixtureNow: string;
  resourceLabel?: string;
}) {
  const capacityRequest = quote.capacityRequest;
  const intent = capacityRequest?.intent;
  const quoteLine = quote.lines[0];

  if (
    capacityRequest === undefined ||
    intent === undefined ||
    quoteLine === undefined ||
    quote.lines.length !== 1 ||
    subscription.id !== targetSubscriptionId ||
    subscription.product !== product ||
    capacityRequest.requestKey !== requestKey ||
    intent.product !== product ||
    intent.targetSubscriptionId !== targetSubscriptionId
  ) {
    throw new Error('A current accepted capacity quote is required.');
  }

  assertManagedEmailDesignNonNegativeInteger(
    capacityRequest.resourceHistoryCount,
    'Capacity request resource history count',
  );
  if (
    capacityRequest.id !==
      getManagedEmailDesignCapacityRequestId({
        product,
        targetSubscriptionId,
        resourceHistoryCount: capacityRequest.resourceHistoryCount,
        requestKey,
        mode: intent.mode,
        quantityDelta: intent.quantityDelta,
      }) ||
    (intent.mode === 'create'
      ? capacityRequest.resourceHistoryCount !== 0
      : capacityRequest.resourceHistoryCount === 0)
  ) {
    throw new Error('A current accepted capacity quote is required.');
  }

  const resourceSnapshotsById = new Map(
    subscription.linkedResources.map(
      (snapshot) => [snapshot.id, snapshot] as const,
    ),
  );
  assertManagedEmailDesignSubscriptionIntent({
    intent,
    resourceSnapshots: resourceSnapshotsById,
  });
  const retainedSnapshots: ManagedEmailDesignResourceSnapshot[] = [];
  for (const snapshotId of intent.resourceSnapshotIds) {
    const snapshot = resourceSnapshotsById.get(snapshotId);
    if (!snapshot) {
      throw new Error('A current accepted capacity quote is required.');
    }

    retainedSnapshots.push(snapshot);
  }
  if (
    subscription.linkedResources.length <
    capacityRequest.resourceHistoryCount + retainedSnapshots.length
  ) {
    throw new Error('A current accepted capacity quote is required.');
  }

  const expectedQuote = createManagedEmailDesignCapacityQuote({
    capacityRequest,
    product,
    resourceLabel:
      resourceLabel ?? retainedSnapshots.map(({ label }) => label).join(', '),
    unitPriceCents: subscription.unitPriceCents,
    quantity: intent.quantityDelta,
    fixtureNow: quoteLine.startsAt,
  });

  assertManagedEmailDesignAcceptedCapacityQuote({
    quote,
    expectedQuote,
    fixtureNow,
  });
}

const assertManagedEmailDesignAcquisitionSource = ({
  operation,
  quoteLinesById,
  resourceSnapshotsById,
  capacityRequestIntent,
}: {
  operation: ManagedEmailDesignNonIdleAcquisitionOperation;
  quoteLinesById: Map<string, ManagedEmailDesignQuoteLine>;
  resourceSnapshotsById: Map<string, ManagedEmailDesignResourceSnapshot>;
  capacityRequestIntent: ManagedEmailDesignSubscriptionIntent | undefined;
}) => {
  const lineProducts = operation.lines.map((line) => {
    const quoteLine = quoteLinesById.get(line.quoteLineId);
    if (!quoteLine) {
      throw new Error('Acquisition line is not listed on the accepted quote.');
    }

    return quoteLine.product;
  });
  const operationsByProduct = operation.subscriptionOperations.reduce<
    Record<ManagedEmailDesignRecurringProduct, number>
  >(
    (counts, { intent }) => ({
      ...counts,
      [intent.product]: counts[intent.product] + 1,
    }),
    {
      'managed-domain': 0,
      'managed-mailbox': 0,
      'managed-warmup': 0,
    },
  );
  const linesByProduct = lineProducts.reduce<
    Record<ManagedEmailDesignRecurringProduct, number>
  >(
    (counts, product) => ({
      ...counts,
      [product]: counts[product] + 1,
    }),
    {
      'managed-domain': 0,
      'managed-mailbox': 0,
      'managed-warmup': 0,
    },
  );

  if (
    (operation.source === 'managed-domain' &&
      (operation.lines.length !== 1 ||
        linesByProduct['managed-domain'] !== 1 ||
        operationsByProduct['managed-domain'] !== 1 ||
        operation.subscriptionOperations.length !== 1)) ||
    (operation.source === 'managed-mailbox' &&
      (linesByProduct['managed-mailbox'] === 0 ||
        linesByProduct['managed-mailbox'] !== operation.lines.length ||
        operationsByProduct['managed-mailbox'] !== 1 ||
        operation.subscriptionOperations.length !== 1)) ||
    (operation.source === 'managed-warmup' &&
      (linesByProduct['managed-warmup'] === 0 ||
        linesByProduct['managed-warmup'] !== operation.lines.length ||
        operationsByProduct['managed-warmup'] !== 1 ||
        operation.subscriptionOperations.length !== 1)) ||
    (operation.source === 'prewarmed' &&
      (linesByProduct['managed-domain'] !== 1 ||
        linesByProduct['managed-mailbox'] === 0 ||
        linesByProduct['managed-warmup'] !== 0 ||
        operationsByProduct['managed-domain'] !== 1 ||
        operationsByProduct['managed-mailbox'] !== 1 ||
        operationsByProduct['managed-warmup'] !== 0 ||
        operation.subscriptionOperations.length !== 2))
  ) {
    throw new Error('Acquisition source composition is invalid.');
  }

  const operationsById = new Map<
    string,
    ManagedEmailDesignAcquisitionSubscriptionOperation
  >(
    operation.subscriptionOperations.map(
      (subscriptionOperation) =>
        [subscriptionOperation.id, subscriptionOperation] as const,
    ),
  );
  const linesById = new Map<string, ManagedEmailDesignAcquisitionLine>(
    operation.lines.map((line) => [line.id, line] as const),
  );

  if (
    operation.source === 'prewarmed' &&
    operation.lines.some((line) => {
      const lineProduct = quoteLinesById.get(line.quoteLineId)?.product;
      if (lineProduct === 'managed-domain') {
        return line.dependsOnLineIds.length !== 0;
      }

      const dependencyProducts = line.dependsOnLineIds.map((dependencyId) =>
        quoteLinesById.get(linesById.get(dependencyId)?.quoteLineId ?? ''),
      );
      if (lineProduct === 'managed-mailbox') {
        return (
          dependencyProducts.length !== 1 ||
          dependencyProducts[0]?.product !== 'managed-domain'
        );
      }

      return (
        lineProduct !== 'managed-warmup' ||
        dependencyProducts.length !== linesByProduct['managed-mailbox'] ||
        dependencyProducts.some(
          (dependency) => dependency?.product !== 'managed-mailbox',
        )
      );
    })
  ) {
    throw new Error('Prewarmed acquisition dependency graph is invalid.');
  }

  const boundResourceSnapshotIds = new Set<string>();
  for (const line of operation.lines) {
    const subscriptionOperation = operationsById.get(
      line.subscriptionOperationId,
    );
    const quoteLine = quoteLinesById.get(line.quoteLineId);
    const resourceSnapshotId = line.resourceSnapshotId;
    const resourceSnapshot =
      typeof resourceSnapshotId === 'string'
        ? resourceSnapshotsById.get(resourceSnapshotId)
        : undefined;
    if (
      !subscriptionOperation ||
      !quoteLine ||
      subscriptionOperation.intent.product !== quoteLine.product ||
      line.dependsOnLineIds.some((dependencyId) => !linesById.has(dependencyId))
    ) {
      throw new Error('Acquisition line references an invalid operation.');
    }

    const isOnlyLineForSubscriptionOperation = !operation.lines.some(
      (candidate) =>
        candidate.subscriptionOperationId === subscriptionOperation.id &&
        candidate.id !== line.id,
    );
    const isCapacityLine =
      operation.source !== 'prewarmed' &&
      capacityRequestIntent !== undefined &&
      isOnlyLineForSubscriptionOperation &&
      isManagedEmailDesignSameSubscriptionIntent(
        subscriptionOperation.intent,
        capacityRequestIntent,
      );
    const isAggregateQuoteLine =
      operation.source !== 'prewarmed' &&
      subscriptionOperation.intent.resourceSnapshotIds.length > 1 &&
      isOnlyLineForSubscriptionOperation &&
      quoteLine.resourceLabel ===
        subscriptionOperation.intent.resourceSnapshotIds
          .map((snapshotId) => resourceSnapshotsById.get(snapshotId)?.label)
          .join(', ');
    const isAggregateWarmupLine =
      quoteLine.product === 'managed-warmup' &&
      resourceSnapshot?.kind === 'warmup-capacity' &&
      quoteLine.quantity ===
        subscriptionOperation.intent.resourceSnapshotIds.length;
    const usesCanonicalSnapshot =
      isCapacityLine || isAggregateQuoteLine || isAggregateWarmupLine;
    if (
      typeof resourceSnapshotId !== 'string' ||
      resourceSnapshot === undefined ||
      !subscriptionOperation.intent.resourceSnapshotIds.includes(
        resourceSnapshotId,
      ) ||
      (usesCanonicalSnapshot
        ? resourceSnapshotId !==
          subscriptionOperation.intent.resourceSnapshotIds[0]
        : resourceSnapshot.label !== quoteLine.resourceLabel)
    ) {
      throw new Error(
        'Acquisition line resource snapshot must match its subscription intent and quote.',
      );
    }
    if (boundResourceSnapshotIds.has(resourceSnapshotId)) {
      throw new Error(
        'Acquisition line resource snapshot bindings must be unique.',
      );
    }

    boundResourceSnapshotIds.add(resourceSnapshotId);
  }
  if (operation.source === 'prewarmed') {
    const mailboxSubscriptionOperation = operation.subscriptionOperations.find(
      ({ intent }) => intent.product === 'managed-mailbox',
    );
    const mailboxLines = operation.lines.filter(
      (line) =>
        quoteLinesById.get(line.quoteLineId)?.product === 'managed-mailbox',
    );
    if (
      mailboxSubscriptionOperation === undefined ||
      mailboxLines.length !==
        mailboxSubscriptionOperation.intent.resourceSnapshotIds.length ||
      mailboxLines.some((line) => {
        const quantity = quoteLinesById.get(line.quoteLineId)?.quantity;

        return quantity !== 0 && quantity !== 1;
      }) ||
      mailboxSubscriptionOperation.intent.resourceSnapshotIds.some(
        (snapshotId) => !boundResourceSnapshotIds.has(snapshotId),
      )
    ) {
      throw new Error(
        'Prewarmed mailbox resources require one quote and acquisition line each.',
      );
    }
  }

  for (const subscriptionOperation of operation.subscriptionOperations) {
    const quotedQuantity = operation.lines.reduce((total, line) => {
      if (line.subscriptionOperationId !== subscriptionOperation.id) {
        return total;
      }

      return total + (quoteLinesById.get(line.quoteLineId)?.quantity ?? 0);
    }, 0);

    if (quotedQuantity !== subscriptionOperation.intent.quantityDelta) {
      throw new Error(
        'Subscription intent quantity does not match accepted quote.',
      );
    }
  }

  if (
    operation.subscriptionOperations.some(
      (subscriptionOperation) =>
        !operation.lines.some(
          (line) => line.subscriptionOperationId === subscriptionOperation.id,
        ),
    )
  ) {
    throw new Error('Every subscription operation must be referenced.');
  }
};

const assertManagedEmailDesignAcquisitionGraph = (
  operation: ManagedEmailDesignNonIdleAcquisitionOperation,
) => {
  const linesById = new Map<string, ManagedEmailDesignAcquisitionLine>(
    operation.lines.map((line) => [line.id, line] as const),
  );
  const subscriptionOperationsById = new Map<
    string,
    ManagedEmailDesignAcquisitionSubscriptionOperation
  >(
    operation.subscriptionOperations.map(
      (subscriptionOperation) =>
        [subscriptionOperation.id, subscriptionOperation] as const,
    ),
  );
  const declaredLineIds = new Set<string>();
  for (const line of operation.lines) {
    if (
      line.dependsOnLineIds.some(
        (dependencyId) => !declaredLineIds.has(dependencyId),
      )
    ) {
      throw new Error(
        'Acquisition line dependencies must be declared earlier.',
      );
    }

    declaredLineIds.add(line.id);
  }
  const visitedLineIds = new Set<string>();
  const visitingLineIds = new Set<string>();
  const visitLine = (lineId: string) => {
    if (visitedLineIds.has(lineId)) {
      return;
    }
    if (visitingLineIds.has(lineId)) {
      throw new Error('Acquisition resource dependencies must be acyclic.');
    }

    visitingLineIds.add(lineId);
    const line = linesById.get(lineId);
    line?.dependsOnLineIds.forEach(visitLine);
    visitingLineIds.delete(lineId);
    visitedLineIds.add(lineId);
  };

  operation.lines.forEach((line) => visitLine(line.id));

  for (const subscriptionOperation of operation.subscriptionOperations) {
    const referencedLines = operation.lines.filter(
      (line) => line.subscriptionOperationId === subscriptionOperation.id,
    );
    const allPaymentsCompleted = referencedLines.every(
      (line) => line.paymentOutcome === 'completed',
    );
    if (
      (!allPaymentsCompleted && subscriptionOperation.outcome !== 'blocked') ||
      (allPaymentsCompleted && subscriptionOperation.outcome === 'blocked')
    ) {
      throw new Error(
        'Shared subscription operation violates payment prerequisites.',
      );
    }
  }

  for (const line of operation.lines) {
    const subscriptionOperation = subscriptionOperationsById.get(
      line.subscriptionOperationId,
    );
    const prerequisitesCompleted =
      line.paymentOutcome === 'completed' &&
      subscriptionOperation?.outcome === 'completed' &&
      line.dependsOnLineIds.every(
        (dependencyId) =>
          linesById.get(dependencyId)?.resourceOutcome === 'completed',
      );
    if (
      (!prerequisitesCompleted && line.resourceOutcome !== 'blocked') ||
      (prerequisitesCompleted && line.resourceOutcome === 'blocked')
    ) {
      throw new Error('Resource operation violates dependency prerequisites.');
    }
  }
};

export const createManagedEmailDesignAcquisitionOperation = ({
  operation,
  quote,
  resourceSnapshots,
  fixtureNow,
}: {
  operation: ManagedEmailDesignAcquisitionOperation;
  quote?: ManagedEmailDesignQuote;
  resourceSnapshots: ManagedEmailDesignResourceSnapshot[];
  fixtureNow: string;
}): ManagedEmailDesignAcquisitionOperation => {
  if (operation.status === 'idle') {
    if (
      operation.id !== null ||
      operation.acceptedQuoteId !== null ||
      operation.source !== null ||
      operation.lines.length !== 0 ||
      operation.subscriptionOperations.length !== 0
    ) {
      throw new Error('Idle acquisition must not retain commercial identity.');
    }

    return operation;
  }

  if (
    !quote ||
    quote.id !== operation.acceptedQuoteId ||
    !isManagedEmailDesignQuoteCompletable({ quote, fixtureNow })
  ) {
    throw new Error('Acquisition must retain a current accepted quote.');
  }
  assertManagedEmailDesignUniqueIds(operation.lines, 'Acquisition line');
  assertManagedEmailDesignUniqueIds(
    operation.subscriptionOperations,
    'Subscription operation',
  );
  if (
    new Set(
      operation.subscriptionOperations.map(
        ({ intent }) => intent.targetSubscriptionId,
      ),
    ).size !== operation.subscriptionOperations.length
  ) {
    throw new Error('Acquisition target subscription IDs must be unique.');
  }
  if (
    new Set(operation.lines.map((line) => line.resourceOperationId)).size !==
      operation.lines.length ||
    new Set(operation.lines.map((line) => line.paymentEvidenceId)).size !==
      operation.lines.length
  ) {
    throw new Error(
      'Acquisition resource and payment operations must be unique.',
    );
  }
  const quoteLinesById = new Map<string, ManagedEmailDesignQuoteLine>(
    quote.lines.map((line) => [line.id, line] as const),
  );
  const acquisitionQuoteLineIds = new Set(
    operation.lines.map((line) => line.quoteLineId),
  );
  if (
    quoteLinesById.size !== operation.lines.length ||
    acquisitionQuoteLineIds.size !== quoteLinesById.size ||
    operation.lines.some((line) => !quoteLinesById.has(line.quoteLineId))
  ) {
    throw new Error('Quote and acquisition lines must match exactly.');
  }
  assertManagedEmailDesignUniqueIds(
    resourceSnapshots,
    'Acquisition resource snapshot',
  );
  const resourceSnapshotsById = new Map<
    string,
    ManagedEmailDesignResourceSnapshot
  >(resourceSnapshots.map((snapshot) => [snapshot.id, snapshot] as const));
  operation.subscriptionOperations.forEach((subscriptionOperation) =>
    assertManagedEmailDesignSubscriptionIntent({
      intent: subscriptionOperation.intent,
      resourceSnapshots: resourceSnapshotsById,
    }),
  );
  const capacityRequestIntent = quote.capacityRequest?.intent;
  assertManagedEmailDesignAcquisitionSource({
    operation,
    quoteLinesById,
    resourceSnapshotsById,
    capacityRequestIntent,
  });
  if (
    capacityRequestIntent !== undefined &&
    ((operation.source !== capacityRequestIntent.product &&
      !(
        operation.source === 'prewarmed' &&
        capacityRequestIntent.product === 'managed-mailbox'
      )) ||
      operation.subscriptionOperations.filter(({ intent }) =>
        isManagedEmailDesignSameSubscriptionIntent(
          intent,
          capacityRequestIntent,
        ),
      ).length !== 1)
  ) {
    throw new Error(
      'Capacity acquisition intent does not match accepted quote.',
    );
  }
  assertManagedEmailDesignAcquisitionGraph(operation);

  if (getManagedEmailDesignAcquisitionStatus(operation) !== operation.status) {
    throw new Error('Acquisition status must be derived from its graph.');
  }

  return operation;
};

export const getManagedEmailDesignAcquisitionRetryOrder = (
  operation: ManagedEmailDesignAcquisitionOperation,
  targetOutcome?: 'pending' | 'failed' | 'unknown',
) => {
  if (operation.status === 'idle') {
    return [];
  }

  const order: Array<{
    kind: 'payment' | 'subscription' | 'resource';
    id: string;
  }> = [];
  const subscriptionOperationsById = new Map<
    string,
    ManagedEmailDesignAcquisitionSubscriptionOperation
  >(
    operation.subscriptionOperations.map(
      (subscriptionOperation) =>
        [subscriptionOperation.id, subscriptionOperation] as const,
    ),
  );
  const linesById = new Map<string, ManagedEmailDesignAcquisitionLine>(
    operation.lines.map((line) => [line.id, line] as const),
  );

  for (const line of operation.lines) {
    if (
      line.paymentOutcome !== 'completed' &&
      (targetOutcome === undefined || line.paymentOutcome === targetOutcome)
    ) {
      order.push({ kind: 'payment', id: line.paymentEvidenceId });
    }
  }

  for (const subscriptionOperation of operation.subscriptionOperations) {
    let paymentsCompleted = true;
    for (const line of operation.lines) {
      if (
        line.subscriptionOperationId === subscriptionOperation.id &&
        line.paymentOutcome !== 'completed'
      ) {
        paymentsCompleted = false;
        break;
      }
    }

    if (
      paymentsCompleted &&
      subscriptionOperation.outcome !== 'completed' &&
      subscriptionOperation.outcome !== 'blocked' &&
      (targetOutcome === undefined ||
        subscriptionOperation.outcome === targetOutcome)
    ) {
      order.push({ kind: 'subscription', id: subscriptionOperation.id });
    }
  }

  for (const line of operation.lines) {
    const subscriptionOperation = subscriptionOperationsById.get(
      line.subscriptionOperationId,
    );
    const resourceReady =
      line.paymentOutcome === 'completed' &&
      subscriptionOperation?.outcome === 'completed' &&
      line.dependsOnLineIds.every(
        (dependencyId) =>
          linesById.get(dependencyId)?.resourceOutcome === 'completed',
      );
    if (
      resourceReady &&
      line.resourceOutcome !== 'completed' &&
      line.resourceOutcome !== 'blocked' &&
      (targetOutcome === undefined || line.resourceOutcome === targetOutcome)
    ) {
      order.push({ kind: 'resource', id: line.resourceOperationId });
    }
  }

  return order;
};

export const getManagedEmailDesignBundleConflictingAddresses = (
  bundle: ManagedEmailDesignPrewarmedBundle,
  mailboxes: ManagedEmailDesignMailbox[],
) => {
  const existingAddresses = new Set(
    mailboxes.map((mailbox) =>
      normalizeManagedEmailDesignMailboxAddress(mailbox.address),
    ),
  );

  return bundle.mailboxIdentities
    .filter((mailbox) =>
      existingAddresses.has(
        normalizeManagedEmailDesignMailboxAddress(mailbox.address),
      ),
    )
    .map((mailbox) => mailbox.address);
};

export const getManagedEmailDesignBundleConflictMessage = (
  bundle: ManagedEmailDesignPrewarmedBundle,
  workspace: Pick<ManagedEmailDesignWorkspace, 'domains' | 'mailboxes'> &
    Partial<Pick<ManagedEmailDesignWorkspace, 'subscriptions'>>,
) => {
  const normalizedBundleDomain = normalizeManagedEmailDesignDomain(
    bundle.domain,
  );
  const normalizedBundleAddresses = bundle.mailboxIdentities.map((mailbox) =>
    normalizeManagedEmailDesignMailboxAddress(mailbox.address),
  );

  if (
    new Set(normalizedBundleAddresses).size !== normalizedBundleAddresses.length
  ) {
    return i18n._(
      msg`Cannot select this fixed bundle because its mailbox identities are not unique.`,
    );
  }

  if (
    workspace.domains.some(
      (domain) =>
        normalizeManagedEmailDesignDomain(domain.name) ===
        normalizedBundleDomain,
    ) ||
    (workspace.subscriptions ?? []).some(
      (subscription) =>
        subscription.product === 'managed-domain' &&
        subscription.linkedResources.some(
          (snapshot) =>
            snapshot.kind === 'domain' &&
            normalizeManagedEmailDesignDomain(snapshot.label) ===
              normalizedBundleDomain,
        ),
    )
  ) {
    return i18n._(
      msg`Cannot select this fixed bundle because its domain already exists: ${normalizedBundleDomain}.`,
    );
  }

  const conflictingAddresses = getManagedEmailDesignBundleConflictingAddresses(
    bundle,
    workspace.mailboxes,
  );

  if (conflictingAddresses.length === 0) {
    return null;
  }

  const formattedAddresses = conflictingAddresses.join(', ');

  return plural(conflictingAddresses.length, {
    one: `Cannot select this fixed bundle because this identity already exists: ${formattedAddresses}.`,
    other: `Cannot select this fixed bundle because these identities already exist: ${formattedAddresses}.`,
  });
};

const harborlinePrewarmedBundle = {
  id: 'prewarmed-harborline-01',
  domain: 'harborline-mail.com',
  mailboxIdentities: [
    {
      identity: 'Samira Bell',
      address: 'samira@harborline-mail.com',
    },
    {
      identity: 'Theo Walsh',
      address: 'theo@harborline-mail.com',
    },
  ],
} satisfies ManagedEmailDesignPrewarmedBundle;

const collidingFleetwavePrewarmedBundle = {
  id: 'prewarmed-fleetwave-collision',
  domain: 'fleetwave-mail.com',
  mailboxIdentities: [
    {
      identity: 'Avery Miles',
      address: 'avery@fleetwave-mail.com',
    },
    {
      identity: 'Rowan Cole',
      address: 'rowan@fleetwave-mail.com',
    },
  ],
} satisfies ManagedEmailDesignPrewarmedBundle;

export const mixedWorkspace = {
  domains: [
    {
      id: 'domain-northstar',
      name: 'northstar-outreach.com',
      source: 'managed',
      verification: 'verified',
      subscriptionId: 'subscription-managed-domain-northstar',
    },
    {
      id: 'domain-riveroak',
      name: 'riveroak.io',
      source: 'external',
      verification: 'verified',
      subscriptionId: null,
    },
    {
      id: 'domain-fleetwave',
      name: 'fleetwave-mail.com',
      source: 'prewarmed',
      verification: 'verified',
      subscriptionId: 'subscription-prewarmed-domain-fleetwave',
    },
  ],
  mailboxes: [
    {
      id: 'mailbox-mira',
      identity: 'Mira Chen',
      address: 'mira@northstar-outreach.com',
      domain: 'northstar-outreach.com',
      source: 'managed',
      subscriptionId: 'subscription-managed-mailbox',
      readiness: 'not-ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    },
    {
      id: 'mailbox-jordan',
      identity: 'Jordan Lee',
      address: 'jordan@northstar-outreach.com',
      domain: 'northstar-outreach.com',
      source: 'managed',
      subscriptionId: 'subscription-managed-mailbox',
      readiness: 'ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    },
    createManagedEmailDesignMailbox({
      id: 'mailbox-rory',
      identity: 'Rory Blake',
      address: 'rory@riveroak.io',
      domain: 'riveroak.io',
      source: 'connected',
      subscriptionId: null,
      readiness: 'ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
      connection: createManagedEmailDesignMailboxConnection({
        draft: {
          address: 'rory@riveroak.io',
          selectedProtocol: 'SMTP',
          host: 'smtp.riveroak.io',
          port: 587,
          connectionSecurity: 'STARTTLS',
          username: 'rory',
        },
        capabilities: ['imap', 'smtp'],
        canSend: true,
        sendingCapabilityReason: null,
        mode: 'add',
        mailboxId: 'mailbox-rory',
        operation: {
          status: 'connected',
          operationId: 'connection-operation-rory-001',
          configuredOutcome: 'connected',
        },
      }),
    }),
    {
      id: 'mailbox-avery',
      identity: 'Avery Miles',
      address: 'avery@fleetwave-mail.com',
      domain: 'fleetwave-mail.com',
      source: 'prewarmed',
      subscriptionId: 'subscription-managed-mailbox',
      readiness: 'not-ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    },
    {
      id: 'mailbox-rowan',
      identity: 'Rowan Cole',
      address: 'rowan@fleetwave-mail.com',
      domain: 'fleetwave-mail.com',
      source: 'prewarmed',
      subscriptionId: 'subscription-managed-mailbox',
      readiness: 'not-ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    },
  ],
  subscriptions: [
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-managed-domain-northstar',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'domain-northstar',
          kind: 'domain',
          label: 'northstar-outreach.com',
        },
      ],
      unitPriceCents: managedEmailDesignPricing.managedDomainAnnualCents,
      product: 'managed-domain',
      cadence: 'annual',
      quantity: 1,
      status: 'active',
      renewsAt: '2027-10-12T12:00:00.000Z',
    }),
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-prewarmed-domain-fleetwave',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'domain-fleetwave',
          kind: 'domain',
          label: 'fleetwave-mail.com',
        },
      ],
      unitPriceCents: managedEmailDesignPricing.managedDomainAnnualCents,
      product: 'managed-domain',
      cadence: 'annual',
      quantity: 1,
      status: 'active',
      renewsAt: '2028-01-18T12:00:00.000Z',
    }),
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-managed-mailbox',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'mailbox-mira',
          kind: 'mailbox',
          label: 'Mira Chen <mira@northstar-outreach.com>',
        },
        {
          id: 'mailbox-jordan',
          kind: 'mailbox',
          label: 'Jordan Lee <jordan@northstar-outreach.com>',
        },
        {
          id: 'mailbox-avery',
          kind: 'mailbox',
          label: 'Avery Miles <avery@fleetwave-mail.com>',
        },
        {
          id: 'mailbox-rowan',
          kind: 'mailbox',
          label: 'Rowan Cole <rowan@fleetwave-mail.com>',
        },
      ],
      unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      product: 'managed-mailbox',
      cadence: 'monthly',
      quantity: 4,
      status: 'active',
      renewsAt: '2027-02-10T12:00:00.000Z',
    }),
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-managed-warmup',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: getManagedEmailDesignWarmupSnapshots({
        prefix: 'subscription-managed-warmup',
        quantity: 2,
      }),
      unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: 2,
      status: 'active',
      renewsAt: '2027-02-10T12:00:00.000Z',
    }),
  ],
  prewarmedBundles: [
    harborlinePrewarmedBundle,
    collidingFleetwavePrewarmedBundle,
  ],
} satisfies ManagedEmailDesignWorkspace;

export const workspaceWithAvailableWarmupCapacity = {
  ...mixedWorkspace,
  subscriptions: [
    ...mixedWorkspace.subscriptions.filter(
      (subscription) => subscription.product !== 'managed-warmup',
    ),
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-managed-warmup',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: getManagedEmailDesignWarmupSnapshots({
        prefix: 'subscription-managed-warmup',
        quantity: 3,
      }),
      unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: 3,
      status: 'active',
      renewsAt: '2027-02-10T12:00:00.000Z',
    }),
  ],
} satisfies ManagedEmailDesignWorkspace;

export const workspaceWithWarmupStateExamples = {
  ...workspaceWithAvailableWarmupCapacity,
  mailboxes: [
    ...mixedWorkspace.mailboxes,
    {
      id: 'mailbox-lena',
      identity: 'Lena Ortiz',
      address: 'lena@northstar-outreach.com',
      domain: 'northstar-outreach.com',
      source: 'managed',
      subscriptionId: 'subscription-managed-mailbox',
      readiness: 'not-ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: { status: 'idle' },
      },
    },
    createManagedEmailDesignMailbox({
      id: 'mailbox-kai',
      identity: 'Kai Morgan',
      address: 'kai@riveroak.io',
      domain: 'riveroak.io',
      source: 'connected',
      subscriptionId: null,
      readiness: 'ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: { status: 'idle' },
      },
      connection: createManagedEmailDesignMailboxConnection({
        draft: {
          address: 'kai@riveroak.io',
          selectedProtocol: 'SMTP',
          host: 'smtp.riveroak.io',
          port: 587,
          connectionSecurity: 'STARTTLS',
          username: 'kai',
        },
        capabilities: ['smtp'],
        canSend: true,
        sendingCapabilityReason: null,
        mode: 'retest',
        mailboxId: 'mailbox-kai',
        operation: {
          status: 'failed',
          operationId: 'connection-operation-kai-attention-001',
          configuredOutcome: 'failed',
          safeDiagnostic:
            'Authentication failed. Re-enter the password and try again.',
        },
      }),
    }),
  ],
  subscriptions: [
    ...workspaceWithAvailableWarmupCapacity.subscriptions.filter(
      (subscription) =>
        subscription.product !== 'managed-mailbox' &&
        subscription.product !== 'managed-warmup',
    ),
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-managed-mailbox',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: [
        {
          id: 'mailbox-mira',
          kind: 'mailbox',
          label: 'Mira Chen <mira@northstar-outreach.com>',
        },
        {
          id: 'mailbox-jordan',
          kind: 'mailbox',
          label: 'Jordan Lee <jordan@northstar-outreach.com>',
        },
        {
          id: 'mailbox-avery',
          kind: 'mailbox',
          label: 'Avery Miles <avery@fleetwave-mail.com>',
        },
        {
          id: 'mailbox-rowan',
          kind: 'mailbox',
          label: 'Rowan Cole <rowan@fleetwave-mail.com>',
        },
        {
          id: 'mailbox-lena',
          kind: 'mailbox',
          label: 'Lena Ortiz <lena@northstar-outreach.com>',
        },
      ],
      unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      product: 'managed-mailbox',
      cadence: 'monthly',
      quantity: 5,
      status: 'active',
      renewsAt: '2027-02-10T12:00:00.000Z',
    }),
    createManagedEmailDesignRecurringSubscription({
      id: 'subscription-managed-warmup',
      workspaceId: 'workspace-managed-email-design',
      linkedResources: getManagedEmailDesignWarmupSnapshots({
        prefix: 'subscription-managed-warmup',
        quantity: 5,
      }),
      unitPriceCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
      product: 'managed-warmup',
      cadence: 'monthly',
      quantity: 5,
      status: 'active',
      renewsAt: '2027-02-10T12:00:00.000Z',
    }),
  ],
} satisfies ManagedEmailDesignWorkspace;

export const emptyWorkspace = {
  domains: [],
  mailboxes: [],
  prewarmedBundles: [],
  subscriptions: [],
} satisfies ManagedEmailDesignWorkspace;

export const workspaceWithoutPrewarmedInventory = {
  ...mixedWorkspace,
  prewarmedBundles: [],
} satisfies ManagedEmailDesignWorkspace;

export const createManagedDomainReview = (
  domain: string,
  annualCents = managedEmailDesignPricing.managedDomainAnnualCents,
): ManagedEmailDesignReviewDraft => {
  const resource = normalizeManagedEmailDesignDomain(domain);
  const line: ManagedEmailDesignReviewLine = {
    id: 'managed-domain',
    product: 'managed-domain',
    category: 'Domain',
    service: 'Myah-managed sending domain',
    resource,
    recurrence: 'Annual',
    unitPriceCents: annualCents,
    quantity: 1,
    amountCents: annualCents,
    dueTodayCents: annualCents,
  };

  return {
    kind: 'domain-only',
    title: msg`Review managed domain`,
    description: msg`Only the selected annual domain is included. No mailbox or warmup charge is included.`,
    selectedDomain: resource,
    selectedMailbox: null,
    lines: [line],
    dueTodayCents: line.dueTodayCents,
    completion: {
      type: 'add-managed-domain',
      domain: createManagedEmailDesignDomain({
        name: resource,
        source: 'managed',
      }),
    },
  };
};

export const createManagedMailboxReview = ({
  address,
  domain,
}: {
  address: string;
  domain: string;
}): ManagedEmailDesignReviewDraft => {
  const identity =
    normalizeManagedEmailDesignMailboxAddress(address).split('@')[0] ?? '';
  const mailbox = createManagedEmailDesignMailbox({
    identity,
    address,
    domain,
    source: 'managed',
    warmupState: {
      assignment: 'unassigned',
      lastConfirmedProviderState: 'inactive',
      operation: { status: 'idle' },
    },
  });
  const line: ManagedEmailDesignReviewLine = {
    id: 'managed-mailbox',
    product: 'managed-mailbox',
    category: 'Mailbox',
    service: 'Managed mailbox',
    resource: mailbox.address,
    recurrence: 'Monthly',
    unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
    quantity: 1,
    amountCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
    dueTodayCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
  };

  return {
    kind: 'mailbox-only',
    title: msg`Review managed mailbox`,
    description: msg`Only the selected monthly mailbox is included. No domain or warmup charge is included.`,
    selectedDomain: null,
    selectedMailbox: mailbox.address,
    lines: [line],
    dueTodayCents: line.dueTodayCents,
    completion: {
      type: 'add-managed-mailbox',
      mailbox,
    },
  };
};

export const createPrewarmedBundleReview = (
  bundle: ManagedEmailDesignPrewarmedBundle,
): ManagedEmailDesignReviewDraft => {
  const domainLine: ManagedEmailDesignReviewLine = {
    id: `prewarmed-domain-${bundle.id}`,
    product: 'managed-domain',
    category: 'Domain',
    service: 'Prewarmed bundle domain',
    resource: bundle.domain,
    recurrence: 'Annual',
    unitPriceCents: managedEmailDesignPricing.managedDomainAnnualCents,
    quantity: 1,
    amountCents: managedEmailDesignPricing.managedDomainAnnualCents,
    dueTodayCents: managedEmailDesignPricing.managedDomainAnnualCents,
  };
  const mailboxLines = bundle.mailboxIdentities.map(
    (mailbox): ManagedEmailDesignReviewLine => ({
      id: `prewarmed-mailbox-${mailbox.address}`,
      product: 'managed-mailbox',
      category: 'Mailbox',
      service: 'Prewarmed managed mailbox',
      resource: `${mailbox.identity} <${normalizeManagedEmailDesignMailboxAddress(
        mailbox.address,
      )}>`,
      recurrence: 'Monthly',
      unitPriceCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      quantity: 1,
      amountCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
      dueTodayCents: managedEmailDesignPricing.managedMailboxMonthlyCents,
    }),
  );
  const lines = [domainLine, ...mailboxLines];

  return {
    kind: 'prewarmed-bundle',
    title: msg`Review prewarmed bundle`,
    description: msg`This fixed bundle includes the annual domain and listed monthly mailboxes. Existing prewarmed readiness is preserved without ongoing warmup.`,
    selectedDomain: bundle.domain,
    selectedMailbox: mailboxLines.map(({ resource }) => resource).join(', '),
    lines,
    dueTodayCents: lines.reduce((total, line) => total + line.dueTodayCents, 0),
    completion: {
      type: 'add-prewarmed-bundle',
      bundleId: bundle.id,
    },
  };
};

export const formatManagedEmailDesignUsd = (cents: number) =>
  new Intl.NumberFormat(i18n.locale, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
