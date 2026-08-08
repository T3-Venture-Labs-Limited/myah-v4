import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { SingleRecordPicker } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';

const ADD_MEMBER = gql`
  mutation AddCreatorListMemberIntent(
    $input: CreatorListMembershipIntentInput!
  ) {
    addCreatorListMemberIntent(input: $input) {
      id
      creatorListId
      creatorId
    }
  }
`;

const REMOVAL_IMPACT = gql`
  query CreatorListMembershipRemovalImpact(
    $input: CreatorListMembershipIntentInput!
  ) {
    creatorListMembershipRemovalImpact(input: $input) {
      affectedCampaignIds
      requiresConfirmation
      confirmationToken
    }
  }
`;

const REMOVE_MEMBER = gql`
  mutation RemoveCreatorListMemberIntent(
    $input: RemoveCreatorListMemberIntentInput!
  ) {
    removeCreatorListMemberIntent(input: $input)
  }
`;

type NamedRecord = ObjectRecord & {
  name?: string;
};

type CreatorListMemberRecord = ObjectRecord & {
  creatorId: string;
  creator?: NamedRecord;
};

type MembershipRemovalImpact = {
  affectedCampaignIds: string[];
  requiresConfirmation: boolean;
  confirmationToken?: string;
};

type MembershipRemovalImpactData = {
  creatorListMembershipRemovalImpact: MembershipRemovalImpact;
};

type MembershipRemovalImpactVariables = {
  input: {
    creatorListId: string;
    creatorId: string | null;
  };
};

export const MyahCreatorListMembers = ({
  creatorListId,
}: {
  creatorListId: string;
}) => {
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(
    null,
  );
  const [removingCreatorId, setRemovingCreatorId] = useState<string | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [reviewedImpact, setReviewedImpact] =
    useState<MembershipRemovalImpact | null>(null);
  const { openModal, closeModal } = useModal();
  const [addMember] = useMutation(ADD_MEMBER);
  const [removeMember] = useMutation(REMOVE_MEMBER);
  const {
    records: memberships,
    refetch: refetchMemberships,
    fetchMoreRecords: fetchMoreMemberships,
    hasNextPage: hasMoreMemberships,
  } = useFindManyRecords<CreatorListMemberRecord>({
    objectNameSingular: 'creatorListMember',
    filter: { creatorListId: { eq: creatorListId } },
    recordGqlFields: {
      id: true,
      creatorId: true,
      creator: { id: true, name: true },
    },
  });
  const creatorNames = new Map(
    memberships.map(({ creatorId, creator }) => [
      creatorId,
      creator?.name?.trim() || 'Creator',
    ]),
  );
  const { data: impactData, refetch: refetchImpact } = useQuery<
    MembershipRemovalImpactData,
    MembershipRemovalImpactVariables
  >(REMOVAL_IMPACT, {
    variables: {
      input: { creatorListId, creatorId: removingCreatorId },
    },
    skip: !removingCreatorId,
    fetchPolicy: 'network-only',
  });
  const removalImpact =
    reviewedImpact ?? impactData?.creatorListMembershipRemovalImpact;
  const affectedCampaignIds = removalImpact?.affectedCampaignIds ?? [];
  const { records: affectedCampaigns } = useFindManyRecords<NamedRecord>({
    objectNameSingular: 'campaign',
    filter: { id: { in: affectedCampaignIds } },
    recordGqlFields: { id: true, name: true },
    skip: affectedCampaignIds.length === 0,
  });
  const affectedCampaignNames = new Map(
    affectedCampaigns.map(({ id, name }) => [
      id,
      name?.trim() || 'Campaign (unavailable)',
    ]),
  );

  const selectCreatorForRemoval = (creatorId: string) => {
    setConfirmed(false);
    setReviewedImpact(null);
    setRemovingCreatorId(creatorId);
  };

  const submitAdd = async () => {
    if (!selectedCreatorId) return;
    await addMember({
      variables: {
        input: { creatorListId, creatorId: selectedCreatorId },
      },
    });
    setSelectedCreatorId(null);
    await refetchMemberships();
  };

  const submitRemoval = async () => {
    if (!removingCreatorId || !removalImpact) return;
    const latestImpact = (await refetchImpact()).data
      ?.creatorListMembershipRemovalImpact;
    if (!latestImpact) return;
    const displayedCampaignIds = [...removalImpact.affectedCampaignIds].sort();
    const latestCampaignIds = [...latestImpact.affectedCampaignIds].sort();
    if (
      latestImpact.confirmationToken !== removalImpact.confirmationToken ||
      JSON.stringify(latestCampaignIds) !== JSON.stringify(displayedCampaignIds)
    ) {
      setReviewedImpact(latestImpact);
      setConfirmed(false);
      return;
    }
    if (latestImpact.requiresConfirmation && !confirmed) return;
    await removeMember({
      variables: {
        input: {
          creatorListId,
          creatorId: removingCreatorId,
          confirmedCampaignIds: latestImpact.affectedCampaignIds,
          confirmationToken: latestImpact.confirmationToken,
        },
      },
    });
    setRemovingCreatorId(null);
    setConfirmed(false);
    setReviewedImpact(null);
    await refetchMemberships();
  };

  return (
    <section
      aria-label="Creator List members"
      style={{ display: 'grid', gap: 8, padding: '0 24px 24px' }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <strong>Members</strong>
        <Button
          title="Add Creator"
          ariaLabel="Add Creator"
          onClick={() => openModal('creator-list-member-picker')}
          type="button"
          variant="secondary"
        />
      </div>
      {memberships.length === 0 ? <span>No Creators</span> : null}
      {memberships.map(({ id, creatorId }) => (
        <div
          key={id}
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
          }}
        >
          <span>{creatorNames.get(creatorId) ?? 'Creator'}</span>
          <Button
            title="Remove Creator"
            ariaLabel="Remove Creator"
            onClick={() => selectCreatorForRemoval(creatorId)}
            type="button"
            variant="secondary"
          />
        </div>
      ))}
      {hasMoreMemberships ? (
        <Button
          title="Load more Creators"
          ariaLabel="Load more Creators"
          onClick={() => void fetchMoreMemberships()}
          type="button"
          variant="secondary"
        />
      ) : null}
      <ModalStatefulWrapper
        isClosable
        modalInstanceId="creator-list-member-picker"
        onClose={() => setSelectedCreatorId(null)}
      >
        <SingleRecordPicker
          focusId="creator-list-member-picker"
          componentInstanceId="creator-list-member-picker"
          objectNameSingulars={['creator']}
          recordPickerInstanceId="creator-list-member-picker"
          onCancel={() => setSelectedCreatorId(null)}
          onMorphItemSelected={(item) => {
            setSelectedCreatorId(item?.recordId ?? null);
            closeModal('creator-list-member-picker');
          }}
        />
      </ModalStatefulWrapper>
      {selectedCreatorId ? (
        <Button
          title="Add selected Creator"
          ariaLabel="Add selected Creator"
          onClick={() => void submitAdd()}
          type="button"
          variant="primary"
        />
      ) : null}
      {removingCreatorId && removalImpact ? (
        <div role="alertdialog" aria-label="Confirm Creator removal">
          <p>Remove {creatorNames.get(removingCreatorId) ?? 'Creator'}?</p>
          {affectedCampaignIds.length === 0 ? (
            <p>No Campaign loses this Creator as a list source.</p>
          ) : (
            <ul aria-label="Affected Campaigns">
              {affectedCampaignIds
                .map((id) => ({
                  id,
                  label:
                    affectedCampaignNames.get(id) || 'Campaign (unavailable)',
                }))
                .sort(
                  (first, second) =>
                    first.label.localeCompare(second.label) ||
                    first.id.localeCompare(second.id),
                )
                .map(({ id, label }) => (
                  <li key={id}>{label}</li>
                ))}
            </ul>
          )}
          {removalImpact.requiresConfirmation ? (
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirm removal from affected Campaigns
            </label>
          ) : null}
          <Button
            title="Confirm Creator removal"
            ariaLabel="Confirm Creator removal"
            onClick={() => void submitRemoval()}
            type="button"
            variant="primary"
          />
          <Button
            title="Cancel Creator removal"
            ariaLabel="Cancel Creator removal"
            onClick={() => {
              setRemovingCreatorId(null);
              setConfirmed(false);
              setReviewedImpact(null);
            }}
            type="button"
            variant="secondary"
          />
        </div>
      ) : null}
    </section>
  );
};
