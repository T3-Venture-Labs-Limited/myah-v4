import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { ManagedEmailAcquisitionChooser } from '@/settings/workspace/components/managed-email/ManagedEmailAcquisitionChooser';
import { ManagedEmailCreateFlow } from '@/settings/workspace/components/managed-email/ManagedEmailCreateFlow';
import { ManagedEmailPrewarmedFlow } from '@/settings/workspace/components/managed-email/ManagedEmailPrewarmedFlow';
import { ManagedEmailDetails } from '@/settings/workspace/components/managed-email/ManagedEmailDetails';
import { ManagedEmailProgress } from '@/settings/workspace/components/managed-email/ManagedEmailProgress';
import { ManagedEmailReview } from '@/settings/workspace/components/managed-email/ManagedEmailReview';
import { ManagedMailboxTable } from '@/settings/workspace/components/managed-email/ManagedMailboxTable';
import {
  CANCEL_MANAGED_EMAIL_DOMAIN_RENEWAL,
  CANCEL_MANAGED_EMAIL_WARMUP,
  CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE,
  PAUSE_MANAGED_EMAIL_WARMUP,
  RESUME_MANAGED_EMAIL_WARMUP,
  RETRY_MANAGED_EMAIL_PAYMENT,
  SET_MANAGED_EMAIL_CAMPAIGN_CAP,
  STOP_MANAGED_EMAIL_MAILBOX,
} from '@/settings/workspace/graphql/managed-email/managedEmailMutations';
import {
  GET_MANAGED_EMAIL_OPERATION,
  GET_MANAGED_EMAIL_OVERVIEW,
  GET_MANAGED_EMAIL_PREWARMED_BUNDLES,
  GET_MANAGED_EMAIL_PROPOSAL,
  GET_MANAGED_EMAIL_QUOTE,
} from '@/settings/workspace/graphql/managed-email/managedEmailQueries';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { Status } from 'twenty-ui/data-display';
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

const OPERATION_STORAGE_KEY = 'managed-email-operation-id';
const OPERATION_IDEMPOTENCY_STORAGE_KEY =
  'managed-email-operation-idempotency-key';

type OverviewQueryData = {
  managedEmailOverview: ManagedEmailOverviewData;
  managedEmailDomains: ManagedEmailDomain[];
  managedEmailMailboxes: ManagedEmailMailbox[];
};

type BundlesQueryData = {
  managedEmailPrewarmedBundles: ManagedEmailBundle[];
};

type ProposalQueryData = {
  managedEmailProposal: ManagedEmailProposal;
};

type QuoteQueryData = {
  managedEmailQuote: ManagedEmailQuote;
};

type OperationQueryData = {
  managedEmailOperation: ManagedEmailOperation | null;
};

type ConfirmPurchaseData = {
  confirmManagedEmailOrdinaryPurchase: {
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
  | 'PROGRESS';

export const ManagedEmailOverview = () => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { [PermissionFlagType.BILLING]: canPurchase } = usePermissionFlagMap();

  const restoredOperationId =
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(OPERATION_STORAGE_KEY);
  const restoredConfirmationIdempotencyKey =
    restoredOperationId === null
      ? null
      : window.localStorage.getItem(OPERATION_IDEMPOTENCY_STORAGE_KEY);
  const [operationId, setOperationId] = useState<string | null>(
    restoredOperationId,
  );
  const [flow, setFlow] = useState<AcquisitionFlow>(
    restoredOperationId ? 'PROGRESS' : 'OVERVIEW',
  );
  const [bundles, setBundles] = useState<ManagedEmailBundle[]>([]);
  const [proposal, setProposal] = useState<ManagedEmailProposal | null>(null);
  const [quote, setQuote] = useState<ManagedEmailQuote | null>(null);
  const [confirmationIdempotencyKey, setConfirmationIdempotencyKey] = useState<
    string | null
  >(restoredConfirmationIdempotencyKey);

  const { data, loading, error, refetch } = useQuery<OverviewQueryData>(
    GET_MANAGED_EMAIL_OVERVIEW,
    { skip: canPurchase !== true },
  );
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
  const [confirmPurchase, { loading: isConfirming }] = useMutation<
    ConfirmPurchaseData,
    ConfirmPurchaseVariables
  >(CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE);
  const [retryPayment] = useMutation(RETRY_MANAGED_EMAIL_PAYMENT);
  const [setCampaignCap] = useMutation(SET_MANAGED_EMAIL_CAMPAIGN_CAP);
  const [cancelWarmup] = useMutation(CANCEL_MANAGED_EMAIL_WARMUP);
  const [pauseWarmup] = useMutation(PAUSE_MANAGED_EMAIL_WARMUP);
  const [resumeWarmup] = useMutation(RESUME_MANAGED_EMAIL_WARMUP);
  const [stopMailbox] = useMutation(STOP_MANAGED_EMAIL_MAILBOX);
  const [cancelDomainRenewal] = useMutation(
    CANCEL_MANAGED_EMAIL_DOMAIN_RENEWAL,
  );
  const { data: operationData } = useQuery<OperationQueryData>(
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

    if (operationData.managedEmailOperation) {
      setFlow('PROGRESS');
      return;
    }

    window.localStorage.removeItem(OPERATION_STORAGE_KEY);
    window.localStorage.removeItem(OPERATION_IDEMPOTENCY_STORAGE_KEY);
    setConfirmationIdempotencyKey(null);
    setOperationId(null);
    setFlow('OVERVIEW');
  }, [operationData]);

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

  const confirmQuote = async () => {
    if (!quote || !canPurchase) {
      return;
    }

    const idempotencyKey = confirmationIdempotencyKey ?? crypto.randomUUID();
    setConfirmationIdempotencyKey(idempotencyKey);

    try {
      const result = await confirmPurchase({
        variables: {
          input: {
            idempotencyKey,
            quoteFingerprint: quote.quoteFingerprint,
            quoteId: quote.id,
            quoteVersion: quote.quoteVersion,
          },
        },
      });
      const nextOperationId =
        result.data?.confirmManagedEmailOrdinaryPurchase?.operationId;

      if (!nextOperationId) {
        throw new Error('Missing managed email operation');
      }

      window.localStorage.setItem(OPERATION_STORAGE_KEY, nextOperationId);
      window.localStorage.setItem(
        OPERATION_IDEMPOTENCY_STORAGE_KEY,
        idempotencyKey,
      );
      setOperationId(nextOperationId);
      setFlow('PROGRESS');
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not confirm this purchase. Your saved order is safe; please try again.`,
      });
    }
  };

  const retryOperationPayment = async () => {
    if (!operationId || !confirmationIdempotencyKey) {
      enqueueErrorSnackBar({
        message: t`We could not retry payment because the saved order identity is incomplete.`,
      });
      return;
    }

    try {
      await retryPayment({
        variables: {
          input: {
            idempotencyKey: confirmationIdempotencyKey,
            operationId,
          },
        },
      });
    } catch {
      enqueueErrorSnackBar({
        message: t`We could not retry payment. Please try again.`,
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
        onChooseBundle={() => {
          enqueueErrorSnackBar({
            message: t`Prewarmed mailbox purchase confirmation is not available yet.`,
          });
        }}
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
        isConfirming={isConfirming}
        onBack={() => setFlow('ORDINARY')}
        onConfirm={confirmQuote}
        proposal={proposal}
        quote={quote}
      />
    );
  }

  if (flow === 'PROGRESS') {
    const operation = operationData?.managedEmailOperation;

    return operation ? (
      <ManagedEmailProgress
        operation={operation}
        onRetryPayment={() => void retryOperationPayment()}
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

  const overview = data.managedEmailOverview;
  const overviewStatus =
    overview.status === 'READY'
      ? { color: 'green' as const, text: t`Ready` }
      : overview.status === 'WARMING'
        ? { color: 'yellow' as const, text: t`Warming` }
        : overview.status === 'EMPTY'
          ? { color: 'gray' as const, text: t`No managed mailboxes` }
          : { color: 'red' as const, text: t`Action required` };

  return (
    <>
      <Section>
        <H2Title
          title={t`Managed mailboxes`}
          description={t`Managed sending identities, readiness, and campaign availability.`}
        />
        <Status color={overviewStatus.color} text={overviewStatus.text} />
        <p>
          <span>
            {overview.mailboxCount === 1
              ? t`1 mailbox`
              : t`${overview.mailboxCount} mailboxes`}
          </span>
          {' · '}
          <span>{t`${overview.warmingCount} warming`}</span>
          {' · '}
          <span>{t`${overview.actionRequiredCount} action required`}</span>
        </p>
        <Button
          title={t`Add mailboxes`}
          variant="primary"
          onClick={() => setFlow('CHOOSER')}
        />
        {!overview.acquisitionAvailable && (
          <p>{t`Managed mailbox acquisition is not available right now.`}</p>
        )}
      </Section>
      <Section>
        <H2Title
          title={t`Mailbox inventory`}
          description={t`Customer-safe mailbox and readiness status.`}
        />
        {data.managedEmailMailboxes.length === 0 ? (
          <p>{t`No managed mailboxes yet.`}</p>
        ) : (
          <ManagedMailboxTable mailboxes={data.managedEmailMailboxes} />
        )}
      </Section>
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
