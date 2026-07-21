import { SettingsSectionSkeletonLoader } from '@/settings/components/SettingsSectionSkeletonLoader';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button } from 'twenty-ui/input';
import { InlineBanner } from 'twenty-ui/feedback';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

const EM_DASH = '—';

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
  document?: {
    label: string;
    url: string;
  };
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
  | {
      state: 'unavailable';
      reason: 'notConnected' | 'loadFailed';
    }
  | WorkspaceBillingReadyViewModel;

const StyledSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const StyledSummaryItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledValue = styled.span`
  font-size: 20px;
  font-weight: 600;
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

const renderUnknownSummary = () => (
  <StyledSummary>
    <StyledSummaryItem>
      <StyledLabel>{t`Available balance`}</StyledLabel>
      <StyledValue>{EM_DASH}</StyledValue>
    </StyledSummaryItem>
    <StyledSummaryItem>
      <StyledLabel>{t`Month-to-date spend`}</StyledLabel>
      <StyledValue>{EM_DASH}</StyledValue>
    </StyledSummaryItem>
    <StyledSummaryItem>
      <StyledLabel>{t`Settled operations`}</StyledLabel>
      <StyledValue>{EM_DASH}</StyledValue>
    </StyledSummaryItem>
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
  if (viewModel.state === 'loading') {
    return (
      <>
        <SettingsSectionSkeletonLoader rowCount={3} />
        <SettingsSectionSkeletonLoader rowCount={4} />
        <SettingsSectionSkeletonLoader rowCount={4} />
      </>
    );
  }

  if (viewModel.state === 'unavailable') {
    return renderUnavailable(viewModel.reason);
  }

  return null;
};
