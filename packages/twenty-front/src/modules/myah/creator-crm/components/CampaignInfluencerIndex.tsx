import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useOpenFormMultiRecordPicker } from '@/object-record/record-field/ui/form-types/hooks/useOpenFormMultiRecordPicker';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { MultipleRecordPicker } from '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { multipleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchFilterComponentState';
import { getMultipleRecordPickerSelectableListId } from '@/object-record/record-picker/multiple-record-picker/utils/getMultipleRecordPickerSelectableListId';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useSelectableList } from '@/ui/layout/selectable-list/hooks/useSelectableList';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useCallback, useMemo, useState } from 'react';
import { AppPath, ViewFilterOperand } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const CAMPAIGN_INFLUENCERS_FILTER_ID = 'a03b0867-2a0d-49ee-afd3-8a91de66462e';
const CAMPAIGN_INFLUENCERS_VIEW_UNIVERSAL_IDENTIFIER =
  'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b';

const StyledScopeState = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  justify-content: center;
  min-height: ${themeCssVariables.spacing[12]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: center;
`;

type AddCampaignInfluencersButtonProps = {
  campaignId: string;
};

const AddCampaignInfluencersButton = ({
  campaignId,
}: AddCampaignInfluencersButtonProps) => {
  const { applyCreatorBulkRelationship } = useApplyCreatorBulkRelationship();
  const { openFormMultiRecordPicker } = useOpenFormMultiRecordPicker({
    objectNameSingular: 'creator',
  });
  const { closeModal, openModal } = useModal();
  const [isAdding, setIsAdding] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const modalInstanceId = `campaign-influencers-add-${campaignId}`;
  const pickerInstanceId = `campaign-influencers-picker-${campaignId}`;
  const pickerItems = useAtomComponentStateValue(
    multipleRecordPickerPickableMorphItemsComponentState,
    pickerInstanceId,
  );
  const setPickerItems = useSetAtomComponentState(
    multipleRecordPickerPickableMorphItemsComponentState,
    pickerInstanceId,
  );
  const setPickerSearchFilter = useSetAtomComponentState(
    multipleRecordPickerSearchFilterComponentState,
    pickerInstanceId,
  );
  const { resetSelectedItem } = useSelectableList(
    getMultipleRecordPickerSelectableListId(pickerInstanceId),
  );
  const selectedCreatorIds = useMemo(
    () =>
      pickerItems
        .filter(({ isSelected }) => isSelected)
        .map(({ recordId }) => recordId),
    [pickerItems],
  );

  const closeAndReset = useCallback(() => {
    resetSelectedItem();
    setPickerItems([]);
    setPickerSearchFilter('');
    closeModal(modalInstanceId);
    setIsOpen(false);
    setError(undefined);
  }, [
    closeModal,
    modalInstanceId,
    resetSelectedItem,
    setPickerItems,
    setPickerSearchFilter,
  ]);

  const handleOpen = useCallback(() => {
    setError(undefined);
    openFormMultiRecordPicker({
      pickerInstanceId,
      selectedRecordIds: [],
      selectedRecords: [],
    });
    setIsOpen(true);
    openModal(modalInstanceId);
  }, [modalInstanceId, openFormMultiRecordPicker, openModal, pickerInstanceId]);

  const handleClose = useCallback(() => {
    if (isAdding) {
      return;
    }

    closeAndReset();
  }, [closeAndReset, isAdding]);

  const handleAdd = useCallback(async () => {
    if (selectedCreatorIds.length === 0 || isAdding) {
      return;
    }

    setIsAdding(true);
    setError(undefined);

    try {
      await applyCreatorBulkRelationship({
        target: { kind: 'campaign', id: campaignId, label: 'Campaign' },
        creatorIdsToAdd: selectedCreatorIds,
      });
      closeAndReset();
    } catch {
      setError(t`Unable to add influencers.`);
    } finally {
      setIsAdding(false);
    }
  }, [
    applyCreatorBulkRelationship,
    campaignId,
    closeAndReset,
    isAdding,
    selectedCreatorIds,
  ]);

  return (
    <>
      <Button
        ariaLabel={t`Add Influencers`}
        onClick={handleOpen}
        title={t`Add Influencers`}
      />
      {isOpen ? (
        <ModalStatefulWrapper
          modalInstanceId={modalInstanceId}
          onClose={handleClose}
          isClosable
          shouldCloseModalOnClickOutsideOrEscape={!isAdding}
          padding="large"
          overlay="dark"
          dataGloballyPreventClickOutside
          narrowWidth
          autoHeight
        >
          <h2>{t`Add Influencers`}</h2>
          <MultipleRecordPicker
            componentInstanceId={pickerInstanceId}
            focusId={pickerInstanceId}
            onClickOutside={handleClose}
            onSubmit={handleClose}
            shouldResetStateOnClose={false}
          />
          {error ? <StyledScopeState>{error}</StyledScopeState> : null}
          <Button
            ariaLabel={t`Add selected influencers`}
            disabled={selectedCreatorIds.length === 0 || isAdding}
            onClick={() => void handleAdd()}
            title={t`Add selected influencers`}
          />
        </ModalStatefulWrapper>
      ) : null}
    </>
  );
};

type CampaignInfluencerIndexProps = {
  campaignId: string;
  viewId?: string;
};

export const CampaignInfluencerIndex = ({
  campaignId,
  viewId: campaignInfluencersViewId,
}: CampaignInfluencerIndexProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const campaignCreatorObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === 'campaignCreator',
  );
  const campaignCreatorPermissions = useObjectPermissionsForObject(
    campaignCreatorObjectMetadataItem?.id ?? '',
  );
  const views = useAtomStateValue(viewsSelector);
  const fallbackCampaignInfluencersViewId = views.find(
    (view) =>
      view.objectMetadataId === campaignCreatorObjectMetadataItem?.id &&
      view.universalIdentifier ===
        CAMPAIGN_INFLUENCERS_VIEW_UNIVERSAL_IDENTIFIER,
  )?.id;
  const resolvedCampaignInfluencersViewId =
    campaignInfluencersViewId ?? fallbackCampaignInfluencersViewId;
  const hasCampaignInfluencersView = views.some(
    (view) =>
      view.id === resolvedCampaignInfluencersViewId &&
      view.objectMetadataId === campaignCreatorObjectMetadataItem?.id,
  );
  const campaignFieldMetadataItem =
    campaignCreatorObjectMetadataItem?.fields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'campaign',
    );
  const campaignObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.id ===
      campaignFieldMetadataItem?.relation?.targetObjectMetadata.id,
  );
  const campaignPermissions = useObjectPermissionsForObject(
    campaignObjectMetadataItem?.id ?? '',
  );
  const campaignIdFieldMetadataItem = campaignObjectMetadataItem?.fields.find(
    (fieldMetadataItem) => fieldMetadataItem.name === 'id',
  );
  const [selectedCampaignView, setSelectedCampaignView] = useState<
    { campaignId: string; viewId: string } | undefined
  >();
  const selectedCampaignViewId =
    selectedCampaignView?.campaignId === campaignId
      ? selectedCampaignView.viewId
      : resolvedCampaignInfluencersViewId;
  const campaignFilter = useMemo<RecordFilter | undefined>(() => {
    if (!campaignFieldMetadataItem || !campaignIdFieldMetadataItem) {
      return undefined;
    }

    return {
      id: CAMPAIGN_INFLUENCERS_FILTER_ID,
      fieldMetadataId: campaignFieldMetadataItem.id,
      relationTargetFieldMetadataId: campaignIdFieldMetadataItem.id,
      type: 'RELATION',
      operand: ViewFilterOperand.IS,
      value: campaignId,
      displayValue: '',
      label: 'Campaign influencers',
      subFieldName: null,
    };
  }, [campaignFieldMetadataItem, campaignId, campaignIdFieldMetadataItem]);
  const campaignCreatorShowUrl = useCallback(
    (campaignCreatorId: string) =>
      getAppPath(
        AppPath.RecordShowPage,
        {
          objectNameSingular: 'campaignCreator',
          objectRecordId: campaignCreatorId,
        },
        { viewId: selectedCampaignViewId },
      ),
    [selectedCampaignViewId],
  );
  const handleCampaignViewChange = useCallback(
    (viewId: string) => {
      setSelectedCampaignView({ campaignId, viewId });
    },
    [campaignId],
  );

  if (
    !campaignCreatorObjectMetadataItem ||
    !campaignFilter ||
    !hasCampaignInfluencersView ||
    !selectedCampaignViewId
  ) {
    return (
      <StyledScopeState>{t`Campaign Influencers are unavailable.`}</StyledScopeState>
    );
  }

  if (!campaignCreatorPermissions.canReadObjectRecords) {
    return (
      <StyledScopeState>
        {t`You do not have permission to view Campaign Influencers.`}
      </StyledScopeState>
    );
  }

  return (
    <RecordIndexSurface
      key={campaignId}
      contextStoreInstanceId={`campaign-influencers-${campaignId}`}
      objectNameSingular="campaignCreator"
      viewId={selectedCampaignViewId}
      indexIdentifierUrl={campaignCreatorShowUrl}
      onViewChange={handleCampaignViewChange}
      initialQueryOnlyRecordFilters={[campaignFilter]}
      hideEmptyStateSubtitle
      embeddedSurfaceOptions={{
        hideAddNew: true,
        compactTable: true,
        hidePageHeader: true,
        hideQueryOnlyRecordFilters: true,
        hideViewPicker: true,
        hideCurrentRecordFilters: true,
        toolbarAction: campaignPermissions.canUpdateObjectRecords ? (
          <AddCampaignInfluencersButton campaignId={campaignId} />
        ) : undefined,
      }}
    />
  );
};
