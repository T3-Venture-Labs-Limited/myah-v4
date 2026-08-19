import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { SingleRecordPicker } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useState } from 'react';
import { Button, Checkbox } from 'twenty-ui/input';

const APPROVAL_BATCH_SIZE = 500;

const SNAPSHOT = gql`
  query CampaignInfluencerSnapshot($input: CampaignInfluencerCampaignInput!) {
    campaignInfluencerSnapshot(input: $input) {
      campaignCreatorLists {
        id
        creatorListId
      }
    }
  }
`;

const ATTACH = gql`
  mutation AttachCampaignCreatorLists(
    $input: AttachCampaignCreatorListsInput!
  ) {
    attachCampaignCreatorLists(input: $input) {
      campaignCreatorLists {
        id
        creatorListId
      }
    }
  }
`;

const ADDITION_CANDIDATES = gql`
  query CampaignCreatorListAdditionCandidates(
    $input: CampaignCreatorListAdditionCandidatesInput!
  ) {
    campaignCreatorListAdditionCandidates(input: $input) {
      creatorIds
    }
  }
`;

const APPROVE_ADDITIONS = gql`
  mutation ApproveCampaignCreatorListAdditions(
    $input: ApproveCampaignCreatorListAdditionsInput!
  ) {
    approveCampaignCreatorListAdditions(input: $input)
  }
`;

const DETACH = gql`
  mutation DetachCampaignCreatorList($input: DetachCampaignCreatorListInput!) {
    detachCampaignCreatorList(input: $input) {
      campaignCreatorLists {
        id
        creatorListId
      }
    }
  }
`;

type CampaignCreatorList = {
  id: string;
  creatorListId: string;
};

type CampaignInfluencerSnapshotData = {
  campaignInfluencerSnapshot: {
    campaignCreatorLists: CampaignCreatorList[];
  };
};

type CampaignInfluencerSnapshotVariables = {
  input: { campaignId: string };
};

type CampaignCreatorListAdditionCandidatesData = {
  campaignCreatorListAdditionCandidates: { creatorIds: string[] };
};

type CampaignCreatorListAdditionCandidatesVariables = {
  input: { campaignId: string; creatorListId: string };
};

type ApproveCampaignCreatorListAdditionsData = {
  approveCampaignCreatorListAdditions: boolean;
};

type ApproveCampaignCreatorListAdditionsVariables = {
  input: { campaignId: string; creatorListId: string; creatorIds: string[] };
};

type DetachCampaignCreatorListData = {
  detachCampaignCreatorList: {
    campaignCreatorLists: CampaignCreatorList[];
  };
};

type DetachCampaignCreatorListVariables = {
  input: { campaignId: string; creatorListId: string };
};

type CreatorListAttachmentProps = {
  campaignId: string;
  creatorListId: string;
  creatorListName: string;
  onDetach: (creatorListId: string) => void;
  onChanged: () => Promise<void>;
};

const CreatorListAttachment = ({
  campaignId,
  creatorListId,
  creatorListName,
  onDetach,
  onChanged,
}: CreatorListAttachmentProps) => {
  const { closeModal, openModal } = useModal();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
  const [reviewError, setReviewError] = useState<string>();
  const [refreshError, setRefreshError] = useState<string>();
  const reviewModalInstanceId = `campaign-list-additions-${campaignId}-${creatorListId}`;
  const { data, refetch } = useQuery<
    CampaignCreatorListAdditionCandidatesData,
    CampaignCreatorListAdditionCandidatesVariables
  >(ADDITION_CANDIDATES, {
    variables: { input: { campaignId, creatorListId } },
  });
  const [approve] = useMutation<
    ApproveCampaignCreatorListAdditionsData,
    ApproveCampaignCreatorListAdditionsVariables
  >(APPROVE_ADDITIONS);
  const candidateIds =
    data?.campaignCreatorListAdditionCandidates.creatorIds ?? [];
  const { records: creators, loading: areCandidateLabelsLoading } =
    useFindManyRecords<ObjectRecord & { name?: string }>({
      limit: candidateIds.length,
      objectNameSingular: 'creator',
      filter: { id: { in: candidateIds } },
      recordGqlFields: { id: true, name: true },
      skip: candidateIds.length === 0,
    });
  const creatorNames = new Map(
    creators.map((record) => [record.id, record.name?.trim()]),
  );
  const candidates = candidateIds.map((id) => ({
    id,
    label: creatorNames.get(id) || 'Creator (unavailable)',
  }));

  const openReview = () => {
    setRefreshError(undefined);
    setSelectedCreatorIds(candidateIds);
    setReviewError(undefined);
    setIsReviewOpen(true);
    openModal(reviewModalInstanceId);
  };

  const closeReview = (force = false) => {
    if (isApproving && !force) {
      return;
    }

    closeModal(reviewModalInstanceId);
    setIsReviewOpen(false);
    setSelectedCreatorIds([]);
    setReviewError(undefined);
  };

  const submitApproval = async () => {
    if (selectedCreatorIds.length === 0 || isApproving) {
      return;
    }

    setIsApproving(true);
    setRefreshError(undefined);
    setReviewError(undefined);

    try {
      for (
        let batchStartIndex = 0;
        batchStartIndex < selectedCreatorIds.length;
        batchStartIndex += APPROVAL_BATCH_SIZE
      ) {
        await approve({
          variables: {
            input: {
              campaignId,
              creatorListId,
              creatorIds: selectedCreatorIds.slice(
                batchStartIndex,
                batchStartIndex + APPROVAL_BATCH_SIZE,
              ),
            },
          },
        });
      }
    } catch {
      const result = await refetch().catch(() => undefined);
      setSelectedCreatorIds(
        result?.data?.campaignCreatorListAdditionCandidates.creatorIds ?? [],
      );
      setReviewError('The additions changed. Review the current candidates.');
      setIsReviewOpen(true);
      openModal(reviewModalInstanceId);
      setIsApproving(false);
      return;
    }

    closeReview(true);
    try {
      await Promise.all([refetch(), onChanged()]);
    } catch {
      setRefreshError(
        'Approved additions were saved, but the view could not refresh.',
      );
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <span>{creatorListName}</span>
      {refreshError ? <p role="alert">{refreshError}</p> : null}
      {candidateIds.length > 0 ? (
        <Button
          disabled={areCandidateLabelsLoading}
          ariaLabel={`Review ${candidateIds.length} addition${candidateIds.length === 1 ? '' : 's'}`}
          onClick={openReview}
          title={`Review ${candidateIds.length} addition${candidateIds.length === 1 ? '' : 's'}`}
          type="button"
          variant="secondary"
        />
      ) : null}
      <Button
        ariaLabel="Remove Creator List"
        onClick={() => onDetach(creatorListId)}
        title="Remove Creator List"
        type="button"
        variant="secondary"
      />
      {isReviewOpen ? (
        <ModalStatefulWrapper
          isClosable
          modalInstanceId={reviewModalInstanceId}
          onClose={closeReview}
          shouldCloseModalOnClickOutsideOrEscape={!isApproving}
        >
          <h2>{`Review additions from ${creatorListName}`}</h2>
          <div aria-label="Creator List additions" role="group">
            {candidates.map(({ id, label }) => (
              <label key={id}>
                <Checkbox
                  aria-label={label}
                  checked={selectedCreatorIds.includes(id)}
                  onCheckedChange={(isSelected) =>
                    setSelectedCreatorIds((current) =>
                      isSelected
                        ? [...new Set([...current, id])]
                        : current.filter((creatorId) => creatorId !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          {reviewError ? <p role="alert">{reviewError}</p> : null}
          <Button
            ariaLabel="Approve selected additions"
            disabled={
              areCandidateLabelsLoading ||
              selectedCreatorIds.length === 0 ||
              isApproving
            }
            onClick={() => void submitApproval()}
            title="Approve selected additions"
            type="button"
            variant="primary"
          />
          <Button
            ariaLabel="Cancel additions review"
            onClick={() => closeReview()}
            title="Cancel additions review"
            type="button"
            variant="secondary"
          />
        </ModalStatefulWrapper>
      ) : null}
    </div>
  );
};

type MyahCampaignAudienceControlsProps = {
  campaignId: string;
  onAudienceChanged?: () => Promise<unknown>;
};

export const MyahCampaignAudienceControls = ({
  campaignId,
  onAudienceChanged,
}: MyahCampaignAudienceControlsProps) => {
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [detachingListId, setDetachingListId] = useState<string | null>(null);
  const { closeModal, openModal } = useModal();
  const pickerModalInstanceId = 'campaign-list-picker';
  const detachModalInstanceId = `campaign-list-detach-${campaignId}`;
  const { data, refetch } = useQuery<
    CampaignInfluencerSnapshotData,
    CampaignInfluencerSnapshotVariables
  >(SNAPSHOT, { variables: { input: { campaignId } } });
  const [attach] = useMutation(ATTACH);
  const [detach] = useMutation<
    DetachCampaignCreatorListData,
    DetachCampaignCreatorListVariables
  >(DETACH);
  const apolloCoreClient = useApolloCoreClient();
  const attachedLists =
    data?.campaignInfluencerSnapshot.campaignCreatorLists ?? [];
  const attachedListIds = attachedLists.map((list) => list.creatorListId);
  const { records: creatorLists } = useFindManyRecords<
    ObjectRecord & { name?: string }
  >({
    objectNameSingular: 'creatorList',
    filter: { id: { in: attachedListIds } },
    recordGqlFields: { id: true, name: true },
    skip: attachedListIds.length === 0,
  });
  const { refetch: refetchCampaignCreatorLists } =
    useFindManyRecords<ObjectRecord>({
      objectNameSingular: 'campaignCreatorList',
      filter: { campaignId: { eq: campaignId } },
      recordGqlFields: { id: true },
      skip: !campaignId,
    });
  const creatorListNames = new Map(
    creatorLists.map((record) => [record.id, record.name ?? 'Creator List']),
  );

  const refresh = async () => {
    await Promise.all([
      refetch(),
      refetchCampaignCreatorLists(),
      apolloCoreClient.refetchQueries({
        include: ['active', 'inactive', 'FindManyCampaignCreators'],
        updateCache: (cache) => {
          cache.evict({ fieldName: 'campaignCreators' });
        },
      }),
    ]);
    await onAudienceChanged?.();
  };

  const submitList = async () => {
    if (!selectedListId) {
      return;
    }

    await attach({
      variables: { input: { campaignId, creatorListIds: [selectedListId] } },
    });
    setSelectedListId(null);
    await refresh();
  };

  const openDetach = (creatorListId: string) => {
    setDetachingListId(creatorListId);
    openModal(detachModalInstanceId);
  };

  const closeDetach = () => {
    closeModal(detachModalInstanceId);
    setDetachingListId(null);
  };

  const submitDetach = async () => {
    if (!detachingListId) {
      return;
    }

    await detach({
      variables: { input: { campaignId, creatorListId: detachingListId } },
    });
    closeDetach();
    await refresh();
  };

  return (
    <>
      <Button
        ariaLabel="Attach Creator List"
        onClick={() => {
          setIsPickerOpen(true);
          openModal(pickerModalInstanceId);
        }}
        title="Attach Creator List"
        type="button"
        variant="secondary"
      />
      {attachedLists.map((list) => (
        <CreatorListAttachment
          campaignId={campaignId}
          creatorListId={list.creatorListId}
          creatorListName={
            creatorListNames.get(list.creatorListId) ?? 'Creator List'
          }
          key={list.id}
          onChanged={refresh}
          onDetach={openDetach}
        />
      ))}
      {isPickerOpen ? (
        <ModalStatefulWrapper
          isClosable
          modalInstanceId={pickerModalInstanceId}
          onClose={() => setIsPickerOpen(false)}
        >
          <SingleRecordPicker
            componentInstanceId={pickerModalInstanceId}
            focusId={pickerModalInstanceId}
            objectNameSingulars={['creatorList']}
            onCancel={() => setIsPickerOpen(false)}
            onMorphItemSelected={(item) => {
              setSelectedListId(item?.recordId ?? null);
              closeModal(pickerModalInstanceId);
              setIsPickerOpen(false);
            }}
            recordPickerInstanceId={pickerModalInstanceId}
          />
        </ModalStatefulWrapper>
      ) : null}
      {selectedListId ? (
        <Button
          ariaLabel="Attach selected Creator List"
          onClick={() => void submitList()}
          title="Attach selected Creator List"
          type="button"
          variant="primary"
        />
      ) : null}
      {detachingListId ? (
        <ModalStatefulWrapper
          isClosable
          modalInstanceId={detachModalInstanceId}
          onClose={closeDetach}
        >
          <h2>{`Detach ${creatorListNames.get(detachingListId) ?? 'Creator List'}?`}</h2>
          <p>
            This only detaches the List. Existing Campaign influencers remain
            unchanged.
          </p>
          <Button
            ariaLabel="Confirm Creator List detach"
            onClick={() => void submitDetach()}
            title="Confirm Creator List detach"
            type="button"
            variant="primary"
          />
          <Button
            ariaLabel="Cancel Creator List detach"
            onClick={closeDetach}
            title="Cancel Creator List detach"
            type="button"
            variant="secondary"
          />
        </ModalStatefulWrapper>
      ) : null}
    </>
  );
};
