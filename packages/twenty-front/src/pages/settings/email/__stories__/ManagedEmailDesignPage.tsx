import { useLingui } from '@lingui/react/macro';
import { plural } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { StepBar } from '@/ui/navigation/step-bar/components/StepBar';
import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { Info } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { Card, CardContent, CardHeader } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  applyManagedEmailDesignSubscriptionCancellation,
  applyManagedEmailDesignSubscriptionQuantityChange,
  createManagedEmailDesignAcquisitionOperation,
  createManagedEmailDesignDomain,
  createManagedEmailDesignMailbox,
  createManagedEmailDesignMailboxConnection,
  createManagedEmailDesignQuote,
  createManagedEmailDesignRecurringSubscription,
  createManagedDomainReview,
  createManagedMailboxReview,
  createPrewarmedBundleReview,
  findManagedEmailDesignHistoricalMailboxSnapshot,
  formatManagedEmailDesignUsd,
  getManagedEmailDesignAcquisitionRetryOrder,
  getManagedEmailDesignAcquisitionStatus,
  getManagedEmailDesignAssignedWarmupCount,
  getManagedEmailDesignAvailableWarmupCount,
  getManagedEmailDesignBundleConflictMessage,
  getManagedEmailDesignDomainSearchResults,
  getManagedEmailDesignDomainSubscription,
  getManagedEmailDesignDomainValidationMessage,
  getManagedEmailDesignEffectiveSubscriptionQuantity,
  getManagedEmailDesignLinkedMailboxCount,
  getManagedEmailDesignTupleIdentity,
  getManagedEmailDesignMailboxValidationMessage,
  getManagedEmailDesignMailboxSendingCapabilityReasonMessage,
  isManagedEmailDesignLocalPart,
  isManagedEmailDesignQuoteCompletable,
  managedEmailDesignDnsRecords,
  managedEmailDesignMailboxConnectionSafeDiagnostics,
  mixedWorkspace,
  normalizeManagedEmailDesignDomain,
  normalizeManagedEmailDesignMailboxAddress,
  requestManagedEmailDesignSubscriptionCancellation,
  resolveManagedEmailDesignMailboxPoolAcquisition,
  resolveManagedEmailDesignWarmupCapacityAcquisition,
  scheduleManagedEmailDesignSubscriptionQuantityChange,
  undoManagedEmailDesignSubscriptionCancellation,
  type ManagedEmailDesignAcquisitionOperation,
  type ManagedEmailDesignCapacityResolution,
  type ManagedEmailDesignConnectionDraft,
  type ManagedEmailDesignDnsLifecycle,
  type ManagedEmailDesignDnsRecord,
  type ManagedEmailDesignDnsStatus,
  type ManagedEmailDesignDomain,
  type ManagedEmailDesignDomainSearchLifecycle,
  type ManagedEmailDesignDomainSearchResult,
  type ManagedEmailDesignDomainSearchStatus,
  type ManagedEmailDesignMailbox,
  type ManagedEmailDesignMailboxConnection,
  type ManagedEmailDesignMailboxConnectionConfiguredOutcome,
  type ManagedEmailDesignMailboxConnectionLifecycle,
  type ManagedEmailDesignMailboxConnectionMode,
  type ManagedEmailDesignPrewarmedBundle,
  type ManagedEmailDesignQuote,
  type ManagedEmailDesignQuoteLine,
  type ManagedEmailDesignResourceSnapshot,
  type ManagedEmailDesignRecurringSubscription,
  type ManagedEmailDesignReviewDraft,
  type ManagedEmailDesignSubscriptionIntent,
  type ManagedEmailDesignWorkspace,
} from './ManagedEmailDesign.fixtures';
import {
  ManagedEmailDesignDashboard,
  ManagedEmailDesignMailboxImmediateAction,
} from './ManagedEmailDesignDashboard';
import {
  ManagedEmailDesignJourney,
  type ManagedEmailDesignCompletionEvidence,
  type ManagedEmailDesignDomainAcquisitionSource,
  type ManagedEmailDesignFlow,
  type ManagedEmailDesignMailboxAcquisitionSource,
  type ManagedEmailDesignMailboxConnectionSubmission,
  type ManagedEmailDesignReviewStockConflict,
} from './ManagedEmailDesignJourney';
import { type PageDecoratorArgs } from '~/testing/decorators/PageDecorator';

export type ManagedEmailDesignInitialReview =
  | 'domain-only'
  | 'mailbox-only'
  | 'prewarmed-bundle';

export type ManagedEmailDesignPageProps = PageDecoratorArgs & {
  initialWorkspace?: ManagedEmailDesignWorkspace;
  initialFlow?: ManagedEmailDesignFlow;
  initialDomainSource?: ManagedEmailDesignDomainAcquisitionSource;
  initialMailboxSource?: ManagedEmailDesignMailboxAcquisitionSource;
  initialDnsStatus?: ManagedEmailDesignDnsStatus;
  initialDnsLifecycle?: ManagedEmailDesignDnsLifecycle;
  initialReview?: ManagedEmailDesignInitialReview;
  initialDomainSearchQuery?: string;
  initialDomainSearchStatus?: ManagedEmailDesignDomainSearchStatus;
  initialManagedDomainSearchLifecycle?: ManagedEmailDesignDomainSearchLifecycle;
  initialMailboxConnectionMode?: ManagedEmailDesignMailboxConnectionMode;
  initialMailboxConnectionMailboxId?: string;
  initialMailboxConnectionDraft?: ManagedEmailDesignConnectionDraft;
  initialMailboxConnectionOutcome?: ManagedEmailDesignMailboxConnectionConfiguredOutcome;
  initialMailboxConnectionOutcomes?: ManagedEmailDesignMailboxConnectionConfiguredOutcome[];
  initialMailboxConnectionReconcileOutcome?: Extract<
    ManagedEmailDesignMailboxConnectionConfiguredOutcome,
    'failed' | 'connected'
  >;
  initialMailboxConnectionReconcileOutcomes?: Extract<
    ManagedEmailDesignMailboxConnectionConfiguredOutcome,
    'failed' | 'connected'
  >[];
  initialReviewDraft?: ManagedEmailDesignReviewDraft | null;
  initialReviewQuote?: ManagedEmailDesignQuote | null;
  initialRefreshedQuote?: ManagedEmailDesignQuote | null;
  initialAcquisitionOperation?: ManagedEmailDesignAcquisitionOperation;
  initialAcquisitionResolution?: ManagedEmailDesignCapacityResolution;
  initialRecoveredMailboxSourceSubscriptionId?: string;
  initialPrewarmedCapacityResolution?: Exclude<
    ManagedEmailDesignCapacityResolution,
    { status: 'blocked' }
  >;
  initialWarmupTargetMailboxAddress?: string | null;
  initialAcquisitionPendingOutcome?: 'failed' | 'unknown' | 'completed';
  initialAcquisitionSubmittingOutcome?: 'failed' | 'reconciliation-required';
  initialAcquisitionReconcileOutcomes?: Array<
    'unknown' | 'failed' | 'completed'
  >;
  initialCompletionEvidence?: ManagedEmailDesignCompletionEvidence | null;
};

type ManagedEmailDesignCommercialCompletionEvidenceInput = {
  evidence: ManagedEmailDesignCompletionEvidence | null | undefined;
  quote: ManagedEmailDesignQuote | null;
  acquisitionResolution:
    | ManagedEmailDesignCapacityResolution
    | null
    | undefined;
  workspace: ManagedEmailDesignWorkspace;
  warmupTargetMailboxAddress: string | null;
};

const getManagedEmailDesignAcquisitionResourceSnapshots = ({
  operation,
  quote,
  capacitySubscription,
}: {
  operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
  quote: ManagedEmailDesignQuote;
  capacitySubscription?: ManagedEmailDesignRecurringSubscription;
}) => {
  const quoteLinesById = new Map(
    quote.lines.map((line) => [line.id, line] as const),
  );
  const resourceSnapshotsById = new Map<
    string,
    ManagedEmailDesignResourceSnapshot
  >();
  for (const line of operation.lines) {
    const quoteLine = quoteLinesById.get(line.quoteLineId);
    if (quoteLine === undefined) {
      continue;
    }

    resourceSnapshotsById.set(line.resourceSnapshotId, {
      id: line.resourceSnapshotId,
      kind:
        quoteLine.product === 'managed-domain'
          ? 'domain'
          : quoteLine.product === 'managed-mailbox'
            ? 'mailbox'
            : 'warmup-capacity',
      label: quoteLine.resourceLabel,
    });
  }
  for (const snapshot of capacitySubscription?.linkedResources ?? []) {
    resourceSnapshotsById.set(snapshot.id, snapshot);
  }

  return [...resourceSnapshotsById.values()];
};

const isCompletedExternalDomainCompletionEvidence = (
  evidence: ManagedEmailDesignCompletionEvidence | null | undefined,
  workspace: ManagedEmailDesignWorkspace,
): evidence is Extract<
  ManagedEmailDesignCompletionEvidence,
  { kind: 'external-domain' }
> => {
  if (
    evidence?.kind !== 'external-domain' ||
    evidence.domain.id !== evidence.dnsLifecycle.domain.id ||
    normalizeManagedEmailDesignDomain(evidence.domain.name) !==
      normalizeManagedEmailDesignDomain(evidence.dnsLifecycle.domain.name) ||
    evidence.dnsLifecycle.operation.configuredOutcome !== 'completed' ||
    evidence.dnsLifecycle.operation.status !== 'completed' ||
    evidence.dnsLifecycle.records.length !==
      managedEmailDesignDnsRecords.length ||
    getManagedEmailDesignDomainValidationMessage({
      domain: evidence.domain.name,
      domains: workspace.domains.filter(
        (domain) => domain.id !== evidence.domain.id,
      ),
    }) !== null
  ) {
    return false;
  }

  const existingDomain = workspace.domains.find(
    (domain) => domain.id === evidence.domain.id,
  );
  if (
    existingDomain !== undefined &&
    (existingDomain.source !== 'external' ||
      normalizeManagedEmailDesignDomain(existingDomain.name) !==
        normalizeManagedEmailDesignDomain(evidence.domain.name))
  ) {
    return false;
  }

  const recordsById = new Map(
    evidence.dnsLifecycle.records.map((record) => [record.id, record]),
  );

  return managedEmailDesignDnsRecords.every((expectedRecord) => {
    const record = recordsById.get(expectedRecord.id);

    return (
      record?.status === 'verified' &&
      record.type === expectedRecord.type &&
      record.key === expectedRecord.key &&
      record.value === expectedRecord.value &&
      record.ttl === expectedRecord.ttl &&
      (record.priority ?? null) === (expectedRecord.priority ?? null)
    );
  });
};

const isCompletedCommercialCompletionEvidence = (
  input: ManagedEmailDesignCommercialCompletionEvidenceInput,
): input is ManagedEmailDesignCommercialCompletionEvidenceInput & {
  evidence: Extract<
    ManagedEmailDesignCompletionEvidence,
    { kind: 'commercial' }
  >;
} => {
  const {
    evidence,
    quote,
    acquisitionResolution,
    workspace,
    warmupTargetMailboxAddress,
  } = input;
  if (evidence?.kind !== 'commercial') {
    return false;
  }

  const operation = evidence.acquisitionOperation;
  const matchesAcceptedQuote = (candidate: ManagedEmailDesignQuote | null) => {
    if (
      candidate === null ||
      candidate.id !== operation.acceptedQuoteId ||
      !isManagedEmailDesignQuoteCompletable({
        quote: candidate,
        fixtureNow: managedEmailDesignFixtureNow,
      })
    ) {
      return false;
    }

    const quoteLinesById = new Map(
      candidate.lines.map((line) => [line.id, line] as const),
    );
    const operationQuoteLineIds = new Set(
      operation.lines.map((line) => line.quoteLineId),
    );

    return (
      operation.lines.length > 0 &&
      operation.lines.length === candidate.lines.length &&
      operationQuoteLineIds.size === candidate.lines.length &&
      candidate.lines.every((line) => operationQuoteLineIds.has(line.id)) &&
      operation.lines.every((line) => {
        const quoteLine = quoteLinesById.get(line.quoteLineId);

        return (
          quoteLine !== undefined &&
          (operation.source === 'prewarmed' ||
            quoteLine.product === operation.source)
        );
      })
    );
  };

  const normalizedEvidenceResource = evidence.resource.trim().toLowerCase();
  const resourceMatchesQuote = quote?.lines.some((line) => {
    const normalizedLabel = line.resourceLabel.trim().toLowerCase();

    return (
      normalizedLabel === normalizedEvidenceResource ||
      normalizedLabel.includes(`<${normalizedEvidenceResource}>`) ||
      normalizedLabel.endsWith(` for ${normalizedEvidenceResource}`)
    );
  });
  const resourceMatchesPrewarmedDomain = quote?.lines.some(
    (line) =>
      line.product === 'managed-domain' &&
      line.resourceLabel.trim().toLowerCase() === normalizedEvidenceResource,
  );
  const resourceMatchesSource =
    evidence.source === 'managed-warmup'
      ? warmupTargetMailboxAddress === null
        ? resourceMatchesQuote === true
        : workspace.mailboxes.some(
            (mailbox) =>
              normalizeManagedEmailDesignMailboxAddress(mailbox.address) ===
              normalizeManagedEmailDesignMailboxAddress(
                warmupTargetMailboxAddress,
              ),
          ) &&
          normalizeManagedEmailDesignMailboxAddress(
            warmupTargetMailboxAddress,
          ) === normalizeManagedEmailDesignMailboxAddress(evidence.resource)
      : evidence.source === 'prewarmed'
        ? resourceMatchesPrewarmedDomain === true
        : resourceMatchesQuote === true;
  const mailboxAtIndex = evidence.resource.lastIndexOf('@');
  const mailboxDomain =
    evidence.source === 'managed-mailbox' && mailboxAtIndex >= 0
      ? normalizeManagedEmailDesignDomain(
          evidence.resource.slice(mailboxAtIndex + 1).replace(/>$/, ''),
        )
      : null;
  const hasVerifiedMailboxDomain =
    evidence.source !== 'managed-mailbox' ||
    (mailboxDomain !== null &&
      workspace.domains.some(
        (domain) =>
          domain.verification === 'verified' &&
          normalizeManagedEmailDesignDomain(domain.name) === mailboxDomain,
      ));
  const validatesDomainOwnership =
    evidence.source === 'managed-domain' || evidence.source === 'prewarmed';
  const domainQuoteLine = quote?.lines.find(
    (line) => line.product === 'managed-domain',
  );
  const domainOperationLine = operation.lines.find(
    (line) => line.quoteLineId === domainQuoteLine?.id,
  );
  const domainSubscriptionOperation = operation.subscriptionOperations.find(
    (subscriptionOperation) =>
      subscriptionOperation.intent.product === 'managed-domain',
  );
  const normalizedCompletionDomain = normalizeManagedEmailDesignDomain(
    evidence.resource,
  );
  const hasConflictingDomainOwnership =
    validatesDomainOwnership &&
    (workspace.domains.some(
      (domain) =>
        normalizeManagedEmailDesignDomain(domain.name) ===
          normalizedCompletionDomain &&
        domain.id !== domainOperationLine?.resourceSnapshotId,
    ) ||
      workspace.subscriptions.some(
        (subscription) =>
          subscription.product === 'managed-domain' &&
          subscription.id !==
            domainSubscriptionOperation?.intent.targetSubscriptionId &&
          subscription.linkedResources.some(
            (snapshot) =>
              snapshot.kind === 'domain' &&
              normalizeManagedEmailDesignDomain(snapshot.label) ===
                normalizedCompletionDomain,
          ),
      ));
  const capacityProduct =
    evidence.source === 'prewarmed'
      ? 'managed-mailbox'
      : evidence.source === 'managed-mailbox' ||
          evidence.source === 'managed-warmup'
        ? evidence.source
        : null;
  const capacitySubscriptionOperation = operation.subscriptionOperations.find(
    (subscriptionOperation) =>
      subscriptionOperation.intent.product === capacityProduct,
  );
  const hasConflictingCapacityPool =
    capacityProduct !== null &&
    workspace.subscriptions.some(
      (subscription) =>
        subscription.product === capacityProduct &&
        subscription.status !== 'canceled' &&
        subscription.id !==
          capacitySubscriptionOperation?.intent.targetSubscriptionId,
    );

  if (
    quote === null ||
    operation.status !== 'succeeded' ||
    getManagedEmailDesignAcquisitionStatus(operation) !== 'succeeded' ||
    evidence.source !== operation.source ||
    !resourceMatchesSource ||
    !hasVerifiedMailboxDomain ||
    hasConflictingDomainOwnership ||
    hasConflictingCapacityPool ||
    !matchesAcceptedQuote(quote)
  ) {
    return false;
  }

  try {
    createManagedEmailDesignAcquisitionOperation({
      operation,
      quote,
      resourceSnapshots: getManagedEmailDesignAcquisitionResourceSnapshots({
        operation,
        quote,
        capacitySubscription:
          acquisitionResolution?.status === 'ready'
            ? acquisitionResolution.subscription
            : undefined,
      }),
      fixtureNow: managedEmailDesignFixtureNow,
    });
  } catch {
    return false;
  }

  const quoteLinesById = new Map(
    quote.lines.map((line) => [line.id, line] as const),
  );
  const subscriptionOperationsById = new Map(
    operation.subscriptionOperations.map(
      (subscriptionOperation) =>
        [subscriptionOperation.id, subscriptionOperation] as const,
    ),
  );
  if (
    new Set(operation.lines.map(({ id }) => id)).size !==
      operation.lines.length ||
    subscriptionOperationsById.size !== operation.subscriptionOperations.length
  ) {
    return false;
  }
  const declaredLineIds = new Set<string>();
  const boundResourceSnapshotIds = new Set<string>();
  for (const line of operation.lines) {
    const quoteLine = quoteLinesById.get(line.quoteLineId);
    const subscriptionOperation = subscriptionOperationsById.get(
      line.subscriptionOperationId,
    );
    if (
      quoteLine === undefined ||
      subscriptionOperation === undefined ||
      subscriptionOperation.outcome !== 'completed' ||
      subscriptionOperation.intent.product !== quoteLine.product ||
      line.paymentOutcome !== 'completed' ||
      line.resourceOutcome !== 'completed' ||
      typeof line.resourceSnapshotId !== 'string' ||
      !subscriptionOperation.intent.resourceSnapshotIds.includes(
        line.resourceSnapshotId,
      ) ||
      boundResourceSnapshotIds.has(line.resourceSnapshotId) ||
      line.dependsOnLineIds.some(
        (dependencyId) =>
          !declaredLineIds.has(dependencyId) ||
          operation.lines.find(({ id }) => id === dependencyId)
            ?.resourceOutcome !== 'completed',
      )
    ) {
      return false;
    }

    declaredLineIds.add(line.id);
    boundResourceSnapshotIds.add(line.resourceSnapshotId);
  }
  if (
    operation.subscriptionOperations.some((subscriptionOperation) => {
      const referencedLines = operation.lines.filter(
        (line) => line.subscriptionOperationId === subscriptionOperation.id,
      );

      return (
        referencedLines.length === 0 ||
        referencedLines.reduce(
          (quantity, line) =>
            quantity + (quoteLinesById.get(line.quoteLineId)?.quantity ?? 0),
          0,
        ) !== subscriptionOperation.intent.quantityDelta
      );
    })
  ) {
    return false;
  }

  const operationProducts = new Set(
    operation.subscriptionOperations.map(({ intent }) => intent.product),
  );
  if (
    (operation.source === 'prewarmed' &&
      (operationProducts.size !== 2 ||
        !operationProducts.has('managed-domain') ||
        !operationProducts.has('managed-mailbox'))) ||
    (operation.source !== 'prewarmed' &&
      (operationProducts.size !== 1 ||
        !operationProducts.has(operation.source)))
  ) {
    return false;
  }

  if (operation.source === 'prewarmed') {
    const capacityIntent = quote.capacityRequest?.intent;
    if (capacityIntent === undefined) {
      return true;
    }
    if (capacityIntent.product !== 'managed-mailbox') {
      return false;
    }

    return operation.subscriptionOperations.some(
      ({ intent }) =>
        intent.product === capacityIntent.product &&
        intent.mode === capacityIntent.mode &&
        intent.targetSubscriptionId === capacityIntent.targetSubscriptionId &&
        intent.quantityDelta === capacityIntent.quantityDelta &&
        intent.resourceSnapshotIds.length ===
          capacityIntent.resourceSnapshotIds.length &&
        intent.resourceSnapshotIds.every(
          (snapshotId, index) =>
            snapshotId === capacityIntent.resourceSnapshotIds[index],
        ),
    );
  }

  if (acquisitionResolution === null || acquisitionResolution === undefined) {
    return quote.capacityRequest === undefined;
  }
  const capacityIntent = quote.capacityRequest;
  if (capacityIntent === undefined) {
    return false;
  }

  if (
    acquisitionResolution.status !== 'ready' ||
    acquisitionResolution.intent.product !== operation.source
  ) {
    return false;
  }
  const resolvedCapacityRequest = acquisitionResolution.quote.capacityRequest;
  if (
    !matchesAcceptedQuote(acquisitionResolution.quote) ||
    resolvedCapacityRequest?.id !== capacityIntent.id ||
    resolvedCapacityRequest.resourceHistoryCount !==
      capacityIntent.resourceHistoryCount ||
    resolvedCapacityRequest.requestKey !== capacityIntent.requestKey
  ) {
    return false;
  }
  if (
    acquisitionResolution.intent.product !== capacityIntent.intent.product ||
    acquisitionResolution.intent.mode !== capacityIntent.intent.mode ||
    acquisitionResolution.intent.targetSubscriptionId !==
      capacityIntent.intent.targetSubscriptionId ||
    acquisitionResolution.intent.quantityDelta !==
      capacityIntent.intent.quantityDelta ||
    acquisitionResolution.intent.resourceSnapshotIds.length !==
      capacityIntent.intent.resourceSnapshotIds.length ||
    !acquisitionResolution.intent.resourceSnapshotIds.every(
      (snapshotId, index) =>
        snapshotId === capacityIntent.intent.resourceSnapshotIds[index],
    )
  ) {
    return false;
  }

  return operation.subscriptionOperations.some(({ intent }) => {
    const expectedIntent = acquisitionResolution.intent;

    return (
      intent.product === expectedIntent.product &&
      intent.mode === expectedIntent.mode &&
      intent.targetSubscriptionId === expectedIntent.targetSubscriptionId &&
      intent.quantityDelta === expectedIntent.quantityDelta &&
      intent.resourceSnapshotIds.length ===
        expectedIntent.resourceSnapshotIds.length &&
      intent.resourceSnapshotIds.every(
        (snapshotId, index) =>
          snapshotId === expectedIntent.resourceSnapshotIds[index],
      )
    );
  });
};

const defaultExternalDomainName = 'brightforge.io';

const managedEmailDesignSubscriptionEffectiveAt = '2027-02-10T12:00:00.000Z';
const managedEmailDesignFixtureNow = '2027-01-10T12:00:00.000Z';
const managedEmailDesignNewDomainRenewsAt = '2028-01-10T12:00:00.000Z';
const managedEmailDesignWorkspaceId = 'workspace-managed-email-design';

const formatManagedEmailDesignDate = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
const MAILBOX_REMOVAL_MODAL_ID = 'managed-email-design-mailbox-removal';
const MANAGED_EMAIL_SUBSCRIPTION_CANCELLATION_MODAL_ID =
  'managed-email-design-subscription-cancellation';
const WARMUP_CAPACITY_REVIEW_MODAL_ID =
  'managed-email-design-warmup-capacity-review';
const MANAGED_EMAIL_SUBSCRIPTION_QUANTITY_REVIEW_MODAL_ID =
  'managed-email-design-subscription-quantity-review';

type ManagedEmailDesignDomainReturnTarget = 'dashboard' | 'mailbox-details';

type ManagedEmailDesignCurrentOperationResult =
  | {
      kind: 'success' | 'info';
      message: string;
    }
  | {
      kind: 'failure';
      message: string;
    };

type ManagedEmailDesignLinkedMailboxDetail = {
  domainId: string;
  isVisible: boolean;
};

type ManagedEmailDesignMailboxRemoval = {
  id: string;
  address: string;
  source: ManagedEmailDesignMailbox['source'];
};

type ManagedEmailDesignSubscriptionPanelState = {
  selectedSubscriptionId: string | null;
  showInventory: boolean;
  returnFocusId: string;
  targetMailboxId?: string;
};

type ManagedEmailDesignSubscriptionQuantityReview = {
  subscriptionId: string;
  quantity: number;
};

type ManagedEmailDesignWarmupCapacityReview = {
  requestedQuantity: number;
  targetSubscriptionId: string;
  targetMailboxAddress: string | null;
  quote: ManagedEmailDesignQuote;
  intent: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-warmup' }
  >;
};

const isMailboxWarmupConfirmedInactive = (mailbox: ManagedEmailDesignMailbox) =>
  mailbox.warmupState.assignment === 'unassigned' &&
  mailbox.warmupState.lastConfirmedProviderState === 'inactive' &&
  (mailbox.warmupState.operation.status === 'idle' ||
    (mailbox.warmupState.operation.status === 'failed' &&
      mailbox.warmupState.operation.action === 'start'));
const doesMailboxRemovalResetDomainVerification = ({
  workspace,
  mailbox,
}: {
  workspace: ManagedEmailDesignWorkspace;
  mailbox: ManagedEmailDesignMailbox;
}) =>
  mailbox.source === 'connected' &&
  workspace.mailboxes.filter(
    (candidate) =>
      normalizeManagedEmailDesignDomain(candidate.domain) ===
      normalizeManagedEmailDesignDomain(mailbox.domain),
  ).length === 1 &&
  workspace.domains.some(
    (domain) =>
      domain.source === 'external' &&
      domain.verification === 'mailbox-connected' &&
      normalizeManagedEmailDesignDomain(domain.name) ===
        normalizeManagedEmailDesignDomain(mailbox.domain),
  );

const getNextWarmupSubscriptionId = (
  subscriptions: ManagedEmailDesignRecurringSubscription[],
) => {
  const baseId = 'subscription-managed-warmup';
  if (!subscriptions.some((subscription) => subscription.id === baseId)) {
    return baseId;
  }

  const recoveredBaseId = `${baseId}-recovered`;
  if (
    !subscriptions.some((subscription) => subscription.id === recoveredBaseId)
  ) {
    return recoveredBaseId;
  }

  let sequence = 2;
  while (
    subscriptions.some(
      (subscription) => subscription.id === `${recoveredBaseId}-${sequence}`,
    )
  ) {
    sequence += 1;
  }

  return `${recoveredBaseId}-${sequence}`;
};
const getMailboxSnapshotAddress = (
  resource: ManagedEmailDesignResourceSnapshot,
) => {
  if (resource.kind !== 'mailbox') {
    return null;
  }

  const address = resource.label.match(/<([^<>]+)>$/)?.[1];

  return address ? normalizeManagedEmailDesignMailboxAddress(address) : null;
};

const isLiveBillableMailboxSnapshot = ({
  resource,
  mailboxes,
}: {
  resource: ManagedEmailDesignResourceSnapshot;
  mailboxes: ManagedEmailDesignMailbox[];
}) =>
  resource.kind === 'mailbox' &&
  mailboxes.some(
    (mailbox) =>
      (mailbox.source === 'managed' || mailbox.source === 'prewarmed') &&
      (mailbox.id === resource.id ||
        normalizeManagedEmailDesignMailboxAddress(mailbox.address) ===
          getMailboxSnapshotAddress(resource)),
  );

const createMailboxConnectionLifecycle = ({
  mode = 'add',
  mailboxId = null,
  draft = { address: '', selectedProtocol: null },
  capabilities = [],
  canSend = false,
  sendingCapabilityReason = 'SMTP is not configured, so this mailbox cannot send mail.',
  configuredOutcome = 'connected',
  reconcileOutcome = 'connected',
  formEpoch = 0,
}: {
  mode?: ManagedEmailDesignMailboxConnectionMode;
  mailboxId?: string | null;
  draft?: ManagedEmailDesignConnectionDraft;
  capabilities?: ManagedEmailDesignMailboxConnectionLifecycle['capabilities'];
  canSend?: boolean;
  sendingCapabilityReason?: ManagedEmailDesignMailboxConnectionLifecycle['sendingCapabilityReason'];
  configuredOutcome?: ManagedEmailDesignMailboxConnectionConfiguredOutcome;
  reconcileOutcome?: Extract<
    ManagedEmailDesignMailboxConnectionConfiguredOutcome,
    'failed' | 'connected'
  >;
  formEpoch?: number;
} = {}): ManagedEmailDesignMailboxConnectionLifecycle => ({
  mode,
  mailboxId,
  draft: {
    address: normalizeManagedEmailDesignMailboxAddress(draft.address),
    selectedProtocol: draft.selectedProtocol ?? null,
    ...(draft.host !== undefined ? { host: draft.host.trim() } : {}),
    ...(draft.port !== undefined ? { port: draft.port } : {}),
    ...(draft.connectionSecurity !== undefined
      ? { connectionSecurity: draft.connectionSecurity }
      : {}),
    ...(draft.username?.trim() ? { username: draft.username.trim() } : {}),
  },
  capabilities: [...capabilities],
  canSend,
  sendingCapabilityReason: canSend ? null : sendingCapabilityReason,
  operation: { status: 'idle' },
  operationId: null,
  configuredOutcome,
  reconcileOutcome,
  formEpoch,
  requiresFreshPassword: false,
});

const getMailboxConnectionOperationId = (
  lifecycle: ManagedEmailDesignMailboxConnectionLifecycle,
  sequence: number,
) => {
  const suffix = String(sequence).padStart(3, '0');

  return lifecycle.mode === 'add'
    ? `mailbox-connection-${suffix}`
    : `mailbox-${lifecycle.mailboxId ?? 'unknown'}-${lifecycle.mode}-${suffix}`;
};

const createDnsRecords = ({
  initialDnsStatus,
}: {
  initialDnsStatus: ManagedEmailDesignDnsStatus;
}): ManagedEmailDesignDnsRecord[] =>
  managedEmailDesignDnsRecords.map((record) => ({
    ...record,
    status:
      initialDnsStatus === 'verified'
        ? 'verified'
        : initialDnsStatus === 'action-required'
          ? record.status
          : 'pending',
  }));

const createInitialDnsLifecycle = ({
  initialDnsLifecycle,
  initialDnsStatus,
}: {
  initialDnsLifecycle: ManagedEmailDesignDnsLifecycle | undefined;
  initialDnsStatus: ManagedEmailDesignDnsStatus;
}): ManagedEmailDesignDnsLifecycle => {
  if (initialDnsLifecycle !== undefined) {
    return {
      ...initialDnsLifecycle,
      domain: {
        ...initialDnsLifecycle.domain,
        name: normalizeManagedEmailDesignDomain(
          initialDnsLifecycle.domain.name,
        ),
      },
      records: initialDnsLifecycle.records.map((record) => ({ ...record })),
      ...(initialDnsLifecycle.completedRecords !== undefined
        ? {
            completedRecords: initialDnsLifecycle.completedRecords.map(
              (record) => ({ ...record }),
            ),
          }
        : {}),
      nextOperationIdIndex: initialDnsLifecycle.nextOperationIdIndex ?? 0,
    };
  }

  const domainName = normalizeManagedEmailDesignDomain(
    defaultExternalDomainName,
  );
  const operation =
    initialDnsStatus === 'verification-required'
      ? {
          status: 'idle' as const,
          configuredOutcome: 'completed' as const,
        }
      : initialDnsStatus === 'checking-dns'
        ? {
            status: 'checking' as const,
            operationId: 'dns-check-initial-001',
            configuredOutcome: 'completed' as const,
          }
        : {
            status: 'completed' as const,
            operationId: 'dns-check-initial-001',
            configuredOutcome: 'completed' as const,
          };

  return {
    domain: {
      id: `story-domain-${domainName}`,
      name: domainName,
    },
    operation,
    records: createDnsRecords({ initialDnsStatus }),
    completedRecords: createDnsRecords({ initialDnsStatus: 'verified' }),
    nextOperationIds: [],
    nextOperationIdIndex: initialDnsStatus === 'verification-required' ? 0 : 1,
  };
};

const createInitialManagedDomainSearchLifecycle = ({
  initialManagedDomainSearchLifecycle,
  initialDomainSearchQuery,
  initialDomainSearchStatus,
  failureDiagnostic,
}: {
  initialManagedDomainSearchLifecycle:
    | ManagedEmailDesignDomainSearchLifecycle
    | undefined;
  initialDomainSearchQuery: string;
  initialDomainSearchStatus: ManagedEmailDesignDomainSearchStatus;
  failureDiagnostic: string;
}): ManagedEmailDesignDomainSearchLifecycle => {
  if (initialManagedDomainSearchLifecycle !== undefined) {
    return {
      ...initialManagedDomainSearchLifecycle,
      configuredResults:
        initialManagedDomainSearchLifecycle.configuredResults.map((result) => ({
          ...result,
        })),
      nextOperationIdIndex:
        initialManagedDomainSearchLifecycle.nextOperationIdIndex ?? 0,
    };
  }

  const configuredResults = getManagedEmailDesignDomainSearchResults(
    initialDomainSearchQuery,
  );
  const configuredOutcome =
    configuredResults.length === 0 ? 'no-results' : 'results';
  const nextOperationIds: string[] = [];

  if (initialDomainSearchStatus === 'idle') {
    return {
      operation: {
        status: 'idle',
        configuredOutcome,
      },
      configuredResults,
      nextOperationIds,
      nextOperationIdIndex: 0,
    };
  }

  if (initialDomainSearchStatus === 'failed') {
    return {
      operation: {
        status: 'failed',
        operationId: 'managed-domain-search-initial-001',
        configuredOutcome,
        safeDiagnostic: failureDiagnostic,
      },
      configuredResults,
      nextOperationIds,
      nextOperationIdIndex: 1,
    };
  }

  return {
    operation: {
      status: initialDomainSearchStatus,
      operationId: 'managed-domain-search-initial-001',
      configuredOutcome,
    },
    configuredResults,
    nextOperationIds,
    nextOperationIdIndex: 1,
  };
};

const clearDnsOperation = (
  lifecycle: ManagedEmailDesignDnsLifecycle,
): ManagedEmailDesignDnsLifecycle => ({
  ...lifecycle,
  operation: {
    status: 'idle',
    configuredOutcome: lifecycle.operation.configuredOutcome,
  },
});

const clearManagedDomainSearchOperation = (
  lifecycle: ManagedEmailDesignDomainSearchLifecycle,
): ManagedEmailDesignDomainSearchLifecycle => ({
  ...lifecycle,
  operation: {
    status: 'idle',
    configuredOutcome: lifecycle.operation.configuredOutcome,
  },
});

const getDnsStatus = ({
  operation,
  records,
}: Pick<
  ManagedEmailDesignDnsLifecycle,
  'operation' | 'records'
>): ManagedEmailDesignDnsStatus => {
  if (operation.status === 'checking') {
    return 'checking-dns';
  }

  if (records.some((record) => record.status === 'action-required')) {
    return 'action-required';
  }

  if (
    records.length > 0 &&
    records.every((record) => record.status === 'verified')
  ) {
    return 'verified';
  }

  return 'verification-required';
};

const createInitialReviewDraft = ({
  initialReview,
  workspace,
}: {
  initialReview: ManagedEmailDesignInitialReview | undefined;
  workspace: ManagedEmailDesignWorkspace;
}): ManagedEmailDesignReviewDraft | null => {
  switch (initialReview) {
    case 'domain-only':
      return createManagedDomainReview('mooreland.com');
    case 'mailbox-only':
      return createManagedMailboxReview({
        address: 'jamie@northstar-outreach.com',
        domain: 'northstar-outreach.com',
      });
    case 'prewarmed-bundle': {
      const bundle = workspace.prewarmedBundles.find(
        (candidate) =>
          getManagedEmailDesignBundleConflictMessage(candidate, workspace) ===
          null,
      );

      return bundle ? createPrewarmedBundleReview(bundle) : null;
    }
    case undefined:
      return null;
  }
};
const getPrewarmedReviewStockConflict = ({
  reviewDraft,
  workspace,
}: {
  reviewDraft: ManagedEmailDesignReviewDraft | null;
  workspace: ManagedEmailDesignWorkspace;
}): ManagedEmailDesignReviewStockConflict | null => {
  const completion = reviewDraft?.completion;
  if (completion?.type !== 'add-prewarmed-bundle') {
    return null;
  }

  const bundle = workspace.prewarmedBundles.find(
    (candidate) => candidate.id === completion.bundleId,
  );

  if (bundle === undefined) {
    return {
      bundleId: completion.bundleId,
      kind: 'inventory-unavailable',
      message: '',
    };
  }

  const conflictMessage = getManagedEmailDesignBundleConflictMessage(
    bundle,
    workspace,
  );

  return conflictMessage === null
    ? null
    : {
        bundleId: bundle.id,
        kind: 'resource-conflict',
        message: conflictMessage,
      };
};

const managedEmailDesignIdleAcquisitionOperation = {
  status: 'idle',
  id: null,
  acceptedQuoteId: null,
  source: null,
  lines: [],
  subscriptionOperations: [],
} satisfies ManagedEmailDesignAcquisitionOperation;

const createReviewQuoteFromDraft = (
  reviewDraft: ManagedEmailDesignReviewDraft,
): ManagedEmailDesignQuote => {
  const lines: ManagedEmailDesignQuoteLine[] = reviewDraft.lines.map((line) => {
    const quoteLine =
      line.product === 'managed-domain'
        ? {
            resourceLabel: line.resource,
            unitPriceCents: line.unitPriceCents,
            amountCents: line.amountCents,
            startsAt: managedEmailDesignFixtureNow,
            renewsAt: managedEmailDesignNewDomainRenewsAt,
            product: line.product,
            cadence: 'annual' as const,
            quantity: 1 as const,
          }
        : {
            resourceLabel: line.resource,
            unitPriceCents: line.unitPriceCents,
            amountCents: line.amountCents,
            startsAt: managedEmailDesignFixtureNow,
            renewsAt: managedEmailDesignSubscriptionEffectiveAt,
            product: line.product,
            cadence: 'monthly' as const,
            quantity: line.quantity,
          };

    return {
      id: `quote-line-${getManagedEmailDesignTupleIdentity([
        reviewDraft.kind,
        line.id,
        quoteLine.resourceLabel,
        quoteLine.product,
        quoteLine.unitPriceCents,
        quoteLine.amountCents,
        quoteLine.startsAt,
        quoteLine.renewsAt,
        quoteLine.cadence,
        quoteLine.quantity,
      ])}`,
      ...quoteLine,
    };
  });
  let dueTodayCents = 0;
  let monthlyRecurringCents = 0;
  let annualRecurringCents = 0;

  for (const line of lines) {
    dueTodayCents += line.amountCents;
    if (line.cadence === 'annual') {
      annualRecurringCents += line.amountCents;
    } else {
      monthlyRecurringCents += line.amountCents;
    }
  }

  const expiresAt = '2027-01-11T12:00:00.000Z';
  const id = `quote-local-${getManagedEmailDesignTupleIdentity([
    'quote',
    reviewDraft.kind,
    lines.length,
    ...lines.map((line) => line.id),
    expiresAt,
    dueTodayCents,
    monthlyRecurringCents,
    annualRecurringCents,
    'valid',
  ])}`;

  return createManagedEmailDesignQuote({
    fixtureNow: managedEmailDesignFixtureNow,
    quote: {
      id,
      expiresAt,
      acceptedQuoteId: id,
      lines,
      totals: {
        dueTodayCents,
        monthlyRecurringCents,
        annualRecurringCents,
      },
      status: 'valid',
    },
  });
};

const createPrewarmedCapacityReviewQuote = ({
  reviewDraft,
  capacityQuote,
  capacityResourceSnapshots,
}: {
  reviewDraft: ManagedEmailDesignReviewDraft;
  capacityQuote: ManagedEmailDesignQuote;
  capacityResourceSnapshots: ManagedEmailDesignResourceSnapshot[];
}): ManagedEmailDesignQuote => {
  const draftQuote = createReviewQuoteFromDraft(reviewDraft);
  const domainLine = draftQuote.lines.find(
    (line) => line.product === 'managed-domain',
  );
  const capacityMailboxLine = capacityQuote.lines.find(
    (line) => line.product === 'managed-mailbox',
  );
  const capacityRequest = capacityQuote.capacityRequest;
  if (
    domainLine === undefined ||
    capacityMailboxLine === undefined ||
    capacityRequest?.intent.product !== 'managed-mailbox'
  ) {
    throw new Error(
      'A prewarmed review requires domain and mailbox capacity quote lines.',
    );
  }

  const capacityResourceSnapshotsById = new Map(
    capacityResourceSnapshots.map((snapshot) => [snapshot.id, snapshot]),
  );
  const requestedSnapshots: ManagedEmailDesignResourceSnapshot[] = [];
  for (const snapshotId of capacityRequest.intent.resourceSnapshotIds) {
    const snapshot = capacityResourceSnapshotsById.get(snapshotId);
    if (snapshot === undefined) {
      throw new Error(
        'A prewarmed review requires every mailbox capacity snapshot.',
      );
    }
    requestedSnapshots.push(snapshot);
  }

  const mailboxLines: ManagedEmailDesignQuoteLine[] = requestedSnapshots.map(
    (snapshot, index) => {
      const quantity = index < capacityMailboxLine.quantity ? 1 : 0;

      return {
        id: `quote-line-${getManagedEmailDesignTupleIdentity([
          'prewarmed-capacity-mailbox',
          capacityMailboxLine.id,
          snapshot.id,
          quantity,
        ])}`,
        resourceLabel: snapshot.label,
        unitPriceCents: capacityMailboxLine.unitPriceCents,
        quantity,
        amountCents: capacityMailboxLine.unitPriceCents * quantity,
        startsAt: capacityMailboxLine.startsAt,
        renewsAt: capacityMailboxLine.renewsAt,
        product: 'managed-mailbox',
        cadence: 'monthly',
      };
    },
  );
  const lines: ManagedEmailDesignQuoteLine[] = [domainLine, ...mailboxLines];
  const totals = lines.reduce(
    (current, line) => ({
      dueTodayCents: current.dueTodayCents + line.amountCents,
      monthlyRecurringCents:
        current.monthlyRecurringCents +
        (line.cadence === 'monthly' ? line.amountCents : 0),
      annualRecurringCents:
        current.annualRecurringCents +
        (line.cadence === 'annual' ? line.amountCents : 0),
    }),
    {
      dueTodayCents: 0,
      monthlyRecurringCents: 0,
      annualRecurringCents: 0,
    },
  );
  const expiresAt =
    draftQuote.expiresAt < capacityQuote.expiresAt
      ? draftQuote.expiresAt
      : capacityQuote.expiresAt;
  const id = `quote-local-${getManagedEmailDesignTupleIdentity([
    'prewarmed-capacity',
    ...lines.map((line) => line.id),
    capacityRequest.id,
    expiresAt,
    totals.dueTodayCents,
    totals.monthlyRecurringCents,
    totals.annualRecurringCents,
  ])}`;

  return createManagedEmailDesignQuote({
    fixtureNow: managedEmailDesignFixtureNow,
    quote: {
      id,
      acceptedQuoteId: id,
      expiresAt,
      lines,
      totals,
      capacityRequest: capacityQuote.capacityRequest,
      status: 'valid',
    },
  });
};

const createPrewarmedMailboxPoolSelection = ({
  bundle,
  targetSubscriptionId,
}: {
  bundle: ManagedEmailDesignPrewarmedBundle;
  targetSubscriptionId: string;
}) =>
  bundle.mailboxIdentities.map((identity) =>
    createManagedEmailDesignMailbox({
      id: `story-mailbox-${normalizeManagedEmailDesignMailboxAddress(
        identity.address,
      )}`,
      identity: identity.identity,
      address: identity.address,
      domain: bundle.domain,
      source: 'prewarmed',
      subscriptionId: targetSubscriptionId,
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    }),
  );

const acceptManagedEmailDesignQuote = (
  quote: ManagedEmailDesignQuote,
): ManagedEmailDesignQuote | null => {
  if (quote.status !== 'valid') {
    return null;
  }

  return createManagedEmailDesignQuote({
    fixtureNow: managedEmailDesignFixtureNow,
    quote: {
      ...quote,
      acceptedQuoteId: quote.id,
    },
  });
};

const getCompletedLocalResources = ({
  quote,
  operation,
  reviewDraft,
}: {
  quote: ManagedEmailDesignQuote | null;
  operation: ManagedEmailDesignAcquisitionOperation;
  reviewDraft: ManagedEmailDesignReviewDraft | null;
}) => {
  if (quote !== null && operation.status !== 'idle') {
    const quoteLinesById = new Map(quote.lines.map((line) => [line.id, line]));

    return operation.lines.flatMap((line) => {
      if (line.resourceOutcome !== 'completed') {
        return [];
      }

      const quoteLine = quoteLinesById.get(line.quoteLineId);
      if (
        quoteLine === undefined ||
        (operation.source === 'prewarmed' &&
          quoteLine.product === 'managed-warmup')
      ) {
        return [];
      }

      return [
        quoteLine.resourceLabel.match(/<([^>]+)>$/)?.[1] ??
          quoteLine.resourceLabel,
      ];
    });
  }

  return reviewDraft?.lines.map((line) => line.resource) ?? [];
};

const createCompletedCommercialAcquisitionOperation = ({
  source,
  quote,
  resourceSnapshots,
  subscriptionOperations,
  lineResourceSnapshotIds,
}: {
  source: Extract<
    ManagedEmailDesignAcquisitionOperation,
    { id: string }
  >['source'];
  quote: ManagedEmailDesignQuote;
  resourceSnapshots: ManagedEmailDesignResourceSnapshot[];
  subscriptionOperations: Array<{
    id: string;
    intent: ManagedEmailDesignSubscriptionIntent;
  }>;
  lineResourceSnapshotIds: Map<string, string>;
}): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
  const operationId = `acquisition-${quote.id}`;
  const snapshotsById = new Map(
    resourceSnapshots.map((snapshot) => [snapshot.id, snapshot] as const),
  );
  const domainLineId = quote.lines.find(
    (line) => line.product === 'managed-domain',
  )?.id;
  const lines = quote.lines.map((quoteLine) => {
    const sameProductOperations = subscriptionOperations.filter(
      (subscriptionOperation) =>
        subscriptionOperation.intent.product === quoteLine.product,
    );
    const resourceSnapshotId = lineResourceSnapshotIds.get(quoteLine.id);
    const subscriptionOperation = sameProductOperations.find(
      (candidate) =>
        resourceSnapshotId !== undefined &&
        candidate.intent.resourceSnapshotIds.includes(resourceSnapshotId),
    );

    if (
      resourceSnapshotId === undefined ||
      !snapshotsById.has(resourceSnapshotId) ||
      subscriptionOperation === undefined
    ) {
      throw new Error(
        'The accepted quote cannot be mapped to a local resource.',
      );
    }

    return {
      id: `acquisition-line-${operationId}-${quoteLine.id}`,
      quoteLineId: quoteLine.id,
      resourceSnapshotId,
      dependsOnLineIds:
        source === 'prewarmed' &&
        quoteLine.product === 'managed-mailbox' &&
        domainLineId !== undefined
          ? [`acquisition-line-${operationId}-${domainLineId}`]
          : [],
      resourceOperationId: `resource-operation-${operationId}-${quoteLine.id}`,
      subscriptionOperationId: subscriptionOperation.id,
      paymentEvidenceId: `payment-evidence-${operationId}-${quoteLine.id}`,
      paymentOutcome: 'completed' as const,
      resourceOutcome: 'completed' as const,
    };
  });
  const operation: Extract<
    ManagedEmailDesignAcquisitionOperation,
    { id: string }
  > = {
    status: 'succeeded',
    id: operationId,
    acceptedQuoteId: quote.id,
    source,
    lines,
    subscriptionOperations: subscriptionOperations.map(
      (subscriptionOperation) => ({
        ...subscriptionOperation,
        outcome: 'completed' as const,
      }),
    ),
  };
  const acquisition = createManagedEmailDesignAcquisitionOperation({
    operation,
    quote,
    resourceSnapshots,
    fixtureNow: managedEmailDesignFixtureNow,
  });

  if (acquisition.status === 'idle') {
    throw new Error('A commercial acquisition must retain its operation ID.');
  }

  return acquisition;
};
const createPendingCommercialAcquisitionOperation = (
  input: Parameters<typeof createCompletedCommercialAcquisitionOperation>[0],
): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
  const completedOperation =
    createCompletedCommercialAcquisitionOperation(input);
  const acquisition = createManagedEmailDesignAcquisitionOperation({
    operation: {
      ...completedOperation,
      status: 'pending' as const,
      lines: completedOperation.lines.map((line) => ({
        ...line,
        paymentOutcome: 'pending' as const,
        resourceOutcome: 'blocked' as const,
      })),
      subscriptionOperations: completedOperation.subscriptionOperations.map(
        (subscriptionOperation) => ({
          ...subscriptionOperation,
          outcome: 'blocked' as const,
        }),
      ),
    },
    quote: input.quote,
    resourceSnapshots: input.resourceSnapshots,
    fixtureNow: managedEmailDesignFixtureNow,
  });

  if (acquisition.status !== 'pending') {
    throw new Error('A pending acquisition must retain its payment identity.');
  }

  return acquisition;
};

const managedEmailStoryEvidenceStyle = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
} satisfies CSSProperties;

const StyledSelectedSubscription = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: ${themeCssVariables.font.size.sm};
  }

  output {
    display: block;
    font-weight: ${themeCssVariables.font.weight.semiBold};
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const StyledSubscriptionInventory = styled.ul`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  padding: 0;

  & > li {
    display: grid;
    gap: ${themeCssVariables.spacing[1]};
    min-width: 0;
  }

  & > li > strong,
  & > li > span {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const StyledSubscriptionList = styled.ul`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  padding: 0;

  & > li {
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    min-width: 0;
  }

  strong {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const StyledSubscriptionDetails = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;

  & > div {
    align-items: start;
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    min-width: 0;
  }

  dt {
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

const StyledSubscriptionResourceSnapshots = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;

  & > div {
    display: grid;
    gap: ${themeCssVariables.spacing[1]};
    min-width: 0;
  }

  span {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const StyledSubscriptionCardHeaderText = styled.span`
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
`;

export const ManagedEmailDesignPage = ({
  initialWorkspace = mixedWorkspace,
  initialFlow,
  initialDomainSource,
  initialMailboxSource,
  initialDnsStatus = 'verification-required',
  initialDnsLifecycle,
  initialReview,
  initialDomainSearchQuery = '',
  initialDomainSearchStatus = 'idle',
  initialManagedDomainSearchLifecycle,
  initialMailboxConnectionMode,
  initialMailboxConnectionMailboxId,
  initialMailboxConnectionDraft,
  initialMailboxConnectionOutcome,
  initialMailboxConnectionOutcomes,
  initialMailboxConnectionReconcileOutcome,
  initialMailboxConnectionReconcileOutcomes,
  initialReviewDraft,
  initialReviewQuote,
  initialRefreshedQuote,
  initialAcquisitionOperation,
  initialAcquisitionResolution,
  initialRecoveredMailboxSourceSubscriptionId,
  initialPrewarmedCapacityResolution,
  initialWarmupTargetMailboxAddress,
  initialAcquisitionPendingOutcome,
  initialAcquisitionSubmittingOutcome,
  initialAcquisitionReconcileOutcomes,
  initialCompletionEvidence,
}: ManagedEmailDesignPageProps) => {
  const { i18n, t } = useLingui();
  const normalizedInitialDomainSearchQuery = normalizeManagedEmailDesignDomain(
    initialDomainSearchQuery,
  );
  const initialDnsLifecycleState = createInitialDnsLifecycle({
    initialDnsLifecycle,
    initialDnsStatus,
  });
  const initialManagedDomainSearchLifecycleState =
    createInitialManagedDomainSearchLifecycle({
      initialManagedDomainSearchLifecycle,
      initialDomainSearchQuery: normalizedInitialDomainSearchQuery,
      initialDomainSearchStatus,
      failureDiagnostic: t`The managed domain search could not be completed. Try again.`,
    });
  const initialVerifiedDomain =
    initialWorkspace.domains.find(
      (domain) => domain.verification === 'verified',
    )?.name ?? '';
  const initialDomainSourceSelection = initialDomainSource ?? null;
  const initialMailboxSourceSelection = initialMailboxSource ?? null;
  const initialMailboxConnectionOutcomeSequence =
    initialMailboxConnectionOutcomes?.length
      ? initialMailboxConnectionOutcomes
      : [initialMailboxConnectionOutcome ?? 'connected'];
  const initialMailboxConnectionReconcileOutcomeSequence =
    initialMailboxConnectionReconcileOutcomes?.length
      ? initialMailboxConnectionReconcileOutcomes
      : [initialMailboxConnectionReconcileOutcome ?? 'connected'];
  const initialMailboxConnectionMailbox =
    initialMailboxConnectionMailboxId === undefined
      ? undefined
      : initialWorkspace.mailboxes.find(
          (mailbox) => mailbox.id === initialMailboxConnectionMailboxId,
        );
  const initialMailboxConnectionModeValue =
    initialMailboxConnectionMode ??
    (initialMailboxConnectionMailbox === undefined ? 'add' : 'edit');
  const initialMailboxConnectionDraftValue = initialMailboxConnectionDraft ??
    initialMailboxConnectionMailbox?.connection?.draft ?? {
      address: '',
      selectedProtocol: null,
    };
  const createInitialMailboxConnection = (formEpoch = 0) => {
    const lifecycle = createMailboxConnectionLifecycle({
      mode: initialMailboxConnectionModeValue,
      mailboxId:
        initialMailboxConnectionModeValue === 'add'
          ? null
          : (initialMailboxConnectionMailbox?.id ??
            initialMailboxConnectionMailboxId ??
            null),
      draft: initialMailboxConnectionDraftValue,
      capabilities:
        initialMailboxConnectionMailbox?.connection?.capabilities ?? [],
      canSend: initialMailboxConnectionMailbox?.connection?.canSend ?? false,
      sendingCapabilityReason:
        initialMailboxConnectionMailbox?.connection?.sendingCapabilityReason ??
        'SMTP is not configured, so this mailbox cannot send mail.',
      configuredOutcome: initialMailboxConnectionOutcomeSequence[0],
      reconcileOutcome: initialMailboxConnectionReconcileOutcomeSequence[0],
      formEpoch,
    });

    return {
      ...lifecycle,
      requiresFreshPassword: initialMailboxConnectionModeValue === 'retest',
    };
  };
  const initialReviewDraftValue =
    initialReviewDraft === undefined
      ? createInitialReviewDraft({
          initialReview,
          workspace: initialWorkspace,
        })
      : initialReviewDraft;
  const initialReviewQuoteValue =
    initialReviewQuote === undefined
      ? initialReviewDraftValue === null
        ? null
        : createReviewQuoteFromDraft(initialReviewDraftValue)
      : initialReviewQuote;
  const initialReviewStockConflictValue = getPrewarmedReviewStockConflict({
    reviewDraft: initialReviewDraftValue,
    workspace: initialWorkspace,
  });
  const initialReviewStockConflict =
    initialReviewStockConflictValue?.kind === 'inventory-unavailable'
      ? {
          ...initialReviewStockConflictValue,
          message: t`The selected prewarmed offer is no longer available. Return to inventory to choose another available bundle.`,
        }
      : initialReviewStockConflictValue;
  const initialPrewarmedReviewBundleId =
    initialReviewDraftValue?.completion.type === 'add-prewarmed-bundle'
      ? initialReviewDraftValue.completion.bundleId
      : null;
  const initialSelectedPrewarmedBundle =
    initialPrewarmedReviewBundleId === null
      ? null
      : (initialWorkspace.prewarmedBundles.find(
          (bundle) => bundle.id === initialPrewarmedReviewBundleId,
        ) ?? null);
  const initialAcquisitionOperationValue =
    initialAcquisitionOperation ?? managedEmailDesignIdleAcquisitionOperation;
  const initialRecoveredMailboxSourceSubscriptionIdValue =
    initialRecoveredMailboxSourceSubscriptionId ??
    (initialAcquisitionResolution !== undefined &&
    initialAcquisitionResolution.status !== 'blocked'
      ? (initialAcquisitionResolution.sourceCanceledSubscriptionId ?? null)
      : null);
  const initialAcquisitionPendingOutcomeSequence: Array<
    'unknown' | 'failed' | 'completed'
  > = [initialAcquisitionPendingOutcome ?? 'completed'];
  const initialAcquisitionReconcileOutcomeSequence: Array<
    'unknown' | 'failed' | 'completed'
  > = initialAcquisitionReconcileOutcomes?.length
    ? initialAcquisitionReconcileOutcomes
    : ['completed'];
  const initialCompletionEvidenceValidation = {
    evidence: initialCompletionEvidence,
    quote: initialReviewQuoteValue,
    acquisitionResolution: initialAcquisitionResolution,
    workspace: initialWorkspace,
    warmupTargetMailboxAddress: initialWarmupTargetMailboxAddress ?? null,
  };
  const validatedInitialCompletionEvidence =
    isCompletedExternalDomainCompletionEvidence(
      initialCompletionEvidence,
      initialWorkspace,
    )
      ? initialCompletionEvidence
      : isCompletedCommercialCompletionEvidence(
            initialCompletionEvidenceValidation,
          )
        ? initialCompletionEvidenceValidation.evidence
        : null;
  const initialCompletedLocalResources =
    isCompletedExternalDomainCompletionEvidence(
      validatedInitialCompletionEvidence,
      initialWorkspace,
    )
      ? [validatedInitialCompletionEvidence.domain.name]
      : validatedInitialCompletionEvidence?.kind === 'commercial'
        ? getCompletedLocalResources({
            quote: initialReviewQuoteValue,
            operation: validatedInitialCompletionEvidence.acquisitionOperation,
            reviewDraft: null,
          })
        : [];
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [flow, setFlow] = useState<ManagedEmailDesignFlow>(
    initialFlow ?? (initialReviewDraftValue === null ? 'dashboard' : 'review'),
  );
  const [domainSource, setDomainSource] =
    useState<ManagedEmailDesignDomainAcquisitionSource | null>(
      initialDomainSourceSelection,
    );
  const [managedDomainSearchQuery, setManagedDomainSearchQuery] = useState(
    normalizedInitialDomainSearchQuery,
  );
  const [managedDomainSearchLifecycle, setManagedDomainSearchLifecycle] =
    useState(initialManagedDomainSearchLifecycleState);
  const [domainSearchResults, setDomainSearchResults] = useState(() =>
    initialManagedDomainSearchLifecycleState.operation.status === 'results'
      ? initialManagedDomainSearchLifecycleState.configuredResults
      : [],
  );
  const [selectedDomainSearchResult, setSelectedDomainSearchResult] =
    useState<ManagedEmailDesignDomainSearchResult | null>(null);
  const [externalDomainName, setExternalDomainName] = useState(
    initialDnsLifecycleState.domain.name,
  );
  const [dnsLifecycle, setDnsLifecycle] = useState(initialDnsLifecycleState);
  const [mailboxSource, setMailboxSource] =
    useState<ManagedEmailDesignMailboxAcquisitionSource | null>(
      initialMailboxSourceSelection,
    );
  const [selectedDomainName, setSelectedDomainName] = useState(
    initialVerifiedDomain,
  );
  const [mailboxLocalPart, setMailboxLocalPart] = useState('jamie');
  const [mailboxConnection, setMailboxConnection] = useState(() =>
    createInitialMailboxConnection(),
  );
  const [mailboxConnectionOutcomeIndex, setMailboxConnectionOutcomeIndex] =
    useState(0);
  const [
    mailboxConnectionReconcileOutcomeIndex,
    setMailboxConnectionReconcileOutcomeIndex,
  ] = useState(0);
  const [
    isReconcilingStoredMailboxConnection,
    setIsReconcilingStoredMailboxConnection,
  ] = useState(false);
  const [
    mailboxConnectionOperationSequence,
    setMailboxConnectionOperationSequence,
  ] = useState(0);
  const [selectedPrewarmedBundle, setSelectedPrewarmedBundle] = useState(
    initialSelectedPrewarmedBundle,
  );
  const [reviewDraft, setReviewDraft] = useState(initialReviewDraftValue);
  const [reviewQuote, setReviewQuote] = useState(initialReviewQuoteValue);
  const [refreshedReviewQuote, setRefreshedReviewQuote] = useState(
    initialRefreshedQuote ?? null,
  );
  const [isRefreshedReviewQuoteVisible, setIsRefreshedReviewQuoteVisible] =
    useState(false);
  const [acquisitionOperation, setAcquisitionOperation] = useState(
    initialAcquisitionOperationValue,
  );
  const [isReviewPaymentSubmitting, setIsReviewPaymentSubmitting] =
    useState(false);
  const [acquisitionPendingOutcomeIndex, setAcquisitionPendingOutcomeIndex] =
    useState(0);
  const [
    acquisitionReconcileOutcomeIndex,
    setAcquisitionReconcileOutcomeIndex,
  ] = useState(0);
  const [acquisitionResolution, setAcquisitionResolution] = useState(
    initialAcquisitionResolution ?? null,
  );
  const [prewarmedCapacityResolution, setPrewarmedCapacityResolution] =
    useState<Exclude<
      ManagedEmailDesignCapacityResolution,
      { status: 'blocked' }
    > | null>(initialPrewarmedCapacityResolution ?? null);
  const [reviewStockConflict, setReviewStockConflict] = useState(
    initialReviewStockConflict,
  );
  const [completionEvidence, setCompletionEvidence] = useState(
    validatedInitialCompletionEvidence,
  );
  const [completedLocalResources, setCompletedLocalResources] = useState(
    initialCompletedLocalResources,
  );
  const [
    hasRecoveredMailboxCapacityReview,
    setHasRecoveredMailboxCapacityReview,
  ] = useState(false);
  const [
    isRecoveredMailboxCapacityReviewVisible,
    setIsRecoveredMailboxCapacityReviewVisible,
  ] = useState(false);
  const [recoveredMailboxSelection, setRecoveredMailboxSelection] =
    useState<ManagedEmailDesignMailbox | null>(null);
  const [
    recoveredMailboxSourceSubscriptionId,
    setRecoveredMailboxSourceSubscriptionId,
  ] = useState<string | null>(initialRecoveredMailboxSourceSubscriptionIdValue);
  const [reviewBackFlow, setReviewBackFlow] =
    useState<ManagedEmailDesignFlow>('dashboard');
  const [domainReturnTarget, setDomainReturnTarget] =
    useState<ManagedEmailDesignDomainReturnTarget>('dashboard');
  const [completionMessage, setCompletionMessage] = useState(
    t`The local Storybook fixture was updated.`,
  );
  const [currentOperationResult, setCurrentOperationResult] =
    useState<ManagedEmailDesignCurrentOperationResult | null>(null);
  const [linkedMailboxDetail, setLinkedMailboxDetail] =
    useState<ManagedEmailDesignLinkedMailboxDetail | null>(null);
  const linkedMailboxBackButtonRef = useRef<HTMLButtonElement>(null);
  const completionScreenRef = useRef<HTMLElement>(null);
  const dashboardScreenRef = useRef<HTMLElement>(null);
  const subscriptionPanelFocusRef = useRef<HTMLElement>(null);
  const [completionMaterializationEpoch, setCompletionMaterializationEpoch] =
    useState(0);
  const [materializedCompletionEpoch, setMaterializedCompletionEpoch] =
    useState<number | null>(null);
  const [warmupOperationIds, setWarmupOperationIds] = useState(
    () =>
      new Set(
        initialWorkspace.mailboxes.flatMap((mailbox) =>
          mailbox.warmupState.operation.status === 'idle'
            ? []
            : [mailbox.warmupState.operation.operationId],
        ),
      ),
  );
  const [linkedMailboxReturnFocusId, setLinkedMailboxReturnFocusId] = useState<
    string | null
  >(null);
  const [mailboxToRemove, setMailboxToRemove] =
    useState<ManagedEmailDesignMailboxRemoval | null>(null);
  const mailboxSelectedForRemoval =
    mailboxToRemove === null
      ? undefined
      : workspace.mailboxes.find(
          (mailbox) => mailbox.id === mailboxToRemove.id,
        );
  const mailboxRemovalResetsDomainVerification =
    mailboxSelectedForRemoval !== undefined &&
    doesMailboxRemovalResetDomainVerification({
      workspace,
      mailbox: mailboxSelectedForRemoval,
    });
  // Preserve the imperative return target without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const mailboxRemovalFinalFocusRef = useRef<string | null>(null);
  const [subscriptionPanel, setSubscriptionPanel] =
    useState<ManagedEmailDesignSubscriptionPanelState | null>(null);
  const isSubscriptionPanelOpen = subscriptionPanel !== null;
  const [subscriptionQuantityDrafts, setSubscriptionQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const [subscriptionQuantityReview, setSubscriptionQuantityReview] =
    useState<ManagedEmailDesignSubscriptionQuantityReview | null>(null);
  const [subscriptionQuantityBlockerIds, setSubscriptionQuantityBlockerIds] =
    useState<string[]>([]);

  const [subscriptionPanelAlert, setSubscriptionPanelAlert] = useState<
    string | null
  >(null);
  const [warmupCapacityQuantity, setWarmupCapacityQuantity] = useState('1');
  const [warmupCapacityReview, setWarmupCapacityReview] =
    useState<ManagedEmailDesignWarmupCapacityReview | null>(null);
  const [
    warmupCompletionTargetMailboxAddress,
    setWarmupCompletionTargetMailboxAddress,
  ] = useState(initialWarmupTargetMailboxAddress ?? null);
  const [subscriptionToCancelId, setSubscriptionToCancelId] = useState<
    string | null
  >(null);
  const [mailboxFocusId, setMailboxFocusId] = useState<string | null>(null);
  const { closeModal, openModal } = useModal();

  useEffect(() => {
    if (linkedMailboxDetail?.isVisible) {
      linkedMailboxBackButtonRef.current?.focus();
      return;
    }

    if (linkedMailboxDetail === null && linkedMailboxReturnFocusId !== null) {
      document.getElementById(linkedMailboxReturnFocusId)?.focus();
      setLinkedMailboxReturnFocusId(null);
    }
  }, [linkedMailboxDetail, linkedMailboxReturnFocusId]);
  useEffect(() => {
    if (flow === 'completion') {
      completionScreenRef.current?.focus();
    }
  }, [flow]);

  useEffect(() => {
    if (flow === 'dashboard') {
      dashboardScreenRef.current?.focus();
    }
  }, [flow]);

  useEffect(() => {
    if (isSubscriptionPanelOpen) {
      subscriptionPanelFocusRef.current?.focus();
    }
  }, [isSubscriptionPanelOpen]);

  useEffect(() => {
    if (mailboxFocusId === null) {
      return;
    }

    document.getElementById(mailboxFocusId)?.focus();
    setMailboxFocusId(null);
  }, [mailboxFocusId]);
  const dnsStatus = getDnsStatus(dnsLifecycle);
  const managedMailboxPoolSignature = workspace.subscriptions
    .filter((subscription) => subscription.product === 'managed-mailbox')
    .map(
      (subscription) =>
        `${subscription.id}:${subscription.status}:${subscription.quantity}:${subscription.linkedResources
          .map((resource) => resource.id)
          .join(',')}`,
    )
    .join('|');

  const selectedDnsWorkspaceDomain = workspace.domains.find(
    (domain) =>
      domain.id === dnsLifecycle.domain.id &&
      normalizeManagedEmailDesignDomain(domain.name) ===
        normalizeManagedEmailDesignDomain(dnsLifecycle.domain.name),
  );
  const isExistingDomainDnsRepair = selectedDnsWorkspaceDomain !== undefined;
  const externalDomainValidationMessage =
    getManagedEmailDesignDomainValidationMessage({
      domain: externalDomainName,
      domains: workspace.domains,
    });
  const normalizedSelectedDomain =
    normalizeManagedEmailDesignDomain(selectedDomainName);
  const selectedManagedMailboxDomain = workspace.domains.find(
    (domain) =>
      normalizeManagedEmailDesignDomain(domain.name) ===
      normalizedSelectedDomain,
  );
  const managedMailboxAddress = `${mailboxLocalPart.trim()}@${normalizedSelectedDomain}`;
  const managedMailboxValidationMessage = !isManagedEmailDesignLocalPart(
    mailboxLocalPart,
  )
    ? t`Use a valid mailbox local part without @.`
    : selectedManagedMailboxDomain?.verification !== 'verified'
      ? t`Select an existing verified domain for this mailbox.`
      : getManagedEmailDesignMailboxValidationMessage({
          address: managedMailboxAddress,
          mailboxes: workspace.mailboxes,
        });

  const beginOperation = () => {
    setCurrentOperationResult(null);
  };

  const createWarmupOperationId = (
    mailboxId: string,
    action: 'start' | 'pause' | 'resume' | 'stop',
  ) => {
    const usedOperationIds = new Set(warmupOperationIds);
    let operationIndex = 1;
    let operationId = `warmup-${action}-${mailboxId}-${operationIndex}`;

    while (usedOperationIds.has(operationId)) {
      operationIndex += 1;
      operationId = `warmup-${action}-${mailboxId}-${operationIndex}`;
    }

    setWarmupOperationIds(new Set(usedOperationIds).add(operationId));
    return operationId;
  };

  const openManagedEmailSubscriptions = ({
    subscriptionId,
    returnFocusId = 'managed-email-warmup-subscriptions',
    targetMailboxId,
  }: {
    subscriptionId?: string | null;
    returnFocusId?: string;
    targetMailboxId?: string;
  } = {}) => {
    const selectedSubscriptionId =
      subscriptionId ??
      workspace.subscriptions.find(
        (subscription) =>
          subscription.product === 'managed-warmup' &&
          subscription.status !== 'canceled',
      )?.id ??
      workspace.subscriptions.find(
        (subscription) => subscription.product === 'managed-warmup',
      )?.id ??
      null;

    setSubscriptionPanel({
      selectedSubscriptionId,
      showInventory: false,
      returnFocusId,
      targetMailboxId,
    });
    setSubscriptionPanelAlert(null);
    setSubscriptionQuantityReview(null);
    setSubscriptionQuantityBlockerIds([]);
  };

  const closeManagedEmailSubscriptions = (restoreFocus = true) => {
    const returnFocusId = subscriptionPanel?.returnFocusId;

    setSubscriptionPanel(null);
    setSubscriptionPanelAlert(null);
    setSubscriptionQuantityReview(null);
    setSubscriptionQuantityBlockerIds([]);
    if (restoreFocus && returnFocusId !== undefined) {
      window.requestAnimationFrame(() => {
        document.getElementById(returnFocusId)?.focus();
      });
    }
  };

  const recordCompletion = useCallback(
    (message: string, nextFlow: ManagedEmailDesignFlow = 'completion') => {
      setCompletionMessage(message);
      setReviewDraft(null);
      setSelectedPrewarmedBundle(null);
      setPrewarmedCapacityResolution(null);
      setCurrentOperationResult({ kind: 'success', message });
      setFlow(nextFlow);
    },
    [],
  );

  const beginReview = ({
    draft,
    backFlow,
    quote = createReviewQuoteFromDraft(draft),
    acquisitionResolution: reviewAcquisitionResolution = null,
    prewarmedCapacityResolution: reviewPrewarmedCapacityResolution = null,
    selectedMailbox = null,
  }: {
    draft: ManagedEmailDesignReviewDraft;
    backFlow: ManagedEmailDesignFlow;
    quote?: ManagedEmailDesignQuote;
    acquisitionResolution?: ManagedEmailDesignCapacityResolution | null;
    prewarmedCapacityResolution?: Exclude<
      ManagedEmailDesignCapacityResolution,
      { status: 'blocked' }
    > | null;
    selectedMailbox?: ManagedEmailDesignMailbox | null;
  }) => {
    setReviewDraft(draft);
    setReviewQuote(quote);
    setRefreshedReviewQuote(null);
    setIsRefreshedReviewQuoteVisible(false);
    setAcquisitionOperation(managedEmailDesignIdleAcquisitionOperation);
    setIsReviewPaymentSubmitting(false);
    setAcquisitionPendingOutcomeIndex(0);
    setAcquisitionReconcileOutcomeIndex(0);
    setAcquisitionResolution(reviewAcquisitionResolution);
    setPrewarmedCapacityResolution(reviewPrewarmedCapacityResolution);
    setReviewStockConflict(null);
    setHasRecoveredMailboxCapacityReview(false);
    setIsRecoveredMailboxCapacityReviewVisible(false);
    setRecoveredMailboxSelection(selectedMailbox);
    setRecoveredMailboxSourceSubscriptionId(null);
    setCompletionEvidence(null);
    setCompletedLocalResources([]);
    setReviewBackFlow(backFlow);
    setFlow('review');
  };

  const completeDomainAcquisition = ({
    domainName,
    message,
  }: {
    domainName: string;
    message: string;
  }) => {
    const nextFlow =
      domainReturnTarget === 'mailbox-details'
        ? 'mailbox-details'
        : 'completion';

    setSelectedDomainName(normalizeManagedEmailDesignDomain(domainName));
    setDomainReturnTarget('dashboard');
    recordCompletion(message, nextFlow);
  };

  const resetLocalPrototype = () => {
    beginOperation();

    setWorkspace(initialWorkspace);
    setFlow(
      initialFlow ??
        (initialReviewDraftValue === null ? 'dashboard' : 'review'),
    );
    setDomainSource(initialDomainSourceSelection);
    setManagedDomainSearchQuery(normalizedInitialDomainSearchQuery);
    setManagedDomainSearchLifecycle(initialManagedDomainSearchLifecycleState);
    setDomainSearchResults(
      initialManagedDomainSearchLifecycleState.operation.status === 'results'
        ? initialManagedDomainSearchLifecycleState.configuredResults
        : [],
    );
    setSelectedDomainSearchResult(null);
    setExternalDomainName(initialDnsLifecycleState.domain.name);
    setDnsLifecycle(initialDnsLifecycleState);
    setMailboxSource(initialMailboxSourceSelection);
    setSelectedDomainName(initialVerifiedDomain);
    setMailboxLocalPart('jamie');
    setMailboxConnection(createInitialMailboxConnection());
    setMailboxConnectionOutcomeIndex(0);
    setMailboxConnectionReconcileOutcomeIndex(0);
    setIsReconcilingStoredMailboxConnection(false);
    setMailboxConnectionOperationSequence(0);
    setWarmupOperationIds(
      new Set(
        initialWorkspace.mailboxes.flatMap((mailbox) =>
          mailbox.warmupState.operation.status === 'idle'
            ? []
            : [mailbox.warmupState.operation.operationId],
        ),
      ),
    );
    setSubscriptionPanel(null);
    setSubscriptionQuantityDrafts({});
    setSubscriptionPanelAlert(null);
    setSubscriptionQuantityReview(null);
    setSubscriptionQuantityBlockerIds([]);

    setWarmupCapacityQuantity('1');
    setWarmupCapacityReview(null);
    setWarmupCompletionTargetMailboxAddress(
      initialWarmupTargetMailboxAddress ?? null,
    );
    setSubscriptionToCancelId(null);
    setMailboxToRemove(null);
    setSelectedPrewarmedBundle(initialSelectedPrewarmedBundle);
    setReviewDraft(initialReviewDraftValue);
    setReviewQuote(initialReviewQuoteValue);
    setRefreshedReviewQuote(initialRefreshedQuote ?? null);
    setIsRefreshedReviewQuoteVisible(false);
    setAcquisitionOperation(initialAcquisitionOperationValue);
    setIsReviewPaymentSubmitting(false);
    setAcquisitionPendingOutcomeIndex(0);
    setAcquisitionReconcileOutcomeIndex(0);
    setAcquisitionResolution(initialAcquisitionResolution ?? null);
    setPrewarmedCapacityResolution(initialPrewarmedCapacityResolution ?? null);
    setReviewStockConflict(initialReviewStockConflict);
    setCompletionEvidence(validatedInitialCompletionEvidence);
    setCompletedLocalResources(initialCompletedLocalResources);
    setHasRecoveredMailboxCapacityReview(false);
    setIsRecoveredMailboxCapacityReviewVisible(false);
    setReviewBackFlow('dashboard');
    setRecoveredMailboxSelection(null);
    setRecoveredMailboxSourceSubscriptionId(
      initialRecoveredMailboxSourceSubscriptionIdValue,
    );
    setDomainReturnTarget('dashboard');
    setCompletionMessage(t`The local Storybook fixture was reset.`);
    setCompletionMaterializationEpoch((current) => current + 1);
    setCurrentOperationResult({
      kind: 'success',
      message: t`The local Storybook fixture was reset.`,
    });
  };

  const returnToDashboard = () => {
    beginOperation();
    setIsReviewPaymentSubmitting(false);
    setManagedDomainSearchQuery('');
    setManagedDomainSearchLifecycle((current) =>
      clearManagedDomainSearchOperation(current),
    );
    setDomainSearchResults([]);
    setSelectedDomainSearchResult(null);
    setDnsLifecycle((current) => clearDnsOperation(current));
    setReviewDraft(null);
    setSelectedPrewarmedBundle(null);
    setMailboxConnection((current) =>
      createMailboxConnectionLifecycle({
        formEpoch: current.formEpoch + 1,
      }),
    );
    setMailboxConnectionOutcomeIndex(0);
    setMailboxConnectionReconcileOutcomeIndex(0);
    setIsReconcilingStoredMailboxConnection(false);
    setSubscriptionPanel(null);
    setSubscriptionPanelAlert(null);
    setSubscriptionQuantityReview(null);
    setSubscriptionQuantityBlockerIds([]);

    setWarmupCapacityReview(null);
    setMailboxToRemove(null);
    setRecoveredMailboxSourceSubscriptionId(null);
    setDomainReturnTarget('dashboard');
    setFlow('dashboard');
  };

  const goBack = () => {
    beginOperation();

    switch (flow) {
      case 'domain-source': {
        const destination = domainReturnTarget;

        setDomainReturnTarget('dashboard');
        setFlow(destination);
        return;
      }
      case 'mailbox-source':
        setRecoveredMailboxSourceSubscriptionId(null);
        setFlow('dashboard');
        return;
      case 'managed-domain-search':
        setManagedDomainSearchLifecycle((current) =>
          clearManagedDomainSearchOperation(current),
        );
        setDomainSearchResults([]);
        setSelectedDomainSearchResult(null);
        setFlow('domain-source');
        return;
      case 'external-domain-entry':
        setDnsLifecycle((current) => clearDnsOperation(current));
        setFlow('domain-source');
        return;
      case 'external-dns':
        setDnsLifecycle((current) => clearDnsOperation(current));
        if (selectedDnsWorkspaceDomain !== undefined) {
          setRecoveredMailboxSourceSubscriptionId(null);
        }
        setFlow(
          selectedDnsWorkspaceDomain === undefined
            ? 'external-domain-entry'
            : 'dashboard',
        );
        return;
      case 'mailbox-details':
      case 'mailbox-connection':
        setFlow('mailbox-source');
        return;
      case 'prewarmed-inventory':
        setFlow('dashboard');
        return;
      case 'review':
        setIsReviewPaymentSubmitting(false);
        setFlow(reviewBackFlow);
        return;
      case 'completion':
      case 'dashboard':
        setFlow('dashboard');
    }
  };

  const continueDomainSource = () => {
    beginOperation();

    if (domainSource === null) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Choose a domain source to continue.`,
      });
      return;
    }

    setFlow(
      domainSource === 'managed'
        ? 'managed-domain-search'
        : 'external-domain-entry',
    );
  };

  const searchManagedDomains = () => {
    beginOperation();

    if (managedDomainSearchLifecycle.operation.status === 'loading') {
      return;
    }

    const normalizedQuery = normalizeManagedEmailDesignDomain(
      managedDomainSearchQuery,
    );

    if (normalizedQuery === '') {
      return;
    }

    const configuredResults =
      getManagedEmailDesignDomainSearchResults(normalizedQuery);
    const configuredOutcome =
      configuredResults.length === 0 ? 'no-results' : 'results';

    setManagedDomainSearchQuery(normalizedQuery);
    setSelectedDomainSearchResult(null);
    setDomainSearchResults([]);
    setManagedDomainSearchLifecycle((current) => {
      const nextOperationIdIndex = current.nextOperationIdIndex ?? 0;
      const operationId =
        current.nextOperationIds?.[nextOperationIdIndex] ??
        `managed-domain-search-${String(nextOperationIdIndex + 1).padStart(3, '0')}`;

      return {
        ...current,
        operation: {
          status: 'loading',
          operationId,
          configuredOutcome,
        },
        configuredResults,
        nextOperationIdIndex: nextOperationIdIndex + 1,
      };
    });
  };

  const retryManagedDomainSearch = () => {
    beginOperation();
    setManagedDomainSearchLifecycle((current) => {
      if (current.operation.status !== 'failed') {
        return current;
      }

      return {
        ...current,
        operation: {
          status: 'loading',
          operationId: current.operation.operationId,
          configuredOutcome: current.operation.configuredOutcome,
        },
      };
    });
    setSelectedDomainSearchResult(null);
    setDomainSearchResults([]);
  };

  const resolveManagedDomainSearch = () => {
    beginOperation();

    if (managedDomainSearchLifecycle.operation.status !== 'loading') {
      return;
    }

    const { configuredResults, operation } = managedDomainSearchLifecycle;

    setDomainSearchResults(configuredResults);
    setManagedDomainSearchLifecycle((current) => {
      if (current.operation.status !== 'loading') {
        return current;
      }

      return {
        ...current,
        operation: {
          status: operation.configuredOutcome,
          operationId: operation.operationId,
          configuredOutcome: operation.configuredOutcome,
        },
      };
    });
  };

  const continueManagedDomainSearch = () => {
    beginOperation();
    const selectedResult = selectedDomainSearchResult;

    if (selectedResult === null || !selectedResult.available) {
      return;
    }

    const validationMessage = getManagedEmailDesignDomainValidationMessage({
      domain: selectedResult.domain,
      domains: workspace.domains,
    });

    if (validationMessage !== null) {
      setCurrentOperationResult({
        kind: 'failure',
        message: validationMessage,
      });
      return;
    }

    beginReview({
      draft: createManagedDomainReview(
        selectedResult.domain,
        selectedResult.annualCents,
      ),
      backFlow: 'managed-domain-search',
    });
  };

  const continueExternalDomainEntry = () => {
    beginOperation();

    if (externalDomainValidationMessage !== null) {
      setCurrentOperationResult({
        kind: 'failure',
        message: externalDomainValidationMessage,
      });
      return;
    }

    const normalizedDomain =
      normalizeManagedEmailDesignDomain(externalDomainName);

    setExternalDomainName(normalizedDomain);
    setDnsLifecycle((current) => {
      const isSameDomain =
        normalizeManagedEmailDesignDomain(current.domain.name) ===
        normalizedDomain;

      return {
        domain: {
          id: `story-domain-${normalizedDomain}`,
          name: normalizedDomain,
        },
        operation: {
          status: 'idle',
          configuredOutcome: current.operation.configuredOutcome,
        },
        records: isSameDomain
          ? current.records
          : createDnsRecords({ initialDnsStatus: 'verification-required' }),
        completedRecords:
          isSameDomain && current.completedRecords !== undefined
            ? current.completedRecords
            : createDnsRecords({ initialDnsStatus: 'verified' }),
        nextOperationIds: isSameDomain ? current.nextOperationIds : [],
        nextOperationIdIndex: isSameDomain
          ? (current.nextOperationIdIndex ?? 0)
          : 0,
      };
    });
    setFlow('external-dns');
  };

  const openDomainDns = (domain: ManagedEmailDesignDomain) => {
    beginOperation();
    const selectedDomain = workspace.domains.find(
      (candidate) =>
        candidate.id === domain.id &&
        normalizeManagedEmailDesignDomain(candidate.name) ===
          normalizeManagedEmailDesignDomain(domain.name),
    );

    if (selectedDomain === undefined) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`This domain is no longer available in local fixture state.`,
      });
      return;
    }

    const selectedDnsStatus: ManagedEmailDesignDnsStatus =
      selectedDomain.verification === 'mailbox-connected'
        ? 'verification-required'
        : selectedDomain.verification;
    const selectedDnsPurpose =
      selectedDnsStatus === 'checking-dns'
        ? 'view'
        : selectedDnsStatus === 'verified'
          ? 'reverify'
          : selectedDnsStatus === 'action-required'
            ? 'repair'
            : 'verify';
    const initialOperationId = `dns-check-${selectedDomain.id}-initial`;

    setExternalDomainName(selectedDomain.name);
    const nextDnsLifecycle: ManagedEmailDesignDnsLifecycle = {
      domain: {
        id: selectedDomain.id,
        name: selectedDomain.name,
      },
      purpose: selectedDnsPurpose,
      operation:
        selectedDnsStatus === 'checking-dns'
          ? {
              status: 'checking',
              operationId: initialOperationId,
              configuredOutcome: 'completed',
            }
          : {
              status: 'idle',
              configuredOutcome: 'completed',
            },
      records: createDnsRecords({ initialDnsStatus: selectedDnsStatus }),
      completedRecords: createDnsRecords({ initialDnsStatus: 'verified' }),
      nextOperationIds: [],
      nextOperationIdIndex: selectedDnsStatus === 'checking-dns' ? 1 : 0,
    };
    setDnsLifecycle(nextDnsLifecycle);
    setFlow('external-dns');
  };

  const checkDnsVerification = () => {
    beginOperation();
    setDnsLifecycle((current) => {
      if (
        current.operation.status !== 'idle' &&
        current.operation.status !== 'completed'
      ) {
        return current;
      }

      const nextOperationIdIndex = current.nextOperationIdIndex ?? 0;
      const operationId =
        current.nextOperationIds?.[nextOperationIdIndex] ??
        `dns-check-${current.domain.id}-${String(nextOperationIdIndex + 1).padStart(3, '0')}`;

      return {
        ...current,
        operation: {
          status: 'checking',
          operationId,
          configuredOutcome: current.operation.configuredOutcome,
        },
        nextOperationIdIndex: nextOperationIdIndex + 1,
      };
    });
  };

  const retryDnsVerification = () => {
    beginOperation();
    setDnsLifecycle((current) => {
      if (current.operation.status !== 'check-failed') {
        return current;
      }

      return {
        ...current,
        operation: {
          status: 'checking',
          operationId: current.operation.operationId,
          configuredOutcome: current.operation.configuredOutcome,
        },
      };
    });
  };

  const reconcileDnsVerification = () => {
    beginOperation();
    setDnsLifecycle((current) => {
      if (current.operation.status !== 'unknown') {
        return current;
      }

      return {
        ...current,
        operation: {
          status: 'checking',
          operationId: current.operation.operationId,
          configuredOutcome: current.operation.configuredOutcome,
        },
      };
    });
  };

  const resolveDnsVerification = () => {
    beginOperation();
    setDnsLifecycle((current) => {
      if (current.operation.status !== 'checking') {
        return current;
      }

      if (current.operation.configuredOutcome === 'completed') {
        return {
          ...current,
          operation: {
            status: 'completed',
            operationId: current.operation.operationId,
            configuredOutcome: 'completed',
          },
          records: current.completedRecords ?? current.records,
        };
      }

      if (current.operation.configuredOutcome === 'check-failed') {
        return {
          ...current,
          operation: {
            status: 'check-failed',
            operationId: current.operation.operationId,
            configuredOutcome: 'check-failed',
            safeDiagnostic: t`DNS verification could not be completed. Try again.`,
          },
        };
      }

      return {
        ...current,
        operation: {
          status: 'unknown',
          operationId: current.operation.operationId,
          configuredOutcome: 'unknown',
          safeDiagnostic: t`DNS verification returned an indeterminate response. Reconcile and try again.`,
        },
      };
    });
  };

  const completeDnsVerification = () => {
    beginOperation();

    if (
      dnsStatus !== 'verified' ||
      dnsLifecycle.operation.status !== 'completed'
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Complete local DNS verification before adding or repairing this domain.`,
      });
      return;
    }

    const domainName = normalizeManagedEmailDesignDomain(
      dnsLifecycle.domain.name,
    );
    const existingDomain = selectedDnsWorkspaceDomain;

    if (existingDomain !== undefined) {
      setWorkspace((current) => ({
        ...current,
        domains: current.domains.map((candidate) =>
          candidate.id === dnsLifecycle.domain.id &&
          normalizeManagedEmailDesignDomain(candidate.name) === domainName
            ? { ...candidate, verification: 'verified' }
            : candidate,
        ),
      }));
      setReviewDraft(null);
      setSelectedPrewarmedBundle(null);
      setCurrentOperationResult({
        kind: 'success',
        message:
          dnsLifecycle.purpose === 'reverify'
            ? t`${domainName} DNS was reverified in local fixture state.`
            : dnsLifecycle.purpose === 'repair'
              ? t`${domainName} DNS verification was repaired in local fixture state.`
              : t`${domainName} DNS verification was completed in local fixture state.`,
      });
      setFlow('dashboard');
      return;
    }

    const validationMessage = getManagedEmailDesignDomainValidationMessage({
      domain: domainName,
      domains: workspace.domains,
    });

    if (validationMessage !== null) {
      setCurrentOperationResult({
        kind: 'failure',
        message: validationMessage,
      });
      return;
    }

    setWorkspace((current) => ({
      ...current,
      domains: [
        ...current.domains,
        {
          ...createManagedEmailDesignDomain({
            name: domainName,
            source: 'external',
          }),
          id: dnsLifecycle.domain.id,
        },
      ],
    }));
    setCompletionEvidence({
      kind: 'external-domain',
      domain: dnsLifecycle.domain,
      dnsLifecycle,
    });
    setCompletedLocalResources([domainName]);
    completeDomainAcquisition({
      domainName,
      message: t`${domainName} was added to local fixture state.`,
    });
  };

  const resetMailboxConnectionAdd = () => {
    setMailboxConnection((current) =>
      createMailboxConnectionLifecycle({
        formEpoch: current.formEpoch + 1,
      }),
    );
    setMailboxConnectionOutcomeIndex(0);
    setIsReconcilingStoredMailboxConnection(false);
  };

  const startFreshMailboxConnectionAdd = (
    nextFlow: Extract<ManagedEmailDesignFlow, 'mailbox-connection'>,
  ) => {
    resetMailboxConnectionAdd();
    setFlow(nextFlow);
  };

  const continueMailboxSource = () => {
    beginOperation();

    if (mailboxSource === null) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Choose a mailbox source to continue.`,
      });
      return;
    }

    if (mailboxSource === 'connect') {
      setFlow('mailbox-connection');
      return;
    }

    const firstVerifiedDomain = workspace.domains.find(
      (domain) => domain.verification === 'verified',
    );

    if (
      firstVerifiedDomain !== undefined &&
      selectedManagedMailboxDomain?.verification !== 'verified'
    ) {
      setSelectedDomainName(firstVerifiedDomain.name);
    }

    setFlow('mailbox-details');
  };

  const continueMailboxDetails = () => {
    beginOperation();

    if (managedMailboxValidationMessage !== null) {
      setCurrentOperationResult({
        kind: 'failure',
        message: managedMailboxValidationMessage,
      });
      return;
    }

    const draft = createManagedMailboxReview({
      address: managedMailboxAddress,
      domain: normalizedSelectedDomain,
    });

    if (draft.completion.type !== 'add-managed-mailbox') {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`The managed mailbox review could not be prepared.`,
      });
      return;
    }
    const activeMailboxSubscription = workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-mailbox' &&
        subscription.status !== 'canceled',
    );
    const canceledMailboxSubscriptions = workspace.subscriptions.filter(
      (subscription) =>
        subscription.product === 'managed-mailbox' &&
        subscription.status === 'canceled',
    );
    const canceledMailboxSubscriptionsWithLiveResources =
      canceledMailboxSubscriptions.filter((subscription) =>
        workspace.mailboxes.some(
          (mailbox) =>
            mailbox.subscriptionId === subscription.id ||
            findManagedEmailDesignHistoricalMailboxSnapshot({
              snapshots: subscription.linkedResources,
              mailbox,
              retainedSnapshotIds: new Set(),
            }) !== undefined,
        ),
      );
    const selectedCanceledMailboxSubscription =
      recoveredMailboxSourceSubscriptionId === null
        ? undefined
        : canceledMailboxSubscriptions.find(
            (subscription) =>
              subscription.id === recoveredMailboxSourceSubscriptionId,
          );
    if (
      activeMailboxSubscription === undefined &&
      recoveredMailboxSourceSubscriptionId !== null &&
      selectedCanceledMailboxSubscription === undefined
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Select a canceled mailbox pool before recovering capacity.`,
      });
      return;
    }
    if (
      activeMailboxSubscription === undefined &&
      selectedCanceledMailboxSubscription === undefined &&
      canceledMailboxSubscriptionsWithLiveResources.length > 1
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Recover one canceled mailbox pool before adding another mailbox.`,
      });
      return;
    }
    const sourceCanceledSubscriptionId =
      selectedCanceledMailboxSubscription?.id ??
      (activeMailboxSubscription === undefined
        ? canceledMailboxSubscriptionsWithLiveResources[0]?.id
        : undefined);

    let targetSubscriptionId =
      activeMailboxSubscription?.id ?? sourceCanceledSubscriptionId;
    if (targetSubscriptionId === undefined) {
      targetSubscriptionId = `subscription-${draft.completion.mailbox.id}`;
      while (
        workspace.subscriptions.some(
          (subscription) => subscription.id === targetSubscriptionId,
        )
      ) {
        targetSubscriptionId = `${targetSubscriptionId}-replacement`;
      }
    }
    const selectedMailbox = createManagedEmailDesignMailbox({
      ...draft.completion.mailbox,
      subscriptionId: targetSubscriptionId,
    });
    const resolution = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId:
        workspace.subscriptions[0]?.workspaceId ??
        managedEmailDesignWorkspaceId,
      subscriptions: workspace.subscriptions,
      mailboxes: workspace.mailboxes,
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId,
      targetSubscriptionId,
      fixtureNow: managedEmailDesignFixtureNow,
    });
    const quote =
      resolution.status === 'ready'
        ? (acceptManagedEmailDesignQuote(resolution.quote) ?? resolution.quote)
        : resolution.quote;
    const acceptedResolution =
      resolution.status === 'ready'
        ? resolveManagedEmailDesignMailboxPoolAcquisition({
            workspaceId:
              workspace.subscriptions[0]?.workspaceId ??
              managedEmailDesignWorkspaceId,
            subscriptions: workspace.subscriptions,
            mailboxes: workspace.mailboxes,
            selectedMailboxes: [selectedMailbox],
            sourceCanceledSubscriptionId,
            targetSubscriptionId,
            fixtureNow: managedEmailDesignFixtureNow,
            quote,
          })
        : resolution;

    beginReview({
      draft,
      backFlow: 'mailbox-details',
      quote,
      acquisitionResolution: acceptedResolution,
      selectedMailbox,
    });
    if (sourceCanceledSubscriptionId !== undefined) {
      setHasRecoveredMailboxCapacityReview(true);
      setRecoveredMailboxSelection(selectedMailbox);
      setRecoveredMailboxSourceSubscriptionId(sourceCanceledSubscriptionId);
    }
  };
  const createStoredMailboxConnection = (
    lifecycle: ManagedEmailDesignMailboxConnectionLifecycle,
  ) =>
    createManagedEmailDesignMailboxConnection({
      draft: lifecycle.draft,
      capabilities: lifecycle.capabilities,
      canSend: lifecycle.canSend,
      sendingCapabilityReason: lifecycle.sendingCapabilityReason,
      mode: lifecycle.mode,
      mailboxId: lifecycle.mailboxId,
      operation: lifecycle.operation,
    });

  const updateExistingMailboxConnection = ({
    mailboxId,
    connection,
  }: {
    mailboxId: string;
    connection: ManagedEmailDesignMailboxConnection;
  }) => {
    setWorkspace((current) => {
      let didUpdate = false;
      const mailboxes = current.mailboxes.map((mailbox) => {
        if (mailbox.id !== mailboxId) {
          return mailbox;
        }

        didUpdate = true;
        return { ...mailbox, connection };
      });

      return didUpdate ? { ...current, mailboxes } : current;
    });
  };

  const resolveMailboxConnectionResult = (
    outcome: Extract<
      ManagedEmailDesignMailboxConnectionConfiguredOutcome,
      'failed' | 'connected' | 'unknown'
    >,
  ) => {
    const operation = mailboxConnection.operation;

    if (operation.status === 'idle' || operation.status === 'connected') {
      return;
    }

    const operationId = operation.operationId;
    const resolvedOperation =
      outcome === 'connected'
        ? {
            status: 'connected' as const,
            operationId,
            configuredOutcome: outcome,
          }
        : {
            status: outcome,
            operationId,
            configuredOutcome: outcome,
            safeDiagnostic:
              outcome === 'failed'
                ? managedEmailDesignMailboxConnectionSafeDiagnostics[0]
                : managedEmailDesignMailboxConnectionSafeDiagnostics[4],
          };
    const resolvedLifecycle = {
      ...mailboxConnection,
      operation: resolvedOperation,
      requiresFreshPassword: false,
    } satisfies ManagedEmailDesignMailboxConnectionLifecycle;
    const persistedConnection =
      resolvedLifecycle.mailboxId === null
        ? undefined
        : workspace.mailboxes.find(
            (mailbox) => mailbox.id === resolvedLifecycle.mailboxId,
          )?.connection;
    const isPersistedReconciliation =
      (operation.status === 'testing' || operation.status === 'unknown') &&
      persistedConnection?.operation.operationId === operationId &&
      persistedConnection.operation.status === operation.status;
    const candidateStoredConnection =
      createStoredMailboxConnection(resolvedLifecycle);
    const resolvedStoredConnection =
      (outcome !== 'connected' || isReconcilingStoredMailboxConnection) &&
      isPersistedReconciliation &&
      persistedConnection !== undefined
        ? {
            ...persistedConnection,
            operation: resolvedOperation,
          }
        : outcome !== 'connected' && persistedConnection !== undefined
          ? {
              ...candidateStoredConnection,
              canSend:
                persistedConnection.canSend ??
                persistedConnection.capabilities.includes('smtp'),
              sendingCapabilityReason:
                persistedConnection.sendingCapabilityReason ??
                ((persistedConnection.canSend ??
                persistedConnection.capabilities.includes('smtp'))
                  ? null
                  : 'SMTP is not configured, so this mailbox cannot send mail.'),
            }
          : candidateStoredConnection;
    const connectedMailboxDomain = normalizeManagedEmailDesignDomain(
      resolvedLifecycle.draft.address.split('@')[1] ?? '',
    );
    const createsCustomerOwnedDomain =
      resolvedLifecycle.mode === 'add' &&
      !workspace.domains.some(
        (domain) =>
          normalizeManagedEmailDesignDomain(domain.name) ===
          connectedMailboxDomain,
      );

    if (outcome !== 'connected') {
      setMailboxConnection(resolvedLifecycle);

      if (resolvedLifecycle.mailboxId !== null) {
        updateExistingMailboxConnection({
          mailboxId: resolvedLifecycle.mailboxId,
          connection: resolvedStoredConnection,
        });
      }

      return;
    }

    if (resolvedLifecycle.mode === 'add') {
      const [identity = '', domain = ''] =
        resolvedLifecycle.draft.address.split('@');
      const mailboxId = `story-mailbox-${resolvedLifecycle.draft.address}`;
      const storedConnection = createStoredMailboxConnection({
        ...resolvedLifecycle,
        mailboxId,
      });

      setWorkspace((current) => {
        const hasMailbox = current.mailboxes.some(
          (mailbox) =>
            normalizeManagedEmailDesignMailboxAddress(mailbox.address) ===
            resolvedLifecycle.draft.address,
        );

        if (hasMailbox) {
          return current;
        }

        const hasDomain = current.domains.some(
          (candidate) =>
            normalizeManagedEmailDesignDomain(candidate.name) === domain,
        );
        const mailbox = createManagedEmailDesignMailbox({
          id: mailboxId,
          identity,
          address: resolvedLifecycle.draft.address,
          domain,
          source: 'connected',
          readiness: resolvedLifecycle.canSend ? 'ready' : 'not-ready',
          warmupState: {
            assignment: 'unassigned',
            lastConfirmedProviderState: 'inactive',
            operation: { status: 'idle' },
          },
          connection: storedConnection,
        });

        return {
          ...current,
          domains: hasDomain
            ? current.domains
            : [
                ...current.domains,
                createManagedEmailDesignDomain({
                  name: domain,
                  source: 'external',
                  verification: 'mailbox-connected',
                }),
              ],
          mailboxes: [...current.mailboxes, mailbox],
        };
      });
    } else if (resolvedLifecycle.mailboxId !== null) {
      updateExistingMailboxConnection({
        mailboxId: resolvedLifecycle.mailboxId,
        connection: resolvedStoredConnection,
      });
    }

    setCurrentOperationResult({
      kind: 'success',
      message:
        resolvedLifecycle.mode === 'add'
          ? createsCustomerOwnedDomain
            ? t`${resolvedLifecycle.draft.address} was connected in local Storybook fixture state only. A local customer-owned domain record for ${connectedMailboxDomain} was created because it was not already present. No credential, provider, billing, subscription, or warmup cascade occurred.`
            : t`${resolvedLifecycle.draft.address} was connected in local Storybook fixture state only. Its existing local domain record was retained. No credential, provider, billing, subscription, or warmup cascade occurred.`
          : t`${resolvedLifecycle.draft.address} was updated in local Storybook fixture state only. No credential, provider, billing, subscription, domain, readiness, or warmup cascade occurred.`,
    });
    setMailboxConnection((current) =>
      createMailboxConnectionLifecycle({
        formEpoch: current.formEpoch + 1,
      }),
    );
    setFlow('dashboard');
  };

  const submitMailboxConnection = (
    submission: ManagedEmailDesignMailboxConnectionSubmission,
  ) => {
    if (mailboxConnection.operation.status !== 'idle') {
      return;
    }

    const { draft, capabilities, canSend, sendingCapabilityReason } =
      submission;

    if (mailboxConnection.mode === 'add') {
      const validationMessage = getManagedEmailDesignMailboxValidationMessage({
        address: draft.address,
        mailboxes: workspace.mailboxes,
      });

      if (validationMessage !== null) {
        setCurrentOperationResult({
          kind: 'failure',
          message: validationMessage,
        });
        return;
      }
    }

    beginOperation();
    const isRetry = mailboxConnection.operationId !== null;
    let nextOperationSequence = mailboxConnectionOperationSequence;
    let operationId = mailboxConnection.operationId;
    if (!isRetry) {
      const persistedOperationIds = new Set(
        workspace.mailboxes.flatMap((mailbox) => {
          const persistedOperationId =
            mailbox.connection?.operation.operationId;

          return persistedOperationId === undefined
            ? []
            : [persistedOperationId];
        }),
      );

      do {
        nextOperationSequence += 1;
        operationId = getMailboxConnectionOperationId(
          mailboxConnection,
          nextOperationSequence,
        );
      } while (persistedOperationIds.has(operationId));

      setMailboxConnectionOperationSequence(nextOperationSequence);
    }

    if (operationId === null) {
      return;
    }
    const configuredOutcome =
      initialMailboxConnectionOutcomeSequence[mailboxConnectionOutcomeIndex] ??
      initialMailboxConnectionOutcomeSequence[
        initialMailboxConnectionOutcomeSequence.length - 1
      ] ??
      'connected';
    const nextLifecycle = {
      ...mailboxConnection,
      draft,
      capabilities: [...capabilities],
      canSend,
      sendingCapabilityReason,
      operation: {
        status: 'testing' as const,
        operationId,
        configuredOutcome,
      },
      operationId,
      requiresFreshPassword: false,
    } satisfies ManagedEmailDesignMailboxConnectionLifecycle;

    setMailboxConnection(nextLifecycle);
    setMailboxConnectionOutcomeIndex((current) => current + 1);
  };

  const retryMailboxConnection = () => {
    if (mailboxConnection.operation.status !== 'failed') {
      return;
    }

    setIsReconcilingStoredMailboxConnection(false);

    setMailboxConnection((current) => ({
      ...current,
      operation: { status: 'idle' },
      formEpoch: current.formEpoch + 1,
      requiresFreshPassword: true,
    }));
  };

  const reconcileMailboxConnection = () => {
    if (mailboxConnection.operation.status !== 'unknown') {
      return;
    }

    const reconcileOutcome =
      initialMailboxConnectionReconcileOutcomeSequence[
        mailboxConnectionReconcileOutcomeIndex
      ] ??
      initialMailboxConnectionReconcileOutcomeSequence[
        initialMailboxConnectionReconcileOutcomeSequence.length - 1
      ] ??
      mailboxConnection.reconcileOutcome;
    setMailboxConnectionReconcileOutcomeIndex((current) => current + 1);
    resolveMailboxConnectionResult(reconcileOutcome);
  };

  const openMailboxConnection = ({
    mailbox,
    mode,
  }: {
    mailbox: ManagedEmailDesignMailbox;
    mode: Extract<ManagedEmailDesignMailboxConnectionMode, 'edit' | 'retest'>;
  }) => {
    beginOperation();
    setIsReconcilingStoredMailboxConnection(false);
    const connection = mailbox.connection;
    const capabilities = connection?.capabilities ?? [];
    const canSend = connection?.canSend ?? capabilities.includes('smtp');
    const requiresSmtpConfiguration =
      mode === 'edit' && connection?.canSend === false;
    const draft = requiresSmtpConfiguration
      ? {
          address: mailbox.address,
          selectedProtocol: 'SMTP' as const,
        }
      : (connection?.draft ?? {
          address: mailbox.address,
          selectedProtocol: null,
        });

    const nextLifecycle = createMailboxConnectionLifecycle({
      mode,
      mailboxId: mailbox.id,
      draft,
      capabilities,
      canSend,
      sendingCapabilityReason:
        connection?.sendingCapabilityReason ??
        (canSend
          ? null
          : 'SMTP is not configured, so this mailbox cannot send mail.'),
      configuredOutcome:
        initialMailboxConnectionOutcomeSequence[
          mailboxConnectionOutcomeIndex
        ] ?? 'connected',
      reconcileOutcome: initialMailboxConnectionReconcileOutcome ?? 'connected',
      formEpoch: mailboxConnection.formEpoch + 1,
    });

    setMailboxConnection({
      ...nextLifecycle,
      requiresFreshPassword:
        mode === 'retest' ||
        requiresSmtpConfiguration ||
        connection?.draft.selectedProtocol == null,
    });
    setMailboxSource('connect');
    setFlow('mailbox-connection');
  };

  const openMailboxConnectionReconciliation = (
    mailbox: ManagedEmailDesignMailbox,
  ) => {
    const connection = mailbox.connection;
    if (
      connection?.operation.status !== 'testing' &&
      connection?.operation.status !== 'unknown'
    ) {
      return;
    }

    beginOperation();
    setIsReconcilingStoredMailboxConnection(true);
    const operation = connection.operation;
    const canSend =
      connection.canSend ?? connection.capabilities.includes('smtp');
    const lifecycle = createMailboxConnectionLifecycle({
      mode: 'retest',
      mailboxId: mailbox.id,
      draft: connection.draft,
      capabilities: connection.capabilities,
      canSend,
      sendingCapabilityReason:
        connection.sendingCapabilityReason ??
        (canSend
          ? null
          : 'SMTP is not configured, so this mailbox cannot send mail.'),
      configuredOutcome: operation.configuredOutcome,
      reconcileOutcome: initialMailboxConnectionReconcileOutcome ?? 'connected',
      formEpoch: mailboxConnection.formEpoch + 1,
    });

    setMailboxConnection({
      ...lifecycle,
      operation,
      operationId: operation.operationId,
    });
    setMailboxSource('connect');
    setFlow('mailbox-connection');
  };

  const selectPrewarmedBundle = (bundle: ManagedEmailDesignPrewarmedBundle) => {
    beginOperation();
    const conflictMessage = getManagedEmailDesignBundleConflictMessage(
      bundle,
      workspace,
    );

    if (conflictMessage !== null) {
      setCurrentOperationResult({ kind: 'failure', message: conflictMessage });
      return;
    }

    setSelectedPrewarmedBundle(bundle);
  };

  const reviewSelectedPrewarmedBundle = () => {
    beginOperation();

    if (selectedPrewarmedBundle === null) {
      return;
    }

    const conflictMessage = getManagedEmailDesignBundleConflictMessage(
      selectedPrewarmedBundle,
      workspace,
    );

    if (conflictMessage !== null) {
      setCurrentOperationResult({ kind: 'failure', message: conflictMessage });
      return;
    }

    const currentMailboxSubscription = workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-mailbox' &&
        subscription.status !== 'canceled',
    );
    const canceledMailboxSubscriptionsWithLiveResources =
      workspace.subscriptions.filter(
        (subscription) =>
          subscription.product === 'managed-mailbox' &&
          subscription.status === 'canceled' &&
          workspace.mailboxes.some(
            (mailbox) =>
              mailbox.subscriptionId === subscription.id ||
              findManagedEmailDesignHistoricalMailboxSnapshot({
                snapshots: subscription.linkedResources,
                mailbox,
                retainedSnapshotIds: new Set(),
              }) !== undefined,
          ),
      );

    if (
      currentMailboxSubscription === undefined &&
      canceledMailboxSubscriptionsWithLiveResources.length > 1
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Recover one canceled mailbox pool before acquiring a prewarmed bundle.`,
      });
      return;
    }

    const sourceCanceledSubscriptionId =
      currentMailboxSubscription === undefined
        ? canceledMailboxSubscriptionsWithLiveResources[0]?.id
        : undefined;
    const targetSubscriptionId =
      currentMailboxSubscription?.id ??
      sourceCanceledSubscriptionId ??
      `subscription-prewarmed-${getManagedEmailDesignTupleIdentity([
        selectedPrewarmedBundle.id,
        'managed-mailbox',
      ])}`;
    const selectedMailboxes = createPrewarmedMailboxPoolSelection({
      bundle: selectedPrewarmedBundle,
      targetSubscriptionId,
    });

    try {
      const capacityResolution =
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId:
            workspace.subscriptions[0]?.workspaceId ??
            managedEmailDesignWorkspaceId,
          subscriptions: workspace.subscriptions,
          mailboxes: workspace.mailboxes,
          selectedMailboxes,
          sourceCanceledSubscriptionId,
          targetSubscriptionId,
          fixtureNow: managedEmailDesignFixtureNow,
        });

      if (capacityResolution.status === 'blocked') {
        setCurrentOperationResult({
          kind: 'failure',
          message:
            capacityResolution.reason === 'subscription-change-pending'
              ? t`Apply the pending mailbox-pool quantity change before acquiring a prewarmed bundle.`
              : t`Undo the pending mailbox cancellation before acquiring a prewarmed bundle.`,
        });
        return;
      }

      const acceptedCapacityQuote = acceptManagedEmailDesignQuote(
        capacityResolution.quote,
      );
      if (acceptedCapacityQuote === null) {
        throw new Error(t`Accept the mailbox capacity quote before review.`);
      }
      const acceptedCapacityResolution =
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId:
            workspace.subscriptions[0]?.workspaceId ??
            managedEmailDesignWorkspaceId,
          subscriptions: workspace.subscriptions,
          mailboxes: workspace.mailboxes,
          selectedMailboxes,
          sourceCanceledSubscriptionId,
          targetSubscriptionId,
          fixtureNow: managedEmailDesignFixtureNow,
          quote: acceptedCapacityQuote,
        });
      if (
        acceptedCapacityResolution.status !== 'ready' ||
        acceptedCapacityResolution.subscription === undefined
      ) {
        throw new Error(t`The mailbox capacity quote is no longer ready.`);
      }

      const draft = createPrewarmedBundleReview(selectedPrewarmedBundle);
      beginReview({
        draft,
        quote: createPrewarmedCapacityReviewQuote({
          reviewDraft: draft,
          capacityQuote: acceptedCapacityResolution.quote,
          capacityResourceSnapshots:
            acceptedCapacityResolution.subscription.linkedResources,
        }),
        prewarmedCapacityResolution: acceptedCapacityResolution,
        backFlow: 'prewarmed-inventory',
      });
    } catch {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`The prewarmed mailbox review could not be prepared.`,
      });
    }
  };

  const settleAcquisitionOperation = ({
    operation,
    outcome,
    preserveUnknown,
    targetOutcome,
  }: {
    operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
    outcome: 'completed' | 'failed' | 'unknown';
    preserveUnknown: boolean;
    targetOutcome?: 'pending' | 'failed' | 'unknown';
  }): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> => {
    const retryTarget = getManagedEmailDesignAcquisitionRetryOrder(
      operation,
      targetOutcome,
    )[0];

    if (retryTarget === undefined) {
      return operation;
    }

    let lines = operation.lines.map((line) => {
      if (
        retryTarget.kind === 'payment' &&
        line.paymentEvidenceId === retryTarget.id
      ) {
        return preserveUnknown && line.paymentOutcome === 'unknown'
          ? line
          : { ...line, paymentOutcome: outcome };
      }

      if (
        retryTarget.kind === 'resource' &&
        line.resourceOperationId === retryTarget.id
      ) {
        return preserveUnknown && line.resourceOutcome === 'unknown'
          ? line
          : { ...line, resourceOutcome: outcome };
      }

      return line;
    });
    let subscriptionOperations = operation.subscriptionOperations.map(
      (subscriptionOperation) => {
        if (
          retryTarget.kind !== 'subscription' ||
          subscriptionOperation.id !== retryTarget.id
        ) {
          return subscriptionOperation;
        }

        return preserveUnknown && subscriptionOperation.outcome === 'unknown'
          ? subscriptionOperation
          : { ...subscriptionOperation, outcome };
      },
    );

    if (outcome === 'completed') {
      const affectedSubscriptionOperationIds = new Set(
        retryTarget.kind === 'payment'
          ? lines
              .filter(
                (line) =>
                  line.paymentEvidenceId === retryTarget.id &&
                  line.paymentOutcome === 'completed',
              )
              .map((line) => line.subscriptionOperationId)
          : retryTarget.kind === 'subscription'
            ? [retryTarget.id]
            : [],
      );
      const affectedResourceLineIds = new Set(
        retryTarget.kind === 'resource'
          ? lines
              .filter(
                (line) =>
                  line.resourceOperationId === retryTarget.id &&
                  line.resourceOutcome === 'completed',
              )
              .map((line) => line.id)
          : [],
      );

      for (
        let pass = 0;
        pass < lines.length + subscriptionOperations.length;
        pass += 1
      ) {
        let progressed = false;
        subscriptionOperations = subscriptionOperations.map(
          (subscriptionOperation) => {
            const paymentsCompleted = lines
              .filter(
                (line) =>
                  line.subscriptionOperationId === subscriptionOperation.id,
              )
              .every((line) => line.paymentOutcome === 'completed');

            if (
              !affectedSubscriptionOperationIds.has(subscriptionOperation.id) ||
              subscriptionOperation.outcome === 'completed' ||
              !paymentsCompleted
            ) {
              return subscriptionOperation;
            }

            progressed = true;
            return { ...subscriptionOperation, outcome: 'completed' as const };
          },
        );

        const completedSubscriptionOperationIds = new Set(
          subscriptionOperations
            .filter(
              (subscriptionOperation) =>
                subscriptionOperation.outcome === 'completed',
            )
            .map((subscriptionOperation) => subscriptionOperation.id),
        );
        const nextLines = lines.map((line) => {
          const isDownstream =
            affectedSubscriptionOperationIds.has(
              line.subscriptionOperationId,
            ) ||
            line.dependsOnLineIds.some((dependencyId) =>
              affectedResourceLineIds.has(dependencyId),
            );
          const canMaterialize =
            isDownstream &&
            line.resourceOutcome !== 'completed' &&
            line.paymentOutcome === 'completed' &&
            completedSubscriptionOperationIds.has(
              line.subscriptionOperationId,
            ) &&
            line.dependsOnLineIds.every(
              (dependencyId) =>
                lines.find((candidate) => candidate.id === dependencyId)
                  ?.resourceOutcome === 'completed',
            );

          if (!canMaterialize) {
            return line;
          }

          progressed = true;
          affectedResourceLineIds.add(line.id);
          return { ...line, resourceOutcome: 'completed' as const };
        });

        lines = nextLines;
        if (!progressed) {
          break;
        }
      }
    }

    const settledOperation = {
      ...operation,
      lines,
      subscriptionOperations,
    } as Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;

    return {
      ...settledOperation,
      status: getManagedEmailDesignAcquisitionStatus(settledOperation),
    } as Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>;
  };

  const completeCommercialAcquisition = useCallback(
    (
      operation: Extract<
        ManagedEmailDesignAcquisitionOperation,
        { id: string }
      >,
      shouldRecordCompletion = true,
      capacitySubscription?: ManagedEmailDesignRecurringSubscription,
      completionQuote = reviewQuote,
      completionResource?: string,
    ) => {
      if (
        completionQuote === null ||
        completionQuote.id !== operation.acceptedQuoteId ||
        !isManagedEmailDesignQuoteCompletable({
          quote: completionQuote,
          fixtureNow: managedEmailDesignFixtureNow,
        })
      ) {
        return;
      }

      const quoteLinesById = new Map(
        completionQuote.lines.map((line) => [line.id, line] as const),
      );
      const resourceSnapshots =
        getManagedEmailDesignAcquisitionResourceSnapshots({
          operation,
          quote: completionQuote,
          capacitySubscription,
        });
      const resourceSnapshotsById = new Map(
        resourceSnapshots.map((snapshot) => [snapshot.id, snapshot] as const),
      );
      try {
        createManagedEmailDesignAcquisitionOperation({
          operation,
          quote: completionQuote,
          resourceSnapshots,
          fixtureNow: managedEmailDesignFixtureNow,
        });
      } catch {
        return;
      }

      const completedSubscriptions = operation.subscriptionOperations.filter(
        (subscriptionOperation) =>
          subscriptionOperation.outcome === 'completed',
      );
      const completedPrewarmedBundleId =
        operation.source === 'prewarmed' &&
        operation.status === 'succeeded' &&
        reviewDraft?.completion.type === 'add-prewarmed-bundle'
          ? reviewDraft.completion.bundleId
          : null;

      setWorkspace((current) => {
        const conflictingCurrentPool = completedSubscriptions.find(
          (subscriptionOperation) =>
            (subscriptionOperation.intent.product === 'managed-mailbox' ||
              subscriptionOperation.intent.product === 'managed-warmup') &&
            current.subscriptions.some(
              (subscription) =>
                subscription.product === subscriptionOperation.intent.product &&
                subscription.status !== 'canceled' &&
                subscription.id !==
                  subscriptionOperation.intent.targetSubscriptionId,
            ),
        );
        if (conflictingCurrentPool !== undefined) {
          throw new Error(
            t`A current ${conflictingCurrentPool.intent.product} pool already exists.`,
          );
        }

        let subscriptions = [...current.subscriptions];
        let domains = [...current.domains];
        let mailboxes = [...current.mailboxes];
        const workspaceId =
          current.subscriptions[0]?.workspaceId ??
          managedEmailDesignWorkspaceId;

        for (const subscriptionOperation of completedSubscriptions) {
          const linkedResources =
            subscriptionOperation.intent.resourceSnapshotIds.flatMap(
              (snapshotId) => {
                const snapshot = resourceSnapshotsById.get(snapshotId);

                return snapshot === undefined ? [] : [snapshot];
              },
            );
          const quoteLine = operation.lines
            .filter(
              (line) =>
                line.subscriptionOperationId === subscriptionOperation.id,
            )
            .map((line) => quoteLinesById.get(line.quoteLineId))
            .find(
              (candidate): candidate is ManagedEmailDesignQuoteLine =>
                candidate !== undefined,
            );
          const hasCompletedResources = operation.lines
            .filter(
              (line) =>
                line.subscriptionOperationId === subscriptionOperation.id,
            )
            .every((line) => line.resourceOutcome === 'completed');
          const capacityReplacement =
            hasCompletedResources &&
            capacitySubscription?.id ===
              subscriptionOperation.intent.targetSubscriptionId
              ? capacitySubscription
              : undefined;
          const existingIndex = subscriptions.findIndex(
            (subscription) =>
              subscription.id ===
              subscriptionOperation.intent.targetSubscriptionId,
          );

          if (capacityReplacement !== undefined) {
            if (existingIndex >= 0) {
              subscriptions[existingIndex] = capacityReplacement;
            } else {
              subscriptions = [...subscriptions, capacityReplacement];
            }
            continue;
          }

          if (existingIndex >= 0) {
            const existing = subscriptions[existingIndex];
            if (existing === undefined) {
              continue;
            }

            const alreadyLinked = linkedResources.every((resource) =>
              existing.linkedResources.some(
                (existingResource) => existingResource.id === resource.id,
              ),
            );
            subscriptions[existingIndex] =
              createManagedEmailDesignRecurringSubscription({
                ...existing,
                quantity:
                  subscriptionOperation.intent.mode === 'increment-existing' &&
                  !alreadyLinked
                    ? existing.quantity +
                      subscriptionOperation.intent.quantityDelta
                    : existing.quantity,
                linkedResources: [
                  ...existing.linkedResources,
                  ...linkedResources.filter(
                    (resource) =>
                      !existing.linkedResources.some(
                        (existingResource) =>
                          existingResource.id === resource.id,
                      ),
                  ),
                ],
              } as ManagedEmailDesignRecurringSubscription);
            continue;
          }

          if (quoteLine === undefined || linkedResources.length === 0) {
            continue;
          }

          const common = {
            id: subscriptionOperation.intent.targetSubscriptionId,
            workspaceId,
            linkedResources,
            unitPriceCents: quoteLine.unitPriceCents,
            status: 'active' as const,
            renewsAt: quoteLine.renewsAt,
          };

          subscriptions = [
            ...subscriptions,
            subscriptionOperation.intent.product === 'managed-domain'
              ? createManagedEmailDesignRecurringSubscription({
                  ...common,
                  product: 'managed-domain',
                  cadence: 'annual',
                  quantity: 1,
                })
              : subscriptionOperation.intent.product === 'managed-mailbox'
                ? createManagedEmailDesignRecurringSubscription({
                    ...common,
                    product: 'managed-mailbox',
                    cadence: 'monthly',
                    quantity: subscriptionOperation.intent.quantityDelta,
                  })
                : createManagedEmailDesignRecurringSubscription({
                    ...common,
                    product: 'managed-warmup',
                    cadence: 'monthly',
                    quantity: subscriptionOperation.intent.quantityDelta,
                  }),
          ];
        }

        const lineBackedResourceSnapshotIds = new Set(
          operation.lines.map((line) => line.resourceSnapshotId),
        );
        const materializeResource = ({
          resource,
          subscriptionId,
        }: {
          resource: ManagedEmailDesignResourceSnapshot;
          subscriptionId: string;
        }) => {
          if (resource.kind === 'domain') {
            const domainName = normalizeManagedEmailDesignDomain(
              resource.label,
            );
            if (
              domains.some(
                (domain) =>
                  normalizeManagedEmailDesignDomain(domain.name) === domainName,
              )
            ) {
              return;
            }

            domains = [
              ...domains,
              {
                ...createManagedEmailDesignDomain({
                  name: domainName,
                  source:
                    operation.source === 'prewarmed' ? 'prewarmed' : 'managed',
                  subscriptionId,
                }),
                id: resource.id,
              },
            ];
            return;
          }

          if (resource.kind !== 'mailbox') {
            return;
          }

          const match = resource.label.match(/^(.*) <([^>]+)>$/);
          const address = normalizeManagedEmailDesignMailboxAddress(
            match?.[2] ?? resource.label,
          );
          const prewarmedIdentity =
            operation.source === 'prewarmed'
              ? current.prewarmedBundles
                  .find(
                    (bundle) =>
                      bundle.id ===
                      (reviewDraft?.completion.type === 'add-prewarmed-bundle'
                        ? reviewDraft.completion.bundleId
                        : ''),
                  )
                  ?.mailboxIdentities.find(
                    (identity) =>
                      normalizeManagedEmailDesignMailboxAddress(
                        identity.address,
                      ) === address,
                  )?.identity
              : undefined;
          const existingMailboxIndex = mailboxes.findIndex(
            (mailbox) =>
              normalizeManagedEmailDesignMailboxAddress(mailbox.address) ===
              address,
          );
          if (existingMailboxIndex >= 0) {
            const existingMailbox = mailboxes[existingMailboxIndex];
            const sourceCanceledSubscription =
              recoveredMailboxSourceSubscriptionId === null
                ? undefined
                : current.subscriptions.find(
                    (subscription) =>
                      subscription.id ===
                        recoveredMailboxSourceSubscriptionId &&
                      subscription.product === 'managed-mailbox' &&
                      subscription.status === 'canceled',
                  );
            if (
              operation.source === 'managed-mailbox' &&
              existingMailbox !== undefined &&
              existingMailbox.source !== 'connected' &&
              sourceCanceledSubscription !== undefined &&
              (existingMailbox.subscriptionId ===
                sourceCanceledSubscription.id ||
                (existingMailbox.subscriptionId === null &&
                  findManagedEmailDesignHistoricalMailboxSnapshot({
                    snapshots: sourceCanceledSubscription.linkedResources,
                    mailbox: existingMailbox,
                    retainedSnapshotIds: new Set(),
                  }) !== undefined))
            ) {
              mailboxes[existingMailboxIndex] = createManagedEmailDesignMailbox(
                {
                  ...existingMailbox,
                  subscriptionId,
                },
              );
            }
            return;
          }

          mailboxes = [
            ...mailboxes,
            createManagedEmailDesignMailbox({
              id: resource.id,
              identity:
                match?.[1] ??
                prewarmedIdentity ??
                address.slice(0, Math.max(address.indexOf('@'), 0)),
              address,
              domain: address.split('@')[1] ?? '',
              source:
                operation.source === 'prewarmed' ? 'prewarmed' : 'managed',
              subscriptionId,
              readiness:
                operation.source === 'prewarmed' ? 'ready' : 'not-ready',
              warmupState: {
                assignment: 'unassigned',
                lastConfirmedProviderState: 'inactive',
                operation: { status: 'idle' },
              },
            }),
          ];
        };

        for (const line of operation.lines) {
          if (line.resourceOutcome !== 'completed') {
            continue;
          }

          const subscriptionOperation = completedSubscriptions.find(
            (candidate) => candidate.id === line.subscriptionOperationId,
          );
          const resource = resourceSnapshotsById.get(line.resourceSnapshotId);
          if (subscriptionOperation === undefined || resource === undefined) {
            continue;
          }

          materializeResource({
            resource,
            subscriptionId: subscriptionOperation.intent.targetSubscriptionId,
          });
        }

        for (const subscriptionOperation of completedSubscriptions) {
          const hasCompletedResourceLine = operation.lines.some(
            (line) =>
              line.subscriptionOperationId === subscriptionOperation.id &&
              line.resourceOutcome === 'completed',
          );
          if (!hasCompletedResourceLine) {
            continue;
          }

          for (const snapshotId of subscriptionOperation.intent
            .resourceSnapshotIds) {
            if (lineBackedResourceSnapshotIds.has(snapshotId)) {
              continue;
            }

            const resource = resourceSnapshotsById.get(snapshotId);
            if (resource !== undefined) {
              materializeResource({
                resource,
                subscriptionId:
                  subscriptionOperation.intent.targetSubscriptionId,
              });
            }
          }
        }

        const prewarmedBundles =
          completedPrewarmedBundleId === null
            ? current.prewarmedBundles
            : current.prewarmedBundles.filter(
                (bundle) => bundle.id !== completedPrewarmedBundleId,
              );

        return {
          ...current,
          domains,
          mailboxes,
          subscriptions,
          prewarmedBundles,
        };
      });

      if (!shouldRecordCompletion) {
        return;
      }

      const resource =
        completionResource ??
        (operation.source === 'prewarmed'
          ? (completionQuote.lines.find(
              (line) => line.product === 'managed-domain',
            )?.resourceLabel ??
            reviewDraft?.selectedDomain ??
            '')
          : (reviewDraft?.selectedMailbox ??
            reviewDraft?.selectedDomain ??
            completionQuote.lines[0]?.resourceLabel ??
            ''));
      setCompletionEvidence({
        kind: 'commercial',
        source: operation.source,
        resource,
        acquisitionOperation: operation,
      });
      setCompletedLocalResources(
        getCompletedLocalResources({
          quote: completionQuote,
          operation,
          reviewDraft,
        }),
      );
      if (operation.source === 'managed-domain') {
        setSelectedDomainName(normalizeManagedEmailDesignDomain(resource));
      }
      recordCompletion(
        t`${resource} was completed in local fixture state.`,
        operation.source === 'managed-domain' &&
          domainReturnTarget === 'mailbox-details'
          ? 'mailbox-details'
          : 'completion',
      );
      if (operation.source === 'managed-domain') {
        setDomainReturnTarget('dashboard');
      }
    },
    [
      domainReturnTarget,
      recordCompletion,
      recoveredMailboxSourceSubscriptionId,
      reviewDraft,
      reviewQuote,
      t,
    ],
  );

  const resolveCurrentCapacityReview =
    (): ManagedEmailDesignCapacityResolution | null => {
      if (
        acquisitionResolution === null ||
        acquisitionResolution.status === 'blocked' ||
        reviewQuote === null ||
        reviewDraft === null
      ) {
        return null;
      }

      if (acquisitionResolution.intent.product === 'managed-mailbox') {
        if (reviewDraft.completion.type !== 'add-managed-mailbox') {
          return null;
        }

        const selectedMailbox =
          recoveredMailboxSelection ??
          createManagedEmailDesignMailbox({
            id: reviewDraft.completion.mailbox.id,
            identity: reviewDraft.completion.mailbox.identity,
            address: reviewDraft.completion.mailbox.address,
            domain: reviewDraft.completion.mailbox.domain,
            source: 'managed',
            readiness: reviewDraft.completion.mailbox.readiness,
            warmupState: reviewDraft.completion.mailbox.warmupState,
          });

        return resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId:
            workspace.subscriptions[0]?.workspaceId ??
            managedEmailDesignWorkspaceId,
          subscriptions: workspace.subscriptions,
          mailboxes: workspace.mailboxes,
          selectedMailboxes: [selectedMailbox],
          sourceCanceledSubscriptionId:
            acquisitionResolution.sourceCanceledSubscriptionId ??
            recoveredMailboxSourceSubscriptionId ??
            undefined,
          targetSubscriptionId:
            acquisitionResolution.intent.targetSubscriptionId,
          fixtureNow: managedEmailDesignFixtureNow,
          quote: reviewQuote,
        });
      }

      return resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId:
          workspace.subscriptions[0]?.workspaceId ??
          managedEmailDesignWorkspaceId,
        subscriptions: workspace.subscriptions,
        mailboxes: workspace.mailboxes,
        requestedQuantity: acquisitionResolution.intent.quantityDelta,
        targetSubscriptionId: acquisitionResolution.intent.targetSubscriptionId,
        fixtureNow: managedEmailDesignFixtureNow,
        quote: reviewQuote,
      });
    };

  const createCapacityAcquisitionOperation = (
    resolution: ManagedEmailDesignCapacityResolution,
  ): Extract<ManagedEmailDesignAcquisitionOperation, { id: string }> | null => {
    if (
      resolution.status !== 'ready' ||
      resolution.subscription === undefined ||
      (resolution.intent.product !== 'managed-mailbox' &&
        resolution.intent.product !== 'managed-warmup')
    ) {
      return null;
    }

    const source = resolution.intent.product;
    const primarySnapshotId = resolution.intent.resourceSnapshotIds[0];
    if (primarySnapshotId === undefined) {
      return null;
    }

    return createCompletedCommercialAcquisitionOperation({
      source,
      quote: resolution.quote,
      resourceSnapshots: resolution.subscription.linkedResources,
      subscriptionOperations: [
        {
          id: `subscription-operation-acquisition-${resolution.quote.id}-${source}`,
          intent: resolution.intent,
        },
      ],
      lineResourceSnapshotIds: new Map(
        resolution.quote.lines.map(
          (line) => [line.id, primarySnapshotId] as const,
        ),
      ),
    });
  };

  const completeCapacityAcquisition = useCallback(
    ({
      operation,
      resolution,
    }: {
      operation: Extract<
        ManagedEmailDesignAcquisitionOperation,
        { id: string }
      >;
      resolution: ManagedEmailDesignCapacityResolution;
    }) => {
      if (
        resolution.status !== 'ready' ||
        resolution.subscription === undefined ||
        reviewQuote === null ||
        operation.status !== 'succeeded' ||
        operation.source !== resolution.intent.product ||
        reviewQuote.id !== operation.acceptedQuoteId ||
        resolution.quote.id !== operation.acceptedQuoteId ||
        !isManagedEmailDesignQuoteCompletable({
          quote: reviewQuote,
          fixtureNow: managedEmailDesignFixtureNow,
        }) ||
        !isManagedEmailDesignQuoteCompletable({
          quote: resolution.quote,
          fixtureNow: managedEmailDesignFixtureNow,
        })
      ) {
        return false;
      }

      const reviewedMailboxDomain =
        resolution.intent.product === 'managed-mailbox' &&
        reviewDraft?.completion.type === 'add-managed-mailbox'
          ? reviewDraft.completion.mailbox.domain
          : null;
      if (
        reviewedMailboxDomain !== null &&
        !workspace.domains.some(
          (domain) =>
            domain.verification === 'verified' &&
            normalizeManagedEmailDesignDomain(domain.name) ===
              normalizeManagedEmailDesignDomain(reviewedMailboxDomain),
        )
      ) {
        setCurrentOperationResult({
          kind: 'failure',
          message: t`Select an existing verified domain for this mailbox.`,
        });
        setMailboxSource('create');
        setSelectedDomainName(
          workspace.domains.find((domain) => domain.verification === 'verified')
            ?.name ?? '',
        );
        setFlow('mailbox-details');
        return false;
      }

      const completedCapacityMailbox =
        resolution.intent.product === 'managed-warmup'
          ? (reviewDraft?.selectedMailbox ?? null)
          : reviewDraft?.selectedMailbox;
      const completionResource =
        completedCapacityMailbox ??
        resolution.quote.lines[0]?.resourceLabel ??
        '';
      if (resolution.intent.product === 'managed-warmup') {
        setWarmupCompletionTargetMailboxAddress(
          completedCapacityMailbox ?? null,
        );
      }
      setRecoveredMailboxSourceSubscriptionId(
        resolution.sourceCanceledSubscriptionId ??
          recoveredMailboxSourceSubscriptionId,
      );
      setReviewQuote(resolution.quote);
      setAcquisitionResolution(resolution);
      setAcquisitionOperation(operation);
      completeCommercialAcquisition(
        operation,
        false,
        resolution.subscription,
        resolution.quote,
        completionResource,
      );
      setCompletionEvidence({
        kind: 'commercial',
        source: operation.source,
        resource: completionResource,
        acquisitionOperation: operation,
      });
      setCompletedLocalResources(
        resolution.intent.product === 'managed-warmup'
          ? [completionResource]
          : resolution.quote.lines.map(
              (line) =>
                line.resourceLabel.match(/<([^>]+)>$/)?.[1] ??
                line.resourceLabel,
            ),
      );
      recordCompletion(
        resolution.intent.product === 'managed-warmup'
          ? completedCapacityMailbox === null
            ? t`Warmup capacity is available. Assign it to an eligible mailbox before starting warmup.`
            : t`Warmup capacity is available. Start warmup separately when this mailbox is ready.`
          : t`Managed mailbox capacity was applied in local fixture state.`,
      );

      return true;
    },
    [
      completeCommercialAcquisition,
      recordCompletion,
      recoveredMailboxSourceSubscriptionId,
      reviewDraft,
      reviewQuote,
      workspace,
      t,
    ],
  );

  const completeCapacityReview = () => {
    const resolvedCapacity = resolveCurrentCapacityReview();
    if (resolvedCapacity === null) {
      return false;
    }

    const operation = createCapacityAcquisitionOperation(resolvedCapacity);
    if (operation === null) {
      return false;
    }

    return completeCapacityAcquisition({
      operation,
      resolution: resolvedCapacity,
    });
  };
  const completeOrSubmitCommercialAcquisition = (
    operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>,
    capacitySubscription?: ManagedEmailDesignRecurringSubscription,
  ) => {
    setAcquisitionOperation(operation);
    if (operation.status === 'pending') {
      setIsReviewPaymentSubmitting(true);
      return;
    }

    completeCommercialAcquisition(operation, true, capacitySubscription);
  };

  const completeReview = () => {
    if (isReviewPaymentSubmitting) {
      return;
    }

    beginOperation();

    if (
      reviewDraft === null ||
      reviewQuote === null ||
      reviewStockConflict !== null ||
      !isManagedEmailDesignQuoteCompletable({
        quote: reviewQuote,
        fixtureNow: managedEmailDesignFixtureNow,
      }) ||
      (acquisitionOperation.status !== 'idle' &&
        acquisitionOperation.status !== 'succeeded')
    ) {
      return;
    }

    if (
      acquisitionResolution !== null &&
      reviewDraft.completion.type !== 'add-prewarmed-bundle'
    ) {
      if (acquisitionOperation.status === 'succeeded') {
        const resolvedCapacity = resolveCurrentCapacityReview();
        if (resolvedCapacity === null) {
          return;
        }

        completeCapacityAcquisition({
          operation: acquisitionOperation,
          resolution: resolvedCapacity,
        });
        return;
      }

      completeCapacityReview();
      return;
    }

    if (acquisitionOperation.status === 'succeeded') {
      completeCommercialAcquisition(
        acquisitionOperation,
        true,
        reviewDraft.completion.type === 'add-prewarmed-bundle'
          ? prewarmedCapacityResolution?.subscription
          : undefined,
      );
      return;
    }
    const createReviewCommercialAcquisition =
      initialAcquisitionSubmittingOutcome === undefined
        ? createCompletedCommercialAcquisitionOperation
        : createPendingCommercialAcquisitionOperation;

    switch (reviewDraft.completion.type) {
      case 'add-managed-domain': {
        const domain = reviewDraft.completion.domain;
        const validationMessage = getManagedEmailDesignDomainValidationMessage({
          domain: domain.name,
          domains: workspace.domains,
        });
        const existingSubscription =
          getManagedEmailDesignDomainSubscription({
            domain,
            subscriptions: workspace.subscriptions,
          }) ??
          workspace.subscriptions.find(
            (subscription) => subscription.id === domain.subscriptionId,
          );

        if (validationMessage !== null) {
          setCurrentOperationResult({
            kind: 'failure',
            message: validationMessage,
          });
          return;
        }
        if (existingSubscription !== undefined) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`${domain.name} already has a retained managed-domain subscription in local fixture state.`,
          });
          return;
        }
        if (domain.subscriptionId === null) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The managed-domain review is missing its subscription identity.`,
          });
          return;
        }

        const domainQuoteLine = reviewQuote.lines.find(
          (line) => line.product === 'managed-domain',
        );
        if (domainQuoteLine === undefined) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The managed-domain review is missing its annual price.`,
          });
          return;
        }

        const operation = createReviewCommercialAcquisition({
          source: 'managed-domain',
          quote: reviewQuote,
          resourceSnapshots: [
            {
              id: domain.id,
              kind: 'domain',
              label: normalizeManagedEmailDesignDomain(domain.name),
            },
          ],
          subscriptionOperations: [
            {
              id: `subscription-operation-acquisition-${reviewQuote.id}-domain`,
              intent: {
                product: 'managed-domain',
                mode: 'create',
                targetSubscriptionId: domain.subscriptionId,
                quantityDelta: 1,
                resourceSnapshotIds: [domain.id],
              },
            },
          ],
          lineResourceSnapshotIds: new Map([
            [domainQuoteLine.id, domain.id] as const,
          ]),
        });

        completeOrSubmitCommercialAcquisition(operation);
        return;
      }
      case 'add-managed-mailbox': {
        const mailbox = reviewDraft.completion.mailbox;
        const validationMessage = getManagedEmailDesignMailboxValidationMessage(
          {
            address: mailbox.address,
            mailboxes: workspace.mailboxes,
          },
        );
        const hasVerifiedDomain = workspace.domains.some(
          (domain) =>
            normalizeManagedEmailDesignDomain(domain.name) === mailbox.domain &&
            domain.verification === 'verified',
        );

        if (validationMessage !== null || !hasVerifiedDomain) {
          setCurrentOperationResult({
            kind: 'failure',
            message:
              validationMessage ??
              t`Select an existing verified domain for this managed mailbox.`,
          });
          return;
        }

        const mailboxQuoteLine = reviewQuote.lines.find(
          (line) => line.product === 'managed-mailbox',
        );
        if (mailboxQuoteLine === undefined || mailbox.subscriptionId === null) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The managed-mailbox review is missing its subscription identity.`,
          });
          return;
        }

        const hasExistingSubscription = workspace.subscriptions.some(
          (subscription) => subscription.id === mailbox.subscriptionId,
        );
        const operation = createReviewCommercialAcquisition({
          source: 'managed-mailbox',
          quote: reviewQuote,
          resourceSnapshots: [
            {
              id: mailbox.id,
              kind: 'mailbox',
              label: mailbox.address,
            },
          ],
          subscriptionOperations: [
            {
              id: `subscription-operation-acquisition-${reviewQuote.id}-mailbox`,
              intent: {
                product: 'managed-mailbox',
                mode: hasExistingSubscription ? 'increment-existing' : 'create',
                targetSubscriptionId: mailbox.subscriptionId,
                quantityDelta: 1,
                resourceSnapshotIds: [mailbox.id],
              },
            },
          ],
          lineResourceSnapshotIds: new Map([
            [mailboxQuoteLine.id, mailbox.id] as const,
          ]),
        });

        completeOrSubmitCommercialAcquisition(operation);
        return;
      }
      case 'add-prewarmed-bundle': {
        const bundleId = reviewDraft.completion.bundleId;
        const bundle = workspace.prewarmedBundles.find(
          (candidate) => candidate.id === bundleId,
        );
        const conflictMessage =
          bundle === undefined
            ? t`This fixed bundle is no longer available in local fixture inventory.`
            : getManagedEmailDesignBundleConflictMessage(bundle, workspace);
        if (conflictMessage !== null || bundle === undefined) {
          setCurrentOperationResult({
            kind: 'failure',
            message:
              conflictMessage ??
              t`This fixed bundle is no longer available in local fixture inventory.`,
          });
          return;
        }
        if (
          prewarmedCapacityResolution === null ||
          prewarmedCapacityResolution.status !== 'ready' ||
          prewarmedCapacityResolution.intent.product !== 'managed-mailbox'
        ) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The prewarmed mailbox capacity must be reviewed before completion.`,
          });
          return;
        }

        const selectedMailboxes = createPrewarmedMailboxPoolSelection({
          bundle,
          targetSubscriptionId:
            prewarmedCapacityResolution.intent.targetSubscriptionId,
        });
        let confirmedCapacityResolution: Exclude<
          ManagedEmailDesignCapacityResolution,
          { status: 'blocked' }
        > & {
          status: 'ready';
          subscription: ManagedEmailDesignRecurringSubscription;
        };
        try {
          const resolution = resolveManagedEmailDesignMailboxPoolAcquisition({
            workspaceId:
              workspace.subscriptions[0]?.workspaceId ??
              managedEmailDesignWorkspaceId,
            subscriptions: workspace.subscriptions,
            mailboxes: workspace.mailboxes,
            selectedMailboxes,
            sourceCanceledSubscriptionId:
              prewarmedCapacityResolution.sourceCanceledSubscriptionId,
            targetSubscriptionId:
              prewarmedCapacityResolution.intent.targetSubscriptionId,
            fixtureNow: managedEmailDesignFixtureNow,
            quote: prewarmedCapacityResolution.quote,
          });
          if (
            resolution.status !== 'ready' ||
            resolution.subscription === undefined
          ) {
            throw new Error(t`The mailbox capacity is no longer ready.`);
          }
          confirmedCapacityResolution = {
            ...resolution,
            status: 'ready',
            subscription: resolution.subscription,
          };
        } catch {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The mailbox capacity could not be revalidated.`,
          });
          return;
        }

        if (acquisitionResolution !== null) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The prewarmed review contains unexpected warmup capacity.`,
          });
          return;
        }

        const prewarmedDomain = createManagedEmailDesignDomain({
          name: bundle.domain,
          source: 'prewarmed',
        });
        if (prewarmedDomain.subscriptionId === null) {
          setCurrentOperationResult({
            kind: 'failure',
            message: t`The prewarmed domain is missing its subscription identity.`,
          });
          return;
        }

        const domainSnapshot: ManagedEmailDesignResourceSnapshot = {
          id: prewarmedDomain.id,
          kind: 'domain',
          label: prewarmedDomain.name,
        };
        const mailboxSnapshots: ManagedEmailDesignResourceSnapshot[] = [];
        for (const snapshotId of confirmedCapacityResolution.intent
          .resourceSnapshotIds) {
          const snapshot =
            confirmedCapacityResolution.subscription.linkedResources.find(
              (candidate) =>
                candidate.id === snapshotId && candidate.kind === 'mailbox',
            );
          if (snapshot === undefined) {
            setCurrentOperationResult({
              kind: 'failure',
              message: t`The prewarmed review no longer matches local inventory.`,
            });
            return;
          }
          mailboxSnapshots.push(snapshot);
        }

        const lineResourceSnapshotIds = new Map<string, string>();
        for (const quoteLine of reviewQuote.lines) {
          if (quoteLine.product === 'managed-domain') {
            lineResourceSnapshotIds.set(quoteLine.id, domainSnapshot.id);
            continue;
          }
          if (quoteLine.product !== 'managed-mailbox') {
            continue;
          }

          const mailboxSnapshotId = mailboxSnapshots.find(
            (snapshot) => snapshot.label === quoteLine.resourceLabel,
          )?.id;
          if (mailboxSnapshotId === undefined) {
            setCurrentOperationResult({
              kind: 'failure',
              message: t`The prewarmed review no longer matches local inventory.`,
            });
            return;
          }
          lineResourceSnapshotIds.set(quoteLine.id, mailboxSnapshotId);
        }

        const operation = createReviewCommercialAcquisition({
          source: 'prewarmed',
          quote: reviewQuote,
          resourceSnapshots: [domainSnapshot, ...mailboxSnapshots],
          subscriptionOperations: [
            {
              id: `subscription-operation-acquisition-${reviewQuote.id}-prewarmed-domain`,
              intent: {
                product: 'managed-domain',
                mode: 'create',
                targetSubscriptionId: prewarmedDomain.subscriptionId,
                quantityDelta: 1,
                resourceSnapshotIds: [domainSnapshot.id],
              },
            },
            {
              id: `subscription-operation-acquisition-${reviewQuote.id}-prewarmed-mailboxes`,
              intent: confirmedCapacityResolution.intent,
            },
          ],
          lineResourceSnapshotIds,
        });
        completeOrSubmitCommercialAcquisition(
          operation,
          confirmedCapacityResolution.subscription,
        );
      }
    }
  };
  const initialCompletion = validatedInitialCompletionEvidence;

  useEffect(() => {
    if (materializedCompletionEpoch === completionMaterializationEpoch) {
      return;
    }

    setMaterializedCompletionEpoch(completionMaterializationEpoch);

    if (
      isCompletedExternalDomainCompletionEvidence(
        initialCompletion,
        initialWorkspace,
      )
    ) {
      const externalCompletion = initialCompletion;
      setWorkspace((current) => {
        const domainName = normalizeManagedEmailDesignDomain(
          externalCompletion.domain.name,
        );
        const existingDomainIndex = current.domains.findIndex(
          (domain) => domain.id === externalCompletion.domain.id,
        );
        if (existingDomainIndex >= 0) {
          return {
            ...current,
            domains: current.domains.map((domain, index) =>
              index === existingDomainIndex
                ? { ...domain, verification: 'verified' }
                : domain,
            ),
          };
        }

        return {
          ...current,
          domains: [
            ...current.domains,
            {
              ...createManagedEmailDesignDomain({
                name: domainName,
                source: 'external',
              }),
              id: externalCompletion.domain.id,
            },
          ],
        };
      });
      return;
    }
    const initialOperation = initialAcquisitionOperationValue;
    const hasValidatedInitialCommercialCompletion =
      initialCompletion?.kind === 'commercial' &&
      initialCompletion.acquisitionOperation.id === initialOperation.id;
    const initialResolutionCandidate =
      initialOperation.source === 'prewarmed'
        ? prewarmedCapacityResolution
        : acquisitionResolution;
    const expectedCapacityProduct =
      initialOperation.source === 'prewarmed'
        ? 'managed-mailbox'
        : initialOperation.source;
    const initialCapacityResolution =
      initialResolutionCandidate?.status === 'ready' &&
      initialResolutionCandidate.subscription !== undefined &&
      initialResolutionCandidate.intent.product === expectedCapacityProduct
        ? initialResolutionCandidate
        : null;
    const initialMailboxResource =
      initialCompletion?.kind === 'commercial' &&
      initialOperation.source === 'managed-mailbox'
        ? initialCompletion.resource
        : null;
    const initialMailboxAtIndex =
      initialMailboxResource?.lastIndexOf('@') ?? -1;
    const initialMailboxDomain =
      initialMailboxResource === null || initialMailboxAtIndex < 0
        ? null
        : normalizeManagedEmailDesignDomain(
            initialMailboxResource
              .slice(initialMailboxAtIndex + 1)
              .replace(/>$/, ''),
          );
    const hasVerifiedInitialMailboxDomain =
      initialOperation.source !== 'managed-mailbox' ||
      (initialMailboxDomain !== null &&
        initialWorkspace.domains.some(
          (domain) =>
            domain.verification === 'verified' &&
            normalizeManagedEmailDesignDomain(domain.name) ===
              initialMailboxDomain,
        ));

    if (!hasVerifiedInitialMailboxDomain) {
      return;
    }

    if (
      initialOperation.status !== 'idle' &&
      initialOperation.status !== 'succeeded'
    ) {
      completeCommercialAcquisition(
        initialOperation,
        false,
        initialCapacityResolution?.subscription,
      );
      return;
    }

    if (initialOperation.status === 'succeeded') {
      if (initialCapacityResolution !== null) {
        if (initialOperation.source === 'prewarmed') {
          completeCommercialAcquisition(
            initialOperation,
            hasValidatedInitialCommercialCompletion,
            initialCapacityResolution.subscription,
          );
        } else if (hasValidatedInitialCommercialCompletion) {
          completeCapacityAcquisition({
            operation: initialOperation,
            resolution: initialCapacityResolution,
          });
        } else {
          completeCommercialAcquisition(
            initialOperation,
            false,
            initialCapacityResolution.subscription,
          );
        }
        return;
      }

      completeCommercialAcquisition(
        initialOperation,
        hasValidatedInitialCommercialCompletion,
      );
    }
  }, [
    acquisitionResolution,
    prewarmedCapacityResolution,
    completeCapacityAcquisition,
    completeCommercialAcquisition,
    completionMaterializationEpoch,
    initialAcquisitionOperationValue,
    initialCompletion,
    initialWorkspace,
    materializedCompletionEpoch,
  ]);

  const refreshReviewQuote = () => {
    if (
      (reviewQuote?.status !== 'expired' &&
        reviewQuote?.status !== 'price-changed') ||
      refreshedReviewQuote === null
    ) {
      return;
    }

    setIsRefreshedReviewQuoteVisible(true);
    setCurrentOperationResult({
      kind: 'success',
      message: t`Fresh quote ready. Accept it to complete locally.`,
    });
  };

  const acceptRefreshedReviewQuote = () => {
    if (refreshedReviewQuote === null) {
      return;
    }

    const acceptedQuote = acceptManagedEmailDesignQuote(refreshedReviewQuote);
    if (acceptedQuote === null) {
      return;
    }

    setReviewQuote(acceptedQuote);
    setIsRefreshedReviewQuoteVisible(false);
    setCurrentOperationResult({
      kind: 'success',
      message: t`Current quote accepted. Complete locally to apply it.`,
    });
  };

  const completeSucceededAcquisition = (
    operation: Extract<ManagedEmailDesignAcquisitionOperation, { id: string }>,
  ) => {
    if (
      acquisitionResolution !== null &&
      (operation.source === 'managed-mailbox' ||
        operation.source === 'managed-warmup')
    ) {
      const resolvedCapacity = resolveCurrentCapacityReview();
      if (resolvedCapacity !== null) {
        completeCapacityAcquisition({
          operation,
          resolution: resolvedCapacity,
        });
      }
      return;
    }

    completeCommercialAcquisition(operation);
  };
  const resolveSubmittedReviewPayment = () => {
    if (
      !isReviewPaymentSubmitting ||
      initialAcquisitionSubmittingOutcome === undefined ||
      acquisitionOperation.status !== 'pending'
    ) {
      return;
    }

    let settledOperation = acquisitionOperation;
    const outcome =
      initialAcquisitionSubmittingOutcome === 'reconciliation-required'
        ? 'unknown'
        : 'failed';
    for (
      let pendingPaymentIndex = 0;
      pendingPaymentIndex < acquisitionOperation.lines.length &&
      settledOperation.status === 'pending';
      pendingPaymentIndex += 1
    ) {
      const nextOperation = settleAcquisitionOperation({
        operation: settledOperation,
        outcome,
        preserveUnknown: false,
        targetOutcome: 'pending',
      });
      if (nextOperation === settledOperation) {
        break;
      }

      settledOperation = nextOperation;
    }

    setIsReviewPaymentSubmitting(false);
    setAcquisitionOperation(settledOperation);
  };

  const retryAcquisitionOperation = () => {
    if (
      acquisitionOperation.status !== 'failed' &&
      acquisitionOperation.status !== 'partial'
    ) {
      return;
    }

    const settledOperation = settleAcquisitionOperation({
      operation: acquisitionOperation,
      outcome: 'completed',
      preserveUnknown: false,
    });
    setAcquisitionOperation(settledOperation);

    if (settledOperation.status === 'succeeded') {
      completeSucceededAcquisition(settledOperation);
      return;
    }

    completeCommercialAcquisition(
      settledOperation,
      false,
      acquisitionResolution?.status === 'ready' &&
        acquisitionResolution.subscription !== undefined &&
        acquisitionResolution.intent.product === settledOperation.source
        ? acquisitionResolution.subscription
        : undefined,
    );
  };

  const reconcileAcquisitionOperation = () => {
    if (isReviewPaymentSubmitting) {
      return;
    }

    const isPendingPayment = acquisitionOperation.status === 'pending';
    if (
      !isPendingPayment &&
      acquisitionOperation.status !== 'reconciliation-required'
    ) {
      return;
    }

    const outcome: 'failed' | 'unknown' | 'completed' =
      (isPendingPayment
        ? initialAcquisitionPendingOutcomeSequence[
            Math.min(
              acquisitionPendingOutcomeIndex,
              initialAcquisitionPendingOutcomeSequence.length - 1,
            )
          ]
        : initialAcquisitionReconcileOutcomeSequence[
            Math.min(
              acquisitionReconcileOutcomeIndex,
              initialAcquisitionReconcileOutcomeSequence.length - 1,
            )
          ]) ?? 'completed';
    const settledOperation = settleAcquisitionOperation({
      operation: acquisitionOperation,
      outcome,
      preserveUnknown: !isPendingPayment && outcome === 'unknown',
      targetOutcome: isPendingPayment ? 'pending' : 'unknown',
    });
    if (isPendingPayment) {
      setAcquisitionPendingOutcomeIndex((index) => index + 1);
    } else {
      setAcquisitionReconcileOutcomeIndex((index) => index + 1);
    }
    setAcquisitionOperation(settledOperation);

    if (settledOperation.status === 'succeeded') {
      completeSucceededAcquisition(settledOperation);
      return;
    }

    completeCommercialAcquisition(
      settledOperation,
      false,
      acquisitionResolution?.status === 'ready' &&
        acquisitionResolution.subscription !== undefined &&
        acquisitionResolution.intent.product === settledOperation.source
        ? acquisitionResolution.subscription
        : undefined,
    );
  };

  const simulateSelectedPrewarmedOfferUnavailable = () => {
    const bundleId =
      reviewDraft?.completion.type === 'add-prewarmed-bundle'
        ? reviewDraft.completion.bundleId
        : null;
    if (
      bundleId === null ||
      reviewStockConflict !== null ||
      acquisitionOperation.status !== 'idle'
    ) {
      return;
    }

    if (!workspace.prewarmedBundles.some((bundle) => bundle.id === bundleId)) {
      return;
    }

    const nextWorkspace = {
      ...workspace,
      prewarmedBundles: workspace.prewarmedBundles.filter(
        (bundle) => bundle.id !== bundleId,
      ),
    };
    const nextConflict = getPrewarmedReviewStockConflict({
      reviewDraft,
      workspace: nextWorkspace,
    });
    if (nextConflict === null) {
      return;
    }

    beginOperation();
    setWorkspace(nextWorkspace);
    setReviewStockConflict(
      nextConflict.kind === 'inventory-unavailable'
        ? {
            ...nextConflict,
            message: t`The selected prewarmed offer is no longer available. Return to inventory to choose another available bundle.`,
          }
        : nextConflict,
    );
    window.requestAnimationFrame(() => {
      document
        .getElementById('managed-email-review-return-to-inventory')
        ?.focus();
    });
  };

  const returnToPrewarmedInventory = () => {
    if (reviewStockConflict === null) {
      return;
    }

    beginOperation();
    setReviewStockConflict(null);
    setReviewDraft(null);
    setReviewQuote(null);
    setSelectedPrewarmedBundle(null);
    setFlow('prewarmed-inventory');
  };

  const startRecoveredMailboxCapacityReview = (
    sourceCanceledSubscriptionId: string,
  ) => {
    beginOperation();
    const canceledMailboxSubscription = workspace.subscriptions.find(
      (subscription) =>
        subscription.id === sourceCanceledSubscriptionId &&
        subscription.product === 'managed-mailbox' &&
        subscription.status === 'canceled',
    );
    if (canceledMailboxSubscription === undefined) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Select a canceled mailbox pool before recovering capacity.`,
      });
      return;
    }

    const verifiedDomain = workspace.domains.find(
      (domain) => domain.verification === 'verified',
    );
    setMailboxSource('create');
    setSelectedDomainName(verifiedDomain?.name ?? '');
    setMailboxLocalPart('new-mailbox');
    setRecoveredMailboxSelection(null);
    setRecoveredMailboxSourceSubscriptionId(sourceCanceledSubscriptionId);
    setHasRecoveredMailboxCapacityReview(false);
    setIsRecoveredMailboxCapacityReviewVisible(false);
    closeManagedEmailSubscriptions(false);
    setFlow('mailbox-details');
  };

  const reviewRecoveredMailboxCapacity = () => {
    if (!hasRecoveredMailboxCapacityReview) {
      return;
    }

    setIsRecoveredMailboxCapacityReviewVisible(true);
  };

  const acceptRecoveredMailboxQuote = () => {
    if (
      reviewQuote === null ||
      acquisitionResolution === null ||
      acquisitionResolution.status === 'blocked' ||
      reviewDraft === null ||
      reviewDraft.completion.type !== 'add-managed-mailbox'
    ) {
      return;
    }
    const recoveredMailbox = reviewDraft.completion.mailbox;

    if (
      !workspace.domains.some(
        (domain) =>
          domain.verification === 'verified' &&
          normalizeManagedEmailDesignDomain(domain.name) ===
            normalizeManagedEmailDesignDomain(recoveredMailbox.domain),
      )
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Select an existing verified domain for this mailbox.`,
      });
      setMailboxSource('create');
      setSelectedDomainName(
        workspace.domains.find((domain) => domain.verification === 'verified')
          ?.name ?? '',
      );
      setFlow('mailbox-details');
      return;
    }

    const acceptedQuote = acceptManagedEmailDesignQuote(reviewQuote);
    if (acceptedQuote === null) {
      return;
    }

    const selectedMailbox =
      recoveredMailboxSelection ??
      createManagedEmailDesignMailbox({
        id: reviewDraft.completion.mailbox.id,
        identity: reviewDraft.completion.mailbox.identity,
        address: reviewDraft.completion.mailbox.address,
        domain: reviewDraft.completion.mailbox.domain,
        source: 'managed',
        readiness: reviewDraft.completion.mailbox.readiness,
        warmupState: reviewDraft.completion.mailbox.warmupState,
      });
    const resolution = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId:
        workspace.subscriptions[0]?.workspaceId ??
        managedEmailDesignWorkspaceId,
      subscriptions: workspace.subscriptions,
      mailboxes: workspace.mailboxes,
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId:
        recoveredMailboxSourceSubscriptionId ?? undefined,
      targetSubscriptionId: acquisitionResolution.intent.targetSubscriptionId,
      fixtureNow: managedEmailDesignFixtureNow,
      quote: acceptedQuote,
    });

    if (resolution.status === 'blocked') {
      return;
    }

    setReviewQuote(acceptedQuote);
    setAcquisitionResolution(resolution);
    setIsRecoveredMailboxCapacityReviewVisible(false);
    setRecoveredMailboxSelection(selectedMailbox);
    setCurrentOperationResult({
      kind: 'success',
      message: t`Recovered mailbox quote accepted. Complete locally to apply it.`,
    });
  };

  const requestDomainCancellation = (domain: ManagedEmailDesignDomain) => {
    beginOperation();
    const subscription = getManagedEmailDesignDomainSubscription({
      domain,
      subscriptions: workspace.subscriptions,
    });

    if (subscription === null || subscription.status !== 'active') {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`This domain does not have an active managed-domain renewal.`,
      });
      return;
    }

    const updatedSubscription =
      requestManagedEmailDesignSubscriptionCancellation({
        subscription,
        cancelAt: subscription.renewsAt,
      });

    setWorkspace((current) => ({
      ...current,
      subscriptions: current.subscriptions.map((candidate) =>
        candidate.id === subscription.id ? updatedSubscription : candidate,
      ),
    }));
    setCurrentOperationResult({
      kind: 'success',
      message: t`Renewal cancellation was scheduled for ${domain.name}.`,
    });
  };

  const undoDomainCancellation = (domain: ManagedEmailDesignDomain) => {
    beginOperation();
    const subscription = getManagedEmailDesignDomainSubscription({
      domain,
      subscriptions: workspace.subscriptions,
    });

    if (subscription === null || subscription.status !== 'pending-cancel') {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`This domain does not have a pending managed-domain cancellation.`,
      });
      return;
    }

    const updatedSubscription = undoManagedEmailDesignSubscriptionCancellation({
      subscription,
      fixtureNow: managedEmailDesignFixtureNow,
    });

    setWorkspace((current) => ({
      ...current,
      subscriptions: current.subscriptions.map((candidate) =>
        candidate.id === subscription.id ? updatedSubscription : candidate,
      ),
    }));
    setCurrentOperationResult({
      kind: 'success',
      message: t`Renewal cancellation was undone for ${domain.name}.`,
    });
  };

  const applyDomainCancellation = (domain: ManagedEmailDesignDomain) => {
    beginOperation();
    const subscription = getManagedEmailDesignDomainSubscription({
      domain,
      subscriptions: workspace.subscriptions,
    });

    if (subscription === null || subscription.status !== 'pending-cancel') {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`This domain does not have a pending managed-domain cancellation.`,
      });
      return;
    }

    const updatedSubscription = applyManagedEmailDesignSubscriptionCancellation(
      {
        subscription,
        fixtureNow: subscription.cancelAt,
      },
    );

    setWorkspace((current) => ({
      ...current,
      subscriptions: current.subscriptions.map((candidate) =>
        candidate.id === subscription.id ? updatedSubscription : candidate,
      ),
    }));
    setCurrentOperationResult({
      kind: 'success',
      message: t`Renewal cancellation took effect for ${domain.name}.`,
    });
  };

  const updateMailboxWarmup = (
    mailboxId: string,
    update: (mailbox: ManagedEmailDesignMailbox) => ManagedEmailDesignMailbox,
  ) =>
    setWorkspace((current) => ({
      ...current,
      mailboxes: current.mailboxes.map((mailbox) =>
        mailbox.id === mailboxId ? update(mailbox) : mailbox,
      ),
    }));

  const startWarmup = (mailboxId: string) => {
    beginOperation();
    const mailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxId,
    );

    if (mailbox === undefined) {
      return;
    }

    if (mailbox.source === 'prewarmed' && mailbox.readiness === 'ready') {
      setCurrentOperationResult({
        kind: 'info',
        message: t`${mailbox.address} is already ready and does not need ongoing warmup.`,
      });
      return;
    }

    if (
      mailbox.source === 'connected' &&
      !(
        mailbox.connection?.canSend ??
        mailbox.connection?.capabilities.includes('smtp') ??
        false
      )
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: mailbox.connection?.sendingCapabilityReason
          ? i18n._(
              getManagedEmailDesignMailboxSendingCapabilityReasonMessage(
                mailbox.connection.sendingCapabilityReason,
              ),
            )
          : t`Configure SMTP before starting warmup.`,
      });
      return;
    }

    if (mailbox.readiness !== 'ready') {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`${mailbox.address} is not ready to send.`,
      });
      return;
    }

    if (
      mailbox.warmupState.assignment !== 'unassigned' ||
      mailbox.warmupState.lastConfirmedProviderState !== 'inactive' ||
      mailbox.warmupState.operation.status !== 'idle'
    ) {
      return;
    }

    if (getManagedEmailDesignAvailableWarmupCount(workspace) === 0) {
      openManagedEmailSubscriptions({
        returnFocusId: `managed-email-warmup-action-${mailbox.id}`,
        targetMailboxId: mailbox.id,
      });
      return;
    }
    const operationId = createWarmupOperationId(mailbox.id, 'start');

    updateMailboxWarmup(mailboxId, (current) => ({
      ...current,
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'pending',
          action: 'start',
          operationId,
        },
      },
    }));
    setCurrentOperationResult({
      kind: 'info',
      message: t`Warmup start is pending for ${mailbox.address} in local Storybook fixture state.`,
    });
  };

  const pauseWarmup = (mailboxId: string) => {
    beginOperation();
    const mailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxId,
    );
    if (
      mailbox === undefined ||
      mailbox.warmupState.assignment !== 'assigned' ||
      mailbox.warmupState.lastConfirmedProviderState !== 'warming' ||
      mailbox.warmupState.operation.status !== 'idle'
    ) {
      return;
    }
    const operationId = createWarmupOperationId(mailbox.id, 'pause');

    updateMailboxWarmup(mailboxId, (current) => ({
      ...current,
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'pending',
          action: 'pause',
          operationId,
        },
      },
    }));
    setCurrentOperationResult({
      kind: 'info',
      message: t`Warmup pause is pending in local Storybook fixture state.`,
    });
  };

  const resumeWarmup = (mailboxId: string) => {
    beginOperation();
    const mailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxId,
    );
    if (
      mailbox === undefined ||
      mailbox.warmupState.assignment !== 'assigned' ||
      mailbox.warmupState.lastConfirmedProviderState !== 'paused' ||
      mailbox.warmupState.operation.status !== 'idle'
    ) {
      return;
    }
    const operationId = createWarmupOperationId(mailbox.id, 'resume');

    updateMailboxWarmup(mailboxId, (current) => ({
      ...current,
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: {
          status: 'pending',
          action: 'resume',
          operationId,
        },
      },
    }));
    setCurrentOperationResult({
      kind: 'info',
      message: t`Warmup resume is pending in local Storybook fixture state.`,
    });
  };

  const stopWarmup = (mailboxId: string) => {
    const mailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxId,
    );

    if (
      mailbox === undefined ||
      mailbox.warmupState.assignment !== 'assigned' ||
      mailbox.warmupState.operation.status !== 'idle'
    ) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Warmup must reach a confirmed provider state before this mailbox can be removed.`,
      });
      return;
    }
    const operationId = createWarmupOperationId(mailbox.id, 'stop');

    beginOperation();
    updateMailboxWarmup(mailboxId, (current) => ({
      ...current,
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState:
          current.warmupState.lastConfirmedProviderState,
        operation: {
          status: 'pending',
          action: 'stop',
          operationId,
        },
      },
    }));
    setCurrentOperationResult({
      kind: 'info',
      message: t`Warmup stop is pending for ${mailbox.address}; its assignment remains until confirmed provider inactivity.`,
    });
  };

  const resolveWarmupOperation = (mailboxId: string) => {
    beginOperation();
    const mailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxId,
    );
    const operation = mailbox?.warmupState.operation;

    if (
      mailbox === undefined ||
      operation === undefined ||
      (operation.status !== 'pending' && operation.status !== 'unknown')
    ) {
      return;
    }

    setMailboxFocusId(`managed-email-warmup-action-${mailbox.id}`);
    updateMailboxWarmup(mailboxId, (current) =>
      operation.action === 'stop'
        ? {
            ...current,
            warmupState: {
              assignment: 'unassigned',
              lastConfirmedProviderState: 'inactive',
              operation: { status: 'idle' },
            },
          }
        : {
            ...current,
            warmupState: {
              assignment: 'assigned',
              lastConfirmedProviderState:
                operation.action === 'pause' ? 'paused' : 'warming',
              operation: { status: 'idle' },
            },
          },
    );
    setCurrentOperationResult({
      kind: 'success',
      message: t`The local warmup operation was resolved without changing readiness or subscriptions.`,
    });
  };

  const retryWarmupOperation = (mailboxId: string) => {
    beginOperation();
    const mailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxId,
    );
    const operation = mailbox?.warmupState.operation;

    if (
      mailbox === undefined ||
      operation === undefined ||
      operation.status !== 'failed'
    ) {
      return;
    }

    if (
      operation.action === 'start' &&
      getManagedEmailDesignAvailableWarmupCount(workspace) === 0
    ) {
      openManagedEmailSubscriptions({
        returnFocusId: `managed-email-warmup-action-${mailbox.id}`,
        targetMailboxId: mailbox.id,
      });
      return;
    }

    updateMailboxWarmup(mailboxId, (current) => ({
      ...current,
      warmupState: {
        assignment:
          operation.action === 'start'
            ? 'assigned'
            : current.warmupState.assignment,
        lastConfirmedProviderState:
          operation.action === 'start'
            ? 'inactive'
            : current.warmupState.lastConfirmedProviderState,
        operation: {
          status: 'pending',
          action: operation.action,
          operationId: operation.operationId,
        },
      },
    }));
    setCurrentOperationResult({
      kind: 'info',
      message: t`Warmup ${operation.action} retry is pending with the same local operation ID.`,
    });
  };

  const reconcileWarmupOperation = (mailboxId: string) => {
    resolveWarmupOperation(mailboxId);
  };
  const requestMailboxRemoval = (mailbox: ManagedEmailDesignMailbox) => {
    const currentMailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailbox.id,
    );

    if (currentMailbox === undefined) {
      return;
    }

    if (!isMailboxWarmupConfirmedInactive(currentMailbox)) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Stop warmup and wait for confirmed provider inactivity before removing this mailbox.`,
      });
      return;
    }

    mailboxRemovalFinalFocusRef.current = `managed-email-mailbox-actions-${currentMailbox.id}-trigger`;
    setCurrentOperationResult(null);
    setMailboxToRemove({
      id: currentMailbox.id,
      address: currentMailbox.address,
      source: currentMailbox.source,
    });
    openModal(MAILBOX_REMOVAL_MODAL_ID);
  };
  const requestLinkedMailboxRemoval = (mailbox: ManagedEmailDesignMailbox) => {
    const currentMailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailbox.id,
    );
    if (currentMailbox === undefined) {
      return;
    }

    const connectionOperationStatus =
      currentMailbox.connection?.operation.status;
    const hasUnresolvedConnection =
      connectionOperationStatus === 'testing' ||
      connectionOperationStatus === 'unknown';
    if (
      hasUnresolvedConnection ||
      !isMailboxWarmupConfirmedInactive(currentMailbox)
    ) {
      const returnFocusId = hasUnresolvedConnection
        ? `managed-email-mailbox-actions-${currentMailbox.id}-trigger`
        : currentMailbox.warmupState.operation.status === 'idle'
          ? `managed-email-mailbox-actions-${currentMailbox.id}-trigger`
          : `managed-email-warmup-action-${currentMailbox.id}`;

      setCurrentOperationResult(null);
      setLinkedMailboxReturnFocusId(returnFocusId);
      setLinkedMailboxDetail(null);
      return;
    }

    requestMailboxRemoval(currentMailbox);
  };

  const removeMailbox = (mailboxRemoval: ManagedEmailDesignMailboxRemoval) => {
    const currentMailbox = workspace.mailboxes.find(
      (candidate) => candidate.id === mailboxRemoval.id,
    );

    if (currentMailbox === undefined) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`${mailboxRemoval.address} is no longer in this local fixture inventory.`,
      });
      return;
    }

    if (!isMailboxWarmupConfirmedInactive(currentMailbox)) {
      setCurrentOperationResult({
        kind: 'failure',
        message: t`Warmup must reach confirmed provider inactivity before this mailbox can be removed.`,
      });
      return;
    }

    const resetsCustomerOwnedDomainVerification =
      doesMailboxRemovalResetDomainVerification({
        workspace,
        mailbox: currentMailbox,
      });

    setWorkspace((current) => {
      const removedMailbox = current.mailboxes.find(
        (mailbox) => mailbox.id === mailboxRemoval.id,
      );
      if (removedMailbox === undefined) {
        return current;
      }

      const mailboxes = current.mailboxes.filter(
        (mailbox) => mailbox.id !== mailboxRemoval.id,
      );
      const hasRemainingLinkedMailbox = mailboxes.some(
        (mailbox) =>
          normalizeManagedEmailDesignDomain(mailbox.domain) ===
          normalizeManagedEmailDesignDomain(removedMailbox.domain),
      );
      const domains = current.domains.map((domain) =>
        !hasRemainingLinkedMailbox &&
        domain.source === 'external' &&
        domain.verification === 'mailbox-connected' &&
        normalizeManagedEmailDesignDomain(domain.name) ===
          normalizeManagedEmailDesignDomain(removedMailbox.domain)
          ? { ...domain, verification: 'verification-required' as const }
          : domain,
      );

      return { ...current, domains, mailboxes };
    });
    setCurrentOperationResult({
      kind: 'success',
      message:
        mailboxRemoval.source === 'connected'
          ? resetsCustomerOwnedDomainVerification
            ? t`${mailboxRemoval.address} was disconnected from local Storybook fixture state only. Its local customer-owned domain record remains, and verification was reset because this was the last connected mailbox. Its pooled mailbox subscription, snapshots, and quantity were unchanged.`
            : t`${mailboxRemoval.address} was disconnected from local Storybook fixture state only. Its local customer-owned domain record, sibling mailboxes, pooled mailbox subscription, snapshots, and quantity were unchanged.`
          : t`${mailboxRemoval.address} was removed from local Storybook fixture state only. Its domain, sibling mailboxes, pooled mailbox subscription, snapshots, and quantity were unchanged.`,
    });
    window.requestAnimationFrame(() => {
      linkedMailboxBackButtonRef.current?.focus();
    });
  };

  const manageMailboxCapacity = (
    subscriptionId: string,
    returnFocusId = 'managed-email-warmup-subscriptions',
  ) => {
    beginOperation();
    openManagedEmailSubscriptions({
      subscriptionId,
      returnFocusId,
    });
  };

  const showDomainRemovalBlocked = (
    domain: ManagedEmailDesignDomain,
    linkedMailboxCount: number,
  ) => {
    beginOperation();

    setCurrentOperationResult({
      kind: 'info',
      message: plural(linkedMailboxCount, {
        one:
          domain.source === 'external'
            ? `Cannot disconnect ${domain.name}: ${linkedMailboxCount} linked mailbox is still in this local fixture inventory. Domain removal never removes linked mailboxes.`
            : `Cannot remove ${domain.name}: ${linkedMailboxCount} linked mailbox is still in this local fixture inventory. Domain removal never removes linked mailboxes.`,
        other:
          domain.source === 'external'
            ? `Cannot disconnect ${domain.name}: ${linkedMailboxCount} linked mailboxes are still in this local fixture inventory. Domain removal never removes linked mailboxes.`
            : `Cannot remove ${domain.name}: ${linkedMailboxCount} linked mailboxes are still in this local fixture inventory. Domain removal never removes linked mailboxes.`,
      }),
    });
    setLinkedMailboxDetail({ domainId: domain.id, isVisible: false });
  };

  const removeDomain = (domain: ManagedEmailDesignDomain) => {
    beginOperation();
    const linkedMailboxCount = getManagedEmailDesignLinkedMailboxCount(
      domain.name,
      workspace.mailboxes,
    );

    if (linkedMailboxCount > 0) {
      showDomainRemovalBlocked(domain, linkedMailboxCount);
      return;
    }

    setWorkspace((current) => ({
      ...current,
      domains: current.domains.filter(
        (candidate) => candidate.id !== domain.id,
      ),
    }));
    setCurrentOperationResult({
      kind: 'success',
      message:
        domain.source === 'external'
          ? t`${domain.name} was disconnected from local Storybook fixture state only. No linked mailbox or provider state changed.`
          : t`${domain.name} was removed from this workspace in local Storybook fixture state only. Its managed-domain subscription was not changed.`,
    });
  };

  const replaceManagedEmailSubscription = (
    subscription: ManagedEmailDesignRecurringSubscription,
  ) => {
    setWorkspace((current) => ({
      ...current,
      subscriptions: current.subscriptions.map((candidate) =>
        candidate.id === subscription.id ? subscription : candidate,
      ),
    }));
  };

  const showSubscriptionQuantityReductionBlocked = (
    subscription: ManagedEmailDesignRecurringSubscription,
    quantity: number,
  ) => {
    const blockerIds = workspace.mailboxes
      .filter((mailbox) =>
        subscription.product === 'managed-mailbox'
          ? mailbox.source === 'managed' || mailbox.source === 'prewarmed'
          : mailbox.warmupState.assignment === 'assigned',
      )
      .map((mailbox) => mailbox.id);

    setSubscriptionQuantityBlockerIds(blockerIds);
    setSubscriptionPanelAlert(
      subscription.product === 'managed-mailbox'
        ? plural(blockerIds.length, {
            one: `Cannot reduce to ${quantity}: ${blockerIds.length} retained mailbox resource snapshot still requires this subscription.`,
            other: `Cannot reduce to ${quantity}: ${blockerIds.length} retained mailbox resource snapshots still require this subscription.`,
          })
        : plural(blockerIds.length, {
            one: `Cannot reduce to ${quantity}: ${blockerIds.length} assigned mailbox still requires warmup capacity.`,
            other: `Cannot reduce to ${quantity}: ${blockerIds.length} assigned mailboxes still require warmup capacity.`,
          }),
    );
  };

  const scheduleSubscriptionQuantityReduction = (subscriptionId: string) => {
    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === subscriptionId,
    );
    const quantity = Number(subscriptionQuantityDrafts[subscriptionId]);

    setSubscriptionQuantityBlockerIds([]);
    if (
      subscription === undefined ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      setSubscriptionPanelAlert(t`Enter a positive whole-number quantity.`);
      return;
    }

    try {
      const result = scheduleManagedEmailDesignSubscriptionQuantityChange({
        subscription,
        quantity,
        effectiveAt: managedEmailDesignSubscriptionEffectiveAt,
        mailboxes: workspace.mailboxes,
      });

      if (result.status === 'blocked') {
        showSubscriptionQuantityReductionBlocked(subscription, quantity);
        return;
      }

      setSubscriptionQuantityReview({ subscriptionId, quantity });
      setSubscriptionPanelAlert(null);
      openModal(MANAGED_EMAIL_SUBSCRIPTION_QUANTITY_REVIEW_MODAL_ID);
    } catch {
      setSubscriptionPanelAlert(
        t`The subscription quantity could not be scheduled.`,
      );
    }
  };

  const confirmSubscriptionQuantityReduction = () => {
    const review = subscriptionQuantityReview;

    if (review === null) {
      return;
    }

    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === review.subscriptionId,
    );

    if (subscription === undefined) {
      setSubscriptionQuantityReview(null);
      setSubscriptionQuantityBlockerIds([]);
      setSubscriptionPanelAlert(
        t`The subscription is no longer in this local fixture inventory.`,
      );
      return;
    }

    try {
      const result = scheduleManagedEmailDesignSubscriptionQuantityChange({
        subscription,
        quantity: review.quantity,
        effectiveAt: managedEmailDesignSubscriptionEffectiveAt,
        mailboxes: workspace.mailboxes,
      });

      if (result.status === 'blocked') {
        setSubscriptionQuantityReview(null);
        showSubscriptionQuantityReductionBlocked(subscription, review.quantity);
        return;
      }

      replaceManagedEmailSubscription(result.subscription);
      setSubscriptionQuantityDrafts((current) => ({
        ...current,
        [review.subscriptionId]: String(result.subscription.quantity),
      }));
      setSubscriptionQuantityReview(null);
      setSubscriptionQuantityBlockerIds([]);
      setSubscriptionPanelAlert(null);
    } catch {
      setSubscriptionQuantityReview(null);
      setSubscriptionQuantityBlockerIds([]);
      setSubscriptionPanelAlert(
        t`The subscription quantity could not be scheduled.`,
      );
    }
  };

  const applySubscriptionQuantityChange = (subscriptionId: string) => {
    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === subscriptionId,
    );

    if (subscription?.status !== 'pending-change') {
      return;
    }

    try {
      const updatedSubscription =
        applyManagedEmailDesignSubscriptionQuantityChange({
          subscription,
          fixtureNow: subscription.changeEffectiveAt,
        });
      replaceManagedEmailSubscription(updatedSubscription);
      setSubscriptionQuantityDrafts((current) => ({
        ...current,
        [subscriptionId]: String(updatedSubscription.quantity),
      }));
      setSubscriptionPanelAlert(null);
    } catch {
      setSubscriptionPanelAlert(
        t`The subscription quantity could not be applied.`,
      );
    }
  };

  const requestSubscriptionCancellation = (subscriptionId: string) => {
    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === subscriptionId,
    );

    if (subscription?.status !== 'active') {
      return;
    }

    setSubscriptionToCancelId(subscription.id);
    openModal(MANAGED_EMAIL_SUBSCRIPTION_CANCELLATION_MODAL_ID);
  };

  const confirmSubscriptionCancellation = () => {
    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === subscriptionToCancelId,
    );

    if (subscription?.status === 'active') {
      replaceManagedEmailSubscription(
        requestManagedEmailDesignSubscriptionCancellation({
          subscription,
          cancelAt: subscription.renewsAt,
        }),
      );
      setSubscriptionPanelAlert(
        subscription.product === 'managed-mailbox'
          ? t`Resolve the pending mailbox-pool cancellation before creating another mailbox.`
          : null,
      );
    }

    setSubscriptionToCancelId(null);
    closeModal(MANAGED_EMAIL_SUBSCRIPTION_CANCELLATION_MODAL_ID);
  };

  const undoSubscriptionCancellation = (subscriptionId: string) => {
    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === subscriptionId,
    );

    if (subscription?.status !== 'pending-cancel') {
      return;
    }

    try {
      replaceManagedEmailSubscription(
        undoManagedEmailDesignSubscriptionCancellation({
          subscription,
          fixtureNow: managedEmailDesignFixtureNow,
        }),
      );
      setSubscriptionPanelAlert(null);
    } catch {
      setSubscriptionPanelAlert(t`The cancellation could not be undone.`);
    }
  };

  const applySubscriptionCancellation = (subscriptionId: string) => {
    const subscription = workspace.subscriptions.find(
      (candidate) => candidate.id === subscriptionId,
    );

    if (subscription?.status !== 'pending-cancel') {
      return;
    }

    try {
      replaceManagedEmailSubscription(
        applyManagedEmailDesignSubscriptionCancellation({
          subscription,
          fixtureNow: subscription.cancelAt,
        }),
      );
      setSubscriptionPanelAlert(null);
    } catch {
      setSubscriptionPanelAlert(t`The cancellation could not be applied.`);
    }
  };

  const reviewWarmupCapacityPurchase = () => {
    const requestedQuantity = Number(warmupCapacityQuantity);
    const currentSubscription = workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-warmup' &&
        subscription.status !== 'canceled',
    );
    const targetSubscriptionId =
      currentSubscription?.id ??
      getNextWarmupSubscriptionId(workspace.subscriptions);

    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      setSubscriptionPanelAlert(t`Enter a positive whole-number capacity.`);
      return;
    }

    try {
      const resolution: ManagedEmailDesignCapacityResolution =
        resolveManagedEmailDesignWarmupCapacityAcquisition({
          workspaceId: managedEmailDesignWorkspaceId,
          subscriptions: workspace.subscriptions,
          mailboxes: workspace.mailboxes,
          requestedQuantity,
          targetSubscriptionId,
          fixtureNow: managedEmailDesignFixtureNow,
        });

      if (resolution.status === 'blocked') {
        const availableWarmupCount =
          getManagedEmailDesignAvailableWarmupCount(workspace);
        setSubscriptionPanelAlert(
          resolution.reason === 'warmup-capacity-still-available'
            ? plural(availableWarmupCount, {
                one: `${availableWarmupCount} warmup slot is already available. Assign it before buying more capacity.`,
                other: `${availableWarmupCount} warmup slots are already available. Assign them before buying more capacity.`,
              })
            : resolution.reason === 'subscription-change-pending'
              ? t`Apply the pending subscription quantity change before adding capacity.`
              : t`Undo or apply the pending cancellation before adding capacity.`,
        );
        return;
      }
      if (resolution.intent.product !== 'managed-warmup') {
        setSubscriptionPanelAlert(
          t`The capacity review did not resolve to managed warmup.`,
        );
        return;
      }

      setWarmupCapacityReview({
        requestedQuantity,
        targetSubscriptionId,
        targetMailboxAddress:
          workspace.mailboxes.find(
            (mailbox) => mailbox.id === subscriptionPanel?.targetMailboxId,
          )?.address ?? null,
        quote: resolution.quote,
        intent: resolution.intent,
      });
      setSubscriptionPanelAlert(null);
      openModal(WARMUP_CAPACITY_REVIEW_MODAL_ID);
    } catch {
      setSubscriptionPanelAlert(t`Warmup capacity could not be reviewed.`);
    }
  };

  const acceptWarmupCapacityPurchase = () => {
    if (warmupCapacityReview === null) {
      return;
    }

    const acceptedQuote = acceptManagedEmailDesignQuote(
      warmupCapacityReview.quote,
    );
    if (acceptedQuote === null) {
      setSubscriptionPanelAlert(
        t`Warmup capacity is no longer ready to be accepted.`,
      );
      return;
    }

    try {
      const resolution = resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId: managedEmailDesignWorkspaceId,
        subscriptions: workspace.subscriptions,
        mailboxes: workspace.mailboxes,
        requestedQuantity: warmupCapacityReview.requestedQuantity,
        targetSubscriptionId: warmupCapacityReview.targetSubscriptionId,
        fixtureNow: managedEmailDesignFixtureNow,
        quote: acceptedQuote,
      });

      if (
        resolution.status !== 'ready' ||
        resolution.subscription === undefined
      ) {
        setSubscriptionPanelAlert(
          t`Warmup capacity is no longer ready to be accepted.`,
        );
        return;
      }

      const operation = createCapacityAcquisitionOperation(resolution);
      if (operation === null) {
        setSubscriptionPanelAlert(
          t`Warmup capacity is no longer ready to be accepted.`,
        );
        return;
      }

      const completionResource =
        warmupCapacityReview.targetMailboxAddress ??
        resolution.quote.lines[0]?.resourceLabel ??
        '';
      setReviewQuote(resolution.quote);
      setAcquisitionResolution(resolution);
      setAcquisitionOperation(operation);
      completeCommercialAcquisition(
        operation,
        true,
        resolution.subscription,
        resolution.quote,
        completionResource,
      );
      setWarmupCompletionTargetMailboxAddress(
        warmupCapacityReview.targetMailboxAddress,
      );
      setWarmupCapacityReview(null);
      setSubscriptionPanelAlert(null);
      closeModal(WARMUP_CAPACITY_REVIEW_MODAL_ID);
      closeManagedEmailSubscriptions();
    } catch {
      setSubscriptionPanelAlert(t`Warmup capacity could not be accepted.`);
    }
  };

  const selectedManagedEmailSubscription =
    subscriptionPanel === null
      ? null
      : (workspace.subscriptions.find(
          (subscription) =>
            subscription.id === subscriptionPanel.selectedSubscriptionId,
        ) ?? null);
  const selectedManagedEmailSubscriptionRenewsAt =
    selectedManagedEmailSubscription?.renewsAt;
  const selectedManagedEmailSubscriptionRenewal = useMemo(() => {
    if (
      selectedManagedEmailSubscriptionRenewsAt === undefined ||
      selectedManagedEmailSubscriptionRenewsAt === null
    ) {
      return t`No renewal`;
    }

    return formatManagedEmailDesignDate(
      selectedManagedEmailSubscriptionRenewsAt,
      i18n.locale,
    );
  }, [i18n.locale, selectedManagedEmailSubscriptionRenewsAt, t]);
  const currentWarmupSubscription =
    workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-warmup' &&
        subscription.status !== 'canceled',
    ) ?? null;
  const assignedWarmupCount = getManagedEmailDesignAssignedWarmupCount(
    workspace.mailboxes,
  );
  const availableWarmupCount =
    getManagedEmailDesignAvailableWarmupCount(workspace);
  const selectedWarmupEffectiveQuantity =
    selectedManagedEmailSubscription !== null &&
    selectedManagedEmailSubscription.product === 'managed-warmup'
      ? getManagedEmailDesignEffectiveSubscriptionQuantity(
          selectedManagedEmailSubscription,
        )
      : null;
  const subscriptionToCancel = workspace.subscriptions.find(
    (subscription) => subscription.id === subscriptionToCancelId,
  );
  const subscriptionQuantityReviewSubscription =
    subscriptionQuantityReview === null
      ? undefined
      : workspace.subscriptions.find(
          (subscription) =>
            subscription.id === subscriptionQuantityReview.subscriptionId,
        );
  const subscriptionQuantityReductionBlockers = workspace.mailboxes.filter(
    (mailbox) => subscriptionQuantityBlockerIds.includes(mailbox.id),
  );
  const warmupCapacityQuoteLine =
    warmupCapacityReview?.quote.lines.find(
      (line) => line.product === 'managed-warmup',
    ) ?? null;

  const isDomainJourney =
    flow === 'domain-source' ||
    flow === 'managed-domain-search' ||
    flow === 'external-domain-entry' ||
    flow === 'external-dns' ||
    (flow === 'review' && reviewDraft?.kind === 'domain-only');
  const isPrewarmedJourney =
    flow === 'prewarmed-inventory' ||
    (flow === 'review' && reviewDraft?.kind === 'prewarmed-bundle');
  const isManagedMailboxJourney =
    flow === 'mailbox-source' ||
    flow === 'mailbox-details' ||
    (flow === 'review' && reviewDraft?.kind === 'mailbox-only');
  const secondaryBar =
    flow === 'dashboard' ||
    flow === 'completion' ||
    (flow === 'external-dns' &&
      isExistingDomainDnsRepair) ? undefined : isDomainJourney ? (
      domainSource !== 'external' ? (
        <StepBar
          activeStep={
            flow === 'domain-source'
              ? 0
              : flow === 'managed-domain-search'
                ? 1
                : 2
          }
        >
          <StepBar.Step label={t`Source`} />
          <StepBar.Step label={t`Search`} />
          <StepBar.Step label={t`Review`} />
        </StepBar>
      ) : (
        <StepBar
          activeStep={
            flow === 'domain-source'
              ? 0
              : flow === 'external-domain-entry'
                ? 1
                : 2
          }
        >
          <StepBar.Step label={t`Source`} />
          <StepBar.Step label={t`Domain`} />
          <StepBar.Step label={t`DNS verification`} />
        </StepBar>
      )
    ) : isPrewarmedJourney ? (
      <StepBar activeStep={flow === 'prewarmed-inventory' ? 0 : 1}>
        <StepBar.Step label={t`Inventory`} />
        <StepBar.Step label={t`Review`} />
      </StepBar>
    ) : isManagedMailboxJourney && mailboxSource !== 'connect' ? (
      <StepBar
        activeStep={
          flow === 'mailbox-source' ? 0 : flow === 'mailbox-details' ? 1 : 2
        }
      >
        <StepBar.Step label={t`Source`} />
        <StepBar.Step label={t`Mailbox`} />
        <StepBar.Step label={t`Review`} />
      </StepBar>
    ) : (
      <StepBar activeStep={flow === 'mailbox-source' ? 0 : 1}>
        <StepBar.Step label={t`Source`} />
        <StepBar.Step label={t`Connection`} />
      </StepBar>
    );

  const linkedMailboxDomain =
    linkedMailboxDetail === null
      ? null
      : (workspace.domains.find(
          (domain) => domain.id === linkedMailboxDetail.domainId,
        ) ?? null);
  const linkedMailboxes =
    linkedMailboxDomain === null
      ? []
      : workspace.mailboxes.filter(
          (mailbox) =>
            normalizeManagedEmailDesignDomain(mailbox.domain) ===
            normalizeManagedEmailDesignDomain(linkedMailboxDomain.name),
        );

  const externalDomainCompletionEvidence =
    isCompletedExternalDomainCompletionEvidence(completionEvidence, workspace)
      ? completionEvidence
      : null;
  const commercialCompletionEvidenceValidation = {
    evidence: completionEvidence,
    quote: reviewQuote,
    acquisitionResolution,
    workspace,
    warmupTargetMailboxAddress: warmupCompletionTargetMailboxAddress,
  };
  const commercialCompletionEvidence = isCompletedCommercialCompletionEvidence(
    commercialCompletionEvidenceValidation,
  )
    ? commercialCompletionEvidenceValidation.evidence
    : null;
  const hasCompletionEvidence =
    commercialCompletionEvidence !== null ||
    externalDomainCompletionEvidence !== null;
  const completedCapacityIntent =
    commercialCompletionEvidence === null ||
    acquisitionResolution === null ||
    acquisitionResolution.status === 'blocked'
      ? null
      : acquisitionResolution.intent;
  const completedCapacitySubscription =
    completedCapacityIntent === null
      ? null
      : (workspace.subscriptions.find(
          (subscription) =>
            subscription.id === completedCapacityIntent.targetSubscriptionId,
        ) ?? null);
  const completionIsMailboxCapacity =
    completedCapacityIntent?.product === 'managed-mailbox';
  const completedOperation =
    commercialCompletionEvidence?.acquisitionOperation ?? null;
  const commercialOperationForEvidence =
    flow === 'completion'
      ? completedOperation
      : acquisitionOperation.status !== 'idle'
        ? acquisitionOperation
        : null;
  const acceptedQuoteIdForEvidence =
    commercialOperationForEvidence?.acceptedQuoteId ?? null;
  const completionIsWarmup =
    commercialCompletionEvidence?.source === 'managed-warmup';
  const completionWarmupAddress = commercialCompletionEvidence?.resource ?? '';
  const completionWarmupMailbox =
    workspace.mailboxes.find(
      (mailbox) =>
        normalizeManagedEmailDesignMailboxAddress(mailbox.address) ===
        normalizeManagedEmailDesignMailboxAddress(completionWarmupAddress),
    ) ?? null;
  let completionWarmupOperationText = '';

  if (completionWarmupMailbox !== null) {
    const operation = completionWarmupMailbox.warmupState.operation;

    if (operation.status === 'idle') {
      completionWarmupOperationText = t`Idle`;
    } else {
      const status =
        operation.status === 'pending'
          ? t`Pending`
          : operation.status === 'failed'
            ? t`Failed`
            : t`Unknown`;
      const action =
        operation.action === 'start'
          ? t`start`
          : operation.action === 'pause'
            ? t`pause`
            : operation.action === 'resume'
              ? t`resume`
              : t`stop`;

      completionWarmupOperationText = t`${status} ${action}`;
    }
  }
  const completionCanceledWarmupSubscription =
    workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-warmup' &&
        subscription.status === 'canceled',
    ) ?? null;
  let content;

  if (flow === 'dashboard') {
    content = (
      <section
        ref={dashboardScreenRef}
        role="region"
        tabIndex={-1}
        aria-label={t`Managed email dashboard`}
      >
        <ManagedEmailDesignDashboard
          workspace={workspace}
          fixtureNow={managedEmailDesignFixtureNow}
          onAddDomain={() => {
            beginOperation();
            setDomainReturnTarget('dashboard');
            setDomainSource(null);
            setFlow('domain-source');
          }}
          onAddMailbox={() => {
            beginOperation();
            resetMailboxConnectionAdd();
            setMailboxSource(null);
            setFlow('mailbox-source');
          }}
          onBrowsePrewarmedInventory={() => {
            beginOperation();
            setSelectedPrewarmedBundle(null);
            setFlow('prewarmed-inventory');
          }}
          onManageWarmupSubscriptions={(returnFocusId, targetMailboxId) => {
            beginOperation();
            openManagedEmailSubscriptions({
              returnFocusId,
              targetMailboxId,
            });
          }}
          onManageMailboxCapacity={manageMailboxCapacity}
          onStartWarmup={startWarmup}
          onPauseWarmup={pauseWarmup}
          onResumeWarmup={resumeWarmup}
          onStopWarmup={stopWarmup}
          onResolveWarmupOperation={resolveWarmupOperation}
          onRetryWarmupOperation={retryWarmupOperation}
          onReconcileWarmupOperation={reconcileWarmupOperation}
          onOpenMailboxConnection={openMailboxConnection}
          onReconcileMailboxConnection={openMailboxConnectionReconciliation}
          onRequestMailboxRemoval={requestMailboxRemoval}
          onDomainRemovalBlocked={showDomainRemovalBlocked}
          onOpenDomainDns={openDomainDns}
          onRequestDomainCancellation={requestDomainCancellation}
          onUndoDomainCancellation={undoDomainCancellation}
          onApplyDomainCancellation={applyDomainCancellation}
          onRemoveDomain={removeDomain}
          onResetLocalPrototype={resetLocalPrototype}
        />
      </section>
    );
  } else if (flow === 'completion') {
    content = (
      <section
        ref={completionScreenRef}
        role="region"
        tabIndex={-1}
        aria-label={t`Completion screen`}
      >
        {!hasCompletionEvidence ? (
          <>
            <Section>
              <H2Title
                title={t`Completion unavailable`}
                description={t`The local completion evidence is unavailable or no longer matches this review. Return to the dashboard and start a revised local acquisition path.`}
              />
              <Info
                accent="danger"
                text={t`No local resource was recorded from this completion evidence.`}
              />
            </Section>
            <Section>
              <Button
                title={t`Return to dashboard`}
                variant="primary"
                onClick={returnToDashboard}
              />
              <Button
                title={t`Reset local prototype`}
                variant="secondary"
                onClick={resetLocalPrototype}
              />
            </Section>
          </>
        ) : (
          <>
            <Section>
              <H2Title
                title={
                  externalDomainCompletionEvidence !== null
                    ? t`External domain verified`
                    : commercialCompletionEvidence?.source === 'managed-domain'
                      ? t`Managed domain acquired`
                      : commercialCompletionEvidence?.source ===
                          'managed-mailbox'
                        ? completionIsMailboxCapacity
                          ? t`Managed mailbox capacity applied`
                          : t`Managed mailbox acquired`
                        : commercialCompletionEvidence?.source ===
                            'managed-warmup'
                          ? t`Warmup capacity added`
                          : t`Prewarmed mailboxes acquired`
                }
                description={completionMessage}
              />
            </Section>
            <Section>
              {externalDomainCompletionEvidence !== null ? (
                <>
                  <p>{t`Source: External domain`}</p>
                  <p>{t`Resource: ${externalDomainCompletionEvidence.domain.name}`}</p>
                  <output aria-label={t`DNS verification state`}>
                    {t`Completed`}
                  </output>
                  {externalDomainCompletionEvidence.dnsLifecycle.operation
                    .status !== 'idle' && (
                    <p>
                      {t`DNS verification reference: ${externalDomainCompletionEvidence.dnsLifecycle.operation.operationId}`}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {commercialCompletionEvidence?.source === 'managed-domain'
                      ? t`Source: Managed domain`
                      : commercialCompletionEvidence?.source ===
                          'managed-mailbox'
                        ? completionIsMailboxCapacity
                          ? t`Source: Managed mailbox capacity`
                          : t`Source: Managed mailbox`
                        : commercialCompletionEvidence?.source ===
                            'managed-warmup'
                          ? t`Source: Managed warmup capacity`
                          : t`Source: Prewarmed mailbox bundle`}
                  </p>
                  <p>{t`Resource: ${commercialCompletionEvidence?.resource ?? ''}`}</p>
                  {completedOperation !== null && (
                    <>
                      <p>{t`Quote reference: ${completedOperation.acceptedQuoteId}`}</p>
                      <p>{t`Purchase reference: ${completedOperation.id}`}</p>
                      {completedOperation.subscriptionOperations
                        .filter(
                          (subscriptionOperation) =>
                            subscriptionOperation.outcome === 'completed',
                        )
                        .map((subscriptionOperation) => (
                          <p
                            key={`completion-subscription-${subscriptionOperation.id}`}
                          >
                            {t`Subscription reference: ${subscriptionOperation.intent.targetSubscriptionId}`}
                          </p>
                        ))}
                      <output aria-label={t`Recorded local charge count`}>
                        {
                          completedOperation.lines.filter(
                            (line) => line.paymentOutcome === 'completed',
                          ).length
                        }
                      </output>
                    </>
                  )}
                </>
              )}
              {completedLocalResources.length > 0 && (
                <ul aria-label={t`Completed local resources`}>
                  {completedLocalResources.map((resource) => (
                    <li key={resource}>{resource}</li>
                  ))}
                </ul>
              )}
            </Section>
            {completedCapacityIntent?.product === 'managed-mailbox' &&
              completedCapacitySubscription !== null && (
                <Section>
                  <ul aria-label={t`Managed mailbox pool resources`}>
                    {completedCapacitySubscription.linkedResources
                      .filter((resource) => resource.kind === 'mailbox')
                      .map((resource) => (
                        <li key={resource.id}>
                          {resource.label.match(/<([^>]+)>$/)?.[1] ??
                            resource.label}
                        </li>
                      ))}
                  </ul>
                  <Button
                    id="managed-email-completion-manage-mailbox-capacity"
                    title={t`Manage mailbox capacity`}
                    variant="primary"
                    onClick={() =>
                      manageMailboxCapacity(
                        completedCapacitySubscription.id,
                        'managed-email-completion-manage-mailbox-capacity',
                      )
                    }
                  />
                </Section>
              )}
            {completionIsWarmup && completionWarmupMailbox !== null && (
              <Section>
                <Table role="table" aria-label={t`Warmup-capacity mailbox`}>
                  <TableRow role="row" gridAutoColumns="minmax(0, 1fr)">
                    <TableHeader role="columnheader">{t`Mailbox`}</TableHeader>
                    <TableHeader role="columnheader">{t`Readiness`}</TableHeader>
                    <TableHeader role="columnheader">{t`Assignment`}</TableHeader>
                    <TableHeader role="columnheader">
                      {t`Provider state`}
                    </TableHeader>
                    <TableHeader role="columnheader">{t`Operation`}</TableHeader>
                    <TableHeader role="columnheader">{t`Action`}</TableHeader>
                  </TableRow>
                  <TableBody role="rowgroup">
                    <TableRow role="row" gridAutoColumns="minmax(0, 1fr)">
                      <TableCell role="cell" height="auto">
                        {completionWarmupMailbox.address}
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        <output
                          aria-label={t`Warmup readiness for ${completionWarmupMailbox.address}`}
                        >
                          {completionWarmupMailbox.readiness === 'ready'
                            ? t`Ready`
                            : t`Not ready`}
                        </output>
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        <output
                          aria-label={t`Warmup assignment for ${completionWarmupMailbox.address}`}
                        >
                          {completionWarmupMailbox.warmupState.assignment ===
                          'unassigned'
                            ? t`Unassigned`
                            : t`Assigned`}
                        </output>
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        <output
                          aria-label={t`Confirmed warmup provider state for ${completionWarmupMailbox.address}`}
                        >
                          {completionWarmupMailbox.warmupState
                            .lastConfirmedProviderState === 'inactive'
                            ? t`Inactive`
                            : completionWarmupMailbox.warmupState
                                  .lastConfirmedProviderState === 'warming'
                              ? t`Warming`
                              : t`Paused`}
                        </output>
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        <output
                          aria-label={t`Warmup operation for ${completionWarmupMailbox.address}`}
                        >
                          {completionWarmupOperationText}
                        </output>
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        <ManagedEmailDesignMailboxImmediateAction
                          mailbox={completionWarmupMailbox}
                          availableWarmupCount={getManagedEmailDesignAvailableWarmupCount(
                            workspace,
                          )}
                          onStartWarmup={startWarmup}
                          onPauseWarmup={pauseWarmup}
                          onResumeWarmup={resumeWarmup}
                          onResolveWarmupOperation={resolveWarmupOperation}
                          onRetryWarmupOperation={retryWarmupOperation}
                          onReconcileWarmupOperation={reconcileWarmupOperation}
                          onManageWarmupSubscriptions={(
                            returnFocusId,
                            targetMailboxId,
                          ) => {
                            beginOperation();
                            openManagedEmailSubscriptions({
                              returnFocusId,
                              targetMailboxId,
                            });
                          }}
                          onOpenMailboxConnection={openMailboxConnection}
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Button
                  id="managed-email-completion-increase-warmup-capacity"
                  title={t`Increase warmup capacity`}
                  variant="secondary"
                  onClick={() =>
                    openManagedEmailSubscriptions({
                      subscriptionId:
                        completedCapacitySubscription?.id ?? undefined,
                      returnFocusId:
                        'managed-email-completion-increase-warmup-capacity',
                    })
                  }
                />
                {completionCanceledWarmupSubscription !== null && (
                  <Button
                    id="managed-email-completion-recover-canceled-warmup-capacity"
                    title={t`Recover canceled warmup capacity`}
                    variant="secondary"
                    onClick={() =>
                      openManagedEmailSubscriptions({
                        subscriptionId: completionCanceledWarmupSubscription.id,
                        returnFocusId:
                          'managed-email-completion-recover-canceled-warmup-capacity',
                      })
                    }
                  />
                )}
              </Section>
            )}
            <Section>
              {(externalDomainCompletionEvidence !== null ||
                commercialCompletionEvidence?.source === 'managed-domain') && (
                <Button
                  title={t`Create a mailbox on ${
                    externalDomainCompletionEvidence !== null
                      ? externalDomainCompletionEvidence.domain.name
                      : commercialCompletionEvidence?.resource
                  }`}
                  variant="primary"
                  onClick={() => {
                    const domainName =
                      externalDomainCompletionEvidence !== null
                        ? externalDomainCompletionEvidence.domain.name
                        : (commercialCompletionEvidence?.resource ?? '');
                    beginOperation();
                    setMailboxSource('create');
                    setSelectedDomainName(domainName);
                    setFlow('mailbox-details');
                  }}
                />
              )}
              {commercialCompletionEvidence?.source === 'managed-mailbox' &&
                !completionIsMailboxCapacity && (
                  <Button
                    title={t`Manage mailbox ${commercialCompletionEvidence.resource}`}
                    variant="primary"
                    onClick={() => {
                      beginOperation();
                      setFlow('dashboard');
                    }}
                  />
                )}
              {commercialCompletionEvidence?.source === 'prewarmed' && (
                <Button
                  title={t`Manage prewarmed mailboxes`}
                  variant="primary"
                  onClick={() => {
                    beginOperation();
                    setFlow('dashboard');
                  }}
                />
              )}
              <Button
                title={t`Return to dashboard`}
                variant="secondary"
                onClick={returnToDashboard}
              />
              <Button
                title={t`Reset local prototype`}
                variant="secondary"
                onClick={resetLocalPrototype}
              />
            </Section>
          </>
        )}
      </section>
    );
  } else {
    content = (
      <>
        <ManagedEmailDesignJourney
          state={{
            flow,
            workspace,
            domainSource,
            managedDomainSearchQuery,
            managedDomainSearchLifecycle,
            domainSearchResults,
            selectedDomainSearchResult,
            externalDomainName,
            dnsLifecycle,
            dnsStatus,
            isExistingDomainDnsRepair,
            mailboxSource,
            selectedDomainName,
            mailboxLocalPart,
            mailboxConnection,
            selectedPrewarmedBundle,
            reviewDraft,
            reviewQuote,
            refreshedReviewQuote,
            isRefreshedReviewQuoteVisible,
            acquisitionOperation,
            isReviewPaymentSubmitting,
            reviewStockConflict,
            canCompleteReview:
              reviewDraft !== null &&
              reviewQuote !== null &&
              acquisitionResolution?.status !== 'blocked' &&
              isManagedEmailDesignQuoteCompletable({
                quote: reviewQuote,
                fixtureNow: managedEmailDesignFixtureNow,
              }) &&
              !isReviewPaymentSubmitting &&
              (acquisitionOperation.status === 'idle' ||
                acquisitionOperation.status === 'succeeded') &&
              reviewStockConflict === null,
            hasRecoveredMailboxCapacityReview,
            isRecoveredMailboxCapacityReviewVisible,
            domainValidationMessage: externalDomainValidationMessage,
            mailboxValidationMessage: managedMailboxValidationMessage,
          }}
          actions={{
            onDomainSourceChange: (source) => {
              beginOperation();
              setDomainSource(source);
            },
            onContinueDomainSource: continueDomainSource,
            onManagedDomainSearchQueryChange: (value) => {
              beginOperation();
              const normalizedQuery = normalizeManagedEmailDesignDomain(value);
              const configuredResults =
                getManagedEmailDesignDomainSearchResults(normalizedQuery);

              setManagedDomainSearchQuery(normalizedQuery);
              setManagedDomainSearchLifecycle((current) => ({
                ...clearManagedDomainSearchOperation(current),
                operation: {
                  status: 'idle',
                  configuredOutcome:
                    configuredResults.length === 0 ? 'no-results' : 'results',
                },
                configuredResults,
              }));
              setDomainSearchResults([]);
              setSelectedDomainSearchResult(null);
            },
            onSearchManagedDomains: searchManagedDomains,
            onRetryManagedDomainSearch: retryManagedDomainSearch,
            onResolveManagedDomainSearch: resolveManagedDomainSearch,
            onDomainSearchResultSelect: (result) => {
              beginOperation();
              if (result.available) {
                setSelectedDomainSearchResult(result);
              }
            },
            onContinueManagedDomainSearch: continueManagedDomainSearch,
            onExternalDomainNameChange: (value) => {
              beginOperation();
              setExternalDomainName(value);
            },
            onContinueExternalDomainEntry: continueExternalDomainEntry,
            onCheckDnsVerification: checkDnsVerification,
            onRetryDnsVerification: retryDnsVerification,
            onReconcileDnsVerification: reconcileDnsVerification,
            onResolveDnsVerification: resolveDnsVerification,
            onCompleteDnsVerification: completeDnsVerification,
            onMailboxSourceChange: (source) => {
              beginOperation();
              setMailboxSource(source);
            },
            onContinueMailboxSource: continueMailboxSource,
            onSelectedDomainNameChange: (domainName) => {
              beginOperation();
              setSelectedDomainName(domainName);
            },
            onMailboxLocalPartChange: (value) => {
              beginOperation();
              setMailboxLocalPart(value);
            },
            onContinueMailboxDetails: continueMailboxDetails,
            onGoToDomainSource: () => {
              beginOperation();
              setDomainReturnTarget('mailbox-details');
              setDomainSource(null);
              setFlow('domain-source');
            },
            onMailboxConnectionDraftChange: (draft) => {
              setMailboxConnection((current) => ({
                ...current,
                draft: {
                  address: normalizeManagedEmailDesignMailboxAddress(
                    draft.address,
                  ),
                  selectedProtocol: draft.selectedProtocol ?? null,
                  ...(draft.host !== undefined
                    ? { host: draft.host.trim() }
                    : {}),
                  ...(draft.port !== undefined ? { port: draft.port } : {}),
                  ...(draft.connectionSecurity !== undefined
                    ? { connectionSecurity: draft.connectionSecurity }
                    : {}),
                  ...(draft.username?.trim()
                    ? { username: draft.username.trim() }
                    : {}),
                },
              }));
            },
            onSubmitMailboxConnection: submitMailboxConnection,
            onResolveMailboxConnection: () => {
              if (mailboxConnection.operation.status !== 'testing') {
                return;
              }

              resolveMailboxConnectionResult(
                mailboxConnection.operation.configuredOutcome,
              );
            },
            onRetryMailboxConnection: retryMailboxConnection,
            onReconcileMailboxConnection: reconcileMailboxConnection,
            onSelectedPrewarmedBundleChange: selectPrewarmedBundle,
            onReviewSelectedPrewarmedBundle: reviewSelectedPrewarmedBundle,
            onUseMailboxAcquisitionSource: (source) => {
              beginOperation();
              setMailboxSource(source);
              if (source === 'create') {
                setFlow('mailbox-details');
                return;
              }

              startFreshMailboxConnectionAdd('mailbox-connection');
            },
            onCompleteReview: completeReview,
            onResolveSubmittedReviewPayment: resolveSubmittedReviewPayment,
            onRefreshReviewQuote: refreshReviewQuote,
            onAcceptRefreshedReviewQuote: acceptRefreshedReviewQuote,
            onRetryAcquisitionOperation: retryAcquisitionOperation,
            onReconcileAcquisitionOperation: reconcileAcquisitionOperation,
            onReturnToPrewarmedInventory: returnToPrewarmedInventory,
            onReviewRecoveredMailboxCapacity: reviewRecoveredMailboxCapacity,
            onAcceptRecoveredMailboxQuote: acceptRecoveredMailboxQuote,
            onBack: goBack,
            onCancel: returnToDashboard,
          }}
        />
        {flow === 'review' &&
          reviewDraft?.completion.type === 'add-prewarmed-bundle' &&
          selectedPrewarmedBundle !== null &&
          acquisitionOperation.status === 'idle' &&
          reviewStockConflict === null && (
            <Section>
              <p>
                {t`Simulate the selected offer becoming unavailable before completion.`}
              </p>
              <Button
                title={t`Simulate selected offer becoming unavailable`}
                variant="secondary"
                onClick={simulateSelectedPrewarmedOfferUnavailable}
              />
            </Section>
          )}
      </>
    );
  }

  return (
    <SettingsPageLayout
      title={t`Email infrastructure`}
      links={[
        { children: t`Workspace`, href: '/settings/workspace' },
        { children: t`Email infrastructure` },
      ]}
      secondaryBar={secondaryBar}
    >
      <SettingsPageContainer>
        <div aria-label={t`Managed email design`} role="region">
          <div
            aria-label={t`Managed email outcome`}
            aria-live="polite"
            role="status"
          >
            {currentOperationResult !== null &&
              currentOperationResult.kind !== 'failure' &&
              (flow === 'completion' ? (
                <span style={managedEmailStoryEvidenceStyle}>
                  {currentOperationResult.message}
                </span>
              ) : (
                <Info text={currentOperationResult.message} />
              ))}
          </div>
          <div
            data-testid="managed-email-story-evidence"
            aria-hidden="true"
            style={managedEmailStoryEvidenceStyle}
          >
            {(currentWarmupSubscription ??
              workspace.subscriptions.find(
                (subscription) => subscription.product === 'managed-warmup',
              )) !== null && (
              <output aria-label={t`Warmup capacity subscription ID`}>
                {
                  (
                    currentWarmupSubscription ??
                    workspace.subscriptions.find(
                      (subscription) =>
                        subscription.product === 'managed-warmup',
                    )
                  )?.id
                }
              </output>
            )}
            {selectedManagedEmailSubscription?.product ===
              'managed-mailbox' && (
              <output aria-label={t`Mailbox capacity subscription ID`}>
                {selectedManagedEmailSubscription.id}
              </output>
            )}
            <output aria-label={t`Managed mailbox resource count`}>
              {workspace.mailboxes.length}
            </output>
            <output aria-label={t`Managed mailbox pool signature`}>
              {managedMailboxPoolSignature}
            </output>
            <output aria-label={t`Managed mailbox ownership signature`}>
              {workspace.mailboxes
                .map(
                  (mailbox) =>
                    `${mailbox.id}:${mailbox.subscriptionId ?? 'none'}`,
                )
                .join('|')}
            </output>
            <output aria-label={t`Prewarmed inventory count`}>
              {workspace.prewarmedBundles.length}
            </output>
            {commercialOperationForEvidence !== null && (
              <output aria-label={t`Acquisition operation status`}>
                {commercialOperationForEvidence.status === 'succeeded'
                  ? t`Succeeded`
                  : commercialOperationForEvidence.status === 'pending'
                    ? t`Pending`
                    : commercialOperationForEvidence.status === 'failed'
                      ? t`Failed`
                      : commercialOperationForEvidence.status === 'partial'
                        ? t`Partially completed`
                        : t`Reconciliation required`}
              </output>
            )}
            {commercialOperationForEvidence !== null && (
              <output aria-label={t`Acquisition operation ID`}>
                {commercialOperationForEvidence.id}
              </output>
            )}
            {acceptedQuoteIdForEvidence !== null && (
              <output aria-label={t`Accepted quote ID`}>
                {acceptedQuoteIdForEvidence}
              </output>
            )}
            {commercialOperationForEvidence !== null && (
              <>
                <output aria-label={t`Acquisition line IDs`}>
                  {commercialOperationForEvidence.lines
                    .map((line) => line.id)
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Quote line IDs`}>
                  {commercialOperationForEvidence.lines
                    .map((line) => line.quoteLineId)
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Dependency edge IDs`}>
                  {commercialOperationForEvidence.lines
                    .flatMap((line) =>
                      line.dependsOnLineIds.map(
                        (dependencyLineId) =>
                          `${line.id} -> ${dependencyLineId}`,
                      ),
                    )
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Resource operation IDs`}>
                  {commercialOperationForEvidence.lines
                    .map((line) => line.resourceOperationId)
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Payment evidence IDs`}>
                  {commercialOperationForEvidence.lines
                    .map((line) => line.paymentEvidenceId)
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Subscription operation IDs`}>
                  {commercialOperationForEvidence.subscriptionOperations
                    .map((subscriptionOperation) => subscriptionOperation.id)
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Target subscription IDs`}>
                  {commercialOperationForEvidence.subscriptionOperations
                    .map(
                      (subscriptionOperation) =>
                        subscriptionOperation.intent.targetSubscriptionId,
                    )
                    .join(', ') || t`None`}
                </output>
                <output aria-label={t`Resource snapshot IDs`}>
                  {commercialOperationForEvidence.subscriptionOperations
                    .flatMap(
                      (subscriptionOperation) =>
                        subscriptionOperation.intent.resourceSnapshotIds,
                    )
                    .join(', ') || t`None`}
                </output>
              </>
            )}
          </div>
          {linkedMailboxDetail !== null &&
            !linkedMailboxDetail.isVisible &&
            linkedMailboxDomain !== null && (
              <Button
                title={t`View linked mailboxes`}
                variant="secondary"
                size="small"
                onClick={() => {
                  setCurrentOperationResult(null);
                  setLinkedMailboxDetail((current) =>
                    current === null ? null : { ...current, isVisible: true },
                  );
                }}
              />
            )}
          {currentOperationResult !== null &&
            currentOperationResult.kind === 'failure' && (
              <div role="alert">
                <Info accent="danger" text={currentOperationResult.message} />
              </div>
            )}
          {linkedMailboxDetail?.isVisible && linkedMailboxDomain !== null ? (
            <Section>
              <H2Title
                title={t`Linked mailboxes for ${linkedMailboxDomain.name}`}
                description={t`Remove or disconnect every linked mailbox before changing this domain.`}
              />
              <span>{linkedMailboxDomain.name}</span>
              {linkedMailboxes.map((mailbox) => (
                <div key={mailbox.id}>
                  <strong>{mailbox.identity}</strong>
                  <span>{mailbox.address}</span>
                  <Button
                    title={
                      mailbox.source === 'connected'
                        ? t`Disconnect mailbox ${mailbox.address}`
                        : t`Remove mailbox ${mailbox.address}`
                    }
                    variant="secondary"
                    size="small"
                    onClick={() => requestLinkedMailboxRemoval(mailbox)}
                  />
                </div>
              ))}
              <Button
                ref={linkedMailboxBackButtonRef}
                title={t`Back to domains`}
                variant="secondary"
                size="small"
                onClick={() => {
                  setLinkedMailboxReturnFocusId(
                    `managed-email-domain-actions-${linkedMailboxDomain.id}-trigger`,
                  );
                  setLinkedMailboxDetail(null);
                }}
              />
            </Section>
          ) : (
            content
          )}
          {subscriptionPanel !== null && (
            <Section>
              <section
                ref={subscriptionPanelFocusRef}
                aria-label={t`Managed-email subscriptions`}
                role="region"
                tabIndex={-1}
              >
                <H2Title
                  title={t`Managed-email subscriptions`}
                  description={t`Local fixture subscriptions remain independent from provider, readiness, mailbox removal, and domain changes.`}
                />
                <StyledSelectedSubscription>
                  <span>{t`Selected subscription`}</span>
                  <output aria-label={t`Selected managed-email subscription`}>
                    {selectedManagedEmailSubscription?.id ??
                      t`No active managed-email subscription`}
                  </output>
                </StyledSelectedSubscription>
                <div>
                  <Button
                    title={t`View managed-email subscription inventory`}
                    variant="secondary"
                    size="small"
                    onClick={() =>
                      setSubscriptionPanel((current) =>
                        current === null
                          ? null
                          : { ...current, showInventory: true },
                      )
                    }
                  />
                  <Button
                    title={t`Back to email infrastructure`}
                    variant="secondary"
                    size="small"
                    onClick={() => closeManagedEmailSubscriptions()}
                  />
                </div>
                {subscriptionPanelAlert !== null && (
                  <div role="alert">{subscriptionPanelAlert}</div>
                )}
                {subscriptionQuantityReductionBlockers.length > 0 && (
                  <div aria-label={t`Quantity reduction blockers`}>
                    {subscriptionQuantityReductionBlockers.map((mailbox) => (
                      <div key={mailbox.id}>
                        <span>{`${mailbox.identity} <${mailbox.address}>`}</span>
                        <Button
                          title={t`Review ${mailbox.address}`}
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            closeManagedEmailSubscriptions(false);
                            setMailboxFocusId(
                              `managed-email-mailbox-actions-${mailbox.id}-trigger`,
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {subscriptionPanel.showInventory && (
                  <StyledSubscriptionInventory
                    aria-label={t`Managed-email subscription inventory`}
                  >
                    {workspace.subscriptions.map((subscription) => (
                      <li key={`inventory-${subscription.id}`}>
                        <strong>{subscription.id}</strong>
                        <span>
                          {subscription.product === 'managed-domain'
                            ? t`Managed domain`
                            : subscription.product === 'managed-mailbox'
                              ? t`Managed mailbox`
                              : t`Managed warmup`}
                        </span>
                      </li>
                    ))}
                  </StyledSubscriptionInventory>
                )}
                <StyledSubscriptionList
                  aria-label={t`Managed-email subscriptions`}
                >
                  {workspace.subscriptions.map((subscription) => (
                    <li key={subscription.id}>
                      <strong>{subscription.id}</strong>
                      <Button
                        title={t`Manage subscription ${subscription.id}`}
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setSubscriptionPanel((current) =>
                            current === null
                              ? null
                              : {
                                  ...current,
                                  selectedSubscriptionId: subscription.id,
                                },
                          );
                          setSubscriptionPanelAlert(null);
                          setSubscriptionQuantityBlockerIds([]);
                        }}
                      />
                    </li>
                  ))}
                </StyledSubscriptionList>
                {selectedManagedEmailSubscription === null ? (
                  <div>
                    <span>
                      {t`No active managed-warmup subscription is available for this workspace.`}
                    </span>
                    <input
                      aria-label={t`Warmup capacity quantity`}
                      min={1}
                      type="number"
                      value={warmupCapacityQuantity}
                      onChange={(event) =>
                        setWarmupCapacityQuantity(event.target.value)
                      }
                    />
                    <Button
                      title={t`Review warmup capacity purchase`}
                      variant="primary"
                      size="small"
                      onClick={reviewWarmupCapacityPurchase}
                    />
                  </div>
                ) : (
                  <div>
                    <Card fullWidth rounded>
                      <CardHeader>
                        <StyledSubscriptionCardHeaderText>
                          {selectedManagedEmailSubscription.id}
                        </StyledSubscriptionCardHeaderText>
                      </CardHeader>
                      <CardContent>
                        <StyledSubscriptionDetails>
                          <div>
                            <dt>{t`Quantity`}</dt>
                            <dd>
                              <output
                                aria-label={t`Subscription quantity for ${selectedManagedEmailSubscription.id}`}
                              >
                                {selectedManagedEmailSubscription.quantity}
                              </output>
                            </dd>
                          </div>
                          <div>
                            <dt>{t`Effective quantity`}</dt>
                            <dd>
                              <output
                                aria-label={t`Effective subscription quantity for ${selectedManagedEmailSubscription.id}`}
                              >
                                {getManagedEmailDesignEffectiveSubscriptionQuantity(
                                  selectedManagedEmailSubscription,
                                )}
                              </output>
                            </dd>
                          </div>
                          <div>
                            <dt>{t`Status`}</dt>
                            <dd>
                              <output
                                aria-label={t`Subscription status for ${selectedManagedEmailSubscription.id}`}
                              >
                                {selectedManagedEmailSubscription.status ===
                                'active'
                                  ? t`Active`
                                  : selectedManagedEmailSubscription.status ===
                                      'pending-change'
                                    ? t`Pending quantity reduction`
                                    : selectedManagedEmailSubscription.status ===
                                        'pending-cancel'
                                      ? t`Pending cancellation`
                                      : t`Canceled`}
                              </output>
                            </dd>
                          </div>
                          <div>
                            <dt>{t`Cadence`}</dt>
                            <dd>
                              <output
                                aria-label={t`Subscription cadence for ${selectedManagedEmailSubscription.id}`}
                              >
                                {selectedManagedEmailSubscription.cadence ===
                                'annual'
                                  ? t`Annual`
                                  : t`Monthly`}
                              </output>
                            </dd>
                          </div>
                          <div>
                            <dt>{t`Unit price`}</dt>
                            <dd>
                              <output
                                aria-label={t`Subscription unit price for ${selectedManagedEmailSubscription.id}`}
                              >
                                {formatManagedEmailDesignUsd(
                                  selectedManagedEmailSubscription.unitPriceCents,
                                )}
                              </output>
                            </dd>
                          </div>
                          <div>
                            <dt>{t`Renewal`}</dt>
                            <dd>
                              <output
                                aria-label={t`Subscription renewal for ${selectedManagedEmailSubscription.id}`}
                              >
                                {selectedManagedEmailSubscriptionRenewal}
                              </output>
                            </dd>
                          </div>
                          <div>
                            <dt>{t`Linked resources`}</dt>
                            <dd>
                              <StyledSubscriptionResourceSnapshots
                                aria-label={t`Subscription resource snapshots for ${selectedManagedEmailSubscription.id}`}
                              >
                                {selectedManagedEmailSubscription.linkedResources.map(
                                  (resource) => (
                                    <div key={resource.id}>
                                      <span>{resource.label}</span>
                                      {resource.kind === 'mailbox' &&
                                        !isLiveBillableMailboxSnapshot({
                                          resource,
                                          mailboxes: workspace.mailboxes,
                                        }) && (
                                          <span>
                                            {t`Retained after resource removal`}
                                          </span>
                                        )}
                                    </div>
                                  ),
                                )}
                              </StyledSubscriptionResourceSnapshots>
                            </dd>
                          </div>
                        </StyledSubscriptionDetails>
                      </CardContent>
                    </Card>
                    {selectedWarmupEffectiveQuantity !== null &&
                      selectedWarmupEffectiveQuantity <=
                        assignedWarmupCount && (
                        <>
                          <span>
                            {plural(selectedWarmupEffectiveQuantity, {
                              one: `All ${selectedWarmupEffectiveQuantity} managed warmup subscription slot is assigned.`,
                              other: `All ${selectedWarmupEffectiveQuantity} managed warmup subscription slots are assigned.`,
                            })}
                          </span>
                          <Button
                            title={t`Increase warmup capacity`}
                            variant="secondary"
                            size="small"
                            onClick={() =>
                              setSubscriptionPanel((current) =>
                                current === null
                                  ? null
                                  : {
                                      ...current,
                                      selectedSubscriptionId: null,
                                    },
                              )
                            }
                          />
                        </>
                      )}
                    {selectedManagedEmailSubscription.status ===
                      'pending-change' && (
                      <>
                        <output aria-label={t`Scheduled change effective at`}>
                          {formatManagedEmailDesignDate(
                            selectedManagedEmailSubscription.changeEffectiveAt,
                            i18n.locale,
                          )}
                        </output>
                        <span>
                          {t`Reduction to ${selectedManagedEmailSubscription.pendingQuantity} takes effect on ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.changeEffectiveAt, i18n.locale)}.`}
                        </span>
                        {selectedManagedEmailSubscription.product ===
                          'managed-warmup' && (
                          <output
                            aria-label={t`Effective warmup capacity after ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.changeEffectiveAt, i18n.locale)}`}
                          >
                            {plural(selectedWarmupEffectiveQuantity ?? 0, {
                              one: `${selectedWarmupEffectiveQuantity ?? 0} slot · ${Math.max((selectedWarmupEffectiveQuantity ?? 0) - assignedWarmupCount, 0)} available`,
                              other: `${selectedWarmupEffectiveQuantity ?? 0} slots · ${Math.max((selectedWarmupEffectiveQuantity ?? 0) - assignedWarmupCount, 0)} available`,
                            })}
                          </output>
                        )}
                        <Button
                          title={
                            selectedManagedEmailSubscription.product ===
                            'managed-mailbox'
                              ? t`Apply managed mailbox quantity change effective ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.changeEffectiveAt, i18n.locale)}`
                              : t`Apply managed warmup quantity change effective ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.changeEffectiveAt, i18n.locale)}`
                          }
                          variant="secondary"
                          size="small"
                          onClick={() =>
                            applySubscriptionQuantityChange(
                              selectedManagedEmailSubscription.id,
                            )
                          }
                        />
                      </>
                    )}
                    {selectedManagedEmailSubscription.status ===
                      'pending-cancel' && (
                      <>
                        <output
                          aria-label={t`Subscription cancellation effective at for ${selectedManagedEmailSubscription.id}`}
                        >
                          {formatManagedEmailDesignDate(
                            selectedManagedEmailSubscription.cancelAt,
                            i18n.locale,
                          )}
                        </output>
                        {managedEmailDesignFixtureNow <
                          selectedManagedEmailSubscription.cancelAt && (
                          <Button
                            title={
                              selectedManagedEmailSubscription.product ===
                              'managed-domain'
                                ? t`Undo managed domain cancellation`
                                : selectedManagedEmailSubscription.product ===
                                    'managed-mailbox'
                                  ? t`Undo managed mailbox cancellation`
                                  : t`Undo managed warmup cancellation`
                            }
                            variant="secondary"
                            size="small"
                            onClick={() =>
                              undoSubscriptionCancellation(
                                selectedManagedEmailSubscription.id,
                              )
                            }
                          />
                        )}
                        <Button
                          title={
                            selectedManagedEmailSubscription.product ===
                            'managed-domain'
                              ? t`Apply managed domain cancellation effective ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.cancelAt, i18n.locale)}`
                              : selectedManagedEmailSubscription.product ===
                                  'managed-mailbox'
                                ? t`Apply managed mailbox cancellation effective ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.cancelAt, i18n.locale)}`
                                : t`Apply managed warmup cancellation effective ${formatManagedEmailDesignDate(selectedManagedEmailSubscription.cancelAt, i18n.locale)}`
                          }
                          variant="secondary"
                          size="small"
                          onClick={() =>
                            applySubscriptionCancellation(
                              selectedManagedEmailSubscription.id,
                            )
                          }
                        />
                      </>
                    )}
                    {selectedManagedEmailSubscription.status === 'active' &&
                      selectedManagedEmailSubscription.product !==
                        'managed-domain' && (
                        <>
                          <input
                            aria-label={
                              selectedManagedEmailSubscription.product ===
                              'managed-mailbox'
                                ? t`Managed mailbox subscription quantity`
                                : t`Managed warmup subscription quantity`
                            }
                            min={1}
                            type="number"
                            value={
                              subscriptionQuantityDrafts[
                                selectedManagedEmailSubscription.id
                              ] ??
                              String(selectedManagedEmailSubscription.quantity)
                            }
                            onChange={(event) => {
                              setSubscriptionPanelAlert(null);
                              setSubscriptionQuantityBlockerIds([]);
                              setSubscriptionQuantityDrafts((current) => ({
                                ...current,
                                [selectedManagedEmailSubscription.id]:
                                  event.target.value,
                              }));
                            }}
                          />
                          <Button
                            title={
                              selectedManagedEmailSubscription.product ===
                              'managed-mailbox'
                                ? t`Schedule managed mailbox quantity reduction`
                                : t`Schedule managed warmup quantity reduction`
                            }
                            variant="secondary"
                            size="small"
                            onClick={() =>
                              scheduleSubscriptionQuantityReduction(
                                selectedManagedEmailSubscription.id,
                              )
                            }
                          />
                          <Button
                            title={
                              selectedManagedEmailSubscription.product ===
                              'managed-mailbox'
                                ? t`Cancel managed mailbox renewal`
                                : t`Cancel managed warmup renewal`
                            }
                            variant="secondary"
                            size="small"
                            onClick={() =>
                              requestSubscriptionCancellation(
                                selectedManagedEmailSubscription.id,
                              )
                            }
                          />
                        </>
                      )}
                    {selectedManagedEmailSubscription.status === 'active' &&
                      selectedManagedEmailSubscription.product ===
                        'managed-domain' && (
                        <Button
                          title={t`Cancel renewal for ${selectedManagedEmailSubscription.id}`}
                          variant="secondary"
                          size="small"
                          onClick={() =>
                            requestSubscriptionCancellation(
                              selectedManagedEmailSubscription.id,
                            )
                          }
                        />
                      )}
                    {selectedManagedEmailSubscription.product ===
                      'managed-mailbox' &&
                      selectedManagedEmailSubscription.status ===
                        'canceled' && (
                        <Button
                          title={t`Add another managed mailbox`}
                          variant="primary"
                          size="small"
                          onClick={() =>
                            startRecoveredMailboxCapacityReview(
                              selectedManagedEmailSubscription.id,
                            )
                          }
                        />
                      )}
                    {selectedManagedEmailSubscription.product ===
                      'managed-warmup' &&
                      selectedManagedEmailSubscription.status ===
                        'canceled' && (
                        <>
                          {assignedWarmupCount > 0 && (
                            <span>
                              {plural(assignedWarmupCount, {
                                one: `${assignedWarmupCount} unresolved warmup assignment must be recovered before new capacity can be added.`,
                                other: `${assignedWarmupCount} unresolved warmup assignments must be recovered before new capacity can be added.`,
                              })}
                            </span>
                          )}
                          <Button
                            title={t`Recover warmup capacity`}
                            variant="primary"
                            size="small"
                            onClick={reviewWarmupCapacityPurchase}
                          />
                        </>
                      )}
                    {selectedManagedEmailSubscription.product ===
                      'managed-warmup' &&
                      selectedManagedEmailSubscription.status === 'active' &&
                      currentWarmupSubscription !== null &&
                      availableWarmupCount > 0 && (
                        <span>
                          {plural(availableWarmupCount, {
                            one: `${availableWarmupCount} warmup slot is already available. Assign it before buying more capacity.`,
                            other: `${availableWarmupCount} warmup slots are already available. Assign them before buying more capacity.`,
                          })}
                        </span>
                      )}
                    {selectedManagedEmailSubscription.product ===
                      'managed-warmup' &&
                      selectedManagedEmailSubscription.status === 'active' &&
                      currentWarmupSubscription !== null &&
                      availableWarmupCount === 0 && (
                        <>
                          <input
                            aria-label={t`Additional warmup slots`}
                            min={1}
                            type="number"
                            value={warmupCapacityQuantity}
                            onChange={(event) =>
                              setWarmupCapacityQuantity(event.target.value)
                            }
                          />
                          <Button
                            title={t`Review warmup capacity purchase`}
                            variant="primary"
                            size="small"
                            onClick={reviewWarmupCapacityPurchase}
                          />
                        </>
                      )}
                  </div>
                )}
              </section>
            </Section>
          )}
          <ConfirmationModal
            modalInstanceId={MAILBOX_REMOVAL_MODAL_ID}
            title={
              mailboxToRemove === null
                ? t`Remove mailbox?`
                : mailboxToRemove.source === 'connected'
                  ? t`Disconnect ${mailboxToRemove.address}?`
                  : t`Remove ${mailboxToRemove.address}?`
            }
            subtitle={
              mailboxToRemove === null
                ? t`No mailbox is selected. Close this dialog and choose a mailbox to remove.`
                : mailboxToRemove.source === 'connected'
                  ? mailboxRemovalResetsDomainVerification
                    ? t`Disconnecting ${mailboxToRemove.address} removes only this local mailbox after warmup is inactive. Its local customer-owned domain record remains and will require DNS verification because this is the last connected mailbox. Its pooled managed-mailbox subscription, snapshots, and quantity are unchanged.`
                    : t`Disconnecting ${mailboxToRemove.address} removes only this local mailbox after warmup is inactive. Its domain, sibling mailboxes, and pooled managed-mailbox subscription are unchanged.`
                  : t`Removing ${mailboxToRemove.address} removes only this local mailbox after warmup is inactive. Its domain, sibling mailboxes, and pooled managed-mailbox subscription are unchanged.`
            }
            confirmButtonText={
              mailboxToRemove?.source === 'connected'
                ? t`Disconnect mailbox`
                : t`Remove mailbox resource`
            }
            confirmButtonAccent="danger"
            finalFocus={() => {
              const triggerId = mailboxRemovalFinalFocusRef.current;
              const trigger =
                triggerId === null ? null : document.getElementById(triggerId);

              return (
                trigger ??
                document.getElementById('managed-email-add-mailbox') ??
                false
              );
            }}
            onClose={() => setMailboxToRemove(null)}
            onConfirmClick={() => {
              if (mailboxToRemove !== null) {
                removeMailbox(mailboxToRemove);
              }
              setMailboxToRemove(null);
              closeModal(MAILBOX_REMOVAL_MODAL_ID);
            }}
          />
          <ConfirmationModal
            modalInstanceId={MANAGED_EMAIL_SUBSCRIPTION_CANCELLATION_MODAL_ID}
            title={
              subscriptionToCancel === undefined
                ? t`Cancel subscription renewal?`
                : subscriptionToCancel.product === 'managed-domain'
                  ? t`Cancel managed domain renewal?`
                  : subscriptionToCancel.product === 'managed-mailbox'
                    ? t`Cancel managed mailbox renewal?`
                    : t`Cancel managed warmup renewal?`
            }
            subtitle={
              subscriptionToCancel === undefined ||
              subscriptionToCancel.status !== 'active' ? (
                t`No active subscription is selected. Close this dialog and choose an active subscription to cancel.`
              ) : (
                <>
                  <span>
                    {t`Cancellation takes effect on ${formatManagedEmailDesignDate(subscriptionToCancel.renewsAt, i18n.locale)}.`}
                  </span>
                  {subscriptionToCancel.product === 'managed-mailbox'
                    ? subscriptionToCancel.linkedResources
                        .filter((resource) =>
                          isLiveBillableMailboxSnapshot({
                            resource,
                            mailboxes: workspace.mailboxes,
                          }),
                        )
                        .map((resource) => (
                          <span key={resource.id}>{resource.label}</span>
                        ))
                    : subscriptionToCancel.product === 'managed-warmup'
                      ? workspace.mailboxes
                          .filter(
                            (mailbox) =>
                              mailbox.warmupState.assignment === 'assigned',
                          )
                          .map((mailbox) => (
                            <span key={mailbox.id}>
                              {`${mailbox.identity} <${mailbox.address}>`}
                            </span>
                          ))
                      : null}
                </>
              )
            }
            confirmButtonText={t`Cancel renewal`}
            confirmButtonAccent="danger"
            onClose={() => setSubscriptionToCancelId(null)}
            onConfirmClick={confirmSubscriptionCancellation}
          />
          <ConfirmationModal
            modalInstanceId={
              MANAGED_EMAIL_SUBSCRIPTION_QUANTITY_REVIEW_MODAL_ID
            }
            title={
              subscriptionQuantityReview === null ||
              subscriptionQuantityReviewSubscription === undefined
                ? t`Confirm subscription quantity reduction?`
                : subscriptionQuantityReviewSubscription.product ===
                    'managed-mailbox'
                  ? t`Confirm managed mailbox quantity reduction?`
                  : t`Confirm managed warmup quantity reduction?`
            }
            subtitle={
              subscriptionQuantityReview === null ||
              subscriptionQuantityReviewSubscription === undefined ? (
                t`No subscription quantity change is ready to confirm. Close this dialog and choose a subscription quantity.`
              ) : (
                <>
                  <span>
                    {t`Reduction to ${subscriptionQuantityReview.quantity} takes effect on ${formatManagedEmailDesignDate(managedEmailDesignSubscriptionEffectiveAt, i18n.locale)}.`}
                  </span>
                  {subscriptionQuantityReviewSubscription.product ===
                  'managed-mailbox'
                    ? subscriptionQuantityReviewSubscription.linkedResources
                        .filter((resource) =>
                          isLiveBillableMailboxSnapshot({
                            resource,
                            mailboxes: workspace.mailboxes,
                          }),
                        )
                        .map((resource) => (
                          <span key={resource.id}>{resource.label}</span>
                        ))
                    : workspace.mailboxes
                        .filter(
                          (mailbox) =>
                            mailbox.warmupState.assignment === 'assigned',
                        )
                        .map((mailbox) => (
                          <span key={mailbox.id}>
                            {`${mailbox.identity} <${mailbox.address}>`}
                          </span>
                        ))}
                </>
              )
            }
            confirmButtonText={
              subscriptionQuantityReviewSubscription === undefined
                ? t`Confirm quantity reduction`
                : subscriptionQuantityReviewSubscription.product ===
                    'managed-mailbox'
                  ? t`Confirm managed mailbox quantity reduction`
                  : t`Confirm managed warmup quantity reduction`
            }
            onClose={() => setSubscriptionQuantityReview(null)}
            onConfirmClick={confirmSubscriptionQuantityReduction}
          />

          <ConfirmationModal
            modalInstanceId={WARMUP_CAPACITY_REVIEW_MODAL_ID}
            title={t`Review warmup capacity purchase`}
            subtitle={
              warmupCapacityReview === null ? (
                t`No warmup capacity quote is ready. Close this dialog and review a warmup capacity purchase.`
              ) : (
                <>
                  <span>
                    {warmupCapacityReview.intent.mode === 'create'
                      ? t`First managed warmup subscription`
                      : t`Increment managed warmup capacity`}
                  </span>
                  <output aria-label={t`Warmup subscription intent`}>
                    {warmupCapacityReview.intent.mode === 'create'
                      ? t`Create`
                      : t`Add to existing`}{' '}
                    ·{' '}
                    {plural(warmupCapacityReview.intent.quantityDelta, {
                      one: `${warmupCapacityReview.intent.quantityDelta} slot`,
                      other: `${warmupCapacityReview.intent.quantityDelta} slots`,
                    })}
                  </output>
                  {warmupCapacityQuoteLine !== null && (
                    <>
                      <Table
                        role="table"
                        aria-label={t`Warmup capacity quote charges`}
                      >
                        <TableBody role="rowgroup">
                          <TableRow
                            role="row"
                            gridAutoColumns="minmax(0, 1fr)"
                            height="auto"
                          >
                            <TableHeader role="columnheader">
                              {t`Service`}
                            </TableHeader>
                            <TableHeader role="columnheader">
                              {t`Resource`}
                            </TableHeader>
                            <TableHeader role="columnheader">
                              {t`Cadence`}
                            </TableHeader>
                            <TableHeader role="columnheader">
                              {t`Unit price`}
                            </TableHeader>
                            <TableHeader role="columnheader">
                              {t`Quantity`}
                            </TableHeader>
                            <TableHeader role="columnheader">
                              {t`Amount`}
                            </TableHeader>
                          </TableRow>
                        </TableBody>
                        <TableBody role="rowgroup">
                          <TableRow
                            role="row"
                            gridAutoColumns="minmax(0, 1fr)"
                            height="auto"
                          >
                            <TableCell role="cell" height="auto">
                              <strong>{t`Managed warmup capacity`}</strong>
                            </TableCell>
                            <TableCell role="cell" height="auto">
                              {warmupCapacityQuoteLine.resourceLabel}
                            </TableCell>
                            <TableCell role="cell" height="auto">
                              <output aria-label={t`Warmup quote cadence`}>
                                {warmupCapacityQuoteLine.cadence === 'annual'
                                  ? t`Annual`
                                  : t`Monthly`}
                              </output>
                            </TableCell>
                            <TableCell role="cell" height="auto">
                              <output aria-label={t`Warmup quote unit price`}>
                                {formatManagedEmailDesignUsd(
                                  warmupCapacityQuoteLine.unitPriceCents,
                                )}
                              </output>
                            </TableCell>
                            <TableCell role="cell" height="auto">
                              {warmupCapacityQuoteLine.quantity}
                            </TableCell>
                            <TableCell role="cell" height="auto">
                              <output aria-label={t`Warmup quote line amount`}>
                                {formatManagedEmailDesignUsd(
                                  warmupCapacityQuoteLine.amountCents,
                                )}
                              </output>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                      <Card fullWidth rounded>
                        <CardHeader>{t`Warmup capacity quote totals`}</CardHeader>
                        <CardContent>
                          <p>
                            {t`Effective date:`}{' '}
                            <output aria-label={t`Warmup quote effective date`}>
                              {formatManagedEmailDesignDate(
                                warmupCapacityQuoteLine.startsAt,
                                i18n.locale,
                              )}
                            </output>
                          </p>
                          <p>
                            {t`Due today:`}{' '}
                            <output aria-label={t`Warmup quote due today`}>
                              {formatManagedEmailDesignUsd(
                                warmupCapacityReview.quote.totals.dueTodayCents,
                              )}
                            </output>
                          </p>
                          <p>
                            {t`Monthly recurring:`}{' '}
                            <output
                              aria-label={t`Warmup quote monthly recurring`}
                            >
                              {formatManagedEmailDesignUsd(
                                warmupCapacityReview.quote.totals
                                  .monthlyRecurringCents,
                              )}
                            </output>
                          </p>
                          {warmupCapacityQuoteLine.renewsAt !== '' && (
                            <p>
                              {t`Renewal date:`}{' '}
                              <output aria-label={t`Warmup quote renewal date`}>
                                {formatManagedEmailDesignDate(
                                  warmupCapacityQuoteLine.renewsAt,
                                  i18n.locale,
                                )}
                              </output>
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                  {workspace.mailboxes
                    .filter(
                      (mailbox) =>
                        mailbox.warmupState.assignment === 'assigned',
                    )
                    .map((mailbox) => (
                      <span key={mailbox.id}>
                        {`${mailbox.identity} <${mailbox.address}>`}
                      </span>
                    ))}
                </>
              )
            }
            confirmButtonText={t`Accept warmup capacity quote`}
            onClose={() => setWarmupCapacityReview(null)}
            onConfirmClick={acceptWarmupCapacityPurchase}
          />
        </div>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
