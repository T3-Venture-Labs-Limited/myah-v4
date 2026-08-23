import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { ManagedEmailAcquisitionChooser } from '@/settings/workspace/components/managed-email/ManagedEmailAcquisitionChooser';
import { ManagedEmailCreateFlow } from '@/settings/workspace/components/managed-email/ManagedEmailCreateFlow';
import { ManagedEmailPrewarmedFlow } from '@/settings/workspace/components/managed-email/ManagedEmailPrewarmedFlow';
import { ManagedEmailDetails } from '@/settings/workspace/components/managed-email/ManagedEmailDetails';
import { ManagedEmailProgress } from '@/settings/workspace/components/managed-email/ManagedEmailProgress';
import {
  ManagedEmailPaymentSetup,
  type ManagedEmailPaymentSetup as ManagedEmailPaymentSetupData,
} from '@/settings/workspace/components/managed-email/ManagedEmailPaymentSetup';
import { ManagedEmailReview } from '@/settings/workspace/components/managed-email/ManagedEmailReview';
import { ManagedEmailDashboard } from '@/settings/workspace/components/managed-email/ManagedEmailDashboard';
import {
  CANCEL_MANAGED_EMAIL_DOMAIN_RENEWAL,
  CANCEL_MANAGED_EMAIL_WARMUP,
  CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE,
  PAUSE_MANAGED_EMAIL_WARMUP,
  RESUME_MANAGED_EMAIL_WARMUP,
  SET_MANAGED_EMAIL_CAMPAIGN_CAP,
  STOP_MANAGED_EMAIL_MAILBOX,
  COMPLETE_MANAGED_EMAIL_PAYMENT_METHOD,
  CONFIRM_MANAGED_EMAIL_PREWARMED_PURCHASE,
  PREPARE_MANAGED_EMAIL_PAYMENT_METHOD,
} from '@/settings/workspace/graphql/managed-email/managedEmailMutations';
import {
  GET_MANAGED_EMAIL_OPERATION,
  GET_MANAGED_EMAIL_OVERVIEW,
  GET_MANAGED_EMAIL_PREWARMED_BUNDLES,
  GET_MANAGED_EMAIL_PROPOSAL,
  GET_MANAGED_EMAIL_PREWARMED_PROPOSAL,
  GET_MANAGED_EMAIL_QUOTE,
} from '@/settings/workspace/graphql/managed-email/managedEmailQueries';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import {
  type ManagedEmailBundle,
  type ManagedEmailDomain,
  type ManagedEmailMailbox,
  type ManagedEmailOperation,
  type ManagedEmailOverview as ManagedEmailOverviewData,
  type ManagedEmailProposal,
  type ManagedEmailProposalInput,
  type ManagedEmailPurchaseInput,
  type ManagedEmailQuote,
  PermissionFlagType,
} from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

const PURCHASE_INTENT_STORAGE_KEY_PREFIX = 'managed-email-purchase-intent';

type ManagedEmailAcquisitionMode = 'NEW_MANAGED' | 'PREWARMED_INVENTORY';

type PersistedPurchaseIntent = ManagedEmailPurchaseInput & {
  acquisitionMode: ManagedEmailAcquisitionMode;
  operationId: string | null;
};

const purchaseIntentStorageKey = (workspaceId: string) =>
  `${PURCHASE_INTENT_STORAGE_KEY_PREFIX}:${workspaceId}`;

const readPersistedPurchaseIntent = (
  workspaceId: string,
): PersistedPurchaseIntent | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const storageKey = purchaseIntentStorageKey(workspaceId);
  const serialized = window.localStorage.getItem(storageKey);
  if (serialized === null) {
    return null;
  }

  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    const isNonEmptyString = (candidate: unknown): candidate is string =>
      typeof candidate === 'string' && candidate.trim() !== '';

    if (
      (value.acquisitionMode !== 'NEW_MANAGED' &&
        value.acquisitionMode !== 'PREWARMED_INVENTORY') ||
      !isNonEmptyString(value.idempotencyKey) ||
      (value.operationId !== null && !isNonEmptyString(value.operationId)) ||
      !isNonEmptyString(value.quoteFingerprint) ||
      !isNonEmptyString(value.quoteId) ||
      !isNonEmptyString(value.quoteVersion)
    ) {
      throw new Error('Invalid managed email purchase intent');
    }

    return {
      acquisitionMode: value.acquisitionMode,
      idempotencyKey: value.idempotencyKey,
      operationId: value.operationId,
      quoteFingerprint: value.quoteFingerprint,
      quoteId: value.quoteId,
      quoteVersion: value.quoteVersion,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
};

const storePurchaseIntent = (
  workspaceId: string,
  intent: PersistedPurchaseIntent,
) => {
  window.localStorage.setItem(
    purchaseIntentStorageKey(workspaceId),
    JSON.stringify(intent),
  );
};

const removeStoredPurchaseIntent = (workspaceId: string) => {
  window.localStorage.removeItem(purchaseIntentStorageKey(workspaceId));
};

type OverviewQueryData = {
  managedEmailOverview: ManagedEmailOverviewData;
  managedEmailDomains: ManagedEmailDomain[];
  managedEmailMailboxes: ManagedEmailMailbox[];
};

type BundlesQueryData = {
  managedEmailPrewarmedBundles: ManagedEmailBundle[];
};

type PaymentSetupData = {
  prepareManagedEmailPaymentMethod: ManagedEmailPaymentSetupData;
};

type CompletePaymentMethodData = {
  completeManagedEmailPaymentMethod: {
    ready: boolean;
  };
};

type CompletePaymentMethodVariables = {
  input: {
    setupIntentId: string;
  };
};

type PrewarmedProposalInput = {
  bundleId: string;
};
type ProposalQueryData = {
  managedEmailProposal: ManagedEmailProposal;
};

type PrewarmedProposalQueryData = {
  managedEmailPrewarmedProposal: ManagedEmailProposal;
};

type QuoteQueryData = {
  managedEmailQuote: ManagedEmailQuote;
};

type OperationQueryData = {
  managedEmailOperation: ManagedEmailOperation | null;
};

type ConfirmPurchaseData = {
  confirmManagedEmailOrdinaryPurchase?: {
    accepted: boolean;
    operationId: string;
  };
  confirmManagedEmailPrewarmedPurchase?: {
    accepted: boolean;
    operationId: string;
  };
};

type ConfirmPurchaseVariables = {
  input: ManagedEmailPurchaseInput;
};
type AcquisitionFlow =
  | 'OVERVIEW'
  | 'CHOOSER'
  | 'PREWARMED_LOADING'
  | 'PREWARMED'
  | 'PREWARMED_UNAVAILABLE'
  | 'ORDINARY'
  | 'REVIEW'
  | 'PAYMENT'
  | 'PROGRESS';

const ManagedEmailOverviewForWorkspace = ({
  workspaceId,
}: {
  workspaceId: string;
}) => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { [PermissionFlagType.BILLING]: canPurchase } = usePermissionFlagMap();

  const [purchaseIntent, setPurchaseIntent] =
    useState<PersistedPurchaseIntent | null>(() =>
      readPersistedPurchaseIntent(workspaceId),
    );
  // A ref is intentional here: the mutation guard must change synchronously
  // before StrictMode invokes the same effect closure a second time.
  // oxlint-disable-next-line twenty/no-state-useref
  const shouldRecoverPurchaseIntentRef = useRef(purchaseIntent !== null);
  const [purchaseRecoveryFailed, setPurchaseRecoveryFailed] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(
    purchaseIntent?.operationId ?? null,
  );
  const [flow, setFlow] = useState<AcquisitionFlow>(
    purchaseIntent ? 'PROGRESS' : 'OVERVIEW',
  );
  const [bundles, setBundles] = useState<ManagedEmailBundle[]>([]);
  const [proposal, setProposal] = useState<ManagedEmailProposal | null>(null);
  const [quote, setQuote] = useState<ManagedEmailQuote | null>(null);
  const [confirmationIdempotencyKey, setConfirmationIdempotencyKey] = useState<
    string | null
  >(purchaseIntent?.idempotencyKey ?? null);
  const [acquisitionMode, setAcquisitionMode] =
    useState<ManagedEmailAcquisitionMode>(
      purchaseIntent?.acquisitionMode ?? 'NEW_MANAGED',
    );
  const [paymentSetup, setPaymentSetup] =
    useState<ManagedEmailPaymentSetupData | null>(null);

  const {
    data,
    loading,
    error,
    refetch,
    stopPolling: stopOverviewPolling,
  } = useQuery<OverviewQueryData>(GET_MANAGED_EMAIL_OVERVIEW, {
    pollInterval: operationId ? 5_000 : 0,
    skip: canPurchase !== true,
  });
  useSnackBarOnQueryError(error);

  const [loadBundles] = useLazyQuery<BundlesQueryData>(
    GET_MANAGED_EMAIL_PREWARMED_BUNDLES,
    { fetchPolicy: 'network-only' },
  );
  const [loadProposal] = useLazyQuery<ProposalQueryData>(
    GET_MANAGED_EMAIL_PROPOSAL,
    { fetchPolicy: 'network-only' },
  );
  const [loadQuote] = useLazyQuery<QuoteQueryData>(GET_MANAGED_EMAIL_QUOTE, {
    fetchPolicy: 'network-only',
  });
  const [loadPrewarmedProposal] = useLazyQuery<PrewarmedProposalQueryData>(
    GET_MANAGED_EMAIL_PREWARMED_PROPOSAL,
    { fetchPolicy: 'network-only' },
  );
  const [confirmPurchase, { loading: isConfirming }] = useMutation<
    ConfirmPurchaseData,
    ConfirmPurchaseVariables
  >(CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE);
  const [confirmPrewarmedPurchase, { loading: isConfirmingPrewarmed }] =
    useMutation<ConfirmPurchaseData, ConfirmPurchaseVariables>(
      CONFIRM_MANAGED_EMAIL_PREWARMED_PURCHASE,
    );
  const [preparePaymentMethod] = useMutation<PaymentSetupData>(
    PREPARE_MANAGED_EMAIL_PAYMENT_METHOD,
  );
  const [completePaymentMethod] = useMutation<
    CompletePaymentMethodData,
    CompletePaymentMethodVariables
  >(COMPLETE_MANAGED_EMAIL_PAYMENT_METHOD);
  const [setCampaignCap] = useMutation(SET_MANAGED_EMAIL_CAMPAIGN_CAP);
  const [cancelWarmup] = useMutation(CANCEL_MANAGED_EMAIL_WARMUP);
  const [pauseWarmup] = useMutation(PAUSE_MANAGED_EMAIL_WARMUP);
  const [resumeWarmup] = useMutation(RESUME_MANAGED_EMAIL_WARMUP);
  const [stopMailbox] = useMutation(STOP_MANAGED_EMAIL_MAILBOX);
  const [cancelDomainRenewal] = useMutation(
    CANCEL_MANAGED_EMAIL_DOMAIN_RENEWAL,
  );
  useEffect(() => {
    if (
      canPurchase !== true ||
      operationId !== null ||
      purchaseIntent === null ||
      !shouldRecoverPurchaseIntentRef.current
    ) {
      return;
    }

    shouldRecoverPurchaseIntentRef.current = false;
    const variables = {
      input: {
        idempotencyKey: purchaseIntent.idempotencyKey,
        quoteFingerprint: purchaseIntent.quoteFingerprint,
        quoteId: purchaseIntent.quoteId,
        quoteVersion: purchaseIntent.quoteVersion,
      },
    };
    const confirmation =
      purchaseIntent.acquisitionMode === 'PREWARMED_INVENTORY'
        ? confirmPrewarmedPurchase({ variables })
        : confirmPurchase({ variables });

    void confirmation
      .then((result) => {
        const nextOperationId =
          result.data?.confirmManagedEmailPrewarmedPurchase?.operationId ??
          result.data?.confirmManagedEmailOrdinaryPurchase?.operationId;
        if (!nextOperationId) {
          throw new Error('Missing managed email operation');
        }

        const recoveredIntent = {
          ...purchaseIntent,
          operationId: nextOperationId,
        };
        storePurchaseIntent(workspaceId, recoveredIntent);
        setPurchaseIntent(recoveredIntent);
        setOperationId(nextOperationId);
        setPurchaseRecoveryFailed(false);
      })
      .catch(() => {
        setPurchaseRecoveryFailed(true);
        enqueueErrorSnackBar({
          message: t`We could not recover this saved order. Refresh to try again.`,
        });
      });
  }, [
    canPurchase,
    confirmPrewarmedPurchase,
    confirmPurchase,
    enqueueErrorSnackBar,
    operationId,
    purchaseIntent,
    t,
    workspaceId,
  ]);

  const { data: operationData, stopPolling } = useQuery<OperationQueryData>(
    GET_MANAGED_EMAIL_OPERATION,
    {
      variables: { input: { operationId } },
      skip: canPurchase !== true || !operationId,
      pollInterval: 5_000,
    },
  );

  useEffect(() => {
    if (!operationData) {
      return;
    }

    const operation = operationData.managedEmailOperation;
    if (operation) {
      const isTerminalProviderState = [
        'PROVIDER_FAILED',
        'PROVIDER_PARTIAL',
        'PROVIDER_SUCCEEDED',
      ].includes(operation.state);

      if (
        operation.paymentStatus === 'PAYMENT_FAILED' ||
        isTerminalProviderState
      ) {
        stopPolling();
        stopOverviewPolling();
      }
      if (operation.state === 'PROVIDER_SUCCEEDED') {
        removeStoredPurchaseIntent(workspaceId);
        setPurchaseIntent(null);
        setConfirmationIdempotencyKey(null);
        setOperationId(null);
        setFlow('OVERVIEW');
        void refetch();
        return;
      }
      setFlow('PROGRESS');
      return;
    }

    removeStoredPurchaseIntent(workspaceId);
    setPurchaseIntent(null);
    setConfirmationIdempotencyKey(null);
    setOperationId(null);
    setFlow('OVERVIEW');
  }, [operationData, refetch, stopOverviewPolling, stopPolling, workspaceId]);

  const beginPrewarmedFlow = async () => {
    setFlow('PREWARMED_LOADING');

    try {
      const result = await loadBundles();
      const loadedBundles = result.data?.managedEmailPrewarmedBundles ?? [];
      setBundles(loadedBundles);
      setFlow('PREWARMED');
    } catch {
      setBundles([]);
      setFlow('PREWARMED_UNAVAILABLE');
      enqueueErrorSnackBar({
        message: t`Prewarmed inventory is unavailable right now.`,
      });
    }
  };

  const createProposalAndQuote = async (input: ManagedEmailProposalInput) => {
    try {
      const proposalResult = await loadProposal({ variables: { input } });
      const nextProposal = proposalResult.data?.managedEmailProposal;
      if (!nextProposal) {
        throw new Error('Missing managed email proposal');
      }

      const quoteResult = await loadQuote({
        variables: { input: { proposalId: nextProposal.id } },
      });
      const nextQuote = quoteResult.data?.managedEmailQuote;
      if (!nextQuote) {
        throw new Error('Missing managed email quote');
      }

      setAcquisitionMode('NEW_MANAGED');
      setConfirmationIdempotencyKey(crypto.randomUUID());
      setProposal(nextProposal);
      setQuote(nextQuote);
      setFlow('REVIEW');
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not prepare this managed mailbox order. Please try again.`,
      });
    }
  };

  const createPrewarmedProposalAndQuote = async (
    bundle: ManagedEmailBundle,
  ) => {
    const input: PrewarmedProposalInput = { bundleId: bundle.bundleId };

    try {
      const proposalResult = await loadPrewarmedProposal({
        variables: { input },
      });
      const nextProposal = proposalResult.data?.managedEmailPrewarmedProposal;
      if (!nextProposal) {
        throw new Error('Missing managed email prewarmed proposal');
      }

      const quoteResult = await loadQuote({
        variables: { input: { proposalId: nextProposal.id } },
      });
      const nextQuote = quoteResult.data?.managedEmailQuote;
      if (!nextQuote) {
        throw new Error('Missing managed email quote');
      }

      setAcquisitionMode('PREWARMED_INVENTORY');
      setConfirmationIdempotencyKey(crypto.randomUUID());
      setProposal(nextProposal);
      setQuote(nextQuote);
      setFlow('REVIEW');
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not prepare this prewarmed mailbox order. Please try again.`,
      });
    }
  };

  const submitPurchase = async () => {
    if (!quote || !canPurchase) {
      return;
    }

    const idempotencyKey = confirmationIdempotencyKey ?? crypto.randomUUID();
    const pendingIntent: PersistedPurchaseIntent = {
      acquisitionMode,
      idempotencyKey,
      operationId: null,
      quoteFingerprint: quote.quoteFingerprint,
      quoteId: quote.id,
      quoteVersion: quote.quoteVersion,
    };
    const variables = {
      input: {
        idempotencyKey,
        quoteFingerprint: quote.quoteFingerprint,
        quoteId: quote.id,
        quoteVersion: quote.quoteVersion,
      },
    };

    storePurchaseIntent(workspaceId, pendingIntent);
    setPurchaseIntent(pendingIntent);
    setConfirmationIdempotencyKey(idempotencyKey);

    try {
      const result =
        acquisitionMode === 'PREWARMED_INVENTORY'
          ? await confirmPrewarmedPurchase({ variables })
          : await confirmPurchase({ variables });
      const nextOperationId =
        result.data?.confirmManagedEmailPrewarmedPurchase?.operationId ??
        result.data?.confirmManagedEmailOrdinaryPurchase?.operationId;
      if (!nextOperationId) {
        throw new Error('Missing managed email operation');
      }

      const confirmedIntent = {
        ...pendingIntent,
        operationId: nextOperationId,
      };
      storePurchaseIntent(workspaceId, confirmedIntent);
      setPurchaseIntent(confirmedIntent);
      setOperationId(nextOperationId);
      setFlow('PROGRESS');
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not confirm this purchase. Your saved order is safe; please try again.`,
      });
    }
  };

  const confirmQuote = async () => {
    try {
      const result = await preparePaymentMethod();
      const nextPaymentSetup = result.data?.prepareManagedEmailPaymentMethod;
      if (!nextPaymentSetup) {
        throw new Error('Missing managed email payment setup');
      }
      if (nextPaymentSetup.ready) {
        await submitPurchase();
        return;
      }
      setPaymentSetup(nextPaymentSetup);
      setFlow('PAYMENT');
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not prepare card payment. Please try again.`,
      });
    }
  };

  const completeCardSetup = async (setupIntentId: string) => {
    try {
      const result = await completePaymentMethod({
        variables: { input: { setupIntentId } },
      });
      if (result.data?.completeManagedEmailPaymentMethod?.ready !== true) {
        throw new Error('Managed email payment method is not ready');
      }
      await submitPurchase();
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not save your payment method. Please retry.`,
      });
    }
  };

  const executeLifecycleAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refetch();
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not update this managed email service. Please try again.`,
      });
    }
  };

  if (canPurchase !== true || flow === 'CHOOSER') {
    return (
      <ManagedEmailAcquisitionChooser
        acquisitionAvailable={Boolean(
          data?.managedEmailOverview.acquisitionAvailable,
        )}
        canPurchase={canPurchase === true}
        onChoosePrewarmed={() => void beginPrewarmedFlow()}
        onCreateManaged={() => setFlow('ORDINARY')}
        onConnectExisting={() => navigate(SettingsPath.NewAccount)}
      />
    );
  }

  if (flow === 'PREWARMED_LOADING') {
    return <p>{t`Loading prewarmed inventory…`}</p>;
  }

  if (flow === 'PREWARMED' || flow === 'PREWARMED_UNAVAILABLE') {
    return (
      <ManagedEmailPrewarmedFlow
        bundles={bundles}
        onBack={() => setFlow('CHOOSER')}
        onChooseBundle={(bundle) =>
          void createPrewarmedProposalAndQuote(bundle)
        }
        onUseOrdinary={() => setFlow('ORDINARY')}
      />
    );
  }

  if (flow === 'ORDINARY') {
    return (
      <ManagedEmailCreateFlow
        onBack={() => setFlow('CHOOSER')}
        onSubmit={createProposalAndQuote}
      />
    );
  }

  if (flow === 'REVIEW' && proposal && quote) {
    return (
      <ManagedEmailReview
        isConfirming={isConfirming || isConfirmingPrewarmed}
        onBack={() =>
          setFlow(
            acquisitionMode === 'PREWARMED_INVENTORY'
              ? 'PREWARMED'
              : 'ORDINARY',
          )
        }
        onConfirm={confirmQuote}
        proposal={proposal}
        quote={quote}
      />
    );
  }

  if (flow === 'PAYMENT' && paymentSetup) {
    return (
      <ManagedEmailPaymentSetup
        paymentSetup={paymentSetup}
        onBack={() => setFlow('REVIEW')}
        onComplete={completeCardSetup}
      />
    );
  }

  if (flow === 'PROGRESS') {
    const operation = operationData?.managedEmailOperation;
    const returnToOverview = () => {
      removeStoredPurchaseIntent(workspaceId);
      setPurchaseIntent(null);
      setConfirmationIdempotencyKey(null);
      setOperationId(null);
      setPurchaseRecoveryFailed(false);
      setFlow('OVERVIEW');
    };

    if (purchaseRecoveryFailed) {
      return (
        <Section>
          <H2Title
            title={t`Saved order recovery paused`}
            description={t`We could not recover this saved order. Refresh to try the same order identity again.`}
          />
          <Button
            title={t`Return to mailbox overview`}
            variant="secondary"
            onClick={returnToOverview}
          />
        </Section>
      );
    }

    return operation ? (
      <ManagedEmailProgress
        operation={operation}
        onReturnToOverview={returnToOverview}
      />
    ) : (
      <p>{t`Loading saved order…`}</p>
    );
  }

  if (loading) {
    return <p>{t`Loading managed mailboxes…`}</p>;
  }

  if (!data) {
    return <p>{t`Managed mailbox status is unavailable right now.`}</p>;
  }

  return (
    <>
      <ManagedEmailDashboard
        domains={data.managedEmailDomains}
        mailboxes={data.managedEmailMailboxes}
        onConnectExistingMailbox={() => navigate(SettingsPath.NewAccount)}
        onBrowsePrewarmedInventory={() => void beginPrewarmedFlow()}
        onSetUpManagedEmail={() => setFlow('ORDINARY')}
        overview={data.managedEmailOverview}
      />
      {(data.managedEmailMailboxes.length > 0 ||
        data.managedEmailDomains.length > 0) && (
        <ManagedEmailDetails
          domains={data.managedEmailDomains}
          mailboxes={data.managedEmailMailboxes}
          onSetCampaignCap={(mailboxId, dailyCap) =>
            void executeLifecycleAction(() =>
              setCampaignCap({
                variables: {
                  input: {
                    dailyCap,
                    idempotencyKey: crypto.randomUUID(),
                    mailboxId,
                  },
                },
              }),
            )
          }
          onCancelWarmup={(mailboxId) =>
            void executeLifecycleAction(() =>
              cancelWarmup({
                variables: {
                  input: { idempotencyKey: crypto.randomUUID(), mailboxId },
                },
              }),
            )
          }
          onPauseWarmup={(mailboxId) =>
            void executeLifecycleAction(() =>
              pauseWarmup({
                variables: {
                  input: { idempotencyKey: crypto.randomUUID(), mailboxId },
                },
              }),
            )
          }
          onResumeWarmup={(mailboxId) =>
            void executeLifecycleAction(() =>
              resumeWarmup({
                variables: {
                  input: { idempotencyKey: crypto.randomUUID(), mailboxId },
                },
              }),
            )
          }
          onStopMailbox={(mailboxId) =>
            void executeLifecycleAction(() =>
              stopMailbox({
                variables: {
                  input: { idempotencyKey: crypto.randomUUID(), mailboxId },
                },
              }),
            )
          }
          onCancelDomainRenewal={(domainId) =>
            void executeLifecycleAction(() =>
              cancelDomainRenewal({
                variables: {
                  input: { domainId, idempotencyKey: crypto.randomUUID() },
                },
              }),
            )
          }
        />
      )}
    </>
  );
};

export const ManagedEmailOverview = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);

  if (currentWorkspace === null) {
    return null;
  }

  return (
    <ManagedEmailOverviewForWorkspace
      key={currentWorkspace.id}
      workspaceId={currentWorkspace.id}
    />
  );
};
