import { SettingsSectionSkeletonLoader } from '@/settings/components/SettingsSectionSkeletonLoader';
import { SettingsBillingLabelValueItem } from '@/settings/billing/components/internal/SettingsBillingLabelValueItem';
import {
  StyledSettingsBillingCard,
  StyledSettingsBillingCardHeader,
} from '@/settings/billing/components/internal/SettingsBillingCard';
import { SubscriptionInfoContainer } from '@/settings/billing/components/SubscriptionInfoContainer';
import { Select } from '@/ui/input/components/Select';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { activeTabIdComponentState } from '@/ui/layout/tab-list/states/activeTabIdComponentState';
import { TabList } from '@/ui/layout/tab-list/components/TabList';
import { Table } from '@/ui/layout/table/components/Table';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { useState } from 'react';
import { Status } from 'twenty-ui/data-display';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';
import { Button } from 'twenty-ui/input';
import { InlineBanner } from 'twenty-ui/feedback';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

const EM_DASH = '—';
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const formatUsdCents = (amountCents: number): string =>
  usdFormatter.format(amountCents / 100);
const WORKSPACE_BILLING_TAB_LIST_ID = 'settings-workspace-billing-tabs';
const WORKSPACE_BILLING_TAB_IDS = {
  USAGE: 'usage',
  BILLING_HISTORY: 'billing-history',
} as const;
type UsagePeriod = '7d' | '30d' | '90d';

export type WorkspaceBillingUsageStatus =
  | 'settled'
  | 'processing'
  | 'notCharged'
  | 'underReview';
export type WorkspaceBillingUsageEntry = {
  id: string;
  occurredAt: string;
  activity: string;
  member: string;
  status: WorkspaceBillingUsageStatus;
  chargeCents: number | null;
};
export type WorkspaceBillingHistoryEntry = {
  id: string;
  occurredAt: string;
  description: string;
  type: 'purchasedTopUp' | 'sponsoredGrant' | 'refund' | 'adjustment';
  amountCents: number;
  document?: { label: string; url: string };
};
type WorkspaceBillingReadyViewModel = {
  state: 'ready';
  balanceStatus: 'healthy' | 'low' | 'empty';
  availableBalanceCents: number;
  sponsoredBalanceCents: number | null;
  purchasedBalanceCents: number | null;
  monthToDateSpendCents: number;
  settledOperationCount: number;
  monthToDateRangeLabel: string;
  usageHistory: WorkspaceBillingUsageEntry[];
  billingHistory: WorkspaceBillingHistoryEntry[];
};
export type WorkspaceBillingViewModel =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: 'notConnected' | 'loadFailed' }
  | WorkspaceBillingReadyViewModel;

const StyledSummary = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: 1fr;
  }
`;
const StyledCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
`;
const StyledPrimaryValue = styled.div`
  font-size: 28px;
  font-weight: 600;
`;
const StyledBreakdown = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
const StyledActions = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
`;
const StyledComingSoonText = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
`;
const StyledEmptyCopy = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  margin: 0;
`;
const StyledLowBalanceWarning = styled.div`
  align-items: center;
  background: ${themeCssVariables.snackBar.warning.backgroundColor};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.snackBar.warning.color};
  display: flex;
  gap: 8px;
  padding: 8px 12px;
`;
const StyledBillingEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 8px;
`;
const StyledDocumentLink = styled.a`
  color: ${themeCssVariables.font.color.primary};
`;
const StyledResponsiveTableRow = styled(TableRow)`
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: minmax(96px, 0.9fr) minmax(0, 1.5fr) minmax(
        88px,
        0.8fr
      ) !important;
  }
`;
const StyledResponsiveTableHeader = styled(TableHeader)`
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    &:nth-child(3),
    &:nth-child(4) {
      display: none;
    }
  }
`;
const StyledResponsiveTableCell = styled(TableCell)`
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    &:nth-child(3),
    &:nth-child(4) {
      display: none;
    }
  }
`;
const StyledResponsivePrimaryCell = styled(TableCell)`
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
`;
const StyledResponsiveMetadata = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  display: none;
  font-size: 12px;
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    display: block;
  }
`;
const getUsageStatus = (status: WorkspaceBillingUsageStatus) => {
  switch (status) {
    case 'settled':
      return { label: t`Settled` };
    case 'processing':
      return { label: t`Processing` };
    case 'notCharged':
      return { label: t`Not charged` };
    case 'underReview':
      return { label: t`Under review` };
  }
};

const getUsageAmount = (
  status: WorkspaceBillingUsageStatus,
  chargeCents: number | null,
) => {
  if (status === 'processing' || status === 'underReview') return t`Pending`;
  if (status === 'notCharged') return formatUsdCents(0);
  if (chargeCents === null) return EM_DASH;
  return formatUsdCents(chargeCents);
};

const getBillingHistoryTypeLabel = (
  type: WorkspaceBillingHistoryEntry['type'],
) => {
  switch (type) {
    case 'purchasedTopUp':
      return t`Purchased top-up`;
    case 'sponsoredGrant':
      return t`Sponsored grant`;
    case 'refund':
      return t`Refund`;
    case 'adjustment':
      return t`Adjustment`;
  }
};

const formatSignedUsdCents = (amountCents: number) =>
  amountCents > 0
    ? `+${formatUsdCents(amountCents)}`
    : formatUsdCents(amountCents);

const usageColumns =
  'minmax(132px, 0.9fr) minmax(180px, 1.5fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(96px, 0.7fr)';
const billingHistoryColumns =
  'minmax(120px, 0.9fr) minmax(170px, 1.4fr) minmax(110px, 1fr) minmax(150px, 1.2fr) minmax(90px, 0.7fr)';

const renderUnknownSummary = () => (
  <StyledSummary>
    <SubscriptionInfoContainer>
      <StyledCardBody>
        <SettingsBillingLabelValueItem
          label={t`Available balance`}
          value={EM_DASH}
        />
      </StyledCardBody>
    </SubscriptionInfoContainer>
    <SubscriptionInfoContainer>
      <StyledCardBody>
        <SettingsBillingLabelValueItem
          label={t`Month-to-date spend`}
          value={EM_DASH}
        />
        <SettingsBillingLabelValueItem
          label={t`Settled operations`}
          value={EM_DASH}
        />
      </StyledCardBody>
    </SubscriptionInfoContainer>
  </StyledSummary>
);

const renderUnavailable = (reason: 'notConnected' | 'loadFailed') => (
  <>
    <InlineBanner
      color="blue"
      message={
        reason === 'notConnected'
          ? t`Live billing information has not been connected yet.`
          : t`Billing information is temporarily unavailable.`
      }
    />
    <Section>
      <H2Title title={t`Balance`} description={t`Workspace billing summary`} />
      {renderUnknownSummary()}
      <StyledActions>
        <Button
          ariaLabel={t`Add funds`}
          title={t`Add funds`}
          variant="secondary"
          disabled
        />
        <StyledComingSoonText>{t`Online top-ups coming soon`}</StyledComingSoonText>
      </StyledActions>
    </Section>
    <Section>
      <H2Title title={t`Usage`} description={t`Recent workspace usage`} />
      <StyledEmptyCopy>{t`Usage details will appear here when billing data is connected.`}</StyledEmptyCopy>
    </Section>
    <Section>
      <H2Title
        title={t`Billing history`}
        description={t`Workspace billing activity`}
      />
      <StyledEmptyCopy>{t`Billing history will appear here when billing data is connected.`}</StyledEmptyCopy>
    </Section>
  </>
);

export const SettingsWorkspaceBillingContent = ({
  viewModel,
}: {
  viewModel: WorkspaceBillingViewModel;
}) => {
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>('30d');
  const activeTabId = useAtomComponentStateValue(
    activeTabIdComponentState,
    WORKSPACE_BILLING_TAB_LIST_ID,
  );
  if (viewModel.state === 'loading')
    return (
      <>
        <SettingsSectionSkeletonLoader rowCount={3} />
        <SettingsSectionSkeletonLoader rowCount={4} />
        <SettingsSectionSkeletonLoader rowCount={4} />
      </>
    );
  if (viewModel.state === 'unavailable')
    return renderUnavailable(viewModel.reason);
  const displayedTabId = activeTabId ?? WORKSPACE_BILLING_TAB_IDS.USAGE;
  return (
    <>
      <Section>
        <H2Title
          title={t`Balance`}
          description={t`Workspace billing summary`}
        />
        {viewModel.balanceStatus === 'low' && (
          <StyledLowBalanceWarning>
            <Status color="orange" text={t`Low balance`} weight="medium" />
            <span>{t`Managed services may pause soon.`}</span>
          </StyledLowBalanceWarning>
        )}
        {viewModel.balanceStatus === 'empty' && (
          <InlineBanner
            color="danger"
            message={t`Your balance is empty. Managed services are paused until funds are added.`}
          />
        )}
        <StyledSummary>
          <StyledSettingsBillingCard>
            <StyledSettingsBillingCardHeader>{t`Available balance`}</StyledSettingsBillingCardHeader>
            <StyledCardBody>
              <StyledPrimaryValue>
                {formatUsdCents(viewModel.availableBalanceCents)}
              </StyledPrimaryValue>
              <StyledBreakdown>
                {viewModel.sponsoredBalanceCents !== null && (
                  <SettingsBillingLabelValueItem
                    label={t`Sponsored`}
                    value={t`${formatUsdCents(viewModel.sponsoredBalanceCents)} sponsored`}
                  />
                )}
                {viewModel.purchasedBalanceCents !== null && (
                  <SettingsBillingLabelValueItem
                    label={t`Purchased`}
                    value={t`${formatUsdCents(viewModel.purchasedBalanceCents)} purchased`}
                  />
                )}
              </StyledBreakdown>
              <StyledActions>
                <Button
                  ariaLabel={t`Add funds`}
                  title={t`Add funds`}
                  variant="secondary"
                  disabled
                />
                <StyledComingSoonText>{t`Online top-ups coming soon`}</StyledComingSoonText>
              </StyledActions>
            </StyledCardBody>
          </StyledSettingsBillingCard>
          <StyledSettingsBillingCard>
            <StyledSettingsBillingCardHeader>{t`Month-to-date spend`}</StyledSettingsBillingCardHeader>
            <StyledCardBody>
              <StyledPrimaryValue>
                {formatUsdCents(viewModel.monthToDateSpendCents)}
              </StyledPrimaryValue>
              <SettingsBillingLabelValueItem
                label={t`Operations`}
                value={plural(viewModel.settledOperationCount, {
                  one: `${viewModel.settledOperationCount} managed operation`,
                  other: `${viewModel.settledOperationCount} managed operations`,
                })}
              />
              <SettingsBillingLabelValueItem
                label={t`Period`}
                value={viewModel.monthToDateRangeLabel}
              />
            </StyledCardBody>
          </StyledSettingsBillingCard>
        </StyledSummary>
      </Section>
      <Section>
        <TabList
          ariaLabel={t`Billing records`}
          componentInstanceId={WORKSPACE_BILLING_TAB_LIST_ID}
          behaveAsLinks={false}
          tabs={[
            { id: WORKSPACE_BILLING_TAB_IDS.USAGE, title: t`Usage history` },
            {
              id: WORKSPACE_BILLING_TAB_IDS.BILLING_HISTORY,
              title: t`Billing history`,
            },
          ]}
        />
        {displayedTabId === WORKSPACE_BILLING_TAB_IDS.USAGE && (
          <>
            <Select
              label={t`Usage period`}
              dropdownId="workspace-billing-usage-period"
              value={usagePeriod}
              options={[
                { value: '7d', label: t`Last 7 days` },
                { value: '30d', label: t`Last 30 days` },
                { value: '90d', label: t`Last 90 days` },
              ]}
              onChange={(value) => setUsagePeriod(value as UsagePeriod)}
            />
            {viewModel.usageHistory.length === 0 ? (
              <StyledBillingEmptyState>
                <strong>{t`No usage yet`}</strong>
                <StyledEmptyCopy>
                  {t`Managed service activity will appear here when your workspace starts using it.`}
                </StyledEmptyCopy>
              </StyledBillingEmptyState>
            ) : (
              <Table role="table" aria-label={t`Usage history`}>
                <StyledResponsiveTableRow
                  role="row"
                  gridTemplateColumns={usageColumns}
                >
                  <StyledResponsiveTableHeader role="columnheader">{t`Date`}</StyledResponsiveTableHeader>
                  <StyledResponsiveTableHeader role="columnheader">{t`Activity`}</StyledResponsiveTableHeader>
                  <StyledResponsiveTableHeader role="columnheader">{t`Member`}</StyledResponsiveTableHeader>
                  <StyledResponsiveTableHeader role="columnheader">{t`Status`}</StyledResponsiveTableHeader>
                  <StyledResponsiveTableHeader
                    role="columnheader"
                    align="right"
                  >{t`Amount`}</StyledResponsiveTableHeader>
                </StyledResponsiveTableRow>
                {viewModel.usageHistory.map((entry) => (
                  <StyledResponsiveTableRow
                    key={entry.id}
                    role="row"
                    gridTemplateColumns={usageColumns}
                  >
                    <StyledResponsiveTableCell role="cell">
                      {new Date(entry.occurredAt).toLocaleString()}
                    </StyledResponsiveTableCell>
                    <StyledResponsivePrimaryCell role="cell">
                      {entry.activity}
                      <StyledResponsiveMetadata>
                        {t`${entry.member} · ${getUsageStatus(entry.status).label}`}
                      </StyledResponsiveMetadata>
                    </StyledResponsivePrimaryCell>
                    <StyledResponsiveTableCell role="cell">
                      {entry.member}
                    </StyledResponsiveTableCell>
                    <StyledResponsiveTableCell role="cell">
                      {getUsageStatus(entry.status).label}
                    </StyledResponsiveTableCell>
                    <StyledResponsiveTableCell role="cell" align="right">
                      {getUsageAmount(entry.status, entry.chargeCents)}
                    </StyledResponsiveTableCell>
                  </StyledResponsiveTableRow>
                ))}
              </Table>
            )}
          </>
        )}
        {displayedTabId === WORKSPACE_BILLING_TAB_IDS.BILLING_HISTORY &&
          (viewModel.billingHistory.length === 0 ? (
            <StyledBillingEmptyState>
              <strong>{t`No billing events yet`}</strong>
              <StyledEmptyCopy>
                {t`Funding events will appear here when funds are added or adjusted.`}
              </StyledEmptyCopy>
            </StyledBillingEmptyState>
          ) : (
            <Table role="table" aria-label={t`Billing history`}>
              <StyledResponsiveTableRow
                role="row"
                gridTemplateColumns={billingHistoryColumns}
              >
                <StyledResponsiveTableHeader role="columnheader">{t`Date`}</StyledResponsiveTableHeader>
                <StyledResponsiveTableHeader role="columnheader">{t`Event`}</StyledResponsiveTableHeader>
                <StyledResponsiveTableHeader role="columnheader">{t`Type`}</StyledResponsiveTableHeader>
                <StyledResponsiveTableHeader role="columnheader">{t`Document`}</StyledResponsiveTableHeader>
                <StyledResponsiveTableHeader
                  role="columnheader"
                  align="right"
                >{t`Amount`}</StyledResponsiveTableHeader>
              </StyledResponsiveTableRow>
              {viewModel.billingHistory.map((entry) => (
                <StyledResponsiveTableRow
                  key={entry.id}
                  role="row"
                  gridTemplateColumns={billingHistoryColumns}
                >
                  <StyledResponsiveTableCell role="cell">
                    {new Date(entry.occurredAt).toLocaleString()}
                  </StyledResponsiveTableCell>
                  <StyledResponsivePrimaryCell role="cell">
                    {entry.description}
                    <StyledResponsiveMetadata>
                      {getBillingHistoryTypeLabel(entry.type)}
                      {entry.document !== undefined && (
                        <>
                          {' · '}
                          <StyledDocumentLink href={entry.document.url}>
                            {entry.document.label}
                          </StyledDocumentLink>
                        </>
                      )}
                    </StyledResponsiveMetadata>
                  </StyledResponsivePrimaryCell>
                  <StyledResponsiveTableCell role="cell">
                    {getBillingHistoryTypeLabel(entry.type)}
                  </StyledResponsiveTableCell>
                  <StyledResponsiveTableCell role="cell">
                    {entry.document === undefined ? (
                      EM_DASH
                    ) : (
                      <StyledDocumentLink href={entry.document.url}>
                        {entry.document.label}
                      </StyledDocumentLink>
                    )}
                  </StyledResponsiveTableCell>
                  <StyledResponsiveTableCell role="cell" align="right">
                    {formatSignedUsdCents(entry.amountCents)}
                  </StyledResponsiveTableCell>
                </StyledResponsiveTableRow>
              ))}
            </Table>
          ))}
      </Section>
    </>
  );
};
