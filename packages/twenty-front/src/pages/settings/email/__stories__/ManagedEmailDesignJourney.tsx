import { type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useMediaQuery } from 'react-responsive';

import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsAccountsConnectionForm } from '@/settings/accounts/components/SettingsAccountsConnectionForm';
import { type ConnectionFormData } from '@/settings/accounts/hooks/useImapSmtpCaldavConnectionForm';
import {
  connectionImapSmtpCalDav,
  createConnectionImapSmtpCalDavUpdateSchema,
} from '@/settings/accounts/validation-schemas/connectionImapSmtpCalDav';
import { SettingsDnsRecordsTable } from '@/settings/components/SettingsDnsRecordsTable';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { Status } from 'twenty-ui/data-display';
import { Info } from 'twenty-ui/feedback';
import { Button, CardPicker, RadioGroup } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { Card, CardContent, CardHeader } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { type AccountType } from 'twenty-shared/constants';

import { EmailConnectionSecurity } from '~/generated-metadata/graphql';
import {
  formatManagedEmailDesignUsd,
  getManagedEmailDesignAcquisitionRetryOrder,
  getManagedEmailDesignBundleConflictMessage,
  getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage,
  getManagedEmailDesignMailboxSendingCapabilityReasonMessage,
  managedEmailDesignPricing,
  normalizeManagedEmailDesignDomain,
  normalizeManagedEmailDesignMailboxAddress,
  type ManagedEmailDesignAcquisitionLine,
  type ManagedEmailDesignAcquisitionOperation,
  type ManagedEmailDesignDnsLifecycle,
  type ManagedEmailDesignDnsStatus,
  type ManagedEmailDesignDomainSearchLifecycle,
  type ManagedEmailDesignDomainSearchResult,
  type ManagedEmailDesignConnectionDraft,
  type ManagedEmailDesignMailboxConnectionLifecycle,
  type ManagedEmailDesignMailboxConnectionProtocol,
  type ManagedEmailDesignPrewarmedBundle,
  type ManagedEmailDesignQuote,
  type ManagedEmailDesignQuoteLine,
  type ManagedEmailDesignReviewDraft,
  type ManagedEmailDesignWorkspace,
} from './ManagedEmailDesign.fixtures';

export type ManagedEmailDesignFlow =
  | 'dashboard'
  | 'domain-source'
  | 'managed-domain-search'
  | 'external-domain-entry'
  | 'external-dns'
  | 'mailbox-source'
  | 'mailbox-details'
  | 'mailbox-connection'
  | 'prewarmed-inventory'
  | 'review'
  | 'completion';

export type ManagedEmailDesignDomainAcquisitionSource = 'managed' | 'external';

export type ManagedEmailDesignMailboxAcquisitionSource = 'create' | 'connect';

export type ManagedEmailDesignMailboxConnectionSubmission = Pick<
  ManagedEmailDesignMailboxConnectionLifecycle,
  'draft' | 'capabilities' | 'canSend' | 'sendingCapabilityReason'
>;

export type ManagedEmailDesignReviewStockConflict = {
  bundleId: string;
  kind: 'inventory-unavailable' | 'resource-conflict';
  message: string;
};

export type ManagedEmailDesignCompletionEvidence =
  | {
      kind: 'commercial';
      source:
        | 'managed-domain'
        | 'managed-mailbox'
        | 'managed-warmup'
        | 'prewarmed';
      resource: string;
      acquisitionOperation: Extract<
        ManagedEmailDesignAcquisitionOperation,
        { id: string }
      >;
    }
  | {
      kind: 'external-domain';
      domain: {
        id: string;
        name: string;
      };
      dnsLifecycle: ManagedEmailDesignDnsLifecycle;
    };

type ManagedEmailDesignJourneyState = {
  flow: Exclude<ManagedEmailDesignFlow, 'dashboard' | 'completion'>;
  workspace: ManagedEmailDesignWorkspace;
  domainSource: ManagedEmailDesignDomainAcquisitionSource | null;
  managedDomainSearchQuery: string;
  managedDomainSearchLifecycle: ManagedEmailDesignDomainSearchLifecycle;
  domainSearchResults: ManagedEmailDesignDomainSearchResult[];
  selectedDomainSearchResult: ManagedEmailDesignDomainSearchResult | null;
  externalDomainName: string;
  dnsLifecycle: ManagedEmailDesignDnsLifecycle;
  dnsStatus: ManagedEmailDesignDnsStatus;
  isExistingDomainDnsRepair: boolean;
  mailboxSource: ManagedEmailDesignMailboxAcquisitionSource | null;
  selectedDomainName: string;
  mailboxLocalPart: string;
  mailboxConnection: ManagedEmailDesignMailboxConnectionLifecycle;
  selectedPrewarmedBundle: ManagedEmailDesignPrewarmedBundle | null;
  reviewDraft: ManagedEmailDesignReviewDraft | null;
  reviewQuote: ManagedEmailDesignQuote | null;
  refreshedReviewQuote: ManagedEmailDesignQuote | null;
  isRefreshedReviewQuoteVisible: boolean;
  acquisitionOperation: ManagedEmailDesignAcquisitionOperation;
  isReviewPaymentSubmitting: boolean;
  reviewStockConflict: ManagedEmailDesignReviewStockConflict | null;
  canCompleteReview: boolean;
  hasRecoveredMailboxCapacityReview: boolean;
  isRecoveredMailboxCapacityReviewVisible: boolean;
  domainValidationMessage: string | null;
  mailboxValidationMessage: string | null;
};

type ManagedEmailDesignJourneyActions = {
  onDomainSourceChange: (
    source: ManagedEmailDesignDomainAcquisitionSource,
  ) => void;
  onContinueDomainSource: () => void;
  onManagedDomainSearchQueryChange: (value: string) => void;
  onSearchManagedDomains: () => void;
  onRetryManagedDomainSearch: () => void;
  onResolveManagedDomainSearch: () => void;
  onDomainSearchResultSelect: (
    result: ManagedEmailDesignDomainSearchResult,
  ) => void;
  onContinueManagedDomainSearch: () => void;
  onExternalDomainNameChange: (value: string) => void;
  onContinueExternalDomainEntry: () => void;
  onCheckDnsVerification: () => void;
  onRetryDnsVerification: () => void;
  onReconcileDnsVerification: () => void;
  onResolveDnsVerification: () => void;
  onCompleteDnsVerification: () => void;
  onMailboxSourceChange: (
    source: ManagedEmailDesignMailboxAcquisitionSource,
  ) => void;
  onContinueMailboxSource: () => void;
  onSelectedDomainNameChange: (domainName: string) => void;
  onMailboxLocalPartChange: (value: string) => void;
  onContinueMailboxDetails: () => void;
  onGoToDomainSource: () => void;
  onMailboxConnectionDraftChange: (
    draft: ManagedEmailDesignConnectionDraft,
  ) => void;
  onSubmitMailboxConnection: (
    submission: ManagedEmailDesignMailboxConnectionSubmission,
  ) => void;
  onResolveMailboxConnection: () => void;
  onRetryMailboxConnection: () => void;
  onReconcileMailboxConnection: () => void;
  onSelectedPrewarmedBundleChange: (
    bundle: ManagedEmailDesignPrewarmedBundle,
  ) => void;
  onReviewSelectedPrewarmedBundle: () => void;
  onUseMailboxAcquisitionSource: (
    source: ManagedEmailDesignMailboxAcquisitionSource,
  ) => void;
  onCompleteReview: () => void;
  onResolveSubmittedReviewPayment: () => void;
  onRefreshReviewQuote: () => void;
  onAcceptRefreshedReviewQuote: () => void;
  onRetryAcquisitionOperation: () => void;
  onReconcileAcquisitionOperation: () => void;
  onReturnToPrewarmedInventory: () => void;
  onReviewRecoveredMailboxCapacity: () => void;
  onAcceptRecoveredMailboxQuote: () => void;
  onBack: () => void;
  onCancel: () => void;
};

type ManagedEmailDesignJourneyProps = {
  state: ManagedEmailDesignJourneyState;
  actions: ManagedEmailDesignJourneyActions;
};

type DomainSourceScreenProps = ManagedEmailDesignJourneyProps;
type ManagedDomainSearchScreenProps = ManagedEmailDesignJourneyProps;
type ExternalDomainEntryScreenProps = ManagedEmailDesignJourneyProps;
type ExternalDnsScreenProps = ManagedEmailDesignJourneyProps;
type MailboxSourceScreenProps = ManagedEmailDesignJourneyProps;
type MailboxDetailsScreenProps = ManagedEmailDesignJourneyProps;
type MailboxConnectionScreenProps = ManagedEmailDesignJourneyProps;
type PrewarmedInventoryScreenProps = ManagedEmailDesignJourneyProps;
type ReviewScreenProps = ManagedEmailDesignJourneyProps;

const MAILBOX_CONNECTION_BACK_MODAL_ID = 'managed-email-design-connection-back';
const MANAGED_EMAIL_DESIGN_CONNECT_EXISTING_MAILBOX_ID =
  'managed-email-design-connect-existing-mailbox';
const COMPACT_LAYOUT_MAX_VIEWPORT = 768;
const PURCHASE_REVIEW_GRID_TEMPLATE_COLUMNS =
  'minmax(0, 1.5fr) minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 0.9fr) minmax(0, 0.6fr) minmax(0, 0.9fr)';

const formatManagedEmailDesignJourneyDate = (
  value: string | undefined,
  locale: string,
) =>
  value === undefined
    ? undefined
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(value));

const getManagedEmailDesignConnectionSecurity = (
  connectionSecurity: EmailConnectionSecurity,
) => {
  switch (connectionSecurity) {
    case EmailConnectionSecurity.NONE:
      return 'NONE' as const;
    case EmailConnectionSecurity.STARTTLS:
      return 'STARTTLS' as const;
    case EmailConnectionSecurity.SSL_TLS:
      return 'SSL_TLS' as const;
  }
};

const createConnectionFormDefaultValues = (
  draft: ManagedEmailDesignConnectionDraft,
): ConnectionFormData => {
  const defaults: ConnectionFormData = {
    handle: draft.address,
    IMAP: {
      host: '',
      port: 993,
      password: '',
      connectionSecurity: EmailConnectionSecurity.SSL_TLS,
    },
    SMTP: {
      host: '',
      username: '',
      port: 587,
      password: '',
      connectionSecurity: EmailConnectionSecurity.STARTTLS,
    },
    CALDAV: {
      host: '',
      port: 443,
      password: '',
      connectionSecurity: EmailConnectionSecurity.SSL_TLS,
    },
  };
  const selectedProtocol = draft.selectedProtocol;
  const connectionSecurity = draft.connectionSecurity;

  if (selectedProtocol === 'IMAP') {
    defaults.IMAP = {
      ...defaults.IMAP,
      host: draft.host ?? '',
      port: draft.port ?? 993,
      username: draft.username,
      connectionSecurity:
        connectionSecurity === 'NONE'
          ? EmailConnectionSecurity.NONE
          : connectionSecurity === 'STARTTLS'
            ? EmailConnectionSecurity.STARTTLS
            : EmailConnectionSecurity.SSL_TLS,
    };
  }

  if (selectedProtocol === 'SMTP') {
    defaults.SMTP = {
      ...defaults.SMTP,
      host: draft.host ?? '',
      port: draft.port ?? 587,
      username: draft.username ?? '',
      connectionSecurity:
        connectionSecurity === 'NONE'
          ? EmailConnectionSecurity.NONE
          : connectionSecurity === 'SSL_TLS'
            ? EmailConnectionSecurity.SSL_TLS
            : EmailConnectionSecurity.STARTTLS,
    };
  }

  if (selectedProtocol === 'CALDAV') {
    defaults.CALDAV = {
      ...defaults.CALDAV,
      host: draft.host ?? '',
      port: draft.port ?? 443,
      username: draft.username,
      connectionSecurity:
        connectionSecurity === 'NONE'
          ? EmailConnectionSecurity.NONE
          : connectionSecurity === 'STARTTLS'
            ? EmailConnectionSecurity.STARTTLS
            : EmailConnectionSecurity.SSL_TLS,
    };
  }

  return defaults;
};

const createScrubbedConnectionDraft = ({
  formData,
  selectedProtocol,
}: {
  formData: ConnectionFormData;
  selectedProtocol: ManagedEmailDesignMailboxConnectionProtocol;
}): ManagedEmailDesignConnectionDraft => {
  const connectionParameters =
    selectedProtocol === 'IMAP'
      ? formData.IMAP
      : selectedProtocol === 'SMTP'
        ? formData.SMTP
        : formData.CALDAV;
  if (connectionParameters === undefined) {
    return {
      address: normalizeManagedEmailDesignMailboxAddress(formData.handle),
      selectedProtocol,
      host: '',
      connectionSecurity: selectedProtocol === 'SMTP' ? 'STARTTLS' : 'SSL_TLS',
    };
  }

  const username = connectionParameters.username?.trim();

  return {
    address: normalizeManagedEmailDesignMailboxAddress(formData.handle),
    selectedProtocol,
    host: connectionParameters.host?.trim() ?? '',
    port: connectionParameters.port ?? undefined,
    connectionSecurity: getManagedEmailDesignConnectionSecurity(
      connectionParameters.connectionSecurity ??
        (selectedProtocol === 'SMTP'
          ? EmailConnectionSecurity.STARTTLS
          : EmailConnectionSecurity.SSL_TLS),
    ),
    ...(username ? { username } : {}),
  };
};

const createMailboxConnectionSubmission = ({
  connection,
  formData,
  selectedProtocol,
}: {
  connection: ManagedEmailDesignMailboxConnectionLifecycle;
  formData: ConnectionFormData;
  selectedProtocol: ManagedEmailDesignMailboxConnectionProtocol;
}): ManagedEmailDesignMailboxConnectionSubmission => {
  const draft = createScrubbedConnectionDraft({ formData, selectedProtocol });
  const selectedCapability =
    selectedProtocol === 'IMAP'
      ? ('imap' as const)
      : selectedProtocol === 'SMTP'
        ? ('smtp' as const)
        : ('caldav' as const);
  const capabilities = Array.from(
    new Set([...connection.capabilities, selectedCapability]),
  );
  const hasFreshSmtpCredential =
    selectedProtocol === 'SMTP' &&
    Boolean(formData.SMTP?.host?.trim() && formData.SMTP?.password?.trim());
  const canSend = connection.canSend || hasFreshSmtpCredential;

  return {
    draft,
    capabilities,
    canSend,
    sendingCapabilityReason: canSend
      ? null
      : 'SMTP is not configured, so this mailbox cannot send mail.',
  };
};

const StyledStoryEvidenceOutput = styled.output`
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
`;

const StyledFulfillmentProgressCards = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  width: 100%;
`;

const StyledFulfillmentProgressCard = styled(Card)`
  min-width: 0;
`;

const StyledFulfillmentProgressTitle = styled.span`
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const StyledFulfillmentProgressDetails = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;
  min-width: 0;

  > div {
    align-items: start;
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    min-width: 0;
  }

  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const FlowNavigation = ({
  onBack,
  onCancel,
  disabled = false,
  cancelTitle,
}: {
  onBack: () => void;
  onCancel: () => void;
  disabled?: boolean;
  cancelTitle?: string;
}) => {
  const { t } = useLingui();

  return (
    <Section>
      <Button
        title={t`Back`}
        variant="secondary"
        onClick={onBack}
        disabled={disabled}
      />
      <Button
        title={cancelTitle ?? t`Cancel`}
        variant="tertiary"
        onClick={onCancel}
        disabled={disabled}
      />
    </Section>
  );
};

const DnsStatus = ({ status }: { status: ManagedEmailDesignDnsStatus }) => {
  const { t } = useLingui();

  switch (status) {
    case 'verification-required':
      return <Status color="yellow" text={t`Verification required`} />;
    case 'checking-dns':
      return (
        <Status color="yellow" text={t`Checking DNS locally`} isLoaderVisible />
      );
    case 'verified':
      return <Status color="green" text={t`Verified in local fixture state`} />;
    case 'action-required':
      return <Status color="red" text={t`Action required`} />;
  }
};

const DomainSourceScreen = ({ state, actions }: DomainSourceScreenProps) => {
  const { t } = useLingui();

  return (
    <>
      <Section>
        <H2Title
          title={t`Add domain`}
          description={t`Choose how this domain enters the local inventory.`}
        />
      </Section>

      <RadioGroup<ManagedEmailDesignDomainAcquisitionSource | null>
        aria-label={t`Domain source`}
        value={state.domainSource}
        onValueChange={(source) => {
          if (source !== null) {
            actions.onDomainSourceChange(source);
          }
        }}
      >
        <Section>
          <CardPicker aria-label={t`Buy a Myah-managed domain`} value="managed">
            <div>
              <strong>{t`Buy a Myah-managed domain`}</strong>
              <p>
                {t`Search local fixture results, then review only the annual domain line.`}
              </p>
            </div>
          </CardPicker>
        </Section>

        <Section>
          <CardPicker
            aria-label={t`Connect a customer-owned domain`}
            value="external"
          >
            <div>
              <strong>{t`Connect a customer-owned domain`}</strong>
              <p>
                {t`Enter the domain and verify local DNS fixture records without a purchase review.`}
              </p>
            </div>
          </CardPicker>
        </Section>
      </RadioGroup>

      <Section>
        <Button
          title={t`Continue`}
          variant="primary"
          disabled={state.domainSource === null}
          onClick={actions.onContinueDomainSource}
        />
      </Section>

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

const ManagedDomainSearchScreen = ({
  state,
  actions,
}: ManagedDomainSearchScreenProps) => {
  const { t } = useLingui();
  const { operation } = state.managedDomainSearchLifecycle;
  const domainSearchStatus = operation.status;
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const retryDomainSearchButtonRef = useRef<HTMLButtonElement>(null);
  const domainSearchResultsRegionRef = useRef<HTMLElement>(null);
  const domainSearchState =
    domainSearchStatus === 'idle'
      ? t`Idle`
      : domainSearchStatus === 'loading'
        ? t`Loading`
        : domainSearchStatus === 'failed'
          ? t`Failed`
          : domainSearchStatus === 'results'
            ? t`Results`
            : t`No results`;
  const domainSearchResultCards = state.domainSearchResults.map((result) =>
    result.available ? (
      <Section key={result.domain}>
        <CardPicker aria-label={result.domain} value={result.domain}>
          <div>
            <strong>{result.domain}</strong>
            <p>{t`${formatManagedEmailDesignUsd(result.annualCents)} annually · Renews annually`}</p>
            <Status color="green" text={t`Available`} />
          </div>
        </CardPicker>
      </Section>
    ) : (
      <Section key={result.domain}>
        <Card fullWidth rounded>
          <CardHeader>{result.domain}</CardHeader>
          <CardContent>
            <p>{t`${formatManagedEmailDesignUsd(result.annualCents)} annually · Renews annually`}</p>
            <Status color="red" text={t`Unavailable`} />
          </CardContent>
        </Card>
      </Section>
    ),
  );
  const hasAvailableDomainSearchResults = state.domainSearchResults.some(
    (result) => result.available,
  );

  useEffect(() => {
    switch (domainSearchStatus) {
      case 'failed':
        retryDomainSearchButtonRef.current?.focus();
        return;
      case 'results':
        domainSearchResultsRegionRef.current?.focus();
        return;
      case 'no-results':
        searchButtonRef.current?.focus();
        return;
      default:
        return;
    }
  }, [domainSearchStatus]);

  return (
    <>
      <Section>
        <H2Title
          title={t`Find a domain`}
          description={t`Search deterministic local fixture results with an explicit action.`}
        />
        <SettingsTextInput
          instanceId="managed-email-design-managed-domain-search"
          label={t`Domain search`}
          value={state.managedDomainSearchQuery}
          onChange={actions.onManagedDomainSearchQueryChange}
        />
        <Button
          ref={searchButtonRef}
          title={t`Search`}
          variant={domainSearchStatus === 'results' ? 'secondary' : 'primary'}
          disabled={state.managedDomainSearchQuery.trim() === ''}
          onClick={actions.onSearchManagedDomains}
        />
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Managed domain search state`}
        >
          {domainSearchState}
        </StyledStoryEvidenceOutput>
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Managed domain search operation ID`}
        >
          {operation.operationId ?? t`Not started`}
        </StyledStoryEvidenceOutput>
        <p>
          {t`Search availability and prices are Storybook-local fixtures. No registrar or provider search occurs.`}
        </p>
      </Section>

      {domainSearchStatus === 'idle' && (
        <Section>
          <p>
            {t`Search for mooreland, fleetwave-mail.com, or zzzz-nomatch to inspect the deterministic fixture states.`}
          </p>
        </Section>
      )}

      {domainSearchStatus === 'loading' && (
        <Section>
          <div role="status" aria-label={t`Managed domain search pending`}>
            <Status
              color="yellow"
              text={t`Searching local fixtures`}
              isLoaderVisible
            />
          </div>
          <Button
            title={t`Resolve domain search`}
            variant="secondary"
            onClick={actions.onResolveManagedDomainSearch}
          />
        </Section>
      )}

      {domainSearchStatus === 'failed' && (
        <Section>
          <div role="alert">
            <Info
              accent="danger"
              text={
                operation.safeDiagnostic ??
                t`The managed domain search could not be completed. Try again.`
              }
            />
          </div>
          <Button
            ref={retryDomainSearchButtonRef}
            title={t`Retry domain search`}
            variant="secondary"
            onClick={actions.onRetryManagedDomainSearch}
          />
        </Section>
      )}

      {domainSearchStatus === 'no-results' && (
        <Section>
          <div role="alert">
            <Info
              accent="danger"
              text={t`No local fixture results match this search. Try another domain name.`}
            />
          </div>
        </Section>
      )}

      {domainSearchStatus === 'results' && (
        <section
          ref={domainSearchResultsRegionRef}
          role="region"
          tabIndex={-1}
          aria-label={t`Managed domain search results`}
        >
          {hasAvailableDomainSearchResults ? (
            <RadioGroup<string | null>
              aria-label={t`Available domains`}
              value={state.selectedDomainSearchResult?.domain ?? null}
              onValueChange={(domain) => {
                if (domain === null) {
                  return;
                }

                const selectedResult = state.domainSearchResults.find(
                  (result) => result.domain === domain,
                );

                if (selectedResult?.available) {
                  actions.onDomainSearchResultSelect(selectedResult);
                }
              }}
            >
              {domainSearchResultCards}
            </RadioGroup>
          ) : (
            domainSearchResultCards
          )}
          <Section>
            <Button
              title={t`Continue`}
              variant="primary"
              disabled={state.selectedDomainSearchResult === null}
              onClick={actions.onContinueManagedDomainSearch}
            />
          </Section>
        </section>
      )}

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

const ExternalDomainEntryScreen = ({
  state,
  actions,
}: ExternalDomainEntryScreenProps) => {
  const { t } = useLingui();

  return (
    <>
      <Section>
        <H2Title
          title={t`Enter your domain`}
          description={t`Add a customer-owned domain to local DNS verification.`}
        />
        <SettingsTextInput
          instanceId="managed-email-design-external-domain"
          label={t`Customer-owned domain`}
          value={state.externalDomainName}
          onChange={actions.onExternalDomainNameChange}
          error={state.domainValidationMessage ?? undefined}
        />
        <Button
          title={t`Continue`}
          variant="primary"
          disabled={state.domainValidationMessage !== null}
          onClick={actions.onContinueExternalDomainEntry}
        />
      </Section>

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

const ExternalDnsScreen = ({ state, actions }: ExternalDnsScreenProps) => {
  const { t } = useLingui();
  const { operation } = state.dnsLifecycle;
  const resolveDnsVerificationButtonRef = useRef<HTMLButtonElement>(null);
  const dnsResolutionActionButtonRef = useRef<HTMLButtonElement>(null);
  const completedDnsActionButtonRef = useRef<HTMLButtonElement>(null);
  const domain = normalizeManagedEmailDesignDomain(
    state.dnsLifecycle.domain.name,
  );
  const dnsVerificationState =
    operation.status === 'idle'
      ? t`Idle`
      : operation.status === 'checking'
        ? t`Checking`
        : operation.status === 'completed'
          ? t`Completed`
          : operation.status === 'check-failed'
            ? t`Check failed`
            : t`Unknown`;

  useEffect(() => {
    if (operation.status === 'checking') {
      resolveDnsVerificationButtonRef.current?.focus();
      return;
    }
    if (operation.status === 'completed') {
      completedDnsActionButtonRef.current?.focus();
      return;
    }

    if (operation.status === 'check-failed' || operation.status === 'unknown') {
      dnsResolutionActionButtonRef.current?.focus();
    }
  }, [operation.status]);

  return (
    <>
      <Section>
        <H2Title
          title={t`Verify DNS for ${domain}`}
          description={t`Inspect these deterministic local fixture records, then explicitly resolve the illustrative verification state.`}
        />
        {operation.status === 'checking' ? (
          <div role="status" aria-label={t`DNS verification pending`}>
            <Status color="yellow" text={t`Checking DNS`} isLoaderVisible />
          </div>
        ) : (
          <DnsStatus status={state.dnsStatus} />
        )}
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`DNS verification state`}
        >
          {dnsVerificationState}
        </StyledStoryEvidenceOutput>
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`DNS verification operation ID`}
        >
          {operation.operationId ?? t`Not started`}
        </StyledStoryEvidenceOutput>
        {(operation.status === 'check-failed' ||
          operation.status === 'unknown') && (
          <div role="alert">
            <Info accent="danger" text={operation.safeDiagnostic} />
          </div>
        )}
        <SettingsDnsRecordsTable
          records={state.dnsLifecycle.records}
          domain={domain}
          ariaLabel={t`DNS records for ${domain}`}
        />
        <p>
          {t`These records and every verification result are local Storybook fixtures for inspection only. No DNS publication or query occurs.`}
        </p>
        {operation.status === 'idle' && (
          <Button
            title={
              state.dnsLifecycle.purpose === 'reverify'
                ? t`Reverify DNS`
                : t`Check verification`
            }
            variant="primary"
            onClick={actions.onCheckDnsVerification}
          />
        )}
        {operation.status === 'checking' && (
          <>
            <Button
              title={t`Check verification`}
              variant="secondary"
              disabled
            />
            <Button
              ref={resolveDnsVerificationButtonRef}
              title={t`Resolve DNS verification`}
              variant="primary"
              onClick={actions.onResolveDnsVerification}
            />
          </>
        )}
        {operation.status === 'check-failed' && (
          <Button
            ref={dnsResolutionActionButtonRef}
            title={t`Retry DNS verification`}
            variant="secondary"
            onClick={actions.onRetryDnsVerification}
          />
        )}
        {operation.status === 'unknown' && (
          <Button
            ref={dnsResolutionActionButtonRef}
            title={t`Reconcile DNS verification`}
            variant="secondary"
            onClick={actions.onReconcileDnsVerification}
          />
        )}
        {operation.status === 'completed' && (
          <>
            <Button
              ref={
                state.dnsStatus === 'verified'
                  ? undefined
                  : completedDnsActionButtonRef
              }
              title={t`Check verification again`}
              variant="secondary"
              onClick={actions.onCheckDnsVerification}
            />
            {state.dnsStatus === 'verified' && (
              <Button
                ref={completedDnsActionButtonRef}
                title={
                  state.dnsLifecycle.purpose === 'reverify'
                    ? t`Finish DNS reverification`
                    : state.dnsLifecycle.purpose === 'repair'
                      ? t`Finish DNS repair`
                      : state.isExistingDomainDnsRepair
                        ? t`Finish DNS verification`
                        : t`Complete domain locally`
                }
                variant="primary"
                onClick={actions.onCompleteDnsVerification}
              />
            )}
          </>
        )}
      </Section>

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

const MailboxSourceScreen = ({ state, actions }: MailboxSourceScreenProps) => {
  const { t } = useLingui();

  return (
    <>
      <Section>
        <H2Title
          title={t`Add mailbox`}
          description={t`Choose whether to create a managed mailbox or connect an existing mailbox.`}
        />
      </Section>

      <RadioGroup<ManagedEmailDesignMailboxAcquisitionSource | null>
        aria-label={t`Mailbox source`}
        value={state.mailboxSource}
        onValueChange={(source) => {
          if (source !== null) {
            actions.onMailboxSourceChange(source);
          }
        }}
      >
        <Section>
          <CardPicker aria-label={t`Create a managed mailbox`} value="create">
            <div>
              <strong>{t`Create a managed mailbox`}</strong>
              <p>
                {t`Select an existing verified domain, then review only the monthly mailbox line.`}
              </p>
            </div>
          </CardPicker>
        </Section>

        <Section>
          <CardPicker
            id={MANAGED_EMAIL_DESIGN_CONNECT_EXISTING_MAILBOX_ID}
            aria-label={t`Connect an existing mailbox`}
            value="connect"
          >
            <div>
              <strong>{t`Connect an existing mailbox`}</strong>
              <p>
                {t`Use the existing IMAP/SMTP settings form to connect this mailbox locally.`}
              </p>
            </div>
          </CardPicker>
        </Section>
      </RadioGroup>

      <Section>
        <Button
          title={t`Continue`}
          variant="primary"
          disabled={state.mailboxSource === null}
          onClick={actions.onContinueMailboxSource}
        />
      </Section>

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

const MailboxDetailsScreen = ({
  state,
  actions,
}: MailboxDetailsScreenProps) => {
  const { t } = useLingui();
  const eligibleDomains = state.workspace.domains.filter(
    (domain) => domain.verification === 'verified',
  );
  const selectedDomain = normalizeManagedEmailDesignDomain(
    state.selectedDomainName,
  );

  return (
    <>
      <Section>
        <H2Title
          title={t`Create a managed mailbox`}
          description={t`Create this separate monthly mailbox only on an existing verified domain.`}
        />
      </Section>

      {eligibleDomains.length === 0 ? (
        <Section>
          <Info
            text={t`No eligible verified domain is available in this local fixture state. Add a domain before creating a managed mailbox.`}
          />
          <Button
            title={t`Add domain`}
            variant="primary"
            onClick={actions.onGoToDomainSource}
          />
        </Section>
      ) : (
        <>
          <Section>
            <fieldset>
              <legend>{t`Select a verified domain`}</legend>
              <RadioGroup
                aria-label={t`Verified domain`}
                value={selectedDomain}
                onValueChange={actions.onSelectedDomainNameChange}
              >
                {eligibleDomains.map((domain) => (
                  <CardPicker
                    aria-label={domain.name}
                    key={domain.id}
                    value={domain.name}
                  >
                    <div>
                      <strong>{domain.name}</strong>
                      <Status color="green" text={t`Verified`} />
                    </div>
                  </CardPicker>
                ))}
              </RadioGroup>
            </fieldset>
          </Section>

          <Section>
            <SettingsTextInput
              instanceId="managed-email-design-mailbox-local-part"
              label={t`Mailbox local part`}
              value={state.mailboxLocalPart}
              rightAdornment={`@${selectedDomain}`}
              onChange={actions.onMailboxLocalPartChange}
              error={state.mailboxValidationMessage ?? undefined}
            />
            <Button
              title={t`Review mailbox`}
              variant="primary"
              disabled={state.mailboxValidationMessage !== null}
              onClick={actions.onContinueMailboxDetails}
            />
          </Section>
        </>
      )}

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

const MailboxConnectionScreen = ({
  state,
  actions,
}: MailboxConnectionScreenProps) => {
  const connection = state.mailboxConnection;
  const selectedProtocol = connection.draft.selectedProtocol;
  const { i18n, t } = useLingui();
  const { openModal } = useModal();
  const retryConnectionButtonRef = useRef<HTMLButtonElement>(null);
  const reconcileConnectionButtonRef = useRef<HTMLButtonElement>(null);
  const [lastConnectionFormResetKey, setLastConnectionFormResetKey] = useState<
    string | null
  >(null);
  const [existingProtocol] = useState(() =>
    connection.mode === 'edit'
      ? (connection.draft.selectedProtocol ?? null)
      : null,
  );
  const connectionFormResetKey = `${connection.formEpoch}:${connection.operation.status}`;
  const { control, getValues, handleSubmit, reset, setError, setFocus, watch } =
    useForm<ConnectionFormData>({
      mode: 'onSubmit',
      resolver: zodResolver(
        connection.mode === 'add'
          ? connectionImapSmtpCalDav
          : createConnectionImapSmtpCalDavUpdateSchema({
              editedProtocol: selectedProtocol ?? undefined,
              incompleteConfigurationMessage: t`At least one account type (IMAP, SMTP, or CalDAV) must be completely configured`,
            }),
      ),
      defaultValues: createConnectionFormDefaultValues(connection.draft),
    });
  const formValues = watch();
  const isTesting = connection.operation.status === 'testing';
  const isFormVisible = connection.operation.status === 'idle';
  const isConnectionIdentityBound =
    connection.mailboxId !== null || connection.operationId !== null;
  const hasConfiguredPassword =
    selectedProtocol === 'IMAP'
      ? Boolean(formValues.IMAP?.password?.trim())
      : selectedProtocol === 'SMTP'
        ? Boolean(formValues.SMTP?.password?.trim())
        : selectedProtocol === 'CALDAV'
          ? Boolean(formValues.CALDAV?.password?.trim())
          : false;
  const hasAnyPassword = Boolean(
    formValues.IMAP?.password?.trim() ||
    formValues.SMTP?.password?.trim() ||
    formValues.CALDAV?.password?.trim(),
  );
  const canSend =
    connection.canSend ||
    (selectedProtocol === 'SMTP' &&
      Boolean(
        formValues.SMTP?.host?.trim() && formValues.SMTP?.password?.trim(),
      ));
  const isSmtpRemediationEdit =
    connection.mode === 'edit' &&
    !canSend &&
    connection.draft.selectedProtocol === 'SMTP' &&
    connection.requiresFreshPassword;
  const sendingCapabilityText = canSend
    ? t`SMTP is configured for sending.`
    : i18n._(
        getManagedEmailDesignMailboxSendingCapabilityReasonMessage(
          selectedProtocol === 'SMTP'
            ? 'Complete the SMTP host and password before this mailbox can send mail.'
            : 'SMTP is not configured, so this mailbox cannot send mail.',
        ),
      );

  useEffect(() => {
    if (lastConnectionFormResetKey === connectionFormResetKey) {
      return;
    }

    setLastConnectionFormResetKey(connectionFormResetKey);
    reset(createConnectionFormDefaultValues(connection.draft));

    if (
      connection.requiresFreshPassword &&
      connection.operation.status === 'idle'
    ) {
      window.requestAnimationFrame(() => {
        switch (connection.draft.selectedProtocol) {
          case 'IMAP':
            setFocus('IMAP.password');
            return;
          case 'SMTP':
            setFocus('SMTP.password');
            return;
          case 'CALDAV':
            setFocus('CALDAV.password');
            return;
          case null:
          case undefined:
            return;
        }
      });
    }
  }, [
    connection.draft,
    connection.operation.status,
    connection.requiresFreshPassword,
    connectionFormResetKey,
    lastConnectionFormResetKey,
    reset,
    setFocus,
  ]);

  useEffect(() => {
    if (connection.operation.status === 'failed') {
      retryConnectionButtonRef.current?.focus();
      return;
    }

    if (connection.operation.status === 'unknown') {
      reconcileConnectionButtonRef.current?.focus();
    }
  }, [connection.operation.status]);

  const persistScrubbedDraft = () => {
    if (selectedProtocol === null || selectedProtocol === undefined) {
      actions.onMailboxConnectionDraftChange({
        address: normalizeManagedEmailDesignMailboxAddress(getValues().handle),
        selectedProtocol: null,
      });
      return;
    }

    actions.onMailboxConnectionDraftChange(
      createScrubbedConnectionDraft({
        formData: getValues(),
        selectedProtocol,
      }),
    );
  };

  const onSelectedProtocolChange = (protocol: AccountType) => {
    if (protocol !== 'IMAP' && protocol !== 'SMTP' && protocol !== 'CALDAV') {
      return;
    }

    const nextDraft = createScrubbedConnectionDraft({
      formData: getValues(),
      selectedProtocol: protocol,
    });

    reset(createConnectionFormDefaultValues(nextDraft));
    actions.onMailboxConnectionDraftChange(nextDraft);
  };

  const onSubmit = handleSubmit(
    (formData) => {
      if (
        selectedProtocol === null ||
        selectedProtocol === undefined ||
        connection.operation.status !== 'idle'
      ) {
        return;
      }

      const submission = createMailboxConnectionSubmission({
        connection,
        formData,
        selectedProtocol,
      });

      actions.onMailboxConnectionDraftChange(submission.draft);
      reset(createConnectionFormDefaultValues(submission.draft));
      actions.onSubmitMailboxConnection(submission);
    },
    () => {
      if (connection.mode === 'add' || selectedProtocol == null) {
        return;
      }

      const hostField = `${selectedProtocol}.host` as const;
      setError(hostField, {
        type: 'manual',
        message: t`At least one account type (IMAP, SMTP, or CalDAV) must be completely configured`,
      });
      setFocus(hostField);
    },
  );

  const returnToMailboxSource = () => {
    actions.onBack();
    window.requestAnimationFrame(() => {
      document
        .getElementById(MANAGED_EMAIL_DESIGN_CONNECT_EXISTING_MAILBOX_ID)
        ?.focus();
    });
  };

  const onBack = () => {
    persistScrubbedDraft();

    if (!hasAnyPassword) {
      returnToMailboxSource();
      return;
    }

    openModal(MAILBOX_CONNECTION_BACK_MODAL_ID);
  };

  return (
    <>
      <Section>
        <H2Title
          title={
            connection.mode === 'edit'
              ? isSmtpRemediationEdit
                ? t`Configure SMTP for ${connection.draft.address}`
                : t`Edit connected mailbox`
              : connection.mode === 'retest'
                ? t`Retest connected mailbox`
                : t`Connect an existing mailbox`
          }
          description={t`Use the existing IMAP/SMTP settings form to validate and connect this mailbox locally.`}
        />
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Mailbox connection mode`}
        >
          {connection.mode === 'add'
            ? t`Add`
            : connection.mode === 'edit'
              ? t`Edit`
              : t`Retest`}
        </StyledStoryEvidenceOutput>
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Mailbox connection state`}
        >
          {connection.operation.status === 'idle'
            ? t`Idle`
            : connection.operation.status === 'testing'
              ? t`Testing`
              : connection.operation.status === 'failed'
                ? t`Failed`
                : connection.operation.status === 'connected'
                  ? t`Connected`
                  : t`Unknown`}
        </StyledStoryEvidenceOutput>
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Mailbox connection operation ID`}
        >
          {connection.operation.operationId ??
            connection.operationId ??
            t`Not started`}
        </StyledStoryEvidenceOutput>
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Mailbox sending capability`}
        >
          {canSend ? t`Can send` : sendingCapabilityText}
        </StyledStoryEvidenceOutput>
      </Section>

      {isTesting && (
        <>
          <Section>
            <SettingsTextInput
              instanceId="managed-email-design-pending-connection-address"
              label={t`Email address`}
              value={connection.draft.address}
              disabled
            />
            {selectedProtocol !== null && selectedProtocol !== undefined && (
              <SettingsTextInput
                instanceId="managed-email-design-pending-connection-host"
                label={t`${selectedProtocol} server`}
                value={connection.draft.host ?? ''}
                disabled
              />
            )}
          </Section>
          <Section>
            <div role="status" aria-label={t`Mailbox connection pending`}>
              <Status
                color="yellow"
                text={t`Testing connection`}
                isLoaderVisible
              />
            </div>
            <Button
              title={t`Resolve connection result`}
              variant="secondary"
              onClick={actions.onResolveMailboxConnection}
            />
          </Section>
        </>
      )}

      {connection.operation.status === 'failed' && (
        <Section>
          <div role="alert">
            <Info
              accent="danger"
              text={
                connection.operation.safeDiagnostic === undefined
                  ? t`Authentication failed. Re-enter the password and try again.`
                  : i18n._(
                      getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage(
                        connection.operation.safeDiagnostic,
                      ),
                    )
              }
            />
          </div>
          <Button
            ref={retryConnectionButtonRef}
            title={t`Retry connection`}
            variant="primary"
            onClick={actions.onRetryMailboxConnection}
          />
        </Section>
      )}

      {connection.operation.status === 'unknown' && (
        <Section>
          <div role="alert">
            <Info
              accent="danger"
              text={
                connection.operation.safeDiagnostic === undefined
                  ? t`The connection result is unknown. Reconcile it before trying again.`
                  : i18n._(
                      getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage(
                        connection.operation.safeDiagnostic,
                      ),
                    )
              }
            />
          </div>
          <Button
            ref={reconcileConnectionButtonRef}
            title={t`Reconcile connection`}
            variant="primary"
            onClick={actions.onReconcileMailboxConnection}
          />
        </Section>
      )}

      {isFormVisible && (
        <form onSubmit={onSubmit}>
          <fieldset disabled={isTesting}>
            <SettingsAccountsConnectionForm
              control={control}
              isEditing={connection.mode === 'edit'}
              isEmailAddressDisabled={isConnectionIdentityBound}
              isProtocolSelectionDisabled={
                isConnectionIdentityBound && selectedProtocol != null
              }
              existingProtocols={
                existingProtocol !== null && !connection.requiresFreshPassword
                  ? [existingProtocol]
                  : []
              }
              protocolSelection={{
                selectedProtocol: selectedProtocol ?? null,
                onSelectedProtocolChange,
              }}
            />
          </fieldset>
          <Section>
            <Info
              text={t`This Storybook form uses local React Hook Form state only. Submitted credentials are not stored or sent, and no provider or mutation is called.`}
            />
            {selectedProtocol === 'SMTP' && !canSend && (
              <Info accent="danger" text={sendingCapabilityText} />
            )}
            <Button
              title={t`Connect mailbox locally`}
              type="submit"
              variant="primary"
              disabled={
                isTesting ||
                (connection.requiresFreshPassword && !hasConfiguredPassword)
              }
            />
          </Section>
        </form>
      )}

      <FlowNavigation
        onBack={onBack}
        onCancel={actions.onCancel}
        disabled={isTesting || connection.operation.status === 'unknown'}
      />

      <ConfirmationModal
        modalInstanceId={MAILBOX_CONNECTION_BACK_MODAL_ID}
        title={t`Discard connection passwords?`}
        subtitle={t`Going back keeps the address and connection settings but clears every password.`}
        confirmButtonText={t`Discard passwords and go back`}
        onConfirmClick={() => {
          persistScrubbedDraft();
          reset(
            createConnectionFormDefaultValues({
              ...connection.draft,
              selectedProtocol,
            }),
          );
          returnToMailboxSource();
        }}
      />
    </>
  );
};

const PrewarmedInventoryScreen = ({
  state,
  actions,
}: PrewarmedInventoryScreenProps) => {
  const { t } = useLingui();

  const bundleOptions = state.workspace.prewarmedBundles.map((bundle) => ({
    bundle,
    conflictMessage: getManagedEmailDesignBundleConflictMessage(
      bundle,
      state.workspace,
    ),
  }));
  const selectableBundles = bundleOptions.filter(
    ({ conflictMessage }) => conflictMessage === null,
  );
  const selectedBundleIsSelectable = selectableBundles.some(
    ({ bundle }) => bundle.id === state.selectedPrewarmedBundle?.id,
  );
  const bundleCards = bundleOptions.map(({ bundle, conflictMessage }) => (
    <Section key={bundle.id}>
      {conflictMessage === null ? (
        <CardPicker aria-label={bundle.domain} value={bundle.id}>
          <div>
            <strong>{bundle.domain}</strong>
            <p>{t`Complete fixed mailbox identities`}</p>
            <ul>
              {bundle.mailboxIdentities.map((mailbox) => (
                <li key={mailbox.address}>
                  {t`${mailbox.identity} — ${mailbox.address}`}
                </li>
              ))}
            </ul>
            <Status color="green" text={t`Ready for local assignment`} />
            <p>{t`Available in local inventory`}</p>
            <p>
              {t`${formatManagedEmailDesignUsd(managedEmailDesignPricing.managedDomainAnnualCents)} annually for the domain`}
            </p>
            <p>
              {t`${formatManagedEmailDesignUsd(managedEmailDesignPricing.managedMailboxMonthlyCents)} monthly per mailbox`}
            </p>
          </div>
        </CardPicker>
      ) : (
        <Card fullWidth rounded>
          <CardHeader>{bundle.domain}</CardHeader>
          <CardContent>
            <Status color="red" text={t`Unavailable in this inventory`} />
            <Info accent="danger" text={conflictMessage} />
          </CardContent>
        </Card>
      )}
    </Section>
  ));

  return (
    <>
      <Section>
        <H2Title
          title={t`Choose a prewarmed mailbox bundle`}
          description={t`Choose one complete, fixed domain-and-mailbox bundle. Identities cannot be removed, mixed, or merged.`}
        />
        <Info
          text={t`Prewarmed inventory is local Storybook fixture state. Selecting or completing a bundle does not purchase, provision, or start ongoing warmup.`}
        />
      </Section>

      {selectableBundles.length > 0 ? (
        <RadioGroup<string | null>
          aria-label={t`Prewarmed mailbox bundle`}
          value={state.selectedPrewarmedBundle?.id ?? null}
          onValueChange={(bundleId) => {
            if (bundleId === null) {
              return;
            }

            const selectedBundle = selectableBundles.find(
              ({ bundle }) => bundle.id === bundleId,
            )?.bundle;

            if (selectedBundle) {
              actions.onSelectedPrewarmedBundleChange(selectedBundle);
            }
          }}
        >
          {bundleCards}
        </RadioGroup>
      ) : (
        bundleCards
      )}

      <Section>
        {selectableBundles.length === 0 ? (
          <>
            <Info
              text={
                bundleOptions.length === 0
                  ? t`No prewarmed bundles are available. Create a managed mailbox or connect an existing mailbox instead.`
                  : t`No complete prewarmed bundle is selectable because of the listed local-inventory collisions. Create a managed mailbox or connect an existing mailbox instead.`
              }
            />
            <Button
              title={t`Create a managed mailbox`}
              variant="primary"
              onClick={() => actions.onUseMailboxAcquisitionSource('create')}
            />
            <Button
              title={t`Connect an existing mailbox`}
              variant="secondary"
              onClick={() => actions.onUseMailboxAcquisitionSource('connect')}
            />
          </>
        ) : (
          <Button
            title={t`Review selected bundle`}
            variant="primary"
            disabled={!selectedBundleIsSelectable}
            onClick={actions.onReviewSelectedPrewarmedBundle}
          />
        )}
      </Section>

      <FlowNavigation onBack={actions.onBack} onCancel={actions.onCancel} />
    </>
  );
};

type ManagedEmailDesignTranslate = (descriptor: MessageDescriptor) => string;

const getReviewQuoteService = ({
  reviewDraft,
  line,
  translate,
}: {
  reviewDraft: ManagedEmailDesignReviewDraft;
  line: ManagedEmailDesignQuoteLine;
  translate: ManagedEmailDesignTranslate;
}) => {
  if (line.product === 'managed-warmup') {
    return translate(msg`Managed warmup capacity`);
  }

  if (line.product === 'managed-domain') {
    return reviewDraft.kind === 'prewarmed-bundle'
      ? translate(msg`Prewarmed bundle domain`)
      : translate(msg`Myah-managed sending domain`);
  }

  return reviewDraft.kind === 'prewarmed-bundle'
    ? translate(msg`Prewarmed managed mailbox`)
    : translate(msg`Managed mailbox`);
};

const getReviewQuoteResource = ({
  reviewDraft,
  line,
  translate,
}: {
  reviewDraft: ManagedEmailDesignReviewDraft;
  line: ManagedEmailDesignQuoteLine;
  translate: ManagedEmailDesignTranslate;
}) => {
  if (
    line.product === 'managed-warmup' &&
    reviewDraft.kind !== 'prewarmed-bundle' &&
    reviewDraft.selectedMailbox !== null
  ) {
    return translate(
      msg`${reviewDraft.selectedMailbox}, ${line.resourceLabel}`,
    );
  }

  return line.resourceLabel;
};

const getAcquisitionOutcomeLabel = ({
  outcome,
  label,
  translate,
}: {
  outcome: 'blocked' | 'pending' | 'completed' | 'failed' | 'unknown';
  label: string;
  translate: ManagedEmailDesignTranslate;
}) => {
  const outcomeLabel =
    outcome === 'blocked'
      ? translate(msg`Blocked`)
      : outcome === 'pending'
        ? translate(msg`Pending`)
        : outcome === 'completed'
          ? translate(msg`Completed`)
          : outcome === 'failed'
            ? translate(msg`Failed`)
            : translate(msg`Unknown`);

  return translate(msg`${label} ${outcomeLabel}`);
};

const getManagedEmailDesignAcquisitionRecoveryCopy = ({
  kind,
  outcome,
  translate,
}: {
  kind: 'payment' | 'subscription' | 'resource';
  outcome: ManagedEmailDesignAcquisitionLine['resourceOutcome'] | null;
  translate: ManagedEmailDesignTranslate;
}) => {
  const label =
    kind === 'payment'
      ? translate(msg`Payment`)
      : kind === 'subscription'
        ? translate(msg`Subscription`)
        : translate(msg`Resource`);
  const lowerCaseLabel =
    kind === 'payment'
      ? translate(msg`payment`)
      : kind === 'subscription'
        ? translate(msg`subscription`)
        : translate(msg`resource`);

  if (outcome === 'failed') {
    return {
      title: translate(msg`${label} could not be completed`),
      diagnostic:
        kind === 'payment'
          ? translate(
              msg`The local payment evidence was declined. Your selection is still available and the affected resource was not created.`,
            )
          : kind === 'subscription'
            ? translate(
                msg`The local subscription result could not be completed. Your selection is still available, and resources for the affected subscription were not created.`,
              )
            : translate(
                msg`The local resource result could not be completed. Your selection is still available, and the affected resource was not created.`,
              ),
      actionTitle: translate(msg`Retry same operation`),
      action: 'retry' as const,
    };
  }

  if (outcome === 'unknown') {
    return {
      title: translate(msg`${label} status needs reconciliation`),
      diagnostic:
        kind === 'payment'
          ? translate(
              msg`The local payment result is unknown. Reconcile it before completing this review.`,
            )
          : translate(
              msg`The local ${lowerCaseLabel} result is unknown. Reconcile it before completing this review.`,
            ),
      actionTitle: translate(msg`Reconcile ${lowerCaseLabel} result`),
      action: 'reconcile' as const,
    };
  }

  if (outcome === 'pending') {
    return {
      title: translate(msg`${label} is being processed`),
      diagnostic:
        kind === 'payment'
          ? translate(
              msg`Local payment evidence is pending. The affected resource is not created until the payment result is resolved.`,
            )
          : translate(
              msg`Local ${lowerCaseLabel} result is pending. The affected resource is not created until the ${lowerCaseLabel} result is resolved.`,
            ),
      actionTitle: translate(msg`Resolve ${lowerCaseLabel} result`),
      action: 'reconcile' as const,
    };
  }

  return null;
};

const ReviewScreen = ({ state, actions }: ReviewScreenProps) => {
  const { i18n, t } = useLingui();
  const translate: ManagedEmailDesignTranslate = (descriptor) =>
    i18n._(descriptor);
  const paymentRecoveryButtonRef = useRef<HTMLButtonElement>(null);
  const completeReviewButtonRef = useRef<HTMLButtonElement>(null);
  // Track one post-result focus restoration without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const pendingPaymentRecoveryFocusRef = useRef(false);
  // Preserve the post-result focus target without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const quoteAcceptanceFocusTargetRef = useRef<
    'refreshed' | 'recovered' | null
  >(null);

  useEffect(() => {
    if (
      !pendingPaymentRecoveryFocusRef.current ||
      state.isReviewPaymentSubmitting
    ) {
      return;
    }

    paymentRecoveryButtonRef.current?.focus();
    pendingPaymentRecoveryFocusRef.current = false;
  }, [state.acquisitionOperation.status, state.isReviewPaymentSubmitting]);

  useEffect(() => {
    const focusTarget = quoteAcceptanceFocusTargetRef.current;
    const isAcceptedActionStillVisible =
      focusTarget === 'refreshed'
        ? state.isRefreshedReviewQuoteVisible
        : focusTarget === 'recovered'
          ? state.isRecoveredMailboxCapacityReviewVisible
          : false;

    if (focusTarget === null || isAcceptedActionStillVisible) {
      return;
    }

    if (!completeReviewButtonRef.current?.disabled) {
      completeReviewButtonRef.current?.focus();
    }
    quoteAcceptanceFocusTargetRef.current = null;
  }, [
    state.isRecoveredMailboxCapacityReviewVisible,
    state.isRefreshedReviewQuoteVisible,
  ]);

  useEffect(() => {
    if (state.reviewStockConflict === null) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      document
        .getElementById('managed-email-review-return-to-inventory')
        ?.focus();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [state.reviewStockConflict]);

  const isCompactLayout = useMediaQuery({
    query: `(max-width: ${COMPACT_LAYOUT_MAX_VIEWPORT}px)`,
  });
  const reviewDraft = state.reviewDraft;

  if (reviewDraft === null) {
    return (
      <Section>
        <H2Title
          title={t`Review unavailable`}
          description={t`Choose a local fixture resource before reviewing it.`}
        />
        <Info
          accent="danger"
          text={t`No local review draft is available. Return to the dashboard and start a revised acquisition path.`}
        />
        <Button
          title={t`Return to dashboard`}
          variant="primary"
          onClick={actions.onCancel}
        />
      </Section>
    );
  }

  const reviewQuote = state.reviewQuote;

  if (reviewQuote === null) {
    return (
      <Section>
        <H2Title
          title={t`Review unavailable`}
          description={t`Choose a local fixture resource before reviewing it.`}
        />
        <Info
          accent="danger"
          text={t`No local quote is available. Return to the dashboard and start a revised acquisition path.`}
        />
        <Button
          title={t`Return to dashboard`}
          variant="primary"
          onClick={actions.onCancel}
        />
      </Section>
    );
  }

  const operation = state.acquisitionOperation;
  const annualQuoteLine = reviewQuote.lines.find(
    (line) => line.cadence === 'annual',
  );
  const annualRenewalDate = formatManagedEmailDesignJourneyDate(
    annualQuoteLine?.renewsAt,
    i18n.locale,
  );
  const annualEffectiveDate = formatManagedEmailDesignJourneyDate(
    annualQuoteLine?.startsAt,
    i18n.locale,
  );
  const monthlyQuoteLine = reviewQuote.lines.find(
    (line) => line.cadence === 'monthly',
  );
  const monthlyRenewalDate = formatManagedEmailDesignJourneyDate(
    monthlyQuoteLine?.renewsAt,
    i18n.locale,
  );
  const monthlyEffectiveDate = formatManagedEmailDesignJourneyDate(
    monthlyQuoteLine?.startsAt,
    i18n.locale,
  );
  const prewarmedAnnualDomainIdentity =
    reviewDraft.kind === 'prewarmed-bundle'
      ? reviewQuote.lines.find((line) => line.cadence === 'annual')
          ?.resourceLabel
      : undefined;
  const prewarmedMonthlyMailboxIdentities =
    reviewDraft.kind === 'prewarmed-bundle'
      ? reviewQuote.lines
          .filter((line) => line.cadence === 'monthly')
          .map((line) => line.resourceLabel)
      : [];

  const reviewAmount = formatManagedEmailDesignUsd(
    reviewQuote.totals.dueTodayCents,
  );
  const isQuoteBlocked =
    reviewQuote.status === 'expired' || reviewQuote.status === 'price-changed';
  const refreshedReviewQuote = state.isRefreshedReviewQuoteVisible
    ? state.refreshedReviewQuote
    : null;
  const isFreshReviewQuoteVisible = refreshedReviewQuote !== null;
  const isRecoveredMailboxQuoteAcceptancePending =
    state.hasRecoveredMailboxCapacityReview &&
    reviewQuote.acceptedQuoteId !== reviewQuote.id;
  const recoveredMailboxCount =
    reviewQuote.capacityRequest?.intent.product === 'managed-mailbox'
      ? Math.max(
          0,
          reviewQuote.capacityRequest.intent.resourceSnapshotIds.length - 1,
        )
      : 0;
  const isOperationBlocked =
    state.isReviewPaymentSubmitting ||
    operation.status === 'failed' ||
    operation.status === 'partial' ||
    operation.status === 'reconciliation-required' ||
    operation.status === 'pending';
  const canComplete =
    state.canCompleteReview &&
    !isQuoteBlocked &&
    !isOperationBlocked &&
    state.reviewStockConflict === null &&
    !isRecoveredMailboxQuoteAcceptancePending;
  const previousQuote =
    reviewQuote.status === 'price-changed' ? reviewQuote.previousQuote : null;
  const previousAnnualRenewalDate = formatManagedEmailDesignJourneyDate(
    previousQuote?.lines.find((line) => line.cadence === 'annual')?.renewsAt,
    i18n.locale,
  );
  const previousMonthlyRenewalDate = formatManagedEmailDesignJourneyDate(
    previousQuote?.lines.find((line) => line.cadence === 'monthly')?.renewsAt,
    i18n.locale,
  );
  const acquisitionSubscriptionsById = new Map(
    operation.status === 'idle'
      ? []
      : operation.subscriptionOperations.map((subscriptionOperation) => [
          subscriptionOperation.id,
          subscriptionOperation,
        ]),
  );
  const acquisitionLinesById = new Map(
    operation.status === 'idle'
      ? []
      : operation.lines.map((line) => [line.id, line]),
  );
  const prewarmedFulfillmentRows =
    operation.status === 'idle'
      ? []
      : operation.lines.map((line) => {
          const quoteLine = reviewQuote.lines.find(
            (candidate) => candidate.id === line.quoteLineId,
          );
          const subscriptionOperation = acquisitionSubscriptionsById.get(
            line.subscriptionOperationId,
          );
          const dependencyOutcomes = line.dependsOnLineIds.map(
            (dependencyId) => {
              const dependencyLine = acquisitionLinesById.get(dependencyId);
              if (dependencyLine === undefined) {
                return 'blocked' as const;
              }
              if (dependencyLine.paymentOutcome !== 'completed') {
                return dependencyLine.paymentOutcome;
              }
              const dependencySubscription = acquisitionSubscriptionsById.get(
                dependencyLine.subscriptionOperationId,
              );
              if (
                dependencySubscription?.outcome !== undefined &&
                dependencySubscription.outcome !== 'completed'
              ) {
                return dependencySubscription.outcome;
              }
              return dependencyLine.resourceOutcome;
            },
          );
          const dependencyOutcome =
            dependencyOutcomes.find((outcome) => outcome !== 'completed') ??
            'completed';
          const resourceLabel =
            quoteLine?.resourceLabel ?? t`Resource unavailable`;
          const resource =
            resourceLabel.match(/<([^>]+)>$/)?.[1] ?? resourceLabel;
          const isPooledMailbox =
            quoteLine?.product === 'managed-mailbox' &&
            reviewDraft.kind === 'prewarmed-bundle';

          return {
            id: line.id,
            resource,
            dependency:
              line.dependsOnLineIds.length === 0
                ? t`No dependency`
                : getAcquisitionOutcomeLabel({
                    outcome: dependencyOutcome,
                    label: t`Domain dependency`,
                    translate,
                  }),
            payment: getAcquisitionOutcomeLabel({
              outcome: line.paymentOutcome,
              label: t`Payment`,
              translate,
            }),
            subscription: getAcquisitionOutcomeLabel({
              outcome: subscriptionOperation?.outcome ?? 'blocked',
              label: isPooledMailbox ? t`Pooled subscription` : t`Subscription`,
              translate,
            }),
            resourceState: getAcquisitionOutcomeLabel({
              outcome: line.resourceOutcome,
              label: t`Resource`,
              translate,
            }),
          };
        });
  const prewarmedMailboxLines =
    operation.status === 'idle' || reviewDraft.kind !== 'prewarmed-bundle'
      ? []
      : operation.lines.filter(
          (line) =>
            reviewQuote.lines.find(
              (quoteLine) => quoteLine.id === line.quoteLineId,
            )?.product === 'managed-mailbox',
        );
  const pooledMailboxSubscriptionIsComplete =
    prewarmedMailboxLines.length > 0 &&
    prewarmedMailboxLines.every(
      (line) =>
        acquisitionSubscriptionsById.get(line.subscriptionOperationId)
          ?.outcome === 'completed',
    );
  const pooledMailboxHasIncompleteDependency = prewarmedMailboxLines.some(
    (line) =>
      line.dependsOnLineIds.some(
        (dependencyId) =>
          acquisitionLinesById.get(dependencyId)?.resourceOutcome !==
          'completed',
      ),
  );
  const pooledMailboxStatusCopy = pooledMailboxSubscriptionIsComplete
    ? pooledMailboxHasIncompleteDependency
      ? t`The pooled mailbox subscription is complete. Mailbox resources remain blocked until the domain dependency is complete.`
      : t`The pooled mailbox subscription is complete. Review the resource states above for remaining fulfillment work.`
    : t`The pooled mailbox subscription remains blocked until every mailbox payment is complete.`;
  const recoveryTargetOutcome =
    operation.status === 'reconciliation-required'
      ? 'unknown'
      : operation.status === 'pending'
        ? 'pending'
        : undefined;
  const firstActionableRetryItem =
    operation.status === 'idle'
      ? null
      : (getManagedEmailDesignAcquisitionRetryOrder(
          operation,
          recoveryTargetOutcome,
        )[0] ?? null);
  let firstActionableRetryOutcome:
    | ManagedEmailDesignAcquisitionLine['resourceOutcome']
    | null = null;

  if (operation.status !== 'idle' && firstActionableRetryItem !== null) {
    switch (firstActionableRetryItem.kind) {
      case 'payment':
        firstActionableRetryOutcome =
          operation.lines.find(
            (line) => line.paymentEvidenceId === firstActionableRetryItem.id,
          )?.paymentOutcome ?? null;
        break;
      case 'subscription':
        firstActionableRetryOutcome =
          operation.subscriptionOperations.find(
            (subscriptionOperation) =>
              subscriptionOperation.id === firstActionableRetryItem.id,
          )?.outcome ?? null;
        break;
      case 'resource':
        firstActionableRetryOutcome =
          operation.lines.find(
            (line) => line.resourceOperationId === firstActionableRetryItem.id,
          )?.resourceOutcome ?? null;
        break;
    }
  }

  const acquisitionRecovery =
    firstActionableRetryItem === null
      ? null
      : getManagedEmailDesignAcquisitionRecoveryCopy({
          kind: firstActionableRetryItem.kind,
          outcome: firstActionableRetryOutcome,
          translate,
        });
  const selectedMailboxLines = reviewDraft.lines.filter(
    (line) => line.product === 'managed-mailbox',
  );

  return (
    <>
      <Section>
        <H2Title
          title={i18n._(reviewDraft.title)}
          description={i18n._(reviewDraft.description)}
        />
      </Section>

      <Section>
        <Card fullWidth rounded>
          <CardHeader>{t`Selected resources`}</CardHeader>
          <CardContent>
            <p>
              {reviewDraft.selectedDomain === null
                ? t`Managed domain: No managed domain service selected`
                : t`Domain: ${reviewDraft.selectedDomain}`}
            </p>
            <p>
              {reviewDraft.selectedMailbox === null ? (
                t`Managed mailbox: No managed mailbox service selected`
              ) : (
                <>
                  {t`Mailbox:`}{' '}
                  {selectedMailboxLines.map((line, index) => (
                    <Fragment key={line.id}>
                      {index > 0 && ', '}
                      <span>{line.resource}</span>
                    </Fragment>
                  ))}
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </Section>

      <section aria-label={t`Review charges`}>
        <Section>
          {isCompactLayout ? (
            reviewQuote.lines.map((line) => (
              <section
                key={line.id}
                aria-label={t`Review charge for ${getReviewQuoteResource({
                  reviewDraft,
                  line,
                  translate,
                })}`}
              >
                <Card fullWidth rounded>
                  <CardHeader>
                    {getReviewQuoteService({ reviewDraft, line, translate })}
                  </CardHeader>
                  <CardContent>
                    <p>
                      {t`Resource: ${getReviewQuoteResource({
                        reviewDraft,
                        line,
                        translate,
                      })}`}
                    </p>
                    <p>
                      {line.cadence === 'annual'
                        ? t`Cadence: Annual`
                        : t`Cadence: Monthly`}
                    </p>
                    <p>
                      {t`Unit price: ${formatManagedEmailDesignUsd(line.unitPriceCents)}`}
                    </p>
                    <p>{t`Quantity: ${line.quantity}`}</p>
                    <p>
                      {t`Amount: ${formatManagedEmailDesignUsd(line.amountCents)}`}
                    </p>
                  </CardContent>
                </Card>
              </section>
            ))
          ) : (
            <Table
              role="table"
              aria-label={t`Charges included in this purchase review`}
            >
              <TableRow
                role="row"
                gridTemplateColumns={PURCHASE_REVIEW_GRID_TEMPLATE_COLUMNS}
                height="auto"
              >
                <TableHeader role="columnheader">{t`Service`}</TableHeader>
                <TableHeader role="columnheader">{t`Resource`}</TableHeader>
                <TableHeader role="columnheader">{t`Cadence`}</TableHeader>
                <TableHeader role="columnheader">{t`Unit price`}</TableHeader>
                <TableHeader role="columnheader">{t`Quantity`}</TableHeader>
                <TableHeader role="columnheader" align="right">
                  {t`Amount`}
                </TableHeader>
              </TableRow>
              <TableBody role="rowgroup">
                {reviewQuote.lines.map((line) => (
                  <TableRow
                    key={line.id}
                    role="row"
                    gridTemplateColumns={PURCHASE_REVIEW_GRID_TEMPLATE_COLUMNS}
                    height="auto"
                  >
                    <TableCell role="cell" height="auto">
                      <strong>
                        {getReviewQuoteService({
                          reviewDraft,
                          line,
                          translate,
                        })}
                      </strong>
                    </TableCell>
                    <TableCell role="cell" height="auto">
                      {getReviewQuoteResource({ reviewDraft, line, translate })}
                    </TableCell>
                    <TableCell role="cell" height="auto">
                      {line.cadence === 'annual' ? t`Annual` : t`Monthly`}
                    </TableCell>
                    <TableCell role="cell" height="auto">
                      {formatManagedEmailDesignUsd(line.unitPriceCents)}
                    </TableCell>
                    <TableCell role="cell" height="auto">
                      {line.quantity}
                    </TableCell>
                    <TableCell role="cell" height="auto" align="right">
                      {formatManagedEmailDesignUsd(line.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </section>

      <Section>
        <Card fullWidth rounded>
          <CardHeader>{t`Amount due today`}</CardHeader>
          <CardContent>
            <p>{t`Due today: ${reviewAmount}`}</p>
            {reviewDraft.kind === 'prewarmed-bundle' &&
              annualEffectiveDate !== undefined && (
                <p>{t`Annual effective date: ${annualEffectiveDate}`}</p>
              )}
            {annualRenewalDate !== undefined && (
              <>
                <p>
                  {t`Renews annually: ${formatManagedEmailDesignUsd(reviewQuote.totals.annualRecurringCents)} on ${annualRenewalDate}`}
                </p>
                {prewarmedAnnualDomainIdentity !== undefined && (
                  <p>
                    {t`Included annual domain: ${prewarmedAnnualDomainIdentity}`}
                  </p>
                )}
              </>
            )}
            {monthlyRenewalDate !== undefined && (
              <>
                {reviewDraft.kind === 'prewarmed-bundle' &&
                  monthlyEffectiveDate !== undefined && (
                    <p>{t`Monthly effective date: ${monthlyEffectiveDate}`}</p>
                  )}
                <p>
                  {t`Renews monthly: ${formatManagedEmailDesignUsd(reviewQuote.totals.monthlyRecurringCents)} on ${monthlyRenewalDate}`}
                </p>
                {prewarmedMonthlyMailboxIdentities.length > 0 && (
                  <p>
                    {t`Included monthly mailboxes: ${prewarmedMonthlyMailboxIdentities.join(', ')}`}
                  </p>
                )}
              </>
            )}
            {reviewDraft.kind === 'prewarmed-bundle' && (
              <p>
                {t`Bundled readiness applies at delivery to the included prewarmed resources; it is not ongoing warmup capacity.`}
              </p>
            )}
            <p>
              {t`Only the listed annual or monthly resources renew at the shown amount and cadence.`}
            </p>
          </CardContent>
        </Card>
      </Section>

      {reviewQuote.capacityRequest?.intent.product === 'managed-mailbox' &&
        reviewQuote.capacityRequest.intent.mode ===
          'attach-existing-capacity' && (
          <Section>
            <Info
              text={t`Covered by existing capacity. This mailbox uses one paid spare pool slot and adds no local charge.`}
            />
          </Section>
        )}

      {reviewQuote.capacityRequest?.intent.product === 'managed-warmup' &&
        reviewQuote.capacityRequest.intent.mode === 'create' && (
          <Section>
            <Info
              text={plural(reviewQuote.capacityRequest.intent.quantityDelta, {
                one: `This first capacity purchase creates # requested warmup slot and does not start warmup.`,
                other: `This first capacity purchase creates # requested warmup slots and does not start warmup.`,
              })}
            />
          </Section>
        )}

      {reviewQuote.status === 'expired' && !isFreshReviewQuoteVisible && (
        <Section>
          <Info
            accent="danger"
            text={t`This quote expired. Refresh it before completing this local review.`}
          />
        </Section>
      )}

      {reviewQuote.status === 'price-changed' &&
        previousQuote !== null &&
        !isFreshReviewQuoteVisible && (
          <Section>
            <Info accent="danger" text={t`Price changed before completion.`} />
            <p>
              {t`Previous due today: ${formatManagedEmailDesignUsd(previousQuote.totals.dueTodayCents)}`}
            </p>
            {previousAnnualRenewalDate !== undefined && (
              <p>
                {t`Previous annual renewal: ${formatManagedEmailDesignUsd(previousQuote.totals.annualRecurringCents)} on ${previousAnnualRenewalDate}`}
              </p>
            )}
            {previousMonthlyRenewalDate !== undefined && (
              <p>
                {t`Previous monthly renewal: ${formatManagedEmailDesignUsd(previousQuote.totals.monthlyRecurringCents)} on ${previousMonthlyRenewalDate}`}
              </p>
            )}
            <p>{t`New due today: ${reviewAmount}`}</p>
          </Section>
        )}

      {isQuoteBlocked && (
        <Section>
          <Button
            title={t`Refresh quote`}
            variant="secondary"
            onClick={actions.onRefreshReviewQuote}
          />
          {refreshedReviewQuote !== null && (
            <Button
              title={t`Accept refreshed quote — ${formatManagedEmailDesignUsd(refreshedReviewQuote.totals.dueTodayCents)}`}
              variant="primary"
              onClick={() => {
                quoteAcceptanceFocusTargetRef.current = 'refreshed';
                actions.onAcceptRefreshedReviewQuote();
              }}
            />
          )}
        </Section>
      )}

      {state.reviewStockConflict !== null && (
        <Section>
          <Info accent="danger" text={state.reviewStockConflict.message} />
          <Button
            id="managed-email-review-return-to-inventory"
            title={t`Return to inventory`}
            variant="secondary"
            onClick={actions.onReturnToPrewarmedInventory}
          />
        </Section>
      )}

      {state.isReviewPaymentSubmitting && operation.status !== 'idle' && (
        <Section>
          <H2Title
            title={t`Submitting local payment`}
            description={t`The local Storybook payment submission is open and has not settled.`}
          />
          <StyledStoryEvidenceOutput
            aria-hidden="true"
            aria-label={t`Payment submission status`}
          >
            {t`Submitting`}
          </StyledStoryEvidenceOutput>
          <Info
            text={t`No local resource has been created. Resolve the configured local payment result before this review can continue.`}
          />
          <Info text={t`Purchase reference: ${operation.id}`} />
          <StyledStoryEvidenceOutput
            aria-hidden="true"
            aria-label={t`Purchase reference`}
          >
            {operation.id}
          </StyledStoryEvidenceOutput>
          <Button
            title={t`Resolve configured local payment result`}
            variant="secondary"
            onClick={() => {
              pendingPaymentRecoveryFocusRef.current = true;
              actions.onResolveSubmittedReviewPayment();
            }}
          />
        </Section>
      )}

      {!state.isReviewPaymentSubmitting && acquisitionRecovery !== null && (
        <Section>
          <H2Title title={acquisitionRecovery.title} />
          {firstActionableRetryOutcome === 'pending' ? (
            <Info text={acquisitionRecovery.diagnostic} />
          ) : (
            <Info accent="danger" text={acquisitionRecovery.diagnostic} />
          )}
          {operation.status !== 'idle' && operation.source !== 'prewarmed' && (
            <>
              <Info text={t`Purchase reference: ${operation.id}`} />
              <StyledStoryEvidenceOutput
                aria-hidden="true"
                aria-label={t`Purchase reference`}
              >
                {operation.id}
              </StyledStoryEvidenceOutput>
            </>
          )}
          <Button
            ref={paymentRecoveryButtonRef}
            title={acquisitionRecovery.actionTitle}
            variant="secondary"
            onClick={
              acquisitionRecovery.action === 'retry'
                ? actions.onRetryAcquisitionOperation
                : actions.onReconcileAcquisitionOperation
            }
          />
        </Section>
      )}

      {!state.isReviewPaymentSubmitting &&
        operation.source === 'prewarmed' &&
        (operation.status === 'failed' ||
          operation.status === 'partial' ||
          operation.status === 'pending' ||
          operation.status === 'reconciliation-required') && (
          <Section>
            <H2Title title={t`Prewarmed fulfillment needs attention`} />
            {isCompactLayout ? (
              <StyledFulfillmentProgressCards
                aria-label={t`Prewarmed fulfillment progress`}
              >
                {prewarmedFulfillmentRows.map((fulfillmentRow) => (
                  <StyledFulfillmentProgressCard
                    key={fulfillmentRow.id}
                    fullWidth
                    rounded
                    role="article"
                    aria-label={t`Prewarmed fulfillment for ${fulfillmentRow.resource}`}
                  >
                    <CardHeader>
                      <StyledFulfillmentProgressTitle>
                        {fulfillmentRow.resource}
                      </StyledFulfillmentProgressTitle>
                    </CardHeader>
                    <CardContent>
                      <StyledFulfillmentProgressDetails>
                        <div>
                          <dt>{t`Resource`}</dt>
                          <dd>{fulfillmentRow.resource}</dd>
                        </div>
                        <div>
                          <dt>{t`Dependency`}</dt>
                          <dd>{fulfillmentRow.dependency}</dd>
                        </div>
                        <div>
                          <dt>{t`Payment`}</dt>
                          <dd>{fulfillmentRow.payment}</dd>
                        </div>
                        <div>
                          <dt>{t`Subscription`}</dt>
                          <dd>{fulfillmentRow.subscription}</dd>
                        </div>
                        <div>
                          <dt>{t`Resource state`}</dt>
                          <dd>{fulfillmentRow.resourceState}</dd>
                        </div>
                      </StyledFulfillmentProgressDetails>
                    </CardContent>
                  </StyledFulfillmentProgressCard>
                ))}
              </StyledFulfillmentProgressCards>
            ) : (
              <Table
                role="table"
                aria-label={t`Prewarmed fulfillment progress`}
              >
                <TableRow role="row" gridAutoColumns="minmax(0, 1fr)">
                  <TableHeader role="columnheader">{t`Resource`}</TableHeader>
                  <TableHeader role="columnheader">{t`Dependency`}</TableHeader>
                  <TableHeader role="columnheader">{t`Payment`}</TableHeader>
                  <TableHeader role="columnheader">{t`Subscription`}</TableHeader>
                  <TableHeader role="columnheader">
                    {t`Resource state`}
                  </TableHeader>
                </TableRow>
                <TableBody role="rowgroup">
                  {prewarmedFulfillmentRows.map((fulfillmentRow) => (
                    <TableRow
                      key={fulfillmentRow.id}
                      role="row"
                      gridAutoColumns="minmax(0, 1fr)"
                    >
                      <TableCell role="cell" height="auto">
                        {fulfillmentRow.resource}
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        {fulfillmentRow.dependency}
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        {fulfillmentRow.payment}
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        {fulfillmentRow.subscription}
                      </TableCell>
                      <TableCell role="cell" height="auto">
                        {fulfillmentRow.resourceState}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Info text={pooledMailboxStatusCopy} />
            <Info text={t`Purchase reference: ${operation.id}`} />
            <StyledStoryEvidenceOutput
              aria-hidden="true"
              aria-label={t`Purchase reference`}
            >
              {operation.id}
            </StyledStoryEvidenceOutput>
            <StyledStoryEvidenceOutput
              aria-hidden="true"
              aria-label={t`Recorded local charge count`}
            >
              {
                operation.lines.filter(
                  (line) => line.paymentOutcome === 'completed',
                ).length
              }
            </StyledStoryEvidenceOutput>
            {acquisitionRecovery === null && (
              <Button
                title={t`Retry same operation`}
                variant="secondary"
                onClick={actions.onRetryAcquisitionOperation}
              />
            )}
          </Section>
        )}

      {state.hasRecoveredMailboxCapacityReview && (
        <Section>
          <Button
            title={t`Review recovered mailbox capacity`}
            variant="secondary"
            onClick={actions.onReviewRecoveredMailboxCapacity}
          />
          {state.isRecoveredMailboxCapacityReviewVisible && (
            <>
              <p>
                {plural(recoveredMailboxCount, {
                  one: `Canceled mailbox history leaves # live mailbox uncovered. This refreshed quote includes it and the new mailbox.`,
                  other: `Canceled mailbox history leaves # live mailboxes uncovered. This refreshed quote includes them and the new mailbox.`,
                })}
              </p>
              <Button
                title={t`Accept recovered quote — ${reviewAmount}`}
                variant="primary"
                onClick={() => {
                  quoteAcceptanceFocusTargetRef.current = 'recovered';
                  actions.onAcceptRecoveredMailboxQuote();
                }}
              />
            </>
          )}
        </Section>
      )}

      <Section>
        <p>
          {t`Completing this Storybook review changes only local fixture state. No purchase, subscription quantity change, provider call, DNS check, mailbox provisioning, warmup operation, or production resource change occurs.`}
        </p>
        <Button
          ref={completeReviewButtonRef}
          title={t`Complete locally — ${reviewAmount}`}
          variant="primary"
          disabled={!canComplete}
          onClick={actions.onCompleteReview}
        />
      </Section>

      <FlowNavigation
        onBack={actions.onBack}
        onCancel={actions.onCancel}
        cancelTitle={t`Cancel review`}
      />
    </>
  );
};

export const ManagedEmailDesignJourney = ({
  state,
  actions,
}: ManagedEmailDesignJourneyProps) => {
  const { i18n, t } = useLingui();
  const activeFlowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    activeFlowRef.current?.focus();
  }, [state.flow]);

  const screenTitle = (() => {
    switch (state.flow) {
      case 'domain-source':
        return t`Add domain`;
      case 'managed-domain-search':
        return t`Managed domain search`;
      case 'external-domain-entry':
        return t`Enter your domain`;
      case 'external-dns':
        return t`Verify DNS for ${normalizeManagedEmailDesignDomain(state.dnsLifecycle.domain.name)}`;
      case 'mailbox-source':
        return t`Add mailbox`;
      case 'mailbox-details':
        return t`Create a managed mailbox`;
      case 'mailbox-connection': {
        const connection = state.mailboxConnection;
        const isSmtpRemediationEdit =
          connection.mode === 'edit' &&
          !connection.canSend &&
          connection.draft.selectedProtocol === 'SMTP' &&
          connection.requiresFreshPassword;

        return connection.mode === 'edit'
          ? isSmtpRemediationEdit
            ? t`Configure SMTP for ${connection.draft.address}`
            : t`Edit connected mailbox`
          : connection.mode === 'retest'
            ? t`Retest connected mailbox`
            : t`Connect an existing mailbox`;
      }
      case 'prewarmed-inventory':
        return t`Choose a prewarmed mailbox bundle`;
      case 'review':
        return state.reviewDraft === null
          ? t`Review unavailable`
          : i18n._(state.reviewDraft.title);
    }
  })();

  const activeFlow = (() => {
    switch (state.flow) {
      case 'domain-source':
        return <DomainSourceScreen state={state} actions={actions} />;
      case 'managed-domain-search':
        return <ManagedDomainSearchScreen state={state} actions={actions} />;
      case 'external-domain-entry':
        return <ExternalDomainEntryScreen state={state} actions={actions} />;
      case 'external-dns':
        return <ExternalDnsScreen state={state} actions={actions} />;
      case 'mailbox-source':
        return <MailboxSourceScreen state={state} actions={actions} />;
      case 'mailbox-details':
        return <MailboxDetailsScreen state={state} actions={actions} />;
      case 'mailbox-connection':
        return <MailboxConnectionScreen state={state} actions={actions} />;
      case 'prewarmed-inventory':
        return <PrewarmedInventoryScreen state={state} actions={actions} />;
      case 'review':
        return <ReviewScreen state={state} actions={actions} />;
    }
  })();

  return (
    <section
      ref={activeFlowRef}
      role="region"
      tabIndex={-1}
      aria-label={t`${screenTitle} screen`}
    >
      {activeFlow}
    </section>
  );
};
