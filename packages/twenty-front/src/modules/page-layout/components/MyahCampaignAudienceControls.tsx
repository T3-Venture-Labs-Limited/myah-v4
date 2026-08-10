import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useState } from 'react';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { SingleRecordPicker } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker';
import { Button } from 'twenty-ui/input';

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
const ADD_DIRECT = gql`
  mutation AddDirectCampaignCreators($input: AddDirectCampaignCreatorsInput!) {
    addDirectCampaignCreators(input: $input) {
      campaignCreators {
        id
        creatorId
      }
    }
  }
`;
const IMPACT = gql`
  query CampaignCreatorListRemovalImpact(
    $input: CampaignCreatorListRemovalImpactInput!
  ) {
    campaignCreatorListRemovalImpact(input: $input) {
      affectedCreatorIds
      requiresConfirmation
      confirmationToken
    }
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
  input: {
    campaignId: string;
  };
};

type CampaignCreatorListRemovalImpact = {
  affectedCreatorIds: string[];
  requiresConfirmation: boolean;
  confirmationToken: string;
};

type CampaignCreatorListRemovalImpactData = {
  campaignCreatorListRemovalImpact: CampaignCreatorListRemovalImpact;
};

type CampaignCreatorListRemovalImpactVariables = {
  input: {
    campaignId: string;
    creatorListId: string | null;
  };
};
export const MyahCampaignAudienceControls = ({
  campaignId,
  onAudienceChanged,
}: {
  campaignId: string;
  onAudienceChanged?: () => Promise<unknown>;
}) => {
  const [picker, setPicker] = useState<'list' | 'creator' | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(
    null,
  );
  const [removingListId, setRemovingListId] = useState<string | null>(null);
  const { openModal, closeModal } = useModal();
  const [confirmed, setConfirmed] = useState(false);
  const [reviewedRemovalImpact, setReviewedRemovalImpact] =
    useState<CampaignCreatorListRemovalImpact | null>(null);
  const { data, refetch } = useQuery<
    CampaignInfluencerSnapshotData,
    CampaignInfluencerSnapshotVariables
  >(SNAPSHOT, {
    variables: { input: { campaignId } },
  });
  const [attach] = useMutation(ATTACH);
  const [addDirect] = useMutation(ADD_DIRECT);
  const [detach] = useMutation(DETACH);
  const { data: impact, refetch: refetchImpact } = useQuery<
    CampaignCreatorListRemovalImpactData,
    CampaignCreatorListRemovalImpactVariables
  >(IMPACT, {
    variables: { input: { campaignId, creatorListId: removingListId } },
    skip: !removingListId,
    fetchPolicy: 'network-only',
  });
  const attachedListIds = (
    data?.campaignInfluencerSnapshot?.campaignCreatorLists ?? []
  ).map((list: { creatorListId: string }) => list.creatorListId);
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
  const attachedLists =
    data?.campaignInfluencerSnapshot?.campaignCreatorLists ?? [];
  const removalImpact =
    reviewedRemovalImpact ?? impact?.campaignCreatorListRemovalImpact;
  const affectedCreatorIds = removalImpact?.affectedCreatorIds ?? [];
  const { records: affectedCreators } = useFindManyRecords<
    ObjectRecord & { name?: string }
  >({
    objectNameSingular: 'creator',
    filter: { id: { in: affectedCreatorIds } },
    recordGqlFields: { id: true, name: true },
    skip: affectedCreatorIds.length === 0,
  });
  const affectedCreatorNames = new Map(
    affectedCreators.map((record) => [record.id, record.name?.trim()]),
  );
  const affectedCreatorLabels = affectedCreatorIds
    .map((id) => ({
      id,
      label: affectedCreatorNames.get(id) || 'Creator (unavailable)',
    }))
    .sort(
      (first, second) =>
        first.label.localeCompare(second.label) ||
        first.id.localeCompare(second.id),
    );
  const refresh = async () => {
    await Promise.all([refetch(), refetchCampaignCreatorLists()]);
    await onAudienceChanged?.();
  };
  const selectListForRemoval = (creatorListId: string) => {
    setConfirmed(false);
    setReviewedRemovalImpact(null);
    setRemovingListId(creatorListId);
  };
  const submitList = async () => {
    if (!selectedListId) return;
    await attach({
      variables: { input: { campaignId, creatorListIds: [selectedListId] } },
    });
    setSelectedListId(null);
    await refresh();
  };
  const submitCreator = async () => {
    if (!selectedCreatorId) return;
    await addDirect({
      variables: { input: { campaignId, creatorIds: [selectedCreatorId] } },
    });
    setSelectedCreatorId(null);
    await refresh();
  };
  const submitDetach = async () => {
    if (!removingListId || !removalImpact) return;
    const latestImpact = (await refetchImpact()).data
      ?.campaignCreatorListRemovalImpact;
    if (!latestImpact) return;
    const displayedIds = [...removalImpact.affectedCreatorIds].sort();
    const latestIds = [...latestImpact.affectedCreatorIds].sort();
    if (
      latestImpact.confirmationToken !== removalImpact.confirmationToken ||
      JSON.stringify(latestIds) !== JSON.stringify(displayedIds)
    ) {
      setReviewedRemovalImpact(latestImpact);
      setConfirmed(false);
      return;
    }
    if (latestImpact.requiresConfirmation && !confirmed) return;
    await detach({
      variables: {
        input: {
          campaignId,
          creatorListId: removingListId,
          confirmedCreatorIds: latestImpact.affectedCreatorIds,
          confirmationToken: latestImpact.confirmationToken,
        },
      },
    });
    setRemovingListId(null);
    setConfirmed(false);
    setReviewedRemovalImpact(null);
    await refresh();
  };
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          title="Attach Creator List"
          ariaLabel="Attach Creator List"
          onClick={() => {
            setPicker('list');
            openModal('campaign-list-picker');
          }}
          type="button"
          variant="secondary"
        />
        <Button
          title="Add Direct Creator"
          ariaLabel="Add Direct Creator"
          onClick={() => {
            setPicker('creator');
            openModal('campaign-creator-picker');
          }}
          type="button"
          variant="secondary"
        />
      </div>
      {attachedLists.map((list: { id: string; creatorListId: string }) => (
        <div
          key={list.id}
          style={{
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span>
            {creatorListNames.get(list.creatorListId) ?? 'Creator List'}
          </span>
          <Button
            title="Remove Creator List"
            ariaLabel="Remove Creator List"
            onClick={() => selectListForRemoval(list.creatorListId)}
            type="button"
            variant="secondary"
          />
        </div>
      ))}
      {picker && (
        <ModalStatefulWrapper
          isClosable
          modalInstanceId={`campaign-${picker}-picker`}
          onClose={() => setPicker(null)}
        >
          <SingleRecordPicker
            focusId={`campaign-${picker}-picker`}
            componentInstanceId={`campaign-${picker}-picker`}
            objectNameSingulars={[
              picker === 'list' ? 'creatorList' : 'creator',
            ]}
            recordPickerInstanceId={`campaign-${picker}-picker`}
            onCancel={() => setPicker(null)}
            onMorphItemSelected={(item) => {
              if (picker === 'list') setSelectedListId(item?.recordId ?? null);
              else setSelectedCreatorId(item?.recordId ?? null);
              closeModal(`campaign-${picker}-picker`);
              setPicker(null);
            }}
          />
        </ModalStatefulWrapper>
      )}
      {removingListId && removalImpact && (
        <div role="alertdialog" aria-label="Confirm Creator List removal">
          <p>
            Remove {creatorListNames.get(removingListId) ?? 'Creator List'}?
          </p>
          <p>
            {removalImpact.affectedCreatorIds.length === 0
              ? 'No creators lose their final source.'
              : `${removalImpact.affectedCreatorIds.length} creator${removalImpact.affectedCreatorIds.length === 1 ? '' : 's'} lose their final source.`}
          </p>
          {affectedCreatorLabels.length > 0 && (
            <ul aria-label="Affected Creators">
              {affectedCreatorLabels.map(({ id, label }) => (
                <li key={id}>{label}</li>
              ))}
            </ul>
          )}
          {removalImpact.requiresConfirmation && (
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirm removal of final-source creators
            </label>
          )}
          <Button
            title="Confirm Creator List removal"
            ariaLabel="Confirm Creator List removal"
            onClick={() => void submitDetach()}
            type="button"
            variant="primary"
          />
          <Button
            title="Cancel Creator List removal"
            ariaLabel="Cancel Creator List removal"
            onClick={() => {
              setRemovingListId(null);
              setConfirmed(false);
              setReviewedRemovalImpact(null);
            }}
            type="button"
            variant="secondary"
          />
        </div>
      )}
      {selectedListId && (
        <Button
          title="Attach selected Creator List"
          ariaLabel="Attach selected Creator List"
          onClick={() => void submitList()}
          type="button"
          variant="primary"
        />
      )}
      {selectedCreatorId && (
        <Button
          title="Add selected Direct Creator"
          ariaLabel="Add selected Direct Creator"
          onClick={() => void submitCreator()}
          type="button"
          variant="primary"
        />
      )}
    </>
  );
};
