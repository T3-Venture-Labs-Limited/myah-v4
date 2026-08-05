import {
  CreatorBulkRelationshipDialog,
  getCreatorBulkRelationshipDialogId,
} from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';
import {
  CreatorBulkRelationshipTargetPickerDialog,
  CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID,
} from '@/myah/creator-crm/components/CreatorBulkRelationshipTargetPickerDialog';
import { useCreatorListBulkActionsContext } from '@/myah/creator-crm/contexts/CreatorListBulkActionsContext';
import { useCreatorListContext } from '@/myah/creator-crm/hooks/useCreatorListContext';
import {
  type CreatorBulkRelationshipAction,
  type CreatorBulkRelationshipTarget,
} from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
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

export type MyahCreatorBulkActionsProps = {
  contextStoreInstanceId?: string;
};

export const MyahCreatorBulkActions = ({
  contextStoreInstanceId = MAIN_CONTEXT_STORE_INSTANCE_ID,
}: MyahCreatorBulkActionsProps) => {
  const { objectNamePlural } = useRecordIndexContextOrThrow();
  const scopedCreatorListContext = useCreatorListBulkActionsContext();
  const urlCreatorListContext = useCreatorListContext(
    scopedCreatorListContext !== undefined,
  );
  const { findObjectMetadataItemByNamePlural } =
    useFilteredObjectMetadataItems();
  const objectMetadataItem =
    findObjectMetadataItemByNamePlural(objectNamePlural);
  const creatorListContext = scopedCreatorListContext ?? urlCreatorListContext;
  const contextStoreTargetedRecordsRule = useAtomComponentStateValue(
    contextStoreTargetedRecordsRuleComponentState,
    contextStoreInstanceId,
  );
  const setContextStoreTargetedRecordsRule = useSetAtomComponentState(
    contextStoreTargetedRecordsRuleComponentState,
    contextStoreInstanceId,
  );
  const { closeModal, openModal } = useModal();
  const [targetKind, setTargetKind] =
    useState<CreatorBulkRelationshipTarget['kind']>();
  const [action, setAction] = useState<CreatorBulkRelationshipAction>();

  const selectedCreatorIds =
    contextStoreTargetedRecordsRule.mode === 'selection'
      ? contextStoreTargetedRecordsRule.selectedRecordIds
      : [];

  useEffect(() => {
    if (action) {
      openModal(getCreatorBulkRelationshipDialogId(action));
    }
  }, [action, openModal]);

  useEffect(() => {
    if (
      action?.operation !== 'remove' ||
      creatorListContext?.target.id === action.target.id
    ) {
      return;
    }

    closeModal(getCreatorBulkRelationshipDialogId(action));
    setAction(undefined);
  }, [action, closeModal, creatorListContext]);

  if (
    objectMetadataItem?.universalIdentifier !==
      CREATOR_OBJECT_UNIVERSAL_IDENTIFIER ||
    selectedCreatorIds.length === 0
  ) {
    return null;
  }

  const clearAction = () => {
    setAction(undefined);
    setTargetKind(undefined);
  };

  const openTargetPicker = (kind: CreatorBulkRelationshipTarget['kind']) => {
    setAction(undefined);
    setTargetKind(kind);
    openModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  };

  const handleTargetSelected = (
    selectedTarget: CreatorBulkRelationshipTarget,
  ) => {
    setAction({ operation: 'add', target: selectedTarget });
    setTargetKind(undefined);
  };

  const handleOpenRemoveFromList = () => {
    if (!creatorListContext) {
      return;
    }

    setAction({ operation: 'remove', target: creatorListContext.target });
  };

  const clearSelectionAfterSuccess = () => {
    setContextStoreTargetedRecordsRule({
      mode: 'selection',
      selectedRecordIds: [],
    });
    clearAction();
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
      {creatorListContext && (
        <Button
          title={t`Remove from list`}
          variant="secondary"
          onClick={handleOpenRemoveFromList}
        />
      )}
      {targetKind && !action && (
        <CreatorBulkRelationshipTargetPickerDialog
          kind={targetKind}
          onClose={clearAction}
          onTargetSelected={handleTargetSelected}
        />
      )}
      {action && (
        <CreatorBulkRelationshipDialog
          action={action}
          selectedCreatorIds={selectedCreatorIds}
          onSuccess={clearSelectionAfterSuccess}
          onClose={clearAction}
        />
      )}
    </>
  );
};
