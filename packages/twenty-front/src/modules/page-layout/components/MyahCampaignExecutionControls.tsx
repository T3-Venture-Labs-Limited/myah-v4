import { gql } from '@apollo/client';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { v4 as uuidv4 } from 'uuid';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';

import { useListenToObjectRecordOperationBrowserEvent } from '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type ObjectRecordOperation } from '@/object-record/types/ObjectRecordOperation';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
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

const UPDATE_CAMPAIGN_SENDING_WINDOW = gql`
  mutation UpdateCampaignSendingWindow(
    $input: UpdateCampaignSendingWindowInput!
  ) {
    updateCampaignSendingWindow(input: $input) {
      status
      reason
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
  | 'MISSING_CREATOR'
  | 'INVALID_STAGE'
  | 'NON_EMAIL_CONTACT_METHOD'
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
    }>;
  };
};

const audienceReasonLabels: Record<CampaignOutreachAudienceReason, string> = {
  INVALID_MEMBERSHIP: 'Campaign membership is invalid',
  MISSING_CREATOR: 'Creator is missing or deleted',
  INVALID_STAGE: 'Stage must be Not contacted or Contacted',
  NON_EMAIL_CONTACT_METHOD: 'Contact method must be Email',
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
}: {
  campaignId: string;
}) => {
  const apolloCoreClient = useApolloCoreClient();
  const metadataClient = useApolloClient();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { objectMetadataItem: campaignCreatorMetadata } = useObjectMetadataItem(
    { objectNameSingular: 'campaignCreator' },
  );
  const { objectMetadataItem: creatorMetadata } = useObjectMetadataItem({
    objectNameSingular: 'creator',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { openModal } = useModal();
  const [pending, setPending] = useState<'START' | 'STOP' | 'WINDOW' | null>(
    null,
  );
  const [timeZone, setTimeZone] = useState('');
  const [startLocalTime, setStartLocalTime] = useState('');
  const [endLocalTime, setEndLocalTime] = useState('');
  // A failed or response-lost Start retries with the same key. It is cleared
  // only after a canonical successful response.
  // oxlint-disable-next-line twenty/no-state-useref
  const startAttemptKeyRef = useRef<string | null>(null);
  const stopModalId = `stop-campaign-execution-${campaignId}`;
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

  const lifecycle = campaignQuery.record?.lifecycleStatus;
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
      (message: { channel?: string }) => message.channel === 'EMAIL',
    );
  const hasOutstandingStart = startAttemptKeyRef.current !== null;
  const canStart =
    permissions.canUpdateObjectRecords &&
    pending === null &&
    (hasOutstandingStart || lifecycle === 'DRAFT' || lifecycle === 'PAUSED') &&
    snapshot?.versionStatus === 'ACTIVE' &&
    sequenceReady &&
    hasReadyMailbox &&
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
    permissions.canUpdateObjectRecords &&
    lifecycle === 'ACTIVE' &&
    !campaignQuery.loading &&
    !campaignQuery.error &&
    pending === null;

  const reload = async () => {
    await Promise.all([
      campaignQuery.refetch(),
      sequenceReadiness.refetch(),
      audienceReview.refetch(),
      senderPoolReadiness.refetch(),
    ]);
  };

  const saveWindow = async () => {
    if (
      pending !== null ||
      campaignQuery.loading ||
      campaignQuery.error !== undefined ||
      !permissions.canUpdateObjectRecords ||
      (lifecycle !== 'DRAFT' && lifecycle !== 'PAUSED') ||
      timeZone.trim().length === 0 ||
      startLocalTime.length === 0 ||
      endLocalTime.length === 0
    )
      return;
    setPending('WINDOW');
    try {
      const response = await metadataClient.mutate<{
        updateCampaignSendingWindow: { status: string; reason: string | null };
      }>({
        mutation: UPDATE_CAMPAIGN_SENDING_WINDOW,
        variables: {
          input: {
            campaignId,
            timeZone: timeZone.trim(),
            startLocalTime: `${startLocalTime}:00`,
            endLocalTime: `${endLocalTime}:00`,
          },
        },
      });
      const result = response.data?.updateCampaignSendingWindow;
      if (!result || result.status === 'BLOCKED')
        throw new Error(result?.reason ?? 'Sending window could not be saved.');
      await reload();
      enqueueSuccessSnackBar({ message: 'Campaign sending window saved.' });
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : 'Sending window could not be saved.',
      });
    } finally {
      setPending(null);
    }
  };

  const start = async () => {
    if (!canStart) return;
    const attemptKey = startAttemptKeyRef.current ?? newAttemptKey();
    startAttemptKeyRef.current = attemptKey;
    setPending('START');
    try {
      const response = await metadataClient.mutate<{
        startCampaignExecution: ExecutionResult;
      }>({
        mutation: START_CAMPAIGN_EXECUTION,
        variables: { input: { campaignId, startIdempotencyKey: attemptKey } },
      });
      const result = response.data?.startCampaignExecution;
      if (!result || result.status === 'BLOCKED')
        throw new Error(result?.reason ?? 'Campaign could not be started.');
      startAttemptKeyRef.current = null;
      await reload();
      enqueueSuccessSnackBar({
        message: result.replayed
          ? 'Campaign Start confirmed.'
          : 'Campaign started.',
      });
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : 'Campaign could not be started.',
      });
    } finally {
      setPending(null);
    }
  };

  const stop = async () => {
    if (!canStop) return;
    setPending('STOP');
    try {
      const response = await metadataClient.mutate<{
        stopCampaignExecution: ExecutionResult;
      }>({
        mutation: STOP_CAMPAIGN_EXECUTION,
        variables: { input: { campaignId } },
      });
      const result = response.data?.stopCampaignExecution;
      if (!result || result.status === 'BLOCKED')
        throw new Error(result?.reason ?? 'Campaign could not be stopped.');
      await reload();
      enqueueSuccessSnackBar({
        message: 'Campaign stopped. Unsent work is preserved.',
      });
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : 'Campaign could not be stopped.',
      });
    } finally {
      setPending(null);
    }
  };

  const campaignStateFailed = campaignQuery.error !== undefined;
  const audienceFailed = audienceReview.error !== undefined;
  const readinessFailed =
    sequenceReadiness.error !== undefined ||
    senderPoolReadiness.error !== undefined;
  const blocker = !permissions.canUpdateObjectRecords
    ? "You don't have permission to Start or Stop this Campaign."
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
                : snapshot?.versionStatus !== 'ACTIVE' && lifecycle !== 'ACTIVE'
                  ? 'Publish the current sequence before Start.'
                  : !sequenceReady && lifecycle !== 'ACTIVE'
                    ? 'Add a valid email-only sequence before Start.'
                    : !hasReadyMailbox && lifecycle !== 'ACTIVE'
                      ? 'Select at least one ready email mailbox before Start.'
                      : null;

  return (
    <Section>
      <H2Title title="Campaign execution" />
      {blocker ? <p role="status">{blocker}</p> : null}
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
                  <li key={creator.campaignCreatorId}>{creator.creatorName}</li>
                ))}
              </ul>
            )}
            {audience.excludedCreators.length > 0 ? (
              <ul aria-label="Excluded Campaign Creators">
                {audience.excludedCreators.map((creator) => (
                  <li key={creator.campaignCreatorId}>
                    {`${creator.creatorName ?? 'Creator unavailable'} — ${creator.reasons
                      .map((reason) => audienceReasonLabels[reason])
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
      {(lifecycle === 'DRAFT' || lifecycle === 'PAUSED') &&
      permissions.canUpdateObjectRecords ? (
        <div>
          <label>
            Sending timezone
            <input
              aria-label="Sending timezone"
              onChange={(event) => setTimeZone(event.target.value)}
              placeholder="America/New_York"
              value={timeZone}
            />
          </label>
          <label>
            Start time
            <input
              aria-label="Start time"
              onChange={(event) => setStartLocalTime(event.target.value)}
              type="time"
              value={startLocalTime}
            />
          </label>
          <label>
            End time
            <input
              aria-label="End time"
              onChange={(event) => setEndLocalTime(event.target.value)}
              type="time"
              value={endLocalTime}
            />
          </label>
          <Button
            disabled={
              pending !== null ||
              campaignQuery.loading ||
              campaignQuery.error !== undefined ||
              !timeZone.trim() ||
              !startLocalTime ||
              !endLocalTime
            }
            isLoading={pending === 'WINDOW'}
            onClick={() => void saveWindow()}
            title="Save sending window"
            type="button"
            variant="secondary"
          />
        </div>
      ) : null}
      {lifecycle === 'ACTIVE' && !hasOutstandingStart ? (
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
          onClick={() => void start()}
          title="Start"
          type="button"
          variant="primary"
        />
      ) : null}
      <ConfirmationModal
        confirmButtonText="Stop Campaign"
        loading={pending === 'STOP'}
        modalInstanceId={stopModalId}
        onConfirmClick={() => void stop()}
        subtitle="Stops new outreach dispatch and preserves unsent work. Messages already accepted by a provider cannot be recalled."
        title="Stop this Campaign?"
      />
    </Section>
  );
};
