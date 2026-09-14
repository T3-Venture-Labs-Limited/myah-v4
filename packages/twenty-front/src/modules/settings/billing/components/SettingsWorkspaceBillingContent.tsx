import { SettingsSectionSkeletonLoader } from '@/settings/components/SettingsSectionSkeletonLoader';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import {
  StyledSettingsBillingCard,
  StyledSettingsBillingCardHeader,
} from '@/settings/billing/components/internal/SettingsBillingCard';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { InlineBanner } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const usdFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
});
const formatUsdCents = (amountCents: number): string =>
  usdFormatter.format(amountCents / 100);
const formatUsdWholeDollars = (amountCents: number): string =>
  formatUsdCents(amountCents).replace('.00', '');

export type WorkspaceBillingFundingPolicy = {
  incrementCents: number;
  maximumPrincipalCents: number;
  minimumPrincipalCents: number;
  suggestedPrincipalCents: number[];
};

const parseCustomPrincipalCents = (
  dollars: string,
  policy: WorkspaceBillingFundingPolicy,
): number | null => {
  if (!/^\d+$/.test(dollars)) return null;

  const principalCents = Number(dollars) * 100;
  if (
    !Number.isSafeInteger(principalCents) ||
    principalCents < policy.minimumPrincipalCents ||
    principalCents > policy.maximumPrincipalCents ||
    principalCents % policy.incrementCents !== 0
  ) {
    return null;
  }

  return principalCents;
};
export type WorkspaceBillingSafeSummary = {
  address: {
    city: string | null;
    country: string | null;
    line1: string | null;
    line2: string | null;
    postalCode: string | null;
    state: string | null;
  };
  card: {
    brand: string;
    expiryMonth: number;
    expiryYear: number;
    last4: string;
  } | null;
  name: string | null;
  paymentMethodReady: boolean;
  taxId: { country: string | null; type: string } | null;
};
export type WorkspaceBillingFundingHistoryEntry = {
  actionRequired: boolean;
  collectedTotalCents: number | null;
  createdAt: string;
  expiresAt: string | null;
  fundingType: 'PURCHASED' | 'SPONSORED' | 'CORRECTION';
  id: string;
  invoiceUrl: string | null;
  principalCents: number;
  state:
    | 'PREPARING_PAYMENT'
    | 'AWAITING_PAYMENT'
    | 'PAYMENT_FAILED'
    | 'BALANCE_ACTIVE'
    | 'NEEDS_SUPPORT'
    | 'REFUNDED';
  taxCents: number | null;
  updatedAt: string;
};
type WorkspaceBillingReadyViewModel = {
  state: 'ready';
  availableBalanceCents: number | null;
  customerFundingAvailable: boolean;
  customerFundingBillingSummary: WorkspaceBillingSafeSummary | null;
  customerFundingPaymentMethodReady: boolean;
  customerFundingPolicy: WorkspaceBillingFundingPolicy;
  fundingHistory: WorkspaceBillingFundingHistoryEntry[];
  isSubmitting: boolean;
  retryPrincipalCents?: number | null;
  pendingOperationCount: number;
  reconciliationRequiredOperationCount: number;
};
export type WorkspaceBillingViewModel =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: 'notConnected' | 'loadFailed' }
  | WorkspaceBillingReadyViewModel;

export type WorkspaceManagedEmailSubscription = {
  action: 'CANCEL_RENEWAL' | 'STOP_SERVICE' | null;
  billingInterval: 'ANNUAL' | 'MONTHLY';
  currency: 'USD';
  paidThrough: string | null;
  productKey:
    | 'managed_sending_domain_year'
    | 'managed_mailbox_month'
    | 'managed_warmup_month';
  quantity: number;
  recurringAmountCents: number;
  resourceIds: string[];
  resourceLabels: string[];
  resourceType: 'DOMAIN' | 'MAILBOX';
  service: 'MANAGED_EMAIL';
  status: 'ACTIVE' | 'CANCELS_AT_PERIOD_END' | 'ACTION_REQUIRED';
  unitPriceCents: number;
};
export type WorkspaceManagedEmailSubscriptionsViewModel =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; subscriptions: WorkspaceManagedEmailSubscription[] };

export type SettingsWorkspaceBillingContentProps = {
  viewModel: WorkspaceBillingViewModel;
  managedEmailSubscriptions?: WorkspaceManagedEmailSubscriptionsViewModel;
  onManageManagedEmail?: () => void;
  onManagePaymentDetails?: () => void;
  onRequestFunding?: (principalCents: number) => void;
  onCompletePayment?: (actionId: string) => void;
};

const StyledCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;
const StyledBalance = styled.div`
  font-size: 28px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;
const StyledMuted = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;
const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;
const StyledAmountButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};

  &[aria-pressed='true'] {
    background: ${themeCssVariables.brand.soft};
    border-color: ${themeCssVariables.brand.solid};
    color: ${themeCssVariables.brand.text};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.brand.focusRing};
    outline-offset: 2px;
  }
`;
const StyledSummaryGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: 1fr;
  }
`;
const StyledTableWrap = styled.div`
  overflow-x: auto;
`;
const StyledTable = styled.table`
  border-collapse: collapse;
  min-width: 680px;
  width: 100%;

  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: ${themeCssVariables.spacing[2]};
    text-align: left;
    vertical-align: top;
  }

  th {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;
const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  padding: ${themeCssVariables.spacing[4]};
`;

const managedEmailProductLabel = (
  productKey: WorkspaceManagedEmailSubscription['productKey'],
): string => {
  if (productKey === 'managed_sending_domain_year') return t`Sending domain`;
  if (productKey === 'managed_mailbox_month') return t`Mailbox`;
  return t`Warmup`;
};
const fundingStateLabel = (
  state: WorkspaceBillingFundingHistoryEntry['state'],
): string => {
  switch (state) {
    case 'PREPARING_PAYMENT':
      return t`Preparing payment`;
    case 'AWAITING_PAYMENT':
      return t`Awaiting payment`;
    case 'PAYMENT_FAILED':
      return t`Payment failed`;
    case 'BALANCE_ACTIVE':
      return t`Balance active`;
    case 'NEEDS_SUPPORT':
      return t`Needs support`;
    case 'REFUNDED':
      return t`Refunded`;
  }
};

const ManagedEmailSubscriptions = ({
  viewModel,
  onManage,
}: {
  viewModel: WorkspaceManagedEmailSubscriptionsViewModel | undefined;
  onManage: (() => void) | undefined;
}) => {
  if (viewModel === undefined) return null;

  return (
    <Section>
      <H2Title
        title={t`Managed email subscriptions`}
        description={t`Managed email subscriptions renew separately and do not use your AI balance.`}
      />
      {viewModel.state === 'loading' ? (
        <SettingsSectionSkeletonLoader rowCount={3} />
      ) : viewModel.state === 'unavailable' ? (
        <InlineBanner
          color="blue"
          message={t`Managed email subscription information is temporarily unavailable.`}
        />
      ) : viewModel.subscriptions.length === 0 ? (
        <StyledSettingsBillingCard>
          <StyledEmpty>{t`No managed email subscriptions yet`}</StyledEmpty>
        </StyledSettingsBillingCard>
      ) : (
        <StyledTableWrap>
          <StyledTable aria-label={t`Managed email subscriptions`}>
            <thead>
              <tr>
                <th>{t`Product`}</th>
                <th>{t`Resources`}</th>
                <th>{t`Unit price`}</th>
                <th>{t`Recurring total`}</th>
                <th>{t`Status`}</th>
                <th>{t`Action`}</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.subscriptions.map((subscription) => (
                <tr
                  key={`${subscription.productKey}:${subscription.resourceIds.join(':')}`}
                >
                  <td>{managedEmailProductLabel(subscription.productKey)}</td>
                  <td>
                    {subscription.quantity} ·{' '}
                    {subscription.resourceLabels.join(', ')}
                  </td>
                  <td>{formatUsdCents(subscription.unitPriceCents)}</td>
                  <td>{formatUsdCents(subscription.recurringAmountCents)}</td>
                  <td>
                    {subscription.status === 'CANCELS_AT_PERIOD_END'
                      ? t`Cancels at period end`
                      : subscription.status === 'ACTION_REQUIRED'
                        ? t`Action required`
                        : t`Active`}
                  </td>
                  <td>
                    {subscription.action !== null && onManage !== undefined ? (
                      <Button
                        title={t`Manage`}
                        variant="secondary"
                        size="small"
                        onClick={onManage}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </StyledTable>
        </StyledTableWrap>
      )}
      <StyledMuted>
        {t`AI usage and balance are tracked separately from managed email.`}
      </StyledMuted>
    </Section>
  );
};

const PaymentSummary = ({
  summary,
  onManage,
  isCustomerFundingAvailable,
}: {
  summary: WorkspaceBillingSafeSummary | null;
  onManage: (() => void) | undefined;
  isCustomerFundingAvailable: boolean;
}) => {
  const address = summary?.address;
  const addressText = [
    address?.line1,
    address?.line2,
    address?.city,
    address?.state,
    address?.postalCode,
    address?.country,
  ]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(', ');

  return (
    <Section>
      <H2Title
        title={t`Payment & billing details`}
        description={t`Used for Stripe payment collection and applicable tax.`}
      />
      <StyledSettingsBillingCard>
        <StyledCardBody>
          {summary === null ? (
            <StyledMuted>{t`No payment and billing details saved.`}</StyledMuted>
          ) : (
            <>
              {summary.card === null ? (
                <StyledMuted>{t`No payment method on file.`}</StyledMuted>
              ) : (
                <strong>
                  {summary.card.brand} {'•••• '} {summary.card.last4} ·{' '}
                  {String(summary.card.expiryMonth).padStart(2, '0')}/
                  {String(summary.card.expiryYear).slice(-2).padStart(2, '0')}
                </strong>
              )}
              {summary.name !== null ? <span>{summary.name}</span> : null}
              {addressText !== '' ? (
                <StyledMuted>{addressText}</StyledMuted>
              ) : null}
              {summary.taxId !== null ? (
                <StyledMuted>
                  {t`Tax ID: ${summary.taxId.type}${summary.taxId.country === null ? '' : ` (${summary.taxId.country})`}`}
                </StyledMuted>
              ) : null}
            </>
          )}
          {isCustomerFundingAvailable ? (
            onManage !== undefined ? (
              <StyledActions>
                <Button
                  title={t`Update payment details`}
                  variant="secondary"
                  onClick={onManage}
                />
              </StyledActions>
            ) : null
          ) : (
            <InlineBanner
              color="blue"
              message={t`Payment details are unavailable because AI funding is not enabled for this workspace.`}
            />
          )}
        </StyledCardBody>
      </StyledSettingsBillingCard>
    </Section>
  );
};

const FundingHistory = ({
  entries,
  onCompletePayment,
}: {
  entries: WorkspaceBillingFundingHistoryEntry[];
  onCompletePayment: ((actionId: string) => void) | undefined;
}) => (
  <Section>
    <H2Title
      title={t`AI funding history`}
      description={t`Purchased and sponsored AI credit activity.`}
    />
    {entries.length === 0 ? (
      <StyledSettingsBillingCard>
        <StyledEmpty>{t`No AI funding activity yet`}</StyledEmpty>
      </StyledSettingsBillingCard>
    ) : (
      <StyledTableWrap>
        <StyledTable aria-label={t`AI funding history`}>
          <thead>
            <tr>
              <th>{t`Date`}</th>
              <th>{t`Type`}</th>
              <th>{t`Amount`}</th>
              <th>{t`Status`}</th>
              <th>{t`Expiration`}</th>
              <th>{t`Action`}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{entry.fundingType}</td>
                <td>
                  <div>{t`Principal: ${formatUsdCents(entry.principalCents)}`}</div>
                  {entry.taxCents !== null ? (
                    <div>
                      <StyledMuted>
                        {t`Tax: ${formatUsdCents(entry.taxCents)}`}
                      </StyledMuted>
                    </div>
                  ) : null}
                  {entry.collectedTotalCents !== null ? (
                    <div>
                      <strong>
                        {t`Total collected: ${formatUsdCents(entry.collectedTotalCents)}`}
                      </strong>
                    </div>
                  ) : null}
                </td>
                <td>{fundingStateLabel(entry.state)}</td>
                <td>
                  {entry.expiresAt === null
                    ? '—'
                    : new Date(entry.expiresAt).toLocaleDateString()}
                </td>
                <td>
                  <StyledActions>
                    {entry.invoiceUrl !== null ? (
                      <a
                        href={entry.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t`Invoice`}
                      </a>
                    ) : null}
                    {entry.actionRequired && onCompletePayment !== undefined ? (
                      <Button
                        title={t`Complete payment`}
                        variant="secondary"
                        size="small"
                        onClick={() => onCompletePayment(entry.id)}
                      />
                    ) : null}
                  </StyledActions>
                </td>
              </tr>
            ))}
          </tbody>
        </StyledTable>
      </StyledTableWrap>
    )}
  </Section>
);

export const SettingsWorkspaceBillingContent = ({
  managedEmailSubscriptions,
  onCompletePayment,
  onManageManagedEmail,
  onManagePaymentDetails,
  onRequestFunding,
  viewModel,
}: SettingsWorkspaceBillingContentProps) => {
  const [customAmountDollars, setCustomAmountDollars] = useState('');
  const [isCustomAmountActive, setIsCustomAmountActive] = useState(false);
  const [selectedSuggestedPrincipalCents, setSelectedSuggestedPrincipalCents] =
    useState<number | null>(null);
  const managedEmail = (
    <ManagedEmailSubscriptions
      viewModel={managedEmailSubscriptions}
      onManage={onManageManagedEmail}
    />
  );

  if (viewModel.state === 'loading') {
    return (
      <>
        {managedEmail}
        <SettingsSectionSkeletonLoader rowCount={5} />
      </>
    );
  }

  if (viewModel.state === 'unavailable') {
    return (
      <>
        {managedEmail}
        <Section>
          <H2Title
            title={t`AI balance`}
            description={t`Prepaid managed AI credit.`}
          />
          <InlineBanner
            color="blue"
            message={
              viewModel.reason === 'loadFailed'
                ? t`AI billing information is temporarily unavailable.`
                : t`AI billing is not connected for this workspace.`
            }
          />
        </Section>
      </>
    );
  }

  const { customerFundingPolicy } = viewModel;
  const retryPrincipalCents = viewModel.retryPrincipalCents ?? null;
  const isRetryingAmount = retryPrincipalCents !== null;
  const selectedSuggestionPrincipalCents =
    selectedSuggestedPrincipalCents !== null &&
    customerFundingPolicy.suggestedPrincipalCents.includes(
      selectedSuggestedPrincipalCents,
    )
      ? selectedSuggestedPrincipalCents
      : (customerFundingPolicy.suggestedPrincipalCents[0] ?? null);
  const customPrincipalCents = isCustomAmountActive
    ? parseCustomPrincipalCents(customAmountDollars, customerFundingPolicy)
    : null;
  const principalCents = isRetryingAmount
    ? retryPrincipalCents
    : isCustomAmountActive
      ? customPrincipalCents
      : selectedSuggestionPrincipalCents;
  const customAmountValue = isRetryingAmount
    ? String(retryPrincipalCents / 100)
    : customAmountDollars;
  const customAmountError =
    isCustomAmountActive && customPrincipalCents === null
      ? t`Enter a whole-dollar amount from ${formatUsdWholeDollars(customerFundingPolicy.minimumPrincipalCents)} to ${formatUsdWholeDollars(customerFundingPolicy.maximumPrincipalCents)}.`
      : undefined;
  const availableBalance = viewModel.availableBalanceCents;

  return (
    <>
      {managedEmail}
      <Section>
        <H2Title
          title={t`AI balance`}
          description={t`Prepaid credit used by Myah-managed AI.`}
        />
        <StyledSummaryGrid>
          <StyledSettingsBillingCard>
            <StyledSettingsBillingCardHeader>
              {t`Available`}
            </StyledSettingsBillingCardHeader>
            <StyledCardBody>
              <StyledBalance>
                {availableBalance === null
                  ? '—'
                  : formatUsdCents(availableBalance)}
              </StyledBalance>
              <StyledMuted>
                {t`${viewModel.pendingOperationCount} payment or usage operation(s) pending`}
              </StyledMuted>
              {viewModel.reconciliationRequiredOperationCount > 0 ? (
                <InlineBanner
                  color="blue"
                  message={t`Some billing activity needs support review.`}
                />
              ) : null}
            </StyledCardBody>
          </StyledSettingsBillingCard>
          <StyledSettingsBillingCard>
            <StyledSettingsBillingCardHeader>
              {t`Add AI credit`}
            </StyledSettingsBillingCardHeader>
            <StyledCardBody>
              <StyledActions role="group" aria-label={t`AI credit amount`}>
                {customerFundingPolicy.suggestedPrincipalCents.map(
                  (suggestedPrincipalCents) => (
                    <StyledAmountButton
                      key={suggestedPrincipalCents}
                      type="button"
                      aria-pressed={
                        !isRetryingAmount &&
                        !isCustomAmountActive &&
                        suggestedPrincipalCents ===
                          selectedSuggestionPrincipalCents
                      }
                      disabled={isRetryingAmount}
                      onClick={() => {
                        setCustomAmountDollars('');
                        setIsCustomAmountActive(false);
                        setSelectedSuggestedPrincipalCents(
                          suggestedPrincipalCents,
                        );
                      }}
                    >
                      {formatUsdWholeDollars(suggestedPrincipalCents)}
                    </StyledAmountButton>
                  ),
                )}
              </StyledActions>
              <SettingsTextInput
                error={customAmountError}
                inputMode="numeric"
                instanceId="settings-workspace-billing-custom-amount"
                label={t`Custom amount`}
                leftAdornment="$"
                onChange={(value) => {
                  if (isRetryingAmount) return;

                  setIsCustomAmountActive(true);
                  setCustomAmountDollars(value);
                }}
                readOnly={isRetryingAmount}
                value={customAmountValue}
              />
              <StyledMuted>
                {t`Your saved payment method will be charged immediately. Applicable tax may be added. Purchased credit expires 12 months after payment. Purchases are non-refundable except where law requires.`}
              </StyledMuted>
              <StyledActions>
                <Button
                  title={
                    principalCents === null
                      ? t`Add AI credit`
                      : isRetryingAmount
                        ? t`Retry ${formatUsdWholeDollars(principalCents)} credit`
                        : t`Add ${formatUsdWholeDollars(principalCents)} credit`
                  }
                  accent="brand"
                  disabled={
                    principalCents === null ||
                    !viewModel.customerFundingAvailable ||
                    viewModel.isSubmitting
                  }
                  isLoading={viewModel.isSubmitting}
                  onClick={() => {
                    if (principalCents !== null) {
                      onRequestFunding?.(principalCents);
                    }
                  }}
                />
              </StyledActions>
            </StyledCardBody>
          </StyledSettingsBillingCard>
        </StyledSummaryGrid>
      </Section>
      <PaymentSummary
        summary={viewModel.customerFundingBillingSummary}
        onManage={
          viewModel.customerFundingAvailable
            ? onManagePaymentDetails
            : undefined
        }
        isCustomerFundingAvailable={viewModel.customerFundingAvailable}
      />
      <FundingHistory
        entries={viewModel.fundingHistory}
        onCompletePayment={onCompletePayment}
      />
    </>
  );
};
