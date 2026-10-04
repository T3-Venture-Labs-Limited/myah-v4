import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { gql } from '@apollo/client';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'jotai';
import { Button } from 'twenty-ui/input';
import { v4 as uuidv4 } from 'uuid';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

import {
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useListenToObjectRecordOperationBrowserEvent } from '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type ObjectRecordOperation } from '@/object-record/types/ObjectRecordOperation';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

const CAMPAIGN_SEQUENCE_READINESS = gql`
  query CampaignSequenceExecutionReadiness($campaignId: UUID!) {
    campaignSequence(campaignId: $campaignId) {
      __typename
      ... on CampaignSequenceAbsent {
        kind
      }
      ... on CampaignSequenceLegacy {
        kind
      }
      ... on CampaignSequencePresent {
        kind
        snapshot {
          lifecycleStatus
          versionStatus
          issues {
            code
            message
          }
          sequence
        }
      }
    }
  }
`;

const CAMPAIGN_OUTREACH_AUDIENCE_REVIEW = gql`
  query CampaignOutreachAudienceReview($campaignId: UUID!) {
    campaignOutreachAudienceReview(campaignId: $campaignId) {
      state
      errorCode
      campaignId
      eligibleCount
      eligibleCreators {
        campaignCreatorId
        creatorId
        creatorName
      }
      excludedCount
      excludedCreators {
        campaignCreatorId
        creatorId
        creatorName
        reasons
        activeCampaignName
      }
    }
  }
`;

const CAMPAIGN_EMAIL_SENDER_POOL_READINESS = gql`
  query CampaignEmailSenderPoolExecutionReadiness(
    $input: CampaignEmailAccountCampaignInput!
  ) {
    campaignEmailSenderPool(input: $input) {
      mailboxes {
        bindingStatus
        status
      }
    }
  }
`;

const START_CAMPAIGN_EXECUTION = gql`
  mutation StartCampaignExecution($input: StartCampaignExecutionInput!) {
    startCampaignExecution(input: $input) {
      status
      lifecycleStatus
      reason
      replayed
      changed
      inFlightCount
    }
  }
`;

const STOP_CAMPAIGN_EXECUTION = gql`
  mutation StopCampaignExecution($input: StopCampaignExecutionInput!) {
    stopCampaignExecution(input: $input) {
      status
      lifecycleStatus
      reason
      replayed
      changed
      inFlightCount
    }
  }
`;

type CampaignRecord = ObjectRecord & {
  lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | null;
};

type CampaignSequenceReadinessData = {
  campaignSequence: {
    kind: string;
    snapshot: {
      issues: { code: string; message: string }[];
      sequence: { messages: { channel?: string }[] };
      versionStatus: string;
    } | null;
  };
};

type CampaignOutreachAudienceReason =
  | 'INVALID_MEMBERSHIP'
  | 'OPERATOR_EXCLUDED'
  | 'MISSING_CREATOR'
  | 'INVALID_STAGE'
  | 'ACTIVE_IN_OTHER_CAMPAIGN'
  | 'NO_USABLE_CHANNEL'
  | 'INVALID_EMAIL'
  | 'SUPPRESSED_EMAIL'
  | 'DUPLICATE_CREATOR_EMAIL';

type CampaignOutreachAudienceReviewData = {
  campaignOutreachAudienceReview: {
    state: 'LOADED' | 'ERROR';
    errorCode: string | null;
    campaignId: string;
    eligibleCount: number;
    eligibleCreators: Array<{
      campaignCreatorId: string;
      creatorId: string;
      creatorName: string;
    }>;
    excludedCount: number;
    excludedCreators: Array<{
      campaignCreatorId: string;
      creatorId: string | null;
      creatorName: string | null;
      reasons: CampaignOutreachAudienceReason[];
      activeCampaignName: string | null;
    }>;
  };
};

const audienceReasonLabels: Record<CampaignOutreachAudienceReason, string> = {
  INVALID_MEMBERSHIP: 'Campaign membership is invalid',
  OPERATOR_EXCLUDED: 'Excluded by operator',
  MISSING_CREATOR: 'Creator is missing or deleted',
  INVALID_STAGE: 'Stage must be Not contacted or Contacted',
  ACTIVE_IN_OTHER_CAMPAIGN:
    'Active in another Campaign. A creator can be in one active Campaign at a time',
  NO_USABLE_CHANNEL: 'No Instagram handle or usable email for this sequence',
  INVALID_EMAIL: 'Creator needs a valid email address',
  SUPPRESSED_EMAIL: 'Email address is suppressed',
  DUPLICATE_CREATOR_EMAIL: 'Email conflicts with another Creator',
};

type CampaignEmailSenderPoolReadinessData = {
  campaignEmailSenderPool: {
    mailboxes: { bindingStatus: string; status: string }[];
  };
};

type ExecutionResult = {
  status: 'STARTED' | 'STOPPED' | 'ACKNOWLEDGED' | 'BLOCKED';
  lifecycleStatus: 'ACTIVE' | 'STOPPED' | null;
  reason: string | null;
  replayed: boolean;
  changed: boolean;
  inFlightCount: number | null;
};

type Receipt = 'STARTED' | 'ACKNOWLEDGED' | 'STOPPED';
type Reconciliation = {
  scope: string;
  receipt:
    | Receipt
    | 'ACCESS_CHANGED'
    | 'UNCONFIRMED_START'
    | 'UNCONFIRMED_STOP'
    | 'BLOCKED_STOP';
  refreshing: boolean;
  failed: boolean;
};

const refreshMessage = (receipt: Reconciliation['receipt']) =>
  receipt === 'ACCESS_CHANGED'
    ? 'Campaign access changed. Reload current status before Start or Stop.'
    : receipt === 'UNCONFIRMED_START'
      ? 'Start could not be confirmed. It may have completed; reload status before another action.'
      : receipt === 'UNCONFIRMED_STOP'
        ? 'Stop could not be confirmed. It may have completed; reload status before another action.'
        : receipt === 'BLOCKED_STOP'
          ? 'Campaign Stop was blocked. Reload current status before another action.'
          : receipt === 'ACKNOWLEDGED'
            ? 'Earlier Start attempt acknowledged, but current Campaign status could not be refreshed. Reload before taking another action.'
            : `Campaign ${receipt === 'STARTED' ? 'Start' : 'Stop'} confirmed, but status could not be refreshed. Reload before taking another action.`;

const audienceRefreshOperationTypes: ObjectRecordOperation['type'][] = [
  'create-one',
  'create-many',
  'update-one',
  'update-many',
  'delete-one',
  'delete-many',
  'restore-one',
  'restore-many',
  'destroy-one',
  'destroy-many',
  'merge-records',
];

const newAttemptKey = () => uuidv4();

export const MyahCampaignExecutionControls = ({
  campaignId,
  variant = 'page',
}: {
  campaignId: string;
  variant?: 'header' | 'page' | 'review';
}) => {
  // Render when authentication changes; the subscription below also catches
  // logout/relogin transitions that are batched into one render.
  useAtomStateValue(tokenPairState);
  useAtomStateValue(currentUserState);
  useAtomStateValue(currentWorkspaceState);
  useAtomStateValue(currentWorkspaceMemberState);
  const store = useStore();
  const currentIdentity = useCallback(() => {
    const tokenIdentity = decodeCampaignCreationIdentity(
      store.get(tokenPairState.atom)?.accessOrWorkspaceAgnosticToken.token,
    );
    return JSON.stringify([
      store.get(currentWorkspaceState.atom)?.id,
      store.get(currentUserState.atom)?.id,
      store.get(currentWorkspaceMemberState.atom)?.id,
      tokenIdentity ? campaignCreationIdentityKey(tokenIdentity) : null,
    ]);
  }, [store]);
  // A renewed token with the same actor is not a new attempt. Logout or actor
  // changes must fence even when the same identity returns before a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const observedIdentityRef = useRef(currentIdentity());
  // oxlint-disable-next-line twenty/no-state-useref
  const sessionEpochRef = useRef(0);
  const observeIdentity = useCallback(() => {
    const identity = currentIdentity();
    if (observedIdentityRef.current !== identity) {
      observedIdentityRef.current = identity;
      sessionEpochRef.current += 1;
    }
  }, [currentIdentity]);
  observeIdentity();
  const scope = JSON.stringify([
    campaignId,
    observedIdentityRef.current,
    sessionEpochRef.current,
  ]);
  const currentScope = () => {
    observeIdentity();
    return JSON.stringify([
      campaignId,
      observedIdentityRef.current,
      sessionEpochRef.current,
    ]);
  };
  useEffect(() => {
    const subscriptions = [
      tokenPairState.atom,
      currentUserState.atom,
      currentWorkspaceState.atom,
      currentWorkspaceMemberState.atom,
    ].map((atom) => store.sub(atom, observeIdentity));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [store, observeIdentity]);
  // Imperative request fences prevent stale async completions from mutating a new scope.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(scope);
  // oxlint-disable-next-line twenty/no-state-useref
  const aliveRef = useRef(true);
  // oxlint-disable-next-line twenty/no-state-useref
  const busyRef = useRef(false);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(
    null,
  );
  const [operationNotice, setOperationNotice] = useState<{
    scope: string;
    message: string;
  } | null>(null);
  const [lastFreshStatus, setLastFreshStatus] = useState<{
    scope: string;
    lifecycle: CampaignRecord['lifecycleStatus'];
  } | null>(null);
  const apolloCoreClient = useApolloCoreClient();
  // The Campaign header reads the shared record store; keep its badge current.
  const publishLifecycle = (lifecycle: CampaignRecord['lifecycleStatus']) => {
    const atom = recordStoreFamilyState.atomFamily(campaignId);
    const record = store.get(atom);
    if (record && lifecycle)
      store.set(atom, { ...record, lifecycleStatus: lifecycle });
  };
  const metadataClient = useApolloClient();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { objectMetadataItem: campaignCreatorMetadata } = useObjectMetadataItem(
    { objectNameSingular: 'campaignCreator' },
  );
  const { objectMetadataItem: socialProfileMetadata } = useObjectMetadataItem({
    objectNameSingular: 'socialProfile',
  });
  const { objectMetadataItem: creatorMetadata } = useObjectMetadataItem({
    objectNameSingular: 'creator',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  // oxlint-disable-next-line twenty/no-state-useref
  const readAllowedRef = useRef(permissions.canReadObjectRecords);
  // oxlint-disable-next-line twenty/no-state-useref
  const writeAllowedRef = useRef(permissions.canUpdateObjectRecords);
  // oxlint-disable-next-line twenty/no-state-useref
  const accessEpochRef = useRef(0);
  const revokedAccess =
    (readAllowedRef.current && !permissions.canReadObjectRecords) ||
    (writeAllowedRef.current && !permissions.canUpdateObjectRecords);
  if (revokedAccess) accessEpochRef.current += 1;
  readAllowedRef.current = permissions.canReadObjectRecords;
  writeAllowedRef.current = permissions.canUpdateObjectRecords;
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { openModal, closeModal } = useModal();
  const [pending, setPending] = useState<'START' | 'STOP' | null>(null);
  if (revokedAccess) {
    if (reconciliation?.scope !== scope)
      setReconciliation({
        scope,
        receipt:
          pending === 'STOP'
            ? 'UNCONFIRMED_STOP'
            : pending === 'START'
              ? 'UNCONFIRMED_START'
              : 'ACCESS_CHANGED',
        refreshing: false,
        failed: true,
      });
    else if (reconciliation.refreshing)
      setReconciliation({ ...reconciliation, refreshing: false, failed: true });
    if (operationNotice !== null) setOperationNotice(null);
    busyRef.current = false;
    if (pending !== null) setPending(null);
  }
  const renderAccessEpoch = accessEpochRef.current;
  // A failed or response-lost Start retries with the same key. It is cleared
  // only after a canonical successful response.
  // oxlint-disable-next-line twenty/no-state-useref
  const startAttemptKeyRef = useRef<string | null>(null);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    startAttemptKeyRef.current = null;
    busyRef.current = false;
    if (pending !== null) setPending(null);
  }
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const isSameScope = (origin: string) =>
    aliveRef.current &&
    accessEpochRef.current === renderAccessEpoch &&
    scopeRef.current === origin &&
    currentScope() === origin;
  const isCurrent = (origin: string) =>
    readAllowedRef.current && isSameScope(origin);
  const activeReconciliation =
    reconciliation?.scope === scope ? reconciliation : null;
  const activeNotice =
    operationNotice?.scope === scope ? operationNotice.message : null;
  const stopModalId = `stop-campaign-execution-${campaignId}`;
  const startModalId = `start-campaign-execution-${campaignId}`;
  useEffect(() => {
    if (
      variant !== 'review' &&
      (!permissions.canReadObjectRecords || !permissions.canUpdateObjectRecords)
    )
      closeModal(stopModalId);
  }, [
    variant,
    permissions.canReadObjectRecords,
    permissions.canUpdateObjectRecords,
    closeModal,
    stopModalId,
  ]);
  useEffect(
    () => (variant === 'review' ? undefined : () => closeModal(stopModalId)),
    [variant, closeModal, stopModalId, scope],
  );
  const campaignQuery = useFindOneRecord<CampaignRecord>({
    objectNameSingular: 'campaign',
    objectRecordId: campaignId,
    recordGqlFields: { id: true, lifecycleStatus: true },
    skip: !permissions.canReadObjectRecords,
  });
  const sequenceReadiness = useQuery<CampaignSequenceReadinessData>(
    CAMPAIGN_SEQUENCE_READINESS,
    {
      client: apolloCoreClient,
      variables: { campaignId },
      skip: !permissions.canReadObjectRecords,
    },
  );
  const audienceReview = useQuery<CampaignOutreachAudienceReviewData>(
    CAMPAIGN_OUTREACH_AUDIENCE_REVIEW,
    {
      variables: { campaignId },
      skip: !permissions.canReadObjectRecords,
      fetchPolicy: 'cache-and-network',
    },
  );
  const senderPoolReadiness = useQuery<CampaignEmailSenderPoolReadinessData>(
    CAMPAIGN_EMAIL_SENDER_POOL_READINESS,
    {
      variables: { input: { campaignId } },
      skip: !permissions.canReadObjectRecords,
    },
  );
  const refetchAudience = () => {
    void audienceReview.refetch();
  };
  useListenToObjectRecordOperationBrowserEvent({
    objectMetadataItemId: campaignCreatorMetadata.id,
    operationTypes: audienceRefreshOperationTypes,
    onObjectRecordOperationBrowserEvent: refetchAudience,
  });
  useListenToObjectRecordOperationBrowserEvent({
    objectMetadataItemId: creatorMetadata.id,
    operationTypes: audienceRefreshOperationTypes,
    onObjectRecordOperationBrowserEvent: refetchAudience,
  });
  // An added or removed Instagram handle changes who can be contacted.
  useListenToObjectRecordOperationBrowserEvent({
    objectMetadataItemId: socialProfileMetadata.id,
    operationTypes: audienceRefreshOperationTypes,
    onObjectRecordOperationBrowserEvent: refetchAudience,
  });

  const canRead = permissions.canReadObjectRecords;
  const campaignIsCurrent = campaignQuery.record?.id === campaignId;
  // A completed network read, not a mutation DTO, owns the interim lifecycle
  // until Apollo's record hook has caught up with that read.
  const lifecycle =
    canRead && campaignIsCurrent
      ? lastFreshStatus?.scope === scope
        ? lastFreshStatus.lifecycle
        : campaignQuery.record?.lifecycleStatus
      : undefined;
  useEffect(() => {
    if (
      lastFreshStatus?.scope === scope &&
      campaignIsCurrent &&
      campaignQuery.record?.lifecycleStatus === lastFreshStatus.lifecycle
    )
      setLastFreshStatus(null);
  }, [
    scope,
    campaignIsCurrent,
    campaignQuery.record?.lifecycleStatus,
    lastFreshStatus,
  ]);
  const snapshot = sequenceReadiness.data?.campaignSequence?.snapshot;
  const audience = audienceReview.data?.campaignOutreachAudienceReview;
  const audienceIsCurrent =
    audience?.state === 'LOADED' && audience.campaignId === campaignId;
  const mailboxes =
    senderPoolReadiness.data?.campaignEmailSenderPool?.mailboxes ?? [];
  const hasReadyMailbox = mailboxes.some(
    (mailbox) =>
      mailbox.bindingStatus === 'RESOLVED_BINDING' &&
      mailbox.status === 'READY',
  );
  const sequenceReady =
    sequenceReadiness.data?.campaignSequence?.kind === 'SEQUENCE' &&
    snapshot?.issues?.length === 0 &&
    Array.isArray(snapshot?.sequence?.messages) &&
    snapshot.sequence.messages.length > 0 &&
    snapshot.sequence.messages.every(
      (message: { channel?: string }) =>
        message.channel === 'EMAIL' || message.channel === 'INSTAGRAM',
    );
  // A ready mailbox is needed only when the sequence has email steps.
  const needsMailbox =
    snapshot?.sequence?.messages?.some(
      (message: { channel?: string }) => message.channel === 'EMAIL',
    ) ?? true;
  const hasOutstandingStart = startAttemptKeyRef.current !== null;
  const canStart =
    canRead &&
    campaignIsCurrent &&
    permissions.canUpdateObjectRecords &&
    !busyRef.current &&
    !activeReconciliation &&
    pending === null &&
    (hasOutstandingStart || lifecycle === 'DRAFT' || lifecycle === 'PAUSED') &&
    snapshot?.versionStatus === 'ACTIVE' &&
    sequenceReady &&
    (hasReadyMailbox || !needsMailbox) &&
    audienceIsCurrent &&
    audience.eligibleCount > 0 &&
    !campaignQuery.loading &&
    !sequenceReadiness.loading &&
    !audienceReview.loading &&
    !senderPoolReadiness.loading &&
    !campaignQuery.error &&
    !sequenceReadiness.error &&
    !audienceReview.error &&
    !senderPoolReadiness.error;
  const canStop =
    canRead &&
    campaignIsCurrent &&
    permissions.canUpdateObjectRecords &&
    !busyRef.current &&
    !activeReconciliation &&
    lifecycle === 'ACTIVE' &&
    !campaignQuery.loading &&
    !campaignQuery.error &&
    pending === null;

  const reload = async (origin: string) => {
    if (!isCurrent(origin) || !canRead)
      throw new Error('Campaign scope changed.');
    const results = await Promise.allSettled([
      campaignQuery.refetch(),
      sequenceReadiness.refetch(),
      audienceReview.refetch(),
      senderPoolReadiness.refetch(),
    ]);
    if (
      !isCurrent(origin) ||
      !canRead ||
      results.some((result) => result.status === 'rejected')
    )
      throw new Error('Campaign status could not be refreshed.');
    const [campaign, sequence, audienceResult, pool] = results.map(
      (result) =>
        (result as PromiseFulfilledResult<{ data?: any; error?: unknown }>)
          .value,
    );
    const freshCampaign = campaign.data?.campaign;
    const freshSequence = sequence.data?.campaignSequence;
    const freshAudience = audienceResult.data?.campaignOutreachAudienceReview;
    const freshPool = pool.data?.campaignEmailSenderPool;
    if (
      results.some(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.error !== undefined &&
          result.value.error !== null,
      ) ||
      freshCampaign?.id !== campaignId ||
      !['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'].includes(
        freshCampaign.lifecycleStatus,
      ) ||
      !freshSequence ||
      !['SEQUENCE', 'ABSENT', 'LEGACY'].includes(freshSequence.kind) ||
      !freshAudience ||
      freshAudience.campaignId !== campaignId ||
      freshAudience.state !== 'LOADED' ||
      !Array.isArray(freshAudience.eligibleCreators) ||
      !Array.isArray(freshAudience.excludedCreators) ||
      !freshPool ||
      !Array.isArray(freshPool.mailboxes)
    )
      throw new Error('Campaign status could not be refreshed.');
    return freshCampaign.lifecycleStatus;
  };

  const reconcile = async (origin: string, receipt: Receipt) => {
    if (!isCurrent(origin)) return;
    setReconciliation({
      scope: origin,
      receipt,
      refreshing: true,
      failed: false,
    });
    try {
      const freshLifecycle = await reload(origin);
      if (!isCurrent(origin)) return;
      setLastFreshStatus({ scope: origin, lifecycle: freshLifecycle });
      publishLifecycle(freshLifecycle);
      setReconciliation(null);
      setOperationNotice(null);
      if (receipt === 'ACKNOWLEDGED') {
        enqueueSuccessSnackBar({
          message:
            'Earlier Start attempt acknowledged. No new activation was created; current Campaign status refreshed.',
        });
      } else {
        enqueueSuccessSnackBar({
          message:
            receipt === 'STARTED'
              ? 'Campaign Start confirmed.'
              : freshLifecycle === 'ACTIVE'
                ? 'Campaign Stop confirmed, but Campaign is ACTIVE again. Review current status before another action; messages already accepted by a provider cannot be recalled.'
                : 'Campaign stopped. Unsent work is preserved; messages already accepted by a provider cannot be recalled.',
        });
      }
    } catch {
      if (!isCurrent(origin)) return;
      setReconciliation({
        scope: origin,
        receipt,
        refreshing: false,
        failed: true,
      });
      enqueueErrorSnackBar({ message: refreshMessage(receipt) });
    }
  };

  const recover = async () => {
    if (
      !canRead ||
      !permissions.canUpdateObjectRecords ||
      !activeReconciliation?.failed ||
      busyRef.current
    )
      return;
    const origin = scope;
    busyRef.current = true;
    setReconciliation({ ...activeReconciliation, refreshing: true });
    try {
      const freshLifecycle = await reload(origin);
      if (isCurrent(origin)) {
        setLastFreshStatus({ scope: origin, lifecycle: freshLifecycle });
        publishLifecycle(freshLifecycle);
        setReconciliation(null);
        setOperationNotice(null);
      }
    } catch {
      if (isCurrent(origin))
        setReconciliation({
          ...activeReconciliation,
          refreshing: false,
          failed: true,
        });
    } finally {
      if (isSameScope(origin)) busyRef.current = false;
    }
  };

  const start = async () => {
    if (!canStart || busyRef.current || !isCurrent(scope)) return;
    const origin = scope;
    const attemptKey = startAttemptKeyRef.current ?? newAttemptKey();
    startAttemptKeyRef.current = attemptKey;
    busyRef.current = true;
    setPending('START');
    try {
      const response = await metadataClient.mutate<{
        startCampaignExecution: ExecutionResult;
      }>({
        mutation: START_CAMPAIGN_EXECUTION,
        variables: { input: { campaignId, startIdempotencyKey: attemptKey } },
      });
      if (!isCurrent(origin)) return;
      const result = response.data?.startCampaignExecution;
      if (result?.status === 'BLOCKED' && result.lifecycleStatus === null) {
        const message =
          result.reason === 'INSTAGRAM_ACCOUNT_REQUIRED'
            ? 'Connect and select an Instagram account in Settings before starting a sequence with Instagram steps.'
            : (result.reason ?? 'Campaign Start blocked.');
        setOperationNotice({ scope: origin, message });
        enqueueErrorSnackBar({ message });
        return;
      }
      const receipt =
        result?.status === 'STARTED' &&
        result.lifecycleStatus === 'ACTIVE' &&
        ((result.replayed === false && result.changed === true) ||
          (result.replayed === true && result.changed === false))
          ? 'STARTED'
          : result?.status === 'ACKNOWLEDGED' &&
              result.lifecycleStatus === null &&
              result.replayed === true &&
              result.changed === false
            ? 'ACKNOWLEDGED'
            : null;
      if (!receipt) throw new Error('Start result could not be confirmed.');
      startAttemptKeyRef.current = null;
      setOperationNotice(null);
      await reconcile(origin, receipt);
    } catch {
      if (isCurrent(origin)) {
        const message =
          'Start could not be confirmed. It may have completed; retrying uses the same attempt.';
        setOperationNotice({ scope: origin, message });
        enqueueErrorSnackBar({ message });
      }
    } finally {
      if (isSameScope(origin)) {
        busyRef.current = false;
        setPending(null);
      }
    }
  };

  const stop = async () => {
    if (!canStop || busyRef.current || !isCurrent(scope)) return;
    const origin = scope;
    busyRef.current = true;
    setPending('STOP');
    try {
      const response = await metadataClient.mutate<{
        stopCampaignExecution: ExecutionResult;
      }>({
        mutation: STOP_CAMPAIGN_EXECUTION,
        variables: { input: { campaignId } },
      });
      if (!isCurrent(origin)) return;
      const result = response.data?.stopCampaignExecution;
      if (result?.status === 'BLOCKED' && result.lifecycleStatus === null) {
        const message = result.reason ?? 'Campaign Stop blocked.';
        setOperationNotice({ scope: origin, message });
        setReconciliation({
          scope: origin,
          receipt: 'BLOCKED_STOP',
          refreshing: false,
          failed: true,
        });
        enqueueErrorSnackBar({ message });
        return;
      }
      if (
        result?.status !== 'STOPPED' ||
        result.lifecycleStatus !== 'STOPPED' ||
        typeof result.changed !== 'boolean' ||
        typeof result.inFlightCount !== 'number'
      )
        throw new Error('Stop result could not be confirmed.');
      setOperationNotice(null);
      await reconcile(origin, 'STOPPED');
    } catch {
      if (isCurrent(origin)) {
        const message =
          'Stop could not be confirmed. It may have completed; reload status before another action.';
        setOperationNotice({ scope: origin, message });
        setReconciliation({
          scope: origin,
          receipt: 'UNCONFIRMED_STOP',
          refreshing: false,
          failed: true,
        });
        enqueueErrorSnackBar({ message });
      }
    } finally {
      if (isSameScope(origin)) {
        busyRef.current = false;
        setPending(null);
      }
    }
  };

  const campaignStateFailed = campaignQuery.error !== undefined;
  const audienceFailed = audienceReview.error !== undefined;
  const readinessFailed =
    sequenceReadiness.error !== undefined ||
    senderPoolReadiness.error !== undefined;
  const blocker = !canRead
    ? "You don't have permission to view this Campaign."
    : !permissions.canUpdateObjectRecords
      ? "You don't have permission to Start or Stop this Campaign."
      : !campaignIsCurrent && !campaignQuery.loading
        ? 'Campaign status could not be loaded. Reload before Start or Stop.'
        : campaignStateFailed
          ? 'Campaign status could not be loaded. Reload before Start or Stop.'
          : audienceFailed && lifecycle !== 'ACTIVE'
            ? 'Campaign audience could not be loaded. Reload before Start.'
            : !audienceReview.loading &&
                !audienceFailed &&
                !audienceIsCurrent &&
                lifecycle !== 'ACTIVE'
              ? 'Campaign audience review is unavailable. Reload before Start.'
              : audienceIsCurrent &&
                  audience.eligibleCount === 0 &&
                  lifecycle !== 'ACTIVE'
                ? 'No eligible Campaign Creators. Resolve audience exclusions before Start.'
                : readinessFailed && lifecycle !== 'ACTIVE'
                  ? 'Campaign readiness could not be loaded. Reload before Start.'
                  : lifecycle === 'COMPLETED'
                    ? 'Completed Campaigns cannot be started.'
                    : snapshot?.versionStatus !== 'ACTIVE' &&
                        lifecycle !== 'ACTIVE'
                      ? 'Publish the current sequence before Start.'
                      : !sequenceReady && lifecycle !== 'ACTIVE'
                        ? 'Add a valid sequence before Start.'
                        : needsMailbox &&
                            !hasReadyMailbox &&
                            lifecycle !== 'ACTIVE'
                          ? 'Select at least one ready email mailbox before Start.'
                          : null;

  const reconciliationMessage = activeReconciliation
    ? activeReconciliation.failed
      ? refreshMessage(activeReconciliation.receipt)
      : activeReconciliation.receipt === 'ACKNOWLEDGED'
        ? 'Earlier Start attempt acknowledged. No new activation was created; refreshing current Campaign status.'
        : activeReconciliation.receipt === 'ACCESS_CHANGED'
          ? 'Campaign access changed; refreshing current Campaign status.'
          : activeReconciliation.receipt === 'UNCONFIRMED_START' ||
              activeReconciliation.receipt === 'UNCONFIRMED_STOP' ||
              activeReconciliation.receipt === 'BLOCKED_STOP'
            ? 'Refreshing current Campaign status; no Stop receipt was confirmed.'
            : `Campaign ${activeReconciliation.receipt === 'STARTED' ? 'Start' : 'Stop'} confirmed; refreshing current Campaign status.`
    : null;
  const status = canRead
    ? activeReconciliation?.failed && activeNotice
      ? activeNotice
      : (reconciliationMessage ?? activeNotice)
    : null;
  const recovery =
    activeReconciliation?.failed && canRead ? (
      <Button
        disabled={
          activeReconciliation.refreshing || !permissions.canUpdateObjectRecords
        }
        onClick={() => void recover()}
        title="Reload status"
        type="button"
        variant="secondary"
      />
    ) : null;

  const controls =
    lifecycle === 'ACTIVE' && !hasOutstandingStart ? (
      <Button
        disabled={!canStop}
        isLoading={pending === 'STOP'}
        onClick={() => openModal(stopModalId)}
        title="Stop"
        type="button"
        variant="secondary"
      />
    ) : lifecycle === 'DRAFT' ||
      lifecycle === 'PAUSED' ||
      hasOutstandingStart ? (
      <Button
        disabled={!canStart}
        isLoading={pending === 'START'}
        // The header has no room for the audience review: confirm it first.
        onClick={() =>
          variant === 'header' ? openModal(startModalId) : void start()
        }
        title="Start"
        type="button"
        variant="primary"
      />
    ) : null;

  const confirmation = (
    <ConfirmationModal
      confirmButtonText="Stop Campaign"
      loading={pending === 'STOP'}
      modalInstanceId={stopModalId}
      onConfirmClick={() => void stop()}
      subtitle="Stops new outreach dispatch and preserves unsent work. Messages already accepted by a provider cannot be recalled."
      title="Stop this Campaign?"
    />
  );

  const startConfirmation = (
    <ConfirmationModal
      confirmButtonText="Start Campaign"
      confirmButtonAccent="brand"
      loading={pending === 'START'}
      modalInstanceId={startModalId}
      onConfirmClick={() => {
        closeModal(startModalId);
        void start();
      }}
      subtitle={
        audienceIsCurrent ? (
          <>
            <p>{`${audience.eligibleCount} will be contacted · ${audience.excludedCount} skipped.`}</p>
            {audience.excludedCreators.length > 0 ? (
              <ul aria-label="Skipped Campaign Creators">
                {audience.excludedCreators.map((creator) => (
                  <li key={creator.campaignCreatorId}>
                    {`${creator.creatorName ?? 'Creator unavailable'}: ${creator.reasons
                      .map((reason) =>
                        reason === 'ACTIVE_IN_OTHER_CAMPAIGN' &&
                        creator.activeCampaignName
                          ? `active in ${creator.activeCampaignName}`
                          : audienceReasonLabels[reason],
                      )
                      .join('; ')}`}
                  </li>
                ))}
              </ul>
            ) : null}
            <p>Messages accepted by Instagram or email cannot be recalled.</p>
          </>
        ) : (
          'The Campaign audience could not be loaded. Close this and reload before Start.'
        )
      }
      title="Start this Campaign?"
    />
  );

  if (variant === 'header')
    return (
      <>
        {canRead ? (
          <>
            {status ? <span role="status">{status}</span> : null}
            {controls}
            {recovery}
            {confirmation}
            {startConfirmation}
          </>
        ) : (
          <span role="status">{blocker}</span>
        )}
      </>
    );

  return (
    <Section>
      <H2Title title="Campaign execution" />
      {status ? <p role="status">{status}</p> : null}
      {blocker && !status ? <p role="status">{blocker}</p> : null}
      {!canRead ? null : (
        <>
          <section aria-label="Launch readiness">
            <h3>Launch readiness</h3>
            {sequenceReadiness.loading || senderPoolReadiness.loading ? (
              <p role="status">Checking published sequence and sender pool…</p>
            ) : readinessFailed ? (
              <p role="alert">
                Published sequence or sender-pool status is unavailable.
              </p>
            ) : (
              <>
                <p>
                  {snapshot?.versionStatus !== 'ACTIVE'
                    ? 'Publish the current sequence before Start.'
                    : sequenceReady
                      ? 'Published sequence ready.'
                      : 'A valid sequence is required before Start.'}
                </p>
                <p>
                  {
                    mailboxes.filter(
                      (mailbox) =>
                        mailbox.bindingStatus === 'RESOLVED_BINDING' &&
                        mailbox.status === 'READY',
                    ).length
                  }{' '}
                  ready email mailbox in the sender pool. Linked drafting
                  accounts do not determine execution readiness.
                </p>
              </>
            )}
          </section>
          <section aria-label="Campaign outreach audience review">
            <h3>Outreach audience</h3>
            {audienceReview.loading ? (
              <p role="status">Loading Campaign audience review…</p>
            ) : audienceReview.error ? (
              <p role="alert">
                Campaign audience could not be loaded. This is not an empty
                audience; reload before Start.
              </p>
            ) : audienceIsCurrent ? (
              <>
                <p>{`${audience.eligibleCount} eligible · ${audience.excludedCount} excluded`}</p>
                {audience.eligibleCount === 0 ? (
                  <p>No Campaign Creators are currently eligible.</p>
                ) : (
                  <ul aria-label="Eligible Campaign Creators">
                    {audience.eligibleCreators.map((creator) => (
                      <li key={creator.campaignCreatorId}>
                        {creator.creatorName}
                      </li>
                    ))}
                  </ul>
                )}
                {audience.excludedCreators.length > 0 ? (
                  <ul aria-label="Excluded Campaign Creators">
                    {audience.excludedCreators.map((creator) => (
                      <li key={creator.campaignCreatorId}>
                        {`${creator.creatorName ?? 'Creator unavailable'} — ${creator.reasons
                          .map((reason) =>
                            reason === 'ACTIVE_IN_OTHER_CAMPAIGN' &&
                            creator.activeCampaignName
                              ? `Active in ${creator.activeCampaignName}. Mark them Posted or Dropped there, then start again to include them`
                              : audienceReasonLabels[reason],
                          )
                          .join('; ')}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p role="alert">Campaign audience review is unavailable.</p>
            )}
          </section>
          {variant === 'review' ? null : controls}
          {variant === 'review' ? null : recovery}
          {variant === 'review' ? null : confirmation}
        </>
      )}
    </Section>
  );
};
