import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingSafeSummary,
  type WorkspaceBillingViewModel,
  type WorkspaceManagedEmailSubscription,
  type WorkspaceManagedEmailSubscriptionsViewModel,
} from '@/settings/billing/components/SettingsWorkspaceBillingContent';
import {
  ManagedProviderCustomerFundingPaymentActionForm,
  ManagedProviderCustomerFundingPaymentForm,
  type CustomerFundingBillingDetails,
} from '@/settings/billing/components/ManagedProviderCustomerFundingStripeForms';
import {
  ACKNOWLEDGE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION,
  COMPLETE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD,
  GET_MANAGED_PROVIDER_BILLING_STATUS,
  PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION,
  PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD,
  REQUEST_MANAGED_PROVIDER_CUSTOMER_FUNDING,
} from '@/settings/billing/graphql/managedProviderCustomerFunding';
import { GET_MANAGED_EMAIL_SUBSCRIPTIONS } from '@/settings/workspace/graphql/managed-email/managedEmailQueries';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export type SettingsBillingProps = {
  viewModel?: WorkspaceBillingViewModel;
};

type ManagedEmailSubscriptionsQueryData = {
  managedEmailSubscriptions: WorkspaceManagedEmailSubscription[];
};
type FundingHistoryItem = {
  actionRequired: boolean;
  collectedTotalCents: string | null;
  createdAt: string;
  expiresAt: string | null;
  fundingType: 'PURCHASED' | 'SPONSORED' | 'CORRECTION';
  id: string;
  invoiceUrl: string | null;
  presetId: string | null;
  principalCents: string;
  state:
    | 'PREPARING_PAYMENT'
    | 'AWAITING_PAYMENT'
    | 'PAYMENT_FAILED'
    | 'BALANCE_ACTIVE'
    | 'NEEDS_SUPPORT'
    | 'REFUNDED';
  taxCents: string | null;
  updatedAt: string;
};
type ManagedProviderBillingStatusQueryData = {
  managedProviderBillingStatus: {
    available: boolean;
    prepaidBalanceCents: string | null;
    pendingOperationCount: number;
    reconciliationRequiredOperationCount: number;
    customerFundingAvailable: boolean;
    customerFundingPaymentMethodReady: boolean;
    customerFundingPresets: { id: string; principalCents: string }[];
    customerFundingBillingSummary: WorkspaceBillingSafeSummary | null;
    customerFundingHistory: FundingHistoryItem[];
  };
};
type PaymentMethodPreparation = {
  billingSummary: WorkspaceBillingSafeSummary | null;
  clientSecret: string | null;
  publishableKey: string | null;
  ready: boolean;
  setupIntentId: string | null;
};
type PreparePaymentMethodData = {
  prepareManagedProviderCustomerFundingPaymentMethod: PaymentMethodPreparation;
};
type PreparePaymentActionData = {
  prepareManagedProviderCustomerFundingPaymentAction: {
    clientSecret: string;
  };
};
type RequestFundingData = {
  requestManagedProviderCustomerFunding: { id: string };
};

const toSafeCents = (value: string | null): number | null => {
  if (value === null) return null;
  const amount = Number(value);

  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};
const newIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `billing-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const SettingsBilling = ({ viewModel: suppliedViewModel }: SettingsBillingProps) => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();
  const { enqueueErrorSnackBar } = useSnackBar();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<
    'AI_25_USD' | 'AI_50_USD' | 'AI_100_USD' | null
  >(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingFundingRequest, setPendingFundingRequest] = useState<{
    idempotencyKey: string;
    presetId: 'AI_25_USD' | 'AI_50_USD' | 'AI_100_USD';
  } | null>(null);
  const [paymentPreparation, setPaymentPreparation] =
    useState<PaymentMethodPreparation | null>(null);
  const [paymentAction, setPaymentAction] = useState<{
    actionId: string;
    clientSecret: string;
  } | null>(null);
  const {
    data: managedEmailSubscriptionsData,
    error: managedEmailSubscriptionsError,
    loading: managedEmailSubscriptionsLoading,
  } = useQuery<ManagedEmailSubscriptionsQueryData>(
    GET_MANAGED_EMAIL_SUBSCRIPTIONS,
  );
  const {
    data: fundingData,
    error: fundingError,
    loading: fundingLoading,
    refetch: refetchFunding,
  } = useQuery<ManagedProviderBillingStatusQueryData>(
    GET_MANAGED_PROVIDER_BILLING_STATUS,
    { pollInterval: 5_000 },
  );
  const [preparePaymentMethod] = useMutation<PreparePaymentMethodData>(
    PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD,
  );
  const [completePaymentMethod] = useMutation(
    COMPLETE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD,
  );
  const [requestFunding] = useMutation<RequestFundingData>(
    REQUEST_MANAGED_PROVIDER_CUSTOMER_FUNDING,
  );
  const [preparePaymentAction] = useMutation<PreparePaymentActionData>(
    PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION,
  );
  const [acknowledgePaymentAction] = useMutation(
    ACKNOWLEDGE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION,
  );
  const managedEmailSubscriptions: WorkspaceManagedEmailSubscriptionsViewModel =
    managedEmailSubscriptionsLoading
      ? { state: 'loading' }
      : managedEmailSubscriptionsError !== undefined
        ? { state: 'unavailable' }
        : {
            state: 'ready',
            subscriptions:
              managedEmailSubscriptionsData?.managedEmailSubscriptions ?? [],
          };
  const status = fundingData?.managedProviderBillingStatus;
  useEffect(() => {
    if (
      pendingActionId !== null &&
      status?.customerFundingHistory.some(
        (entry) => entry.id === pendingActionId,
      )
    ) {
      setPendingActionId(null);
    }
  }, [pendingActionId, status?.customerFundingHistory]);
  const fetchedViewModel: WorkspaceBillingViewModel = fundingLoading
    ? { state: 'loading' }
    : fundingError !== undefined || status === undefined
      ? { state: 'unavailable', reason: 'loadFailed' }
      : !status.available
        ? { state: 'unavailable', reason: 'notConnected' }
        : {
          availableBalanceCents: toSafeCents(status.prepaidBalanceCents),
          customerFundingAvailable: status.customerFundingAvailable,
          customerFundingBillingSummary:
            status.customerFundingBillingSummary,
          customerFundingPaymentMethodReady:
            status.customerFundingPaymentMethodReady,
          customerFundingPresets: status.customerFundingPresets
            .map((preset) => ({
              id: preset.id as
                | 'AI_25_USD'
                | 'AI_50_USD'
                | 'AI_100_USD',
              principalCents: toSafeCents(preset.principalCents),
            }))
            .filter(
              (
                preset,
              ): preset is {
                id: 'AI_25_USD' | 'AI_50_USD' | 'AI_100_USD';
                principalCents: number;
              } => preset.principalCents !== null,
            ),
          fundingHistory: status.customerFundingHistory
            .map((entry) => ({
              ...entry,
              collectedTotalCents: toSafeCents(entry.collectedTotalCents),
              principalCents: toSafeCents(entry.principalCents),
              taxCents: toSafeCents(entry.taxCents),
            }))
            .filter(
              (entry): entry is typeof entry & { principalCents: number } =>
                entry.principalCents !== null,
            ),
          isSubmitting: isSubmitting || pendingActionId !== null,
          retryPresetId: pendingFundingRequest?.presetId ?? null,
          pendingOperationCount: status.pendingOperationCount,
          reconciliationRequiredOperationCount:
            status.reconciliationRequiredOperationCount,
          state: 'ready',
        };
  const viewModel = suppliedViewModel ?? fetchedViewModel;

  const showError = (error: unknown) => {
    if (CombinedGraphQLErrors.is(error)) {
      enqueueErrorSnackBar({ apolloError: error });
    } else {
      enqueueErrorSnackBar({ message: t`Billing action could not be completed.` });
    }
  };
  const submitFunding = async (
    presetId: 'AI_25_USD' | 'AI_50_USD' | 'AI_100_USD',
  ) => {
    const request =
      pendingFundingRequest ?? {
        idempotencyKey: newIdempotencyKey(),
        presetId,
      };

    setPendingFundingRequest(request);
    setIsSubmitting(true);
    try {
      const result = await requestFunding({
        variables: {
          idempotencyKey: request.idempotencyKey,
          preset: request.presetId,
        },
      });
      const actionId = result.data?.requestManagedProviderCustomerFunding.id;
      if (actionId === undefined) throw new Error('Missing funding action');
      setPendingFundingRequest(null);
      setPendingActionId(actionId);
    } catch (error) {
      showError(error);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    try {
      await refetchFunding();
    } catch {
      // Polling will reconcile the locally pending action without inviting a retry.
    }
  };
  const managePaymentDetails = async (): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const result = await preparePaymentMethod();
      const preparation =
        result.data?.prepareManagedProviderCustomerFundingPaymentMethod;
      if (preparation === undefined) throw new Error('Missing setup response');
      setPaymentPreparation(preparation);
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };
  const requestTopUp = async (
    presetId: 'AI_25_USD' | 'AI_50_USD' | 'AI_100_USD',
  ) => {
    if (
      viewModel.state === 'ready' &&
      viewModel.customerFundingPaymentMethodReady
    ) {
      await submitFunding(presetId);
      return;
    }
    if (await managePaymentDetails()) {
      setPendingPresetId(presetId);
    }
  };
  const completePaymentDetails = async (
    setupIntentId: string | null,
    details: CustomerFundingBillingDetails,
  ) => {
    setIsSubmitting(true);
    try {
      await completePaymentMethod({ variables: { ...details, setupIntentId } });
      setPaymentPreparation(null);
      try {
        await refetchFunding();
      } catch {
        // Polling will refresh saved payment details.
      }
      if (pendingPresetId !== null) {
        const preset = pendingPresetId;
        setPendingPresetId(null);
        await submitFunding(preset);
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const completePayment = async (actionId: string) => {
    setIsSubmitting(true);
    try {
      const result = await preparePaymentAction({ variables: { actionId } });
      const clientSecret =
        result.data?.prepareManagedProviderCustomerFundingPaymentAction
          .clientSecret;
      if (clientSecret === undefined) throw new Error('Missing payment action');
      setPaymentAction({ actionId, clientSecret });
    } catch (error) {
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const acknowledgeAction = async () => {
    if (paymentAction === null) return;
    try {
      await acknowledgePaymentAction({
        variables: { actionId: paymentAction.actionId },
      });
      setPaymentAction(null);
      await refetchFunding();
    } catch (error) {
      showError(error);
    }
  };

  return (
    <SettingsPageLayout
      title={t`Billing`}
      links={[
        {
          children: <Trans>Workspace</Trans>,
          href: getSettingsPath(SettingsPath.General),
        },
        {
          children: <Trans>Billing</Trans>,
          href: getSettingsPath(SettingsPath.Billing),
        },
      ]}
    >
      <SettingsPageContainer>
        {paymentPreparation !== null ? (
          <ManagedProviderCustomerFundingPaymentForm
            billingSummary={paymentPreparation.billingSummary}
            clientSecret={paymentPreparation.clientSecret}
            onCancel={() => {
              setPaymentPreparation(null);
              setPendingPresetId(null);
            }}
            onComplete={completePaymentDetails}
            setupIntentId={paymentPreparation.setupIntentId}
          />
        ) : null}
        {paymentAction !== null ? (
          <ManagedProviderCustomerFundingPaymentActionForm
            clientSecret={paymentAction.clientSecret}
            onCancel={() => setPaymentAction(null)}
            onConfirmed={acknowledgeAction}
          />
        ) : null}
        <SettingsWorkspaceBillingContent
          viewModel={viewModel}
          managedEmailSubscriptions={managedEmailSubscriptions}
          onCompletePayment={completePayment}
          onManageManagedEmail={() =>
            navigateSettings(SettingsPath.WorkspaceEmail)
          }
          onManagePaymentDetails={managePaymentDetails}
          onRequestTopUp={requestTopUp}
        />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
