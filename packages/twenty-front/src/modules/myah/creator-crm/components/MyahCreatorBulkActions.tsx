import {
  CreatorBulkRelationshipDialog,
  getCreatorBulkRelationshipDialogId,
} from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';
import {
  CreatorBulkRelationshipTargetPickerDialog,
  CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID,
} from '@/myah/creator-crm/components/CreatorBulkRelationshipTargetPickerDialog';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreTargetedRecordsRuleComponentState } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { MenuItem } from 'twenty-ui/navigation';

const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const CREATOR_BULK_RELATIONSHIP_DROPDOWN_ID =
  'creator-bulk-relationship-dropdown';

export const MyahCreatorBulkActions = () => {
  const { objectNamePlural } = useRecordIndexContextOrThrow();
  const { findObjectMetadataItemByNamePlural } =
    useFilteredObjectMetadataItems();
  const objectMetadataItem =
    findObjectMetadataItemByNamePlural(objectNamePlural);
  const targetedRecordsRule = useAtomComponentStateValue(
    contextStoreTargetedRecordsRuleComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const setTargetedRecordsRule = useSetAtomComponentState(
    contextStoreTargetedRecordsRuleComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const { openModal } = useModal();
  const [targetKind, setTargetKind] =
    useState<CreatorBulkRelationshipTarget['kind']>();
  const [target, setTarget] = useState<CreatorBulkRelationshipTarget>();

  const selectedCreatorIds =
    targetedRecordsRule.mode === 'selection'
      ? targetedRecordsRule.selectedRecordIds
      : [];

  useEffect(() => {
    if (target) {
      openModal(getCreatorBulkRelationshipDialogId(target));
    }
  }, [openModal, target]);

  if (
    objectMetadataItem?.universalIdentifier !==
      CREATOR_OBJECT_UNIVERSAL_IDENTIFIER ||
    selectedCreatorIds.length === 0
  ) {
    return null;
  }

  const clearTarget = () => {
    setTarget(undefined);
    setTargetKind(undefined);
  };

  const openTargetPicker = (kind: CreatorBulkRelationshipTarget['kind']) => {
    setTarget(undefined);
    setTargetKind(kind);
    openModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  };

  const handleTargetSelected = (
    selectedTarget: CreatorBulkRelationshipTarget,
  ) => {
    setTarget(selectedTarget);
    setTargetKind(undefined);
  };

  const clearSelectionAfterSuccess = () => {
    setTargetedRecordsRule({ mode: 'selection', selectedRecordIds: [] });
    clearTarget();
  };

  return (
    <>
      <Dropdown
        dropdownId={CREATOR_BULK_RELATIONSHIP_DROPDOWN_ID}
        clickableComponent={<Button title={t`Add to`} variant="secondary" />}
        dropdownComponents={
          <DropdownContent>
            <DropdownMenuItemsContainer>
              <MenuItem
                text={t`Add to Creator List`}
                onClick={() => openTargetPicker('creator-list')}
              />
              <MenuItem
                text={t`Add to Campaign`}
                onClick={() => openTargetPicker('campaign')}
              />
            </DropdownMenuItemsContainer>
          </DropdownContent>
        }
      />
      {targetKind && !target && (
        <CreatorBulkRelationshipTargetPickerDialog
          kind={targetKind}
          onClose={clearTarget}
          onTargetSelected={handleTargetSelected}
        />
      )}
      {target && (
        <CreatorBulkRelationshipDialog
          target={target}
          selectedCreatorIds={selectedCreatorIds}
          onSuccess={clearSelectionAfterSuccess}
          onClose={clearTarget}
        />
      )}
    </>
  );
};
