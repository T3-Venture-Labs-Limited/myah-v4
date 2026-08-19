import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
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

const REMOVE_MEMBER = gql`
  mutation RemoveCreatorListMemberIntent(
    $input: CreatorListMembershipIntentInput!
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

  const selectCreatorForRemoval = (creatorId: string) => {
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
    if (!removingCreatorId) return;

    await removeMember({
      variables: {
        input: {
          creatorListId,
          creatorId: removingCreatorId,
        },
      },
    });
    setRemovingCreatorId(null);
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
      {removingCreatorId ? (
        <div role="alertdialog" aria-label="Confirm Creator removal">
          <p>Remove {creatorNames.get(removingCreatorId) ?? 'Creator'}?</p>
          <p>This only removes the Creator from this List.</p>
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
            onClick={() => setRemovingCreatorId(null)}
            type="button"
            variant="secondary"
          />
        </div>
      ) : null}
    </section>
  );
};
