import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { RecordDetailSectionContainer } from '@/object-record/record-field-list/record-detail-section/components/RecordDetailSectionContainer';
import { MultipleRecordPicker } from '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker';
import { useMultipleRecordPickerOpen } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerOpen';
import { useMultipleRecordPickerPerformSearch } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { multipleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchFilterComponentState';
import { multipleRecordPickerSearchableObjectMetadataItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchableObjectMetadataItemsComponentState';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { IconPlus, IconX } from 'twenty-ui/icon';
import { Button, Checkbox, LightIconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const APPROVAL_BATCH_SIZE = 500;

const StyledCreatorListAttachment = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding-left: ${themeCssVariables.spacing[3]};
  padding-right: ${themeCssVariables.spacing[2]};
`;

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
    <StyledCreatorListAttachment>
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
      <LightIconButton
        accent="tertiary"
        aria-label="Remove Creator List"
        Icon={IconX}
        onClick={() => onDetach(creatorListId)}
        title="Remove Creator List"
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
    </StyledCreatorListAttachment>
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
  const [attachError, setAttachError] = useState<string>();
  const [isAttachingList, setIsAttachingList] = useState(false);
  const [detachingListId, setDetachingListId] = useState<string | null>(null);
  const { closeModal, openModal } = useModal();
  const pickerInstanceId = `campaign-creator-lists-picker-${campaignId}`;
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
  const { objectMetadataItem: creatorListObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: 'creatorList',
    });
  const { closeDropdown } = useCloseDropdown();
  const setMultipleRecordPickerSearchFilter = useSetAtomComponentState(
    multipleRecordPickerSearchFilterComponentState,
    pickerInstanceId,
  );
  const setMultipleRecordPickerPickableMorphItems = useSetAtomComponentState(
    multipleRecordPickerPickableMorphItemsComponentState,
    pickerInstanceId,
  );
  const setMultipleRecordPickerSearchableObjectMetadataItems =
    useSetAtomComponentState(
      multipleRecordPickerSearchableObjectMetadataItemsComponentState,
      pickerInstanceId,
    );
  const { performSearch: multipleRecordPickerPerformSearch } =
    useMultipleRecordPickerPerformSearch();
  const { openMultipleRecordPicker } = useMultipleRecordPickerOpen();
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

  const openPicker = () => {
    const pickableMorphItems: RecordPickerPickableMorphItem[] =
      attachedListIds.map((recordId) => ({
        objectMetadataId: creatorListObjectMetadataItem.id,
        recordId,
        isSelected: true,
        isMatchingSearchFilter: true,
      }));

    setMultipleRecordPickerSearchableObjectMetadataItems([
      creatorListObjectMetadataItem,
    ]);
    setMultipleRecordPickerSearchFilter('');
    setMultipleRecordPickerPickableMorphItems(pickableMorphItems);
    openMultipleRecordPicker(pickerInstanceId);
    multipleRecordPickerPerformSearch({
      multipleRecordPickerInstanceId: pickerInstanceId,
      forceSearchFilter: '',
      forceSearchableObjectMetadataItems: [creatorListObjectMetadataItem],
      forcePickableMorphItems: pickableMorphItems,
    });
  };

  const closePicker = () => {
    closeDropdown(pickerInstanceId);
  };

  const handleCreatorListSelection = async (
    morphItem: RecordPickerPickableMorphItem,
  ) => {
    if (
      isAttachingList ||
      attachedListIds.includes(morphItem.recordId) === morphItem.isSelected
    ) {
      return;
    }

    if (!morphItem.isSelected) {
      closePicker();
      openDetach(morphItem.recordId);
      return;
    }

    setAttachError(undefined);
    setIsAttachingList(true);
    closePicker();

    try {
      await attach({
        variables: {
          input: { campaignId, creatorListIds: [morphItem.recordId] },
        },
      });
    } catch {
      setAttachError('Could not attach Creator List. Try again.');
      openPicker();
      setIsAttachingList(false);
      return;
    }

    try {
      await refresh();
    } catch {
      setAttachError(
        'Creator List was attached, but the view could not refresh.',
      );
    } finally {
      setIsAttachingList(false);
    }
  };

  return (
    <>
      <RecordDetailSectionContainer
        dataTestId="creator-lists-section"
        link={undefined}
        rightAdornment={
          <Dropdown
            disableClickForClickableComponent={isAttachingList}
            dropdownId={pickerInstanceId}
            dropdownPlacement="left-start"
            onClose={() => setMultipleRecordPickerSearchFilter('')}
            onOpen={openPicker}
            clickableComponent={
              <LightIconButton
                aria-label="Add Creator List"
                Icon={IconPlus}
                accent="tertiary"
                disabled={isAttachingList}
              />
            }
            dropdownComponents={
              <MultipleRecordPicker
                componentInstanceId={pickerInstanceId}
                focusId={pickerInstanceId}
                onChange={handleCreatorListSelection}
                onSubmit={closePicker}
                onClickOutside={closePicker}
              />
            }
          />
        }
        title="Creator Lists"
      >
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
        {attachError ? <p role="alert">{attachError}</p> : null}
      </RecordDetailSectionContainer>
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
