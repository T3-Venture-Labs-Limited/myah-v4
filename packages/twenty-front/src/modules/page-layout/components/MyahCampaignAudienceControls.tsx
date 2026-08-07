import { gql, useMutation, useQuery } from '@apollo/client';
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
      campaignCreatorLists { id creatorListId }
    }
  }
`;
const ATTACH = gql`
  mutation AttachCampaignCreatorLists($input: AttachCampaignCreatorListsInput!) {
    attachCampaignCreatorLists(input: $input) { campaignCreatorLists { id creatorListId } }
  }
`;
const ADD_DIRECT = gql`
  mutation AddDirectCampaignCreators($input: AddDirectCampaignCreatorsInput!) {
    addDirectCampaignCreators(input: $input) { campaignCreators { id creatorId } }
  }
`;
const IMPACT = gql`
  query CampaignCreatorListRemovalImpact($input: CampaignCreatorListRemovalImpactInput!) {
    campaignCreatorListRemovalImpact(input: $input) {
      affectedCreatorIds requiresConfirmation confirmationToken
    }
  }
`;
const DETACH = gql`
  mutation DetachCampaignCreatorList($input: DetachCampaignCreatorListInput!) {
    detachCampaignCreatorList(input: $input) { campaignCreatorLists { id creatorListId } }
  }
`;

export const MyahCampaignAudienceControls = ({ campaignId }: { campaignId: string }) => {
  const [picker, setPicker] = useState<'list' | 'creator' | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [removingListId, setRemovingListId] = useState<string | null>(null);
  const { openModal, closeModal } = useModal();
  const [confirmed, setConfirmed] = useState(false);
  const { data, refetch } = useQuery(SNAPSHOT, { variables: { input: { campaignId } } });
  const [attach] = useMutation(ATTACH);
  const [addDirect] = useMutation(ADD_DIRECT);
  const [detach] = useMutation(DETACH);
  const { data: impact } = useQuery(IMPACT, {
    variables: { input: { campaignId, creatorListId: removingListId } },
    skip: !removingListId,
  });
  const attachedListIds = (data?.campaignInfluencerSnapshot?.campaignCreatorLists ?? [])
    .map((list: { creatorListId: string }) => list.creatorListId);
  const { records: creatorLists } = useFindManyRecords<ObjectRecord & { name?: string }>({
    objectNameSingular: 'creatorList',
    filter: { id: { in: attachedListIds } },
    recordGqlFields: { id: true, name: true },
    skip: attachedListIds.length === 0,
  });
  const creatorListNames = new Map(
    creatorLists.map((record) => [record.id, record.name ?? 'Creator List']),
  );
  const attachedLists = data?.campaignInfluencerSnapshot?.campaignCreatorLists ?? [];
  const removalImpact = impact?.campaignCreatorListRemovalImpact;
  const refresh = async () => { await refetch(); };
  const submitList = async () => {
    if (!selectedListId) return;
    await attach({ variables: { input: { campaignId, creatorListIds: [selectedListId] } } });
    setSelectedListId(null); await refresh();
  };
  const submitCreator = async () => {
    if (!selectedCreatorId) return;
    await addDirect({ variables: { input: { campaignId, creatorIds: [selectedCreatorId] } } });
    setSelectedCreatorId(null); await refresh();
  };
  const submitDetach = async () => {
    if (!removingListId || !removalImpact || (removalImpact.requiresConfirmation && !confirmed)) return;
    await detach({ variables: { input: { campaignId, creatorListId: removingListId, confirmedCreatorIds: removalImpact.affectedCreatorIds, confirmationToken: removalImpact.confirmationToken } } });
    setRemovingListId(null); setConfirmed(false); await refresh();
  };
  return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button title="Attach Creator List" ariaLabel="Attach Creator List" onClick={() => { setPicker('list'); openModal('campaign-list-picker'); }} type="button" variant="secondary" />
        <Button title="Add Direct Creator" ariaLabel="Add Direct Creator" onClick={() => { setPicker('creator'); openModal('campaign-creator-picker'); }} type="button" variant="secondary" />
      </div>
      {attachedLists.map((list: { id: string; creatorListId: string }) => (
        <div key={list.id} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span>{creatorListNames.get(list.creatorListId) ?? 'Creator List'}</span>
          <Button title="Remove Creator List" ariaLabel="Remove Creator List" onClick={() => setRemovingListId(list.creatorListId)} type="button" variant="secondary" />
        </div>
      ))}
      {picker && (
        <ModalStatefulWrapper modalInstanceId={`campaign-${picker}-picker`} onClose={() => setPicker(null)}>
          <SingleRecordPicker
            focusId={`campaign-${picker}-picker`}
            componentInstanceId={`campaign-${picker}-picker`}
            objectNameSingulars={[picker === 'list' ? 'creatorList' : 'creator']}
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
          <p>{removalImpact.affectedCreatorIds.length} creators lose their final source.</p>
          {removalImpact.requiresConfirmation && <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirm removal</label>}
          <Button title="Confirm Creator List removal" ariaLabel="Confirm Creator List removal" onClick={() => void submitDetach()} type="button" variant="primary" />
          <Button title="Cancel Creator List removal" ariaLabel="Cancel Creator List removal" onClick={() => { setRemovingListId(null); setConfirmed(false); }} type="button" variant="secondary" />
        </div>
      )}
      {selectedListId && <Button title="Attach selected Creator List" ariaLabel="Attach selected Creator List" onClick={() => void submitList()} type="button" variant="primary" />}
      {selectedCreatorId && <Button title="Add selected Direct Creator" ariaLabel="Add selected Direct Creator" onClick={() => void submitCreator()} type="button" variant="primary" />}
    </div>
  );
};
