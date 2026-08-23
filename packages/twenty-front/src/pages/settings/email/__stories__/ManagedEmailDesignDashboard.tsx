import { type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMediaQuery } from 'react-responsive';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { Table } from '@/ui/layout/table/components/Table';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { Status } from 'twenty-ui/data-display';
import { IconDotsVertical } from 'twenty-ui/icon';
import { Button, LightIconButton } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { MenuItem } from 'twenty-ui/navigation';
import { Card, CardContent, CardHeader } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { useEffect, useRef, useState } from 'react';

import {
  formatManagedEmailDesignUsd,
  getManagedEmailDesignAssignedWarmupCount,
  getManagedEmailDesignAvailableWarmupCount,
  getManagedEmailDesignEffectiveSubscriptionQuantity,
  getManagedEmailDesignDomainSubscription,
  getManagedEmailDesignLinkedMailboxCount,
  getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage,
  getManagedEmailDesignMailboxSendingCapabilityReasonMessage,
  type ManagedEmailDesignDomain,
  type ManagedEmailDesignDomainSource,
  type ManagedEmailDesignDomainVerification,
  type ManagedEmailDesignMailbox,
  type ManagedEmailDesignMailboxSource,
  type ManagedEmailDesignManagedDomainSubscription,
  type ManagedEmailDesignWorkspace,
} from './ManagedEmailDesign.fixtures';

const STOP_WARMUP_MODAL_ID = 'managed-email-design-stop-warmup';
const DOMAIN_REMOVAL_MODAL_ID = 'managed-email-design-domain-removal';
const DOMAIN_CANCELLATION_MODAL_ID = 'managed-email-design-domain-cancellation';
const COMPACT_LAYOUT_MAX_VIEWPORT = 1023;
const DOMAIN_TABLE_GRID_TEMPLATE =
  'minmax(0, 1.35fr) minmax(0, 1.15fr) 80px minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(0, 1.05fr) minmax(0, 1.05fr) 64px';
const MAILBOX_TABLE_GRID_TEMPLATE =
  'minmax(0, 2fr) minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 1fr) 100px';
const getMailboxActionsDropdownId = (mailboxId: string) =>
  `managed-email-mailbox-actions-${mailboxId}`;

const formatManagedEmailDesignDomainDate = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));

const StyledStackedTableCellContent = styled.div`
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  width: 100%;

  & > * {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

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
const StyledCompactDetails = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;

  & > div {
    align-items: center;
    display: grid;
    gap: ${themeCssVariables.spacing[2]};
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
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

const StyledMailboxActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
  max-width: 100%;
  min-width: 0;
`;
const StyledDashboardActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;
const StyledGuidance = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;
const StyledAttentionItem = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;
const StyledBlockedDropdownAction = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: ${themeCssVariables.font.size.sm};
  }
`;
const StyledCardHeaderText = styled.span`
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
`;

const StyledDomainConnectionStatus = styled.div`
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  width: 100%;

  span {
    overflow-wrap: anywhere;
  }
`;

type ManagedEmailDesignDashboardProps = {
  workspace: ManagedEmailDesignWorkspace;
  fixtureNow: string;
  onAddDomain: () => void;
  onAddMailbox: () => void;
  onBrowsePrewarmedInventory: () => void;
  onManageWarmupSubscriptions: (
    returnFocusId?: string,
    targetMailboxId?: string,
  ) => void;
  onManageMailboxCapacity: (
    subscriptionId: string,
    returnFocusId?: string,
  ) => void;
  onStartWarmup: (mailboxId: string) => void;
  onPauseWarmup: (mailboxId: string) => void;
  onResumeWarmup: (mailboxId: string) => void;
  onStopWarmup: (mailboxId: string) => void;
  onResolveWarmupOperation: (mailboxId: string) => void;
  onRetryWarmupOperation: (mailboxId: string) => void;
  onReconcileWarmupOperation: (mailboxId: string) => void;
  onOpenMailboxConnection: ({
    mailbox,
    mode,
  }: {
    mailbox: ManagedEmailDesignMailbox;
    mode: 'edit' | 'retest';
  }) => void;
  onReconcileMailboxConnection: (mailbox: ManagedEmailDesignMailbox) => void;
  onRequestMailboxRemoval: (mailbox: ManagedEmailDesignMailbox) => void;
  onDomainRemovalBlocked: (
    domain: ManagedEmailDesignDomain,
    linkedMailboxCount: number,
  ) => void;
  onOpenDomainDns: (domain: ManagedEmailDesignDomain) => void;
  onRequestDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onUndoDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onApplyDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onRemoveDomain: (domain: ManagedEmailDesignDomain) => void;
  onResetLocalPrototype: () => void;
};

const DomainSourceStatus = ({
  source,
}: {
  source: ManagedEmailDesignDomainSource;
}) => {
  const { t } = useLingui();

  switch (source) {
    case 'managed':
      return <Status color="blue" text={t`Myah-managed`} />;
    case 'external':
      return <Status color="gray" text={t`Customer-owned`} />;
    case 'prewarmed':
      return <Status color="green" text={t`Prewarmed bundle`} />;
  }
};

const DomainVerificationStatus = ({
  verification,
}: {
  verification: ManagedEmailDesignDomainVerification;
}) => {
  const { t } = useLingui();

  switch (verification) {
    case 'verified':
      return <Status color="green" text={t`Verified`} />;
    case 'verification-required':
      return <Status color="yellow" text={t`Verification required`} />;
    case 'checking-dns':
      return <Status color="yellow" text={t`Checking DNS`} isLoaderVisible />;
    case 'action-required':
      return <Status color="red" text={t`Action required`} />;
    case 'mailbox-connected':
      return (
        <StyledDomainConnectionStatus>
          <Status color="gray" text={t`Mailbox connected`} />
          <span>{t`DNS not managed`}</span>
        </StyledDomainConnectionStatus>
      );
  }
};

const MailboxSourceStatus = ({
  source,
}: {
  source: ManagedEmailDesignMailboxSource;
}) => {
  const { t } = useLingui();

  switch (source) {
    case 'managed':
      return <Status color="blue" text={t`Purchased`} />;
    case 'connected':
      return <Status color="gray" text={t`Connected`} />;
    case 'prewarmed':
      return <Status color="green" text={t`Prewarmed`} />;
  }
};
const MailboxConnectionHealth = ({
  mailbox,
}: {
  mailbox: ManagedEmailDesignMailbox;
}) => {
  const { t } = useLingui();

  if (mailbox.source !== 'connected') {
    return <Status color="gray" text={t`Not connected`} />;
  }

  switch (mailbox.connection?.operation.status) {
    case 'testing':
      return (
        <Status color="yellow" text={t`Testing connection`} isLoaderVisible />
      );
    case 'failed':
      return <Status color="red" text={t`Connection failed`} />;
    case 'unknown':
      return <Status color="red" text={t`Connection unknown`} />;
    case 'connected':
    case 'idle':
    case undefined:
      return <Status color="green" text={t`Connected`} />;
  }
};

const MailboxReadinessStatus = ({
  readiness,
}: {
  readiness: ManagedEmailDesignMailbox['readiness'];
}) => {
  const { t } = useLingui();

  return readiness === 'ready' ? (
    <Status color="green" text={t`Ready`} />
  ) : (
    <Status color="gray" text={t`Not ready`} />
  );
};

const WarmupStatus = ({ mailbox }: { mailbox: ManagedEmailDesignMailbox }) => {
  const { t } = useLingui();
  const { lastConfirmedProviderState } = mailbox.warmupState;

  if (lastConfirmedProviderState === 'inactive') {
    return <Status color="gray" text={t`Not active`} />;
  }

  if (lastConfirmedProviderState === 'paused') {
    return <Status color="yellow" text={t`Paused`} />;
  }

  return <Status color="yellow" text={t`Warming`} />;
};

const warmupOperationActionMessages: Record<
  'start' | 'pause' | 'resume' | 'stop',
  MessageDescriptor
> = {
  start: msg`start`,
  pause: msg`pause`,
  resume: msg`resume`,
  stop: msg`stop`,
};

const WarmupLifecycleOutputs = ({
  mailbox,
  workspace,
}: {
  mailbox: ManagedEmailDesignMailbox;
  workspace: ManagedEmailDesignWorkspace;
}) => {
  const { i18n, t } = useLingui();
  const { assignment, lastConfirmedProviderState, operation } =
    mailbox.warmupState;
  const subscription = workspace.subscriptions.find(
    (candidate) => candidate.id === mailbox.subscriptionId,
  );
  let operationText: string;

  if (operation.status === 'idle') {
    operationText = t`Idle`;
  } else {
    const operationStatus =
      operation.status === 'pending'
        ? t`Pending`
        : operation.status === 'failed'
          ? t`Failed`
          : t`Unknown`;
    const operationAction = i18n._(
      warmupOperationActionMessages[operation.action],
    );

    operationText = t`${operationStatus} ${operationAction}`;
  }

  const subscriptionLifecycle =
    subscription === undefined
      ? t`Not applicable`
      : subscription.status === 'active'
        ? t`Active`
        : subscription.status === 'pending-change'
          ? t`Pending quantity reduction`
          : subscription.status === 'pending-cancel'
            ? t`Pending cancellation`
            : t`Canceled`;
  const providerCanSend =
    mailbox.source !== 'connected' ||
    (mailbox.connection?.canSend ??
      mailbox.connection?.capabilities.includes('smtp') ??
      false);
  const eligibility = !providerCanSend
    ? t`Provider cannot send`
    : mailbox.source === 'prewarmed' && mailbox.readiness === 'ready'
      ? t`Ready without ongoing warmup`
      : mailbox.readiness === 'ready'
        ? t`Eligible`
        : t`Not ready to send`;
  const isRemovalBlocked =
    assignment === 'assigned' ||
    (operation.status !== 'idle' && operation.action === 'stop');

  return (
    <>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Warmup assignment for ${mailbox.address}`}
      >
        {assignment === 'assigned' ? t`Assigned` : t`Unassigned`}
      </StyledStoryEvidenceOutput>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Confirmed warmup provider state for ${mailbox.address}`}
      >
        {lastConfirmedProviderState === 'inactive'
          ? t`Inactive`
          : lastConfirmedProviderState === 'warming'
            ? t`Warming`
            : t`Paused`}
      </StyledStoryEvidenceOutput>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Warmup operation for ${mailbox.address}`}
      >
        {operationText}
      </StyledStoryEvidenceOutput>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Warmup operation ID for ${mailbox.address}`}
      >
        {operation.status === 'idle'
          ? t`No active operation`
          : operation.operationId}
      </StyledStoryEvidenceOutput>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Warmup eligibility for ${mailbox.address}`}
      >
        {eligibility}
      </StyledStoryEvidenceOutput>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Mailbox subscription lifecycle for ${mailbox.address}`}
      >
        {subscriptionLifecycle}
      </StyledStoryEvidenceOutput>
      <StyledStoryEvidenceOutput
        aria-hidden="true"
        aria-label={t`Warmup readiness for ${mailbox.address}`}
      >
        {mailbox.readiness === 'ready' ? t`Ready` : t`Not ready`}
      </StyledStoryEvidenceOutput>
      {isRemovalBlocked && (
        <span>
          {t`This mailbox cannot be removed or disconnected until warmup reaches confirmed provider inactivity.`}
        </span>
      )}
      {operation.status !== 'idle' &&
        operation.safeDiagnostic !== undefined && (
          <span>{operation.safeDiagnostic}</span>
        )}
    </>
  );
};

const getDomainRemovalActionMessage = (domain: ManagedEmailDesignDomain) =>
  domain.source === 'external'
    ? msg`Disconnect domain`
    : msg`Remove from workspace`;

type ManagedEmailDesignDomainSubscriptionDetails = {
  annualPrice: string;
  renewal: string | null;
  lifecycle: string;
};

type ManagedEmailDesignTranslate = (descriptor: MessageDescriptor) => string;

const getManagedEmailDesignDomainSubscriptionDetails = (
  subscription: ManagedEmailDesignManagedDomainSubscription | null,
  locale: string,
  translate: ManagedEmailDesignTranslate,
): ManagedEmailDesignDomainSubscriptionDetails | null => {
  if (subscription === null) {
    return null;
  }

  const annualPrice = translate(
    msg`${formatManagedEmailDesignUsd(subscription.unitPriceCents)} / year`,
  );

  switch (subscription.status) {
    case 'active':
      return {
        annualPrice,
        renewal: translate(
          msg`Renews ${formatManagedEmailDesignDomainDate(subscription.renewsAt, locale)}`,
        ),
        lifecycle: translate(msg`Active`),
      };
    case 'pending-cancel':
      return {
        annualPrice,
        renewal: null,
        lifecycle: translate(
          msg`Cancels ${formatManagedEmailDesignDomainDate(subscription.cancelAt, locale)}`,
        ),
      };
    case 'canceled':
      return {
        annualPrice,
        renewal: null,
        lifecycle: translate(
          msg`Canceled on ${formatManagedEmailDesignDomainDate(subscription.canceledAt, locale)}`,
        ),
      };
  }
};

const domainDnsActionMessages: Partial<
  Record<ManagedEmailDesignDomainVerification, MessageDescriptor>
> = {
  verified: msg`Reverify DNS`,
  'verification-required': msg`Verify DNS`,
  'checking-dns': msg`View DNS check`,
  'action-required': msg`Repair DNS`,
};
const DomainOverflowMenu = ({
  domain,
  workspace,
  fixtureNow,
  onRequestRemoval,
  onOpenDomainDns,
  onRequestDomainCancellation,
  onUndoDomainCancellation,
  onApplyDomainCancellation,
}: {
  domain: ManagedEmailDesignDomain;
  fixtureNow: string;
  workspace: ManagedEmailDesignWorkspace;
  onRequestRemoval: (domain: ManagedEmailDesignDomain) => void;
  onOpenDomainDns: (domain: ManagedEmailDesignDomain) => void;
  onRequestDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onUndoDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onApplyDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
}) => {
  const dropdownId = `managed-email-domain-actions-${domain.id}`;
  const { closeDropdown } = useCloseDropdown();
  const { i18n, t } = useLingui();
  const subscription = getManagedEmailDesignDomainSubscription({
    domain,
    subscriptions: workspace.subscriptions,
  });
  const canUndoCancellation =
    subscription?.status === 'pending-cancel' &&
    fixtureNow < subscription.cancelAt;
  const removalActionLabel = i18n._(getDomainRemovalActionMessage(domain));
  const dnsActionMessage = domainDnsActionMessages[domain.verification];

  const runAction = (action: (domain: ManagedEmailDesignDomain) => void) => {
    closeDropdown(dropdownId);
    action(domain);
  };

  return (
    <Dropdown
      containerType="neutral"
      dropdownId={dropdownId}
      dropdownPlacement="bottom-end"
      renderClickableComponentAsChild
      clickableComponent={
        <LightIconButton
          id={`${dropdownId}-trigger`}
          aria-label={t`More actions for ${domain.name}`}
          Icon={IconDotsVertical}
          size="medium"
          accent="tertiary"
        />
      }
      dropdownComponents={
        <DropdownContent>
          <DropdownMenuItemsContainer>
            {dnsActionMessage !== undefined && (
              <MenuItem
                role="button"
                text={i18n._(dnsActionMessage)}
                onClick={() => runAction(onOpenDomainDns)}
              />
            )}
            {subscription !== null && subscription.status === 'active' && (
              <MenuItem
                role="button"
                text={t`Cancel renewal`}
                onClick={() => runAction(onRequestDomainCancellation)}
              />
            )}
            {subscription !== null &&
              subscription.status === 'pending-cancel' && (
                <>
                  {canUndoCancellation && (
                    <MenuItem
                      role="button"
                      text={t`Undo cancellation`}
                      onClick={() => runAction(onUndoDomainCancellation)}
                    />
                  )}
                  <MenuItem
                    role="button"
                    text={t`Apply cancellation effective ${formatManagedEmailDesignDomainDate(subscription.cancelAt, i18n.locale)}`}
                    onClick={() => runAction(onApplyDomainCancellation)}
                  />
                </>
              )}
            <MenuItem
              role="button"
              accent="danger"
              text={removalActionLabel}
              onClick={() => runAction(onRequestRemoval)}
            />
          </DropdownMenuItemsContainer>
        </DropdownContent>
      }
    />
  );
};

const MailboxOverflowMenu = ({
  mailbox,
  managedMailboxCapacitySubscriptionId,
  onManageMailboxCapacity,
  onOpenMailboxActions,
  onOpenMailboxConnection,
  onReconcileMailboxConnection,
  onRequestRemoval,
  onRequestStop,
}: {
  mailbox: ManagedEmailDesignMailbox;
  managedMailboxCapacitySubscriptionId: string | null;
  onManageMailboxCapacity: (
    subscriptionId: string,
    returnFocusId?: string,
  ) => void;
  onOpenMailboxActions: (dropdownId: string) => void;
  onOpenMailboxConnection: ({
    mailbox,
    mode,
  }: {
    mailbox: ManagedEmailDesignMailbox;
    mode: 'edit' | 'retest';
  }) => void;
  onReconcileMailboxConnection: (mailbox: ManagedEmailDesignMailbox) => void;
  onRequestRemoval: (mailbox: ManagedEmailDesignMailbox) => void;
  onRequestStop: (mailboxId: string) => void;
}) => {
  const dropdownId = getMailboxActionsDropdownId(mailbox.id);
  const { closeDropdown } = useCloseDropdown();
  const { t } = useLingui();
  const isConnectedMailbox = mailbox.source === 'connected';
  const connectionOperationStatus = mailbox.connection?.operation.status;
  const isConnectionUnresolved =
    connectionOperationStatus === 'testing' ||
    connectionOperationStatus === 'unknown';
  const removalLabel = isConnectedMailbox ? t`Disconnect` : t`Remove mailbox`;
  const removalDisabledReason =
    connectionOperationStatus === 'unknown'
      ? isConnectedMailbox
        ? t`Reconcile the connection result before disconnecting this mailbox.`
        : t`Reconcile the connection result before removing this mailbox.`
      : connectionOperationStatus === 'testing'
        ? isConnectedMailbox
          ? t`Wait for the connection check to finish before disconnecting this mailbox.`
          : t`Wait for the connection check to finish before removing this mailbox.`
        : isConnectedMailbox
          ? t`Stop warmup and wait for confirmed provider inactivity before disconnecting this mailbox.`
          : t`Stop warmup and wait for confirmed provider inactivity before removing this mailbox.`;
  const removalDisabledReasonId = `${dropdownId}-removal-disabled-reason`;
  const canRequestStop =
    mailbox.warmupState.assignment === 'assigned' &&
    mailbox.warmupState.operation.status === 'idle';
  const canRemove =
    mailbox.warmupState.assignment === 'unassigned' &&
    mailbox.warmupState.lastConfirmedProviderState === 'inactive' &&
    (mailbox.warmupState.operation.status === 'idle' ||
      (mailbox.warmupState.operation.status === 'failed' &&
        mailbox.warmupState.operation.action === 'start'));
  const runAction = (action: () => void) => {
    closeDropdown(dropdownId);
    action();
  };

  return (
    <Dropdown
      containerType="neutral"
      dropdownId={dropdownId}
      dropdownPlacement="bottom-end"
      renderClickableComponentAsChild
      onOpen={() => onOpenMailboxActions(dropdownId)}
      clickableComponent={
        <LightIconButton
          id={`${dropdownId}-trigger`}
          aria-label={t`More actions for ${mailbox.address}`}
          Icon={IconDotsVertical}
          size="medium"
          accent="tertiary"
        />
      }
      dropdownComponents={
        <DropdownContent>
          <DropdownMenuItemsContainer>
            {isConnectedMailbox ? (
              isConnectionUnresolved ? (
                <MenuItem
                  role="button"
                  text={
                    connectionOperationStatus === 'testing'
                      ? t`Resume connection check`
                      : t`Reconcile connection`
                  }
                  onClick={() =>
                    runAction(() => onReconcileMailboxConnection(mailbox))
                  }
                />
              ) : (
                <>
                  <MenuItem
                    role="button"
                    text={t`Edit connection`}
                    onClick={() =>
                      runAction(() =>
                        onOpenMailboxConnection({ mailbox, mode: 'edit' }),
                      )
                    }
                  />
                  <MenuItem
                    role="button"
                    text={t`Retest/Reconnect`}
                    onClick={() =>
                      runAction(() =>
                        onOpenMailboxConnection({ mailbox, mode: 'retest' }),
                      )
                    }
                  />
                </>
              )
            ) : (
              managedMailboxCapacitySubscriptionId !== null && (
                <MenuItem
                  role="button"
                  text={t`Manage mailbox capacity`}
                  onClick={() =>
                    runAction(() =>
                      onManageMailboxCapacity(
                        managedMailboxCapacitySubscriptionId,
                        `${dropdownId}-trigger`,
                      ),
                    )
                  }
                />
              )
            )}
            {canRequestStop && (
              <MenuItem
                role="button"
                text={t`Stop warmup`}
                onClick={() => runAction(() => onRequestStop(mailbox.id))}
              />
            )}
            {canRemove && !isConnectionUnresolved ? (
              <MenuItem
                role="button"
                accent="danger"
                text={removalLabel}
                onClick={() => runAction(() => onRequestRemoval(mailbox))}
              />
            ) : (
              <StyledBlockedDropdownAction>
                <Button
                  title={removalLabel}
                  aria-describedby={removalDisabledReasonId}
                  disabled
                  size="medium"
                  variant="tertiary"
                />
                <span id={removalDisabledReasonId}>
                  {removalDisabledReason}
                </span>
              </StyledBlockedDropdownAction>
            )}
          </DropdownMenuItemsContainer>
        </DropdownContent>
      }
    />
  );
};

export const ManagedEmailDesignMailboxImmediateAction = ({
  mailbox,
  availableWarmupCount,
  onStartWarmup,
  onPauseWarmup,
  onResumeWarmup,
  onResolveWarmupOperation,
  onRetryWarmupOperation,
  onReconcileWarmupOperation,
  onManageWarmupSubscriptions,
  onOpenMailboxConnection,
  showCapacityNote = false,
}: {
  mailbox: ManagedEmailDesignMailbox;
  availableWarmupCount: number;
  onStartWarmup: (mailboxId: string) => void;
  onPauseWarmup: (mailboxId: string) => void;
  onResumeWarmup: (mailboxId: string) => void;
  onResolveWarmupOperation: (mailboxId: string) => void;
  onRetryWarmupOperation: (mailboxId: string) => void;
  onReconcileWarmupOperation: (mailboxId: string) => void;
  onManageWarmupSubscriptions: (
    returnFocusId?: string,
    targetMailboxId?: string,
  ) => void;
  onOpenMailboxConnection: ({
    mailbox,
    mode,
  }: {
    mailbox: ManagedEmailDesignMailbox;
    mode: 'edit' | 'retest';
  }) => void;
  showCapacityNote?: boolean;
}) => {
  const { i18n, t } = useLingui();
  const { assignment, lastConfirmedProviderState, operation } =
    mailbox.warmupState;
  const actionId = `managed-email-warmup-action-${mailbox.id}`;
  const providerCanSend =
    mailbox.source !== 'connected' ||
    (mailbox.connection?.canSend ??
      mailbox.connection?.capabilities.includes('smtp') ??
      false);
  const isPrewarmedReady =
    mailbox.source === 'prewarmed' && mailbox.readiness === 'ready';

  if (operation.status === 'pending') {
    return (
      <Button
        id={actionId}
        title={t`Resolve warmup operation`}
        variant="secondary"
        size="medium"
        onClick={() => onResolveWarmupOperation(mailbox.id)}
      />
    );
  }

  if (operation.status === 'failed' || operation.status === 'unknown') {
    const isRetry = operation.status === 'failed';
    const action = i18n._(warmupOperationActionMessages[operation.action]);
    const actionLabel = isRetry
      ? t`Retry warmup ${action}`
      : t`Reconcile warmup ${action}`;

    return (
      <Button
        id={actionId}
        title={isRetry ? t`Retry` : t`Reconcile`}
        ariaLabel={t`${actionLabel} for ${mailbox.address}`}
        variant="secondary"
        size="medium"
        onClick={() =>
          isRetry
            ? onRetryWarmupOperation(mailbox.id)
            : onReconcileWarmupOperation(mailbox.id)
        }
      />
    );
  }

  if (assignment === 'assigned' && lastConfirmedProviderState === 'warming') {
    return (
      <Button
        id={actionId}
        title={t`Pause`}
        ariaLabel={t`Pause warmup for ${mailbox.address}`}
        variant="secondary"
        size="medium"
        onClick={() => onPauseWarmup(mailbox.id)}
      />
    );
  }

  if (assignment === 'assigned' && lastConfirmedProviderState === 'paused') {
    return (
      <Button
        id={actionId}
        title={t`Resume`}
        ariaLabel={t`Resume warmup for ${mailbox.address}`}
        variant="secondary"
        size="medium"
        onClick={() => onResumeWarmup(mailbox.id)}
      />
    );
  }

  if (isPrewarmedReady) {
    return null;
  }

  if (!providerCanSend) {
    return (
      <Button
        id={actionId}
        title={t`Configure SMTP`}
        ariaLabel={t`Configure SMTP for ${mailbox.address}`}
        variant="secondary"
        size="medium"
        onClick={() => onOpenMailboxConnection({ mailbox, mode: 'edit' })}
      />
    );
  }

  if (mailbox.readiness !== 'ready') {
    return showCapacityNote ? (
      <StyledGuidance>
        {t`This mailbox is not ready to send. Configure SMTP before starting warmup.`}
      </StyledGuidance>
    ) : null;
  }

  if (availableWarmupCount === 0) {
    return (
      <div>
        <Button
          id={actionId}
          title={t`Review warmup capacity`}
          variant="secondary"
          size="medium"
          onClick={() => onManageWarmupSubscriptions(actionId, mailbox.id)}
        />
        {showCapacityNote && (
          <StyledGuidance>
            {t`No warmup capacity is available. Manage subscriptions locally.`}
          </StyledGuidance>
        )}
      </div>
    );
  }

  return (
    <Button
      id={actionId}
      title={t`Start`}
      ariaLabel={t`Start warmup for ${mailbox.address}`}
      variant="secondary"
      size="medium"
      onClick={() => onStartWarmup(mailbox.id)}
    />
  );
};

const MailboxConnectionAttention = ({
  mailboxes,
  onOpenMailboxConnection,
}: {
  mailboxes: ManagedEmailDesignMailbox[];
  onOpenMailboxConnection: ({
    mailbox,
    mode,
  }: {
    mailbox: ManagedEmailDesignMailbox;
    mode: 'edit' | 'retest';
  }) => void;
}) => {
  const { t } = useLingui();

  return (
    <div role="region" aria-label={t`Needs attention`}>
      {mailboxes.map((mailbox) => {
        const connectionOperationStatus = mailbox.connection?.operation.status;

        if (connectionOperationStatus === 'unknown') {
          return (
            <StyledAttentionItem key={mailbox.id}>
              <span role="alert">
                {t`${mailbox.address} connection needs reconciliation.`}
              </span>
            </StyledAttentionItem>
          );
        }

        if (connectionOperationStatus === 'testing') {
          return (
            <StyledAttentionItem key={mailbox.id}>
              <span role="status">
                {t`${mailbox.address} connection check is in progress.`}
              </span>
            </StyledAttentionItem>
          );
        }

        return (
          <StyledAttentionItem key={mailbox.id}>
            <span role="alert">
              {t`${mailbox.address} connection needs attention.`}
            </span>
            <Button
              title={t`Retest/Reconnect`}
              variant="secondary"
              size="medium"
              onClick={() =>
                onOpenMailboxConnection({ mailbox, mode: 'retest' })
              }
            />
          </StyledAttentionItem>
        );
      })}
    </div>
  );
};

const DomainMobileCard = ({
  domain,
  workspace,
  fixtureNow,
  onRequestRemoval,
  onOpenDomainDns,
  onRequestDomainCancellation,
  onUndoDomainCancellation,
  onApplyDomainCancellation,
}: {
  domain: ManagedEmailDesignDomain;
  workspace: ManagedEmailDesignWorkspace;
  fixtureNow: string;
  onRequestRemoval: (domain: ManagedEmailDesignDomain) => void;
  onOpenDomainDns: (domain: ManagedEmailDesignDomain) => void;
  onRequestDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onUndoDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
  onApplyDomainCancellation: (domain: ManagedEmailDesignDomain) => void;
}) => {
  const { i18n, t } = useLingui();
  const linkedMailboxCount = getManagedEmailDesignLinkedMailboxCount(
    domain.name,
    workspace.mailboxes,
  );
  const subscriptionDetails = getManagedEmailDesignDomainSubscriptionDetails(
    getManagedEmailDesignDomainSubscription({
      domain,
      subscriptions: workspace.subscriptions,
    }),
    i18n.locale,
    (descriptor) => i18n._(descriptor),
  );

  return (
    <Card fullWidth rounded>
      <CardHeader>
        <StyledCardHeaderText>{domain.name}</StyledCardHeaderText>
      </CardHeader>
      <CardContent>
        <StyledCompactDetails>
          <div>
            <dt>{t`Source`}</dt>
            <dd>
              <DomainSourceStatus source={domain.source} />
            </dd>
          </div>
          <div>
            <dt>{t`Linked mailboxes`}</dt>
            <dd>
              {plural(linkedMailboxCount, {
                one: '# linked mailbox',
                other: '# linked mailboxes',
              })}
            </dd>
          </div>
          <div>
            <dt>{t`Status`}</dt>
            <dd>
              <DomainVerificationStatus verification={domain.verification} />
            </dd>
          </div>
          {subscriptionDetails !== null && (
            <>
              <div>
                <dt>{t`Annual price`}</dt>
                <dd>{subscriptionDetails.annualPrice}</dd>
              </div>
              {subscriptionDetails.renewal !== null && (
                <div>
                  <dt>{t`Renewal`}</dt>
                  <dd>{subscriptionDetails.renewal}</dd>
                </div>
              )}
              <div>
                <dt>{t`Lifecycle`}</dt>
                <dd>{subscriptionDetails.lifecycle}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{t`Actions`}</dt>
            <dd>
              <StyledMailboxActions>
                <DomainOverflowMenu
                  domain={domain}
                  fixtureNow={fixtureNow}
                  workspace={workspace}
                  onRequestRemoval={onRequestRemoval}
                  onOpenDomainDns={onOpenDomainDns}
                  onRequestDomainCancellation={onRequestDomainCancellation}
                  onUndoDomainCancellation={onUndoDomainCancellation}
                  onApplyDomainCancellation={onApplyDomainCancellation}
                />
              </StyledMailboxActions>
            </dd>
          </div>
        </StyledCompactDetails>
      </CardContent>
    </Card>
  );
};

const MailboxMobileCard = ({
  mailbox,
  workspace,
  availableWarmupCount,
  onStartWarmup,
  onPauseWarmup,
  onResumeWarmup,
  onResolveWarmupOperation,
  onRetryWarmupOperation,
  onReconcileWarmupOperation,
  onManageWarmupSubscriptions,
  onRequestStop,
  managedMailboxCapacitySubscriptionId,
  onManageMailboxCapacity,
  onOpenMailboxActions,
  onOpenMailboxConnection,
  onReconcileMailboxConnection,
  onRequestRemoval,
}: {
  mailbox: ManagedEmailDesignMailbox;
  workspace: ManagedEmailDesignWorkspace;
  availableWarmupCount: number;
  onStartWarmup: (mailboxId: string) => void;
  onPauseWarmup: (mailboxId: string) => void;
  onResumeWarmup: (mailboxId: string) => void;
  onResolveWarmupOperation: (mailboxId: string) => void;
  onRetryWarmupOperation: (mailboxId: string) => void;
  onReconcileWarmupOperation: (mailboxId: string) => void;
  onManageWarmupSubscriptions: (
    returnFocusId?: string,
    targetMailboxId?: string,
  ) => void;
  onRequestStop: (mailboxId: string) => void;
  managedMailboxCapacitySubscriptionId: string | null;
  onManageMailboxCapacity: (
    subscriptionId: string,
    returnFocusId?: string,
  ) => void;
  onOpenMailboxActions: (dropdownId: string) => void;
  onOpenMailboxConnection: ({
    mailbox,
    mode,
  }: {
    mailbox: ManagedEmailDesignMailbox;
    mode: 'edit' | 'retest';
  }) => void;
  onReconcileMailboxConnection: (mailbox: ManagedEmailDesignMailbox) => void;
  onRequestRemoval: (mailbox: ManagedEmailDesignMailbox) => void;
}) => {
  const { t } = useLingui();

  return (
    <Card fullWidth rounded>
      <CardHeader>
        <StyledCardHeaderText>
          {`${mailbox.identity} — ${mailbox.address}`}
        </StyledCardHeaderText>
      </CardHeader>
      <CardContent>
        <StyledCompactDetails>
          <div>
            <dt>{t`Source`}</dt>
            <dd>
              <MailboxSourceStatus source={mailbox.source} />
            </dd>
          </div>
          <div>
            <dt>{t`Domain`}</dt>
            <dd>{mailbox.domain}</dd>
          </div>
          <div>
            <dt>{t`Connection health`}</dt>
            <dd>
              <MailboxConnectionHealth mailbox={mailbox} />
            </dd>
          </div>
          <div>
            <dt>{t`Readiness`}</dt>
            <dd>
              <MailboxReadinessStatus readiness={mailbox.readiness} />
              <StyledStoryEvidenceOutput
                aria-hidden="true"
                aria-label={t`Mailbox readiness for ${mailbox.address}`}
              >
                {mailbox.readiness === 'ready' ? t`Ready` : t`Not ready`}
              </StyledStoryEvidenceOutput>
            </dd>
          </div>
          <div>
            <dt>{t`Warmup`}</dt>
            <dd>
              <WarmupStatus mailbox={mailbox} />
              <WarmupLifecycleOutputs mailbox={mailbox} workspace={workspace} />
            </dd>
          </div>
          <div>
            <dt>{t`Actions`}</dt>
            <dd>
              <StyledMailboxActions>
                <ManagedEmailDesignMailboxImmediateAction
                  mailbox={mailbox}
                  availableWarmupCount={availableWarmupCount}
                  onStartWarmup={onStartWarmup}
                  onPauseWarmup={onPauseWarmup}
                  onResumeWarmup={onResumeWarmup}
                  onResolveWarmupOperation={onResolveWarmupOperation}
                  onRetryWarmupOperation={onRetryWarmupOperation}
                  onReconcileWarmupOperation={onReconcileWarmupOperation}
                  onManageWarmupSubscriptions={onManageWarmupSubscriptions}
                  onOpenMailboxConnection={onOpenMailboxConnection}
                  showCapacityNote
                />
                <MailboxOverflowMenu
                  mailbox={mailbox}
                  managedMailboxCapacitySubscriptionId={
                    managedMailboxCapacitySubscriptionId
                  }
                  onManageMailboxCapacity={onManageMailboxCapacity}
                  onOpenMailboxActions={onOpenMailboxActions}
                  onOpenMailboxConnection={onOpenMailboxConnection}
                  onReconcileMailboxConnection={onReconcileMailboxConnection}
                  onRequestRemoval={onRequestRemoval}
                  onRequestStop={onRequestStop}
                />
              </StyledMailboxActions>
            </dd>
          </div>
        </StyledCompactDetails>
      </CardContent>
    </Card>
  );
};

export const ManagedEmailDesignDashboard = ({
  workspace,
  fixtureNow,
  onAddDomain,
  onAddMailbox,
  onBrowsePrewarmedInventory,
  onManageWarmupSubscriptions,
  onManageMailboxCapacity,
  onStartWarmup,
  onPauseWarmup,
  onResumeWarmup,
  onStopWarmup,
  onResolveWarmupOperation,
  onRetryWarmupOperation,
  onReconcileWarmupOperation,
  onOpenMailboxConnection,
  onReconcileMailboxConnection,
  onRequestMailboxRemoval,
  onDomainRemovalBlocked,
  onOpenDomainDns,
  onRequestDomainCancellation,
  onUndoDomainCancellation,
  onApplyDomainCancellation,
  onRemoveDomain,
  onResetLocalPrototype,
}: ManagedEmailDesignDashboardProps) => {
  const { i18n, t } = useLingui();
  const isCompactLayout = useMediaQuery({
    query: `(max-width: ${COMPACT_LAYOUT_MAX_VIEWPORT}px)`,
  });
  const { closeModal, openModal } = useModal();
  const { closeDropdown } = useCloseDropdown();
  const [mailboxToStop, setMailboxToStop] = useState<string | null>(null);
  // Preserve the imperative return target without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const stopWarmupFinalFocusRef = useRef<string | null>(null);
  const [domainToRemove, setDomainToRemove] =
    useState<ManagedEmailDesignDomain | null>(null);
  // Preserve the imperative return target without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const domainRemovalFinalFocusRef = useRef<string | null>(null);
  // Track one post-commit focus restoration without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const shouldRestoreDomainRemovalFallbackRef = useRef(false);
  useEffect(() => {
    if (!shouldRestoreDomainRemovalFallbackRef.current) {
      return;
    }

    document.getElementById('managed-email-add-domain')?.focus();
    shouldRestoreDomainRemovalFallbackRef.current = false;
  }, [workspace.domains]);
  const [domainToCancel, setDomainToCancel] =
    useState<ManagedEmailDesignDomain | null>(null);
  // Preserve the imperative return target without triggering a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const domainCancellationFinalFocusRef = useRef<string | null>(null);
  const domainToCancelSubscription =
    domainToCancel === null
      ? null
      : getManagedEmailDesignDomainSubscription({
          domain: domainToCancel,
          subscriptions: workspace.subscriptions,
        });
  const domainCancellationEffectiveDate =
    domainToCancelSubscription !== null &&
    domainToCancelSubscription.status === 'active'
      ? formatManagedEmailDesignDomainDate(
          domainToCancelSubscription.renewsAt,
          i18n.locale,
        )
      : null;
  const assignedWarmupCount = getManagedEmailDesignAssignedWarmupCount(
    workspace.mailboxes,
  );
  const currentWarmupSubscription =
    workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-warmup' &&
        subscription.status !== 'canceled',
    ) ??
    workspace.subscriptions.find(
      (subscription) => subscription.product === 'managed-warmup',
    );
  const currentWarmupCapacity =
    currentWarmupSubscription === undefined
      ? 0
      : getManagedEmailDesignEffectiveSubscriptionQuantity(
          currentWarmupSubscription,
        );
  const availableWarmupCount =
    getManagedEmailDesignAvailableWarmupCount(workspace);
  const availableWarmupSlotText = plural(availableWarmupCount, {
    one: '# slot available',
    other: '# slots available',
  });
  const newWarmupSlotsText = plural(availableWarmupCount, {
    one: '# new slot',
    other: '# new slots',
  });
  const unresolvedWarmupAssignmentText = plural(assignedWarmupCount, {
    one: '# unresolved assignment',
    other: '# unresolved assignments',
  });
  const warmupCapacityText = t`Warmup capacity: ${assignedWarmupCount} of ${currentWarmupCapacity} assigned · ${availableWarmupSlotText}.`;
  const warmupCapacityAvailability =
    availableWarmupCount === 0
      ? t`${newWarmupSlotsText} · ${unresolvedWarmupAssignmentText}`
      : availableWarmupSlotText;
  const managedMailboxCapacitySubscriptionId =
    workspace.subscriptions.find(
      (subscription) =>
        subscription.product === 'managed-mailbox' &&
        subscription.status !== 'canceled',
    )?.id ?? null;
  const hasManagedEmailResources =
    workspace.domains.length > 0 || workspace.mailboxes.length > 0;
  const hasRetainedManagedSubscription = workspace.subscriptions.some(
    ({ product }) =>
      product === 'managed-domain' ||
      product === 'managed-mailbox' ||
      product === 'managed-warmup',
  );
  const connectionAttentionMailboxes = workspace.mailboxes.filter(
    (mailbox) =>
      mailbox.source === 'connected' &&
      (mailbox.connection?.operation.status === 'failed' ||
        mailbox.connection?.operation.status === 'unknown' ||
        mailbox.connection?.operation.status === 'testing'),
  );
  const closeOtherMailboxActionMenus = (openedDropdownId: string) => {
    workspace.mailboxes.forEach((mailbox) => {
      const dropdownId = getMailboxActionsDropdownId(mailbox.id);

      if (dropdownId !== openedDropdownId) {
        closeDropdown(dropdownId);
      }
    });
  };

  const requestStopWarmup = (mailboxId: string) => {
    stopWarmupFinalFocusRef.current = `${getMailboxActionsDropdownId(mailboxId)}-trigger`;
    setMailboxToStop(mailboxId);
    openModal(STOP_WARMUP_MODAL_ID);
  };

  const requestDomainRemoval = (domain: ManagedEmailDesignDomain) => {
    const linkedMailboxCount = getManagedEmailDesignLinkedMailboxCount(
      domain.name,
      workspace.mailboxes,
    );

    if (linkedMailboxCount > 0) {
      onDomainRemovalBlocked(domain, linkedMailboxCount);
      return;
    }

    domainRemovalFinalFocusRef.current = `managed-email-domain-actions-${domain.id}-trigger`;
    setDomainToRemove(domain);
    openModal(DOMAIN_REMOVAL_MODAL_ID);
  };

  const requestDomainCancellation = (domain: ManagedEmailDesignDomain) => {
    domainCancellationFinalFocusRef.current = `managed-email-domain-actions-${domain.id}-trigger`;
    setDomainToCancel(domain);
    openModal(DOMAIN_CANCELLATION_MODAL_ID);
  };

  if (!hasManagedEmailResources && !hasRetainedManagedSubscription) {
    return (
      <Section>
        <H2Title
          title={t`Managed email resources`}
          description={t`Start with a domain, then add or connect a mailbox.`}
        />
        <StyledDashboardActions>
          <Button
            id="managed-email-add-domain"
            title={t`Add domain`}
            variant="primary"
            onClick={onAddDomain}
          />
          <Button
            title={t`Add mailbox`}
            variant="secondary"
            onClick={onAddMailbox}
          />
          <Button
            title={t`Browse prewarmed mailboxes`}
            variant="tertiary"
            onClick={onBrowsePrewarmedInventory}
          />
        </StyledDashboardActions>
      </Section>
    );
  }

  if (!hasManagedEmailResources) {
    return (
      <>
        <Section>
          <H2Title
            title={t`Managed email resources`}
            description={t`No active resources remain. Manage the retained subscription or add your next resource.`}
          />
          <StyledDashboardActions>
            <Button
              id="managed-email-warmup-subscriptions"
              title={t`Manage subscriptions`}
              variant="primary"
              onClick={() =>
                onManageWarmupSubscriptions(
                  'managed-email-warmup-subscriptions',
                )
              }
            />
            <Button
              id="managed-email-add-domain"
              title={t`Add domain`}
              variant="secondary"
              onClick={onAddDomain}
            />
            <Button
              title={t`Add mailbox`}
              variant="secondary"
              onClick={onAddMailbox}
            />
            <Button
              title={t`Browse prewarmed mailboxes`}
              variant="tertiary"
              onClick={onBrowsePrewarmedInventory}
            />
          </StyledDashboardActions>
        </Section>
        <Section>
          <Button
            title={t`Reset local prototype`}
            variant="tertiary"
            onClick={onResetLocalPrototype}
          />
        </Section>
      </>
    );
  }

  return (
    <>
      <Section>
        <H2Title
          title={t`Managed email resources`}
          description={t`Manage domains, mailboxes, warmup capacity, and their independent subscription lifecycles.`}
        />
      </Section>

      <Section>
        <StyledDashboardActions>
          <StyledGuidance>
            {t`Browse complete prewarmed mailbox bundles from local Storybook inventory.`}
          </StyledGuidance>
          <Button
            title={t`Browse prewarmed mailboxes`}
            variant="tertiary"
            onClick={onBrowsePrewarmedInventory}
          />
        </StyledDashboardActions>
      </Section>

      {connectionAttentionMailboxes.length > 0 && (
        <Section>
          <MailboxConnectionAttention
            mailboxes={connectionAttentionMailboxes}
            onOpenMailboxConnection={onOpenMailboxConnection}
          />
        </Section>
      )}

      <Section>
        <H2Title
          title={t`Domains`}
          description={t`Every sending domain stays visible with its source, verification state, and mailbox relationship.`}
        />
        {workspace.domains.length === 0 ? (
          <StyledGuidance>
            {t`No domains are in this local fixture inventory. Add a Myah-managed domain or connect a customer-owned domain.`}
          </StyledGuidance>
        ) : isCompactLayout ? (
          workspace.domains.map((domain) => (
            <DomainMobileCard
              key={domain.id}
              domain={domain}
              fixtureNow={fixtureNow}
              workspace={workspace}
              onRequestRemoval={requestDomainRemoval}
              onOpenDomainDns={onOpenDomainDns}
              onRequestDomainCancellation={requestDomainCancellation}
              onUndoDomainCancellation={onUndoDomainCancellation}
              onApplyDomainCancellation={onApplyDomainCancellation}
            />
          ))
        ) : (
          <Table role="table" aria-label={t`Managed email domains`}>
            <TableRow
              role="row"
              gridTemplateColumns={DOMAIN_TABLE_GRID_TEMPLATE}
            >
              <TableHeader role="columnheader">{t`Domain`}</TableHeader>
              <TableHeader role="columnheader">{t`Source`}</TableHeader>
              <TableHeader role="columnheader" align="right">
                {t`Linked mailboxes`}
              </TableHeader>
              <TableHeader role="columnheader">{t`Status`}</TableHeader>
              <TableHeader role="columnheader">{t`Annual price`}</TableHeader>
              <TableHeader role="columnheader">{t`Renewal`}</TableHeader>
              <TableHeader role="columnheader">{t`Lifecycle`}</TableHeader>
              <TableHeader role="columnheader" align="right">
                {t`Actions`}
              </TableHeader>
            </TableRow>
            {workspace.domains.map((domain) => {
              const linkedMailboxCount =
                getManagedEmailDesignLinkedMailboxCount(
                  domain.name,
                  workspace.mailboxes,
                );
              const subscriptionDetails =
                getManagedEmailDesignDomainSubscriptionDetails(
                  getManagedEmailDesignDomainSubscription({
                    domain,
                    subscriptions: workspace.subscriptions,
                  }),
                  i18n.locale,
                  (descriptor) => i18n._(descriptor),
                );

              return (
                <TableRow
                  key={domain.id}
                  role="row"
                  gridTemplateColumns={DOMAIN_TABLE_GRID_TEMPLATE}
                  height={themeCssVariables.spacing[12]}
                >
                  <TableCell
                    role="cell"
                    height={themeCssVariables.spacing[12]}
                    title={domain.name}
                    minWidth="0"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    <strong>{domain.name}</strong>
                  </TableCell>
                  <TableCell role="cell" height={themeCssVariables.spacing[12]}>
                    <DomainSourceStatus source={domain.source} />
                  </TableCell>
                  <TableCell
                    role="cell"
                    align="right"
                    height={themeCssVariables.spacing[12]}
                  >
                    {plural(linkedMailboxCount, {
                      one: '# linked mailbox',
                      other: '# linked mailboxes',
                    })}
                  </TableCell>
                  <TableCell
                    role="cell"
                    height={themeCssVariables.spacing[12]}
                    overflow="hidden"
                  >
                    <DomainVerificationStatus
                      verification={domain.verification}
                    />
                  </TableCell>
                  <TableCell role="cell" height={themeCssVariables.spacing[12]}>
                    {subscriptionDetails?.annualPrice}
                  </TableCell>
                  <TableCell role="cell" height={themeCssVariables.spacing[12]}>
                    {subscriptionDetails?.renewal}
                  </TableCell>
                  <TableCell role="cell" height={themeCssVariables.spacing[12]}>
                    {subscriptionDetails?.lifecycle}
                  </TableCell>
                  <TableCell
                    role="cell"
                    align="right"
                    height={themeCssVariables.spacing[12]}
                  >
                    <DomainOverflowMenu
                      domain={domain}
                      fixtureNow={fixtureNow}
                      workspace={workspace}
                      onRequestRemoval={requestDomainRemoval}
                      onOpenDomainDns={onOpenDomainDns}
                      onRequestDomainCancellation={requestDomainCancellation}
                      onUndoDomainCancellation={onUndoDomainCancellation}
                      onApplyDomainCancellation={onApplyDomainCancellation}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        )}
        <Button
          id="managed-email-add-domain"
          title={t`Add domain`}
          variant="secondary"
          size="medium"
          onClick={onAddDomain}
        />
      </Section>

      <Section>
        <H2Title
          title={t`Mailboxes`}
          description={t`Each mailbox keeps its domain relationship and warmup assignment visible.`}
        />
        {assignedWarmupCount > 0 && (
          <StyledGuidance>
            {t`Stop warmup and wait for confirmed provider inactivity before removing this mailbox.`}
          </StyledGuidance>
        )}
        <StyledGuidance>{warmupCapacityText}</StyledGuidance>
        <StyledStoryEvidenceOutput
          aria-hidden="true"
          aria-label={t`Warmup capacity availability`}
        >
          {warmupCapacityAvailability}
        </StyledStoryEvidenceOutput>
        <StyledMailboxActions>
          <Button
            id="managed-email-warmup-subscriptions"
            title={t`Manage subscriptions`}
            variant="secondary"
            size="medium"
            onClick={() =>
              onManageWarmupSubscriptions('managed-email-warmup-subscriptions')
            }
          />
          <Button
            id="managed-email-warmup-capacity"
            title={t`Manage warmup capacity`}
            variant="secondary"
            size="medium"
            onClick={() =>
              onManageWarmupSubscriptions('managed-email-warmup-capacity')
            }
          />
          {currentWarmupCapacity === 0 &&
            workspace.mailboxes.every(
              (mailbox) => mailbox.warmupState.assignment === 'assigned',
            ) && (
              <Button
                id="managed-email-warmup-capacity-review"
                title={t`Review warmup capacity`}
                variant="secondary"
                size="medium"
                onClick={() =>
                  onManageWarmupSubscriptions(
                    'managed-email-warmup-capacity-review',
                  )
                }
              />
            )}
        </StyledMailboxActions>
        {workspace.mailboxes.length === 0 ? (
          <StyledGuidance>
            {t`No mailboxes are in this local fixture inventory. Create a managed mailbox, connect an existing mailbox, or browse prewarmed mailboxes.`}
          </StyledGuidance>
        ) : isCompactLayout ? (
          workspace.mailboxes.map((mailbox) => (
            <MailboxMobileCard
              key={mailbox.id}
              mailbox={mailbox}
              workspace={workspace}
              availableWarmupCount={availableWarmupCount}
              onStartWarmup={onStartWarmup}
              onPauseWarmup={onPauseWarmup}
              onResumeWarmup={onResumeWarmup}
              onResolveWarmupOperation={onResolveWarmupOperation}
              onRetryWarmupOperation={onRetryWarmupOperation}
              onReconcileWarmupOperation={onReconcileWarmupOperation}
              onManageWarmupSubscriptions={onManageWarmupSubscriptions}
              onRequestStop={requestStopWarmup}
              managedMailboxCapacitySubscriptionId={
                managedMailboxCapacitySubscriptionId
              }
              onManageMailboxCapacity={onManageMailboxCapacity}
              onOpenMailboxActions={closeOtherMailboxActionMenus}
              onOpenMailboxConnection={onOpenMailboxConnection}
              onReconcileMailboxConnection={onReconcileMailboxConnection}
              onRequestRemoval={onRequestMailboxRemoval}
            />
          ))
        ) : (
          <Table role="table" aria-label={t`Managed email mailboxes`}>
            <TableRow
              role="row"
              gridTemplateColumns={MAILBOX_TABLE_GRID_TEMPLATE}
            >
              <TableHeader role="columnheader">
                {t`Mailbox / source`}
              </TableHeader>
              <TableHeader role="columnheader">
                {t`Connection health`}
              </TableHeader>
              <TableHeader role="columnheader">{t`Readiness`}</TableHeader>
              <TableHeader role="columnheader">{t`Warmup`}</TableHeader>
              <TableHeader role="columnheader" align="right">
                {t`Actions`}
              </TableHeader>
            </TableRow>
            {workspace.mailboxes.map((mailbox) => (
              <TableRow
                key={mailbox.id}
                role="row"
                gridTemplateColumns={MAILBOX_TABLE_GRID_TEMPLATE}
                height={themeCssVariables.spacing[16]}
              >
                <TableCell
                  role="cell"
                  height={themeCssVariables.spacing[16]}
                  minWidth="0"
                  overflow="hidden"
                >
                  <StyledStackedTableCellContent>
                    <strong title={mailbox.identity}>{mailbox.identity}</strong>
                    <span title={mailbox.address}>{mailbox.address}</span>
                    <MailboxSourceStatus source={mailbox.source} />
                    <WarmupLifecycleOutputs
                      mailbox={mailbox}
                      workspace={workspace}
                    />
                    {mailbox.connection !== undefined && (
                      <>
                        <StyledStoryEvidenceOutput
                          aria-hidden="true"
                          aria-label={t`Connection operation for ${mailbox.address}`}
                        >
                          {mailbox.connection.operation.operationId ??
                            t`Not started`}
                        </StyledStoryEvidenceOutput>
                        {mailbox.connection.operation.safeDiagnostic !==
                          undefined && (
                          <span>
                            {i18n._(
                              getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage(
                                mailbox.connection.operation.safeDiagnostic,
                              ),
                            )}
                          </span>
                        )}
                        <StyledStoryEvidenceOutput
                          aria-hidden="true"
                          aria-label={t`Connection draft for ${mailbox.address}`}
                        >{`${mailbox.connection.draft.selectedProtocol ?? t`Protocol not selected`} · ${mailbox.connection.draft.host ?? ''} · ${mailbox.connection.draft.port ?? ''} · ${mailbox.connection.draft.connectionSecurity ?? ''}`}</StyledStoryEvidenceOutput>
                        {mailbox.connection.sendingCapabilityReason !== null &&
                          mailbox.connection.sendingCapabilityReason !==
                            undefined && (
                            <span>
                              {i18n._(
                                getManagedEmailDesignMailboxSendingCapabilityReasonMessage(
                                  mailbox.connection.sendingCapabilityReason,
                                ),
                              )}
                            </span>
                          )}
                      </>
                    )}
                  </StyledStackedTableCellContent>
                </TableCell>
                <TableCell
                  role="cell"
                  height={themeCssVariables.spacing[16]}
                  overflow="hidden"
                >
                  <MailboxConnectionHealth mailbox={mailbox} />
                </TableCell>
                <TableCell
                  role="cell"
                  height={themeCssVariables.spacing[16]}
                  overflow="hidden"
                >
                  <MailboxReadinessStatus readiness={mailbox.readiness} />
                  <StyledStoryEvidenceOutput
                    aria-hidden="true"
                    aria-label={t`Mailbox readiness for ${mailbox.address}`}
                  >
                    {mailbox.readiness === 'ready' ? t`Ready` : t`Not ready`}
                  </StyledStoryEvidenceOutput>
                </TableCell>
                <TableCell
                  role="cell"
                  height={themeCssVariables.spacing[16]}
                  overflow="hidden"
                >
                  <WarmupStatus mailbox={mailbox} />
                </TableCell>
                <TableCell
                  role="cell"
                  align="right"
                  height={themeCssVariables.spacing[16]}
                >
                  <StyledMailboxActions>
                    <ManagedEmailDesignMailboxImmediateAction
                      mailbox={mailbox}
                      availableWarmupCount={availableWarmupCount}
                      onStartWarmup={onStartWarmup}
                      onPauseWarmup={onPauseWarmup}
                      onResumeWarmup={onResumeWarmup}
                      onResolveWarmupOperation={onResolveWarmupOperation}
                      onRetryWarmupOperation={onRetryWarmupOperation}
                      onReconcileWarmupOperation={onReconcileWarmupOperation}
                      onManageWarmupSubscriptions={onManageWarmupSubscriptions}
                      onOpenMailboxConnection={onOpenMailboxConnection}
                    />
                    <MailboxOverflowMenu
                      mailbox={mailbox}
                      managedMailboxCapacitySubscriptionId={
                        managedMailboxCapacitySubscriptionId
                      }
                      onManageMailboxCapacity={onManageMailboxCapacity}
                      onOpenMailboxActions={closeOtherMailboxActionMenus}
                      onOpenMailboxConnection={onOpenMailboxConnection}
                      onReconcileMailboxConnection={
                        onReconcileMailboxConnection
                      }
                      onRequestRemoval={onRequestMailboxRemoval}
                      onRequestStop={requestStopWarmup}
                    />
                  </StyledMailboxActions>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        )}
        <Button
          id="managed-email-add-mailbox"
          title={t`Add mailbox`}
          variant="primary"
          size="medium"
          onClick={onAddMailbox}
        />
      </Section>

      <Section>
        <Button
          title={t`Reset local prototype`}
          variant="tertiary"
          onClick={onResetLocalPrototype}
        />
      </Section>

      <ConfirmationModal
        modalInstanceId={STOP_WARMUP_MODAL_ID}
        title={t`Stop warmup?`}
        subtitle={t`Confirmation begins a local simulated stop. The assignment remains until provider inactivity is confirmed or resolved; no billing changes occur.`}
        confirmButtonText={t`Stop warmup`}
        finalFocus={() => {
          const focusId = stopWarmupFinalFocusRef.current;

          return focusId === null
            ? false
            : (document.getElementById(focusId) ?? false);
        }}
        onClose={() => setMailboxToStop(null)}
        onConfirmClick={() => {
          if (mailboxToStop !== null) {
            stopWarmupFinalFocusRef.current = `managed-email-warmup-action-${mailboxToStop}`;
            onStopWarmup(mailboxToStop);
          }
          setMailboxToStop(null);
          closeModal(STOP_WARMUP_MODAL_ID);
        }}
      />
      <ConfirmationModal
        modalInstanceId={DOMAIN_REMOVAL_MODAL_ID}
        title={
          domainToRemove === null
            ? t`Remove domain?`
            : t`${i18n._(getDomainRemovalActionMessage(domainToRemove))} ${domainToRemove.name}?`
        }
        subtitle={
          domainToRemove === null
            ? t`This Storybook action changes only local fixture state.`
            : domainToRemove.source === 'external'
              ? t`Disconnecting ${domainToRemove.name} removes its local connection only after its linked mailboxes are gone. It does not change a managed-domain subscription.`
              : t`Removing ${domainToRemove.name} from this workspace does not cancel or otherwise change its managed-domain subscription. Linked mailboxes are never removed.`
        }
        confirmButtonText={
          domainToRemove === null
            ? t`Remove from workspace`
            : i18n._(getDomainRemovalActionMessage(domainToRemove))
        }
        confirmButtonAccent="danger"
        finalFocus={() => {
          const triggerId = domainRemovalFinalFocusRef.current;
          const trigger =
            triggerId === null ? null : document.getElementById(triggerId);

          return (
            trigger ??
            document.getElementById('managed-email-add-domain') ??
            false
          );
        }}
        onClose={() => setDomainToRemove(null)}
        onConfirmClick={() => {
          domainRemovalFinalFocusRef.current = null;
          shouldRestoreDomainRemovalFallbackRef.current = true;
          if (domainToRemove !== null) {
            onRemoveDomain(domainToRemove);
          }
          setDomainToRemove(null);
        }}
      />
      <ConfirmationModal
        modalInstanceId={DOMAIN_CANCELLATION_MODAL_ID}
        title={t`Cancel managed-domain renewal?`}
        subtitle={
          domainToCancel === null
            ? t`This Storybook action changes only local fixture state.`
            : domainCancellationEffectiveDate !== null
              ? t`This schedules cancellation effective ${domainCancellationEffectiveDate}. Removing the domain from this workspace remains a separate action.`
              : t`This Storybook action changes only local fixture state.`
        }
        confirmButtonText={t`Cancel renewal`}
        confirmButtonAccent="danger"
        finalFocus={() => {
          const triggerId = domainCancellationFinalFocusRef.current;

          return triggerId === null
            ? false
            : (document.getElementById(triggerId) ?? false);
        }}
        onClose={() => setDomainToCancel(null)}
        onConfirmClick={() => {
          if (domainToCancel !== null) {
            onRequestDomainCancellation(domainToCancel);
          }
          setDomainToCancel(null);
          closeModal(DOMAIN_CANCELLATION_MODAL_ID);
        }}
      />
    </>
  );
};
