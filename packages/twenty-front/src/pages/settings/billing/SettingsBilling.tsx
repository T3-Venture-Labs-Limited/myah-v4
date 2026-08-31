import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import {
  ManagedProviderCustomerFundingPaymentActionForm,
  ManagedProviderCustomerFundingPaymentForm,
  type CustomerFundingBillingDetails,
} from '@/settings/billing/components/ManagedProviderCustomerFundingStripeForms';
import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingPreset,
  type WorkspaceBillingSafeSummary,
  type WorkspaceBillingViewModel,
  type WorkspaceManagedEmailSubscription,
  type WorkspaceManagedEmailSubscriptionsViewModel,
} from '@/settings/billing/components/SettingsWorkspaceBillingContent';
import {
  ACKNOWLEDGE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION,
  COMPLETE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD,
  GET_MANAGED_EMAIL_SUBSCRIPTIONS,
  GET_MANAGED_PROVIDER_BILLING_STATUS,
  PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION,
  PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD,
  REQUEST_MANAGED_PROVIDER_CUSTOMER_FUNDING,
} from '@/settings/billing/graphql/managedProviderCustomerFunding';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
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
type CustomerFundingPresetCode = WorkspaceBillingPreset['id'];
type PendingFundingRequest = {
  idempotencyKey: string;
  presetCode: CustomerFundingPresetCode;
  workspaceId: string | null;
};

const CUSTOMER_FUNDING_PENDING_STORAGE_KEY_PREFIX =
  'managed-provider-customer-funding:';
const terminalFundingStates: Partial<
  Record<FundingHistoryItem['state'], true>
> = {
  BALANCE_ACTIVE: true,
  PAYMENT_FAILED: true,
  REFUNDED: true,
};

const isCustomerFundingPresetCode = (
  value: unknown,
): value is CustomerFundingPresetCode =>
  value === 'AI_25_USD' || value === 'AI_50_USD' || value === 'AI_100_USD';

const readPendingFundingRequest = (
  workspaceId: string | null,
): PendingFundingRequest | null => {
  if (workspaceId === null) return null;

  try {
    const serialized = globalThis.localStorage.getItem(
      `${CUSTOMER_FUNDING_PENDING_STORAGE_KEY_PREFIX}${workspaceId}`,
    );
    if (serialized === null) return null;

    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { idempotencyKey, presetCode } = parsed as {
      idempotencyKey?: unknown;
      presetCode?: unknown;
    };
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim() === '' ||
      !isCustomerFundingPresetCode(presetCode)
    ) {
      return null;
    }

    return { idempotencyKey, presetCode, workspaceId };
  } catch {
    return null;
  }
};

const persistPendingFundingRequest = (request: PendingFundingRequest) => {
  if (request.workspaceId === null) return;

  try {
    globalThis.localStorage.setItem(
      `${CUSTOMER_FUNDING_PENDING_STORAGE_KEY_PREFIX}${request.workspaceId}`,
      JSON.stringify({
        idempotencyKey: request.idempotencyKey,
        presetCode: request.presetCode,
      }),
    );
  } catch {
    // Browser storage is optional; the in-memory request still protects retries.
  }
};

const clearPendingFundingRequest = (workspaceId: string | null) => {
  if (workspaceId === null) return;

  try {
    globalThis.localStorage.removeItem(
      `${CUSTOMER_FUNDING_PENDING_STORAGE_KEY_PREFIX}${workspaceId}`,
    );
  } catch {
    // Browser storage is optional.
  }
};

const toSafeCents = (value: string | null): number | null => {
  if (value === null) return null;
  const amount = Number(value);

  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};
const newIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `billing-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const SettingsBilling = ({
  viewModel: suppliedViewModel,
}: SettingsBillingProps) => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();
  const { enqueueErrorSnackBar } = useSnackBar();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const workspaceId = currentWorkspace?.id ?? null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingPresetId, setPendingPresetId] =
    useState<CustomerFundingPresetCode | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingFundingRequest, setPendingFundingRequest] =
    useState<PendingFundingRequest | null>(() =>
      readPendingFundingRequest(workspaceId),
    );
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
    setPendingFundingRequest(readPendingFundingRequest(workspaceId));
    setPendingActionId(null);
  }, [workspaceId]);

  useEffect(() => {
    const action =
      pendingActionId === null
        ? undefined
        : status?.customerFundingHistory.find(
            (entry) => entry.id === pendingActionId,
          );

    if (action === undefined || terminalFundingStates[action.state] !== true) {
      return;
    }

    if (pendingFundingRequest?.workspaceId === workspaceId) {
      clearPendingFundingRequest(workspaceId);
    }
    setPendingFundingRequest(null);
    setPendingActionId(null);
  }, [
    pendingActionId,
    pendingFundingRequest?.workspaceId,
    status?.customerFundingHistory,
    workspaceId,
  ]);

  const activePendingFundingRequest =
    pendingFundingRequest?.workspaceId === workspaceId
      ? pendingFundingRequest
      : null;
  const fetchedViewModel: WorkspaceBillingViewModel = fundingLoading
    ? { state: 'loading' }
    : fundingError !== undefined || status === undefined
      ? { state: 'unavailable', reason: 'loadFailed' }
      : !status.available
        ? { state: 'unavailable', reason: 'notConnected' }
        : {
            availableBalanceCents: toSafeCents(status.prepaidBalanceCents),
            customerFundingAvailable: status.customerFundingAvailable,
            customerFundingBillingSummary: status.customerFundingBillingSummary,
            customerFundingPaymentMethodReady:
              status.customerFundingPaymentMethodReady,
            customerFundingPresets: status.customerFundingPresets
              .map((preset) => ({
                id: preset.id as CustomerFundingPresetCode,
                principalCents: toSafeCents(preset.principalCents),
              }))
              .filter(
                (
                  preset,
                ): preset is {
                  id: CustomerFundingPresetCode;
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
            retryPresetId: activePendingFundingRequest?.presetCode ?? null,
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
      enqueueErrorSnackBar({
        message: t`Billing action could not be completed.`,
      });
    }
  };
  const submitFunding = async (presetCode: CustomerFundingPresetCode) => {
    const request = activePendingFundingRequest ?? {
      idempotencyKey: newIdempotencyKey(),
      presetCode,
      workspaceId,
    };

    if (activePendingFundingRequest === null) {
      persistPendingFundingRequest(request);
    }
    setPendingFundingRequest(request);
    setIsSubmitting(true);
    try {
      const result = await requestFunding({
        variables: {
          idempotencyKey: request.idempotencyKey,
          preset: request.presetCode,
        },
      });
      const actionId = result.data?.requestManagedProviderCustomerFunding.id;
      if (actionId === undefined) throw new Error('Missing funding action');
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
    if (
      viewModel.state === 'ready' &&
      viewModel.customerFundingAvailable === false
    ) {
      return false;
    }

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
  const requestTopUp = async (presetCode: CustomerFundingPresetCode) => {
    if (
      viewModel.state === 'ready' &&
      viewModel.customerFundingAvailable === false
    ) {
      return;
    }

    if (
      viewModel.state === 'ready' &&
      viewModel.customerFundingPaymentMethodReady
    ) {
      await submitFunding(presetCode);
      return;
    }
    if (await managePaymentDetails()) {
      setPendingPresetId(presetCode);
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
        const presetCode = pendingPresetId;
        setPendingPresetId(null);
        await submitFunding(presetCode);
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
    } catch (error) {
      showError(error);
      return;
    }

    setPaymentAction(null);
    try {
      await refetchFunding();
    } catch {
      // Polling will refresh the acknowledged action.
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
        ) : paymentAction !== null ? (
          <ManagedProviderCustomerFundingPaymentActionForm
            clientSecret={paymentAction.clientSecret}
            onCancel={() => setPaymentAction(null)}
            onConfirmed={acknowledgeAction}
          />
        ) : (
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
        )}
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
