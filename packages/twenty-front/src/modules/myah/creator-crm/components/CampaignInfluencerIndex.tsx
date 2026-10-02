import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { CampaignInfluencerReferenceList } from '@/myah/creator-crm/components/CampaignInfluencerReferenceList';
import { MyahCampaignAudienceControls } from '@/page-layout/components/MyahCampaignAudienceControls';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useOpenFormMultiRecordPicker } from '@/object-record/record-field/ui/form-types/hooks/useOpenFormMultiRecordPicker';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { RecordFilterValueDependenciesContext } from '@/object-record/record-filter/contexts/RecordFilterValueDependenciesContext';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { MultipleRecordPicker } from '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { multipleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerSearchFilterComponentState';
import { getMultipleRecordPickerSelectableListId } from '@/object-record/record-picker/multiple-record-picker/utils/getMultipleRecordPickerSelectableListId';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { StyledHeaderDropdownButton } from '@/ui/layout/dropdown/components/StyledHeaderDropdownButton';
import { useSelectableList } from '@/ui/layout/selectable-list/hooks/useSelectableList';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppPath, ViewFilterOperand, ViewType } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const CAMPAIGN_INFLUENCERS_FILTER_ID = 'a03b0867-2a0d-49ee-afd3-8a91de66462e';
const CAMPAIGN_INFLUENCERS_VIEW_UNIVERSAL_IDENTIFIER =
  'b37e3e8f-2cc5-493b-9ef4-1c37d3066e6b';

const StyledAudienceIntro = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]};

  strong {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledPresentationControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  > button {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    cursor: pointer;
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledModeSelector = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};

  button {
    background: none;
    border: 0;
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    padding: ${themeCssVariables.spacing[2]};
  }
  button[aria-pressed='true'] {
    background: ${themeCssVariables.color.pink3};
    color: ${themeCssVariables.font.color.primary};
  }
  button:focus-visible {
    outline: 2px solid ${themeCssVariables.color.pink};
  }
`;

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
  const store = useStore();
  const addInfluencersButtonRef = useRef<HTMLButtonElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Async completion must not close a newer visit to the same campaign.
  const isCurrent = useRef(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const modalInstanceId = `campaign-influencers-add-${campaignId}`;
  const pickerInstanceId = `campaign-influencers-picker-${campaignId}`;
  const multipleRecordPickerPickableMorphItems = useAtomComponentStateValue(
    multipleRecordPickerPickableMorphItemsComponentState,
    pickerInstanceId,
  );
  const setMultipleRecordPickerPickableMorphItems = useSetAtomComponentState(
    multipleRecordPickerPickableMorphItemsComponentState,
    pickerInstanceId,
  );
  const setMultipleRecordPickerSearchFilter = useSetAtomComponentState(
    multipleRecordPickerSearchFilterComponentState,
    pickerInstanceId,
  );
  const { resetSelectedItem } = useSelectableList(
    getMultipleRecordPickerSelectableListId(pickerInstanceId),
  );
  useEffect(() => {
    isCurrent.current = true;
    return () => {
      isCurrent.current = false;
      if (
        store.get(
          isModalOpenedComponentState.atomFamily({
            instanceId: modalInstanceId,
          }),
        )
      ) {
        resetSelectedItem();
        setMultipleRecordPickerPickableMorphItems([]);
        setMultipleRecordPickerSearchFilter('');
        closeModal(modalInstanceId);
      }
    };
  }, [
    closeModal,
    modalInstanceId,
    resetSelectedItem,
    setMultipleRecordPickerPickableMorphItems,
    setMultipleRecordPickerSearchFilter,
    store,
  ]);
  const selectedCreatorIds = useMemo(
    () =>
      multipleRecordPickerPickableMorphItems
        .filter(({ isSelected }) => isSelected)
        .map(({ recordId }) => recordId),
    [multipleRecordPickerPickableMorphItems],
  );
  const preview = useCreatorBulkRelationshipPreview({
    target: { kind: 'campaign', id: campaignId, label: 'Campaign' },
    selectedCreatorIds,
  });
  const canAdd =
    selectedCreatorIds.length > 0 &&
    !isAdding &&
    !preview.loading &&
    !preview.isPreviewUnavailable &&
    preview.unlinkedCreatorIds.length > 0;

  const closeAndReset = useCallback(() => {
    resetSelectedItem();
    setMultipleRecordPickerPickableMorphItems([]);
    setMultipleRecordPickerSearchFilter('');
    closeModal(modalInstanceId);
    setIsOpen(false);
    setError(undefined);
  }, [
    closeModal,
    modalInstanceId,
    resetSelectedItem,
    setMultipleRecordPickerPickableMorphItems,
    setMultipleRecordPickerSearchFilter,
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
    if (!canAdd) {
      return;
    }

    setIsAdding(true);
    setError(undefined);

    try {
      await applyCreatorBulkRelationship({
        target: { kind: 'campaign', id: campaignId, label: 'Campaign' },
        creatorIdsToAdd: preview.unlinkedCreatorIds,
      });
      if (isCurrent.current) closeAndReset();
    } catch {
      if (isCurrent.current) setError(t`Unable to add influencers.`);
    } finally {
      if (isCurrent.current) setIsAdding(false);
    }
  }, [
    applyCreatorBulkRelationship,
    campaignId,
    closeAndReset,
    canAdd,
    preview.unlinkedCreatorIds,
  ]);

  return (
    <>
      <StyledHeaderDropdownButton
        ref={addInfluencersButtonRef}
        onClick={handleOpen}
      >
        {t`Add Influencers`}
      </StyledHeaderDropdownButton>
      {isOpen ? (
        <ModalStatefulWrapper
          modalInstanceId={modalInstanceId}
          modal
          ariaLabel={t`Add Influencers`}
          finalFocus={() => addInfluencersButtonRef.current ?? false}
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
          <p>
            Choose individual creators. Selecting an existing list-sourced
            member marks them as directly added, so they remain after the list
            is detached. This does not send outreach.
          </p>
          <MultipleRecordPicker
            componentInstanceId={pickerInstanceId}
            focusId={pickerInstanceId}
            onClickOutside={handleClose}
            onSubmit={handleClose}
            shouldResetStateOnClose={false}
          />
          {selectedCreatorIds.length > 0 ? (
            <StyledScopeState role="status" aria-label="Membership review">
              {preview.isPreviewUnavailable
                ? t`Unable to verify existing memberships.`
                : preview.loading
                  ? t`Checking existing memberships…`
                  : preview.unlinkedCreatorIds.length > 0
                    ? t`${preview.linkedCreatorIds.length} already directly added · ${preview.unlinkedCreatorIds.length} will be directly added`
                    : t`${preview.linkedCreatorIds.length} already directly added · No changes will be made.`}
            </StyledScopeState>
          ) : null}
          {preview.canRetry ? (
            <Button
              ariaLabel={t`Retry preview`}
              disabled={preview.isRetrying || isAdding}
              onClick={() => void preview.retryPreview()}
              title={t`Retry preview`}
              variant="secondary"
            />
          ) : null}
          {error ? <StyledScopeState>{error}</StyledScopeState> : null}
          <Button
            ariaLabel={t`Cancel addition`}
            disabled={isAdding}
            onClick={handleClose}
            title={t`Cancel`}
            variant="secondary"
          />
          <Button
            ariaLabel={t`Add selected influencers`}
            disabled={!canAdd}
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
  viewId: string | null;
  activityTabId?: string;
  onOpenCreatorContext?: (request: RecordIndexOpenRequest) => void;
};

export const CampaignInfluencerIndex = ({
  campaignId,
  viewId: campaignInfluencersViewId,
  activityTabId,
  onOpenCreatorContext,
}: CampaignInfluencerIndexProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const campaignCreatorObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === 'campaignCreator',
  );
  const views = useAtomStateValue(viewsSelector);
  const campaignInfluencersRuntimeView = views.find(
    (view) =>
      view.universalIdentifier ===
        CAMPAIGN_INFLUENCERS_VIEW_UNIVERSAL_IDENTIFIER &&
      view.objectMetadataId === campaignCreatorObjectMetadataItem?.id &&
      view.type === ViewType.TABLE_WIDGET &&
      view.isActive,
  );
  const campaignCreatorPermissions = useObjectPermissionsForObject(
    campaignCreatorObjectMetadataItem?.id ?? '',
  );
  const campaignFieldMetadataItem =
    campaignCreatorObjectMetadataItem?.fields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'campaign',
    );
  const campaignObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === 'campaign' &&
      (!campaignFieldMetadataItem ||
        campaignFieldMetadataItem.relation?.targetObjectMetadata.id ===
          objectMetadataItem.id),
  );
  const campaignPermissions = useObjectPermissionsForObject(
    campaignObjectMetadataItem?.id ?? '',
  );
  const creatorListMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'creatorList',
  );
  const creatorListPermissions = useObjectPermissionsForObject(
    creatorListMetadata?.id ?? '',
  );
  const campaignIdFieldMetadataItem = campaignObjectMetadataItem?.fields.find(
    (fieldMetadataItem) => fieldMetadataItem.name === 'id',
  );
  const [selectedAudienceMode, setSelectedAudienceMode] = useState<{
    campaignId: string;
    mode: 'reference' | 'advanced';
  }>();
  const audienceMode =
    selectedAudienceMode?.campaignId === campaignId
      ? selectedAudienceMode.mode
      : 'reference';
  const [advancedVisitedCampaignId, setAdvancedVisitedCampaignId] =
    useState<string>();
  const creatorMetadataItem = objectMetadataItems.find(
    (item) => item.nameSingular === 'creator',
  );
  const [selectedCampaignView, setSelectedCampaignView] = useState<
    { campaignId: string; viewId: string } | undefined
  >();
  const selectedCampaignViewId =
    selectedCampaignView?.campaignId === campaignId
      ? selectedCampaignView.viewId
      : (campaignInfluencersViewId ?? campaignInfluencersRuntimeView?.id);
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
        { viewId: selectedCampaignViewId ?? undefined },
      ),
    [selectedCampaignViewId],
  );
  const handleCampaignViewChange = useCallback(
    (viewId: string) => {
      setSelectedCampaignView({ campaignId, viewId });
    },
    [campaignId],
  );

  const hasReadableCampaignCreator =
    campaignCreatorObjectMetadataItem !== undefined &&
    campaignCreatorPermissions.canReadObjectRecords;
  const hasReadableCampaign =
    campaignObjectMetadataItem !== undefined &&
    campaignPermissions.canReadObjectRecords;
  const canAddDirect =
    hasReadableCampaignCreator &&
    hasReadableCampaign &&
    campaignPermissions.canUpdateObjectRecords;
  const canReadAudienceSources =
    hasReadableCampaignCreator &&
    hasReadableCampaign &&
    creatorListMetadata !== undefined &&
    creatorListPermissions.canReadObjectRecords;
  const tableState =
    (campaignObjectMetadataItem && !hasReadableCampaign) ||
    (!hasReadableCampaignCreator && campaignCreatorObjectMetadataItem)
      ? t`You do not have permission to view Campaign Influencers.`
      : !selectedCampaignViewId || !campaignFieldMetadataItem || !campaignFilter
        ? t`Campaign Influencers are unavailable.`
        : undefined;

  return (
    <RecordFilterValueDependenciesContext.Provider
      value={{
        currentRecord: {
          id: campaignId,
          objectMetadataNameSingular: 'campaign',
        },
      }}
    >
      <StyledAudienceIntro>
        <span>
          <strong>Influencers</strong> · Campaign memberships
        </span>
        <span>Recorded stage is not outreach or delivery evidence.</span>
        {hasReadableCampaign && activityTabId ? (
          <Link
            to={`${getAppPath(AppPath.RecordShowPage, {
              objectNameSingular: 'campaign',
              objectRecordId: campaignId,
            })}#${activityTabId}`}
          >
            {t`View Creator activity`}
          </Link>
        ) : null}
      </StyledAudienceIntro>
      {canReadAudienceSources ? (
        <MyahCampaignAudienceControls
          key={`campaign-lists-${campaignId}`}
          campaignId={campaignId}
          canManage={canAddDirect}
          canAttach={
            canAddDirect && creatorListPermissions.canUpdateObjectRecords
          }
        />
      ) : null}
      {tableState ||
      !selectedCampaignViewId ||
      !campaignFieldMetadataItem ||
      !campaignFilter ? (
        <StyledScopeState>{tableState}</StyledScopeState>
      ) : (
        <>
          <StyledPresentationControls>
            <StyledModeSelector role="group" aria-label="Audience presentation">
              <button
                type="button"
                aria-pressed={audienceMode === 'reference'}
                onClick={() =>
                  setSelectedAudienceMode({ campaignId, mode: 'reference' })
                }
              >
                Reference list
              </button>
              <button
                type="button"
                aria-pressed={audienceMode === 'advanced'}
                onClick={() => {
                  setAdvancedVisitedCampaignId(campaignId);
                  setSelectedAudienceMode({ campaignId, mode: 'advanced' });
                }}
              >
                Advanced table
              </button>
            </StyledModeSelector>
            {audienceMode === 'reference' && canAddDirect ? (
              <AddCampaignInfluencersButton campaignId={campaignId} />
            ) : null}
          </StyledPresentationControls>
          <div hidden={audienceMode !== 'reference'}>
            <CampaignInfluencerReferenceList
              key={`campaign-reference-${campaignId}`}
              campaignId={campaignId}
              campaignCreatorMetadataId={campaignCreatorObjectMetadataItem!.id}
              creatorMetadataId={creatorMetadataItem?.id}
              creatorFieldIds={{
                name: creatorMetadataItem?.fields.find(
                  (field) => field.name === 'name',
                )?.id,
                instagramUsername: creatorMetadataItem?.fields.find(
                  (field) => field.name === 'instagramUsername',
                )?.id,
              }}
              stageOptions={
                campaignCreatorObjectMetadataItem?.fields.find(
                  (field) => field.name === 'stage',
                )?.options ?? []
              }
              onOpenCreatorContext={onOpenCreatorContext}
            />
          </div>
          {(audienceMode === 'advanced' ||
            advancedVisitedCampaignId === campaignId) && (
            <div
              hidden={audienceMode !== 'advanced'}
              style={{
                display: audienceMode === 'advanced' ? 'flex' : 'none',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <RecordIndexSurface
                key={`campaign-table-${campaignId}`}
                contextStoreInstanceId={`campaign-influencers-${campaignId}`}
                objectNameSingular="campaignCreator"
                viewId={selectedCampaignViewId}
                indexIdentifierUrl={campaignCreatorShowUrl}
                onOpenRecordFromIndexView={onOpenCreatorContext}
                openFirstColumnRelationInIndex={!!onOpenCreatorContext}
                onViewChange={handleCampaignViewChange}
                initialQueryOnlyRecordFilters={[campaignFilter]}
                hideEmptyStateSubtitle
                embeddedSurfaceOptions={{
                  hideAddNew: true,
                  compactTable: true,
                  showInitialReadError: true,
                  hidePageHeader: true,
                  showInformationBanner: false,
                  hideQueryOnlyRecordFilters: true,
                  hideViewPicker: true,
                  hideCurrentRecordFilter: {
                    fieldMetadataId: campaignFieldMetadataItem.id,
                    relationTargetFieldMetadataId: null,
                    operand: ViewFilterOperand.IS,
                  },
                  toolbarAction: canAddDirect ? (
                    <AddCampaignInfluencersButton campaignId={campaignId} />
                  ) : undefined,
                }}
              />
            </div>
          )}
        </>
      )}
    </RecordFilterValueDependenciesContext.Provider>
  );
};
