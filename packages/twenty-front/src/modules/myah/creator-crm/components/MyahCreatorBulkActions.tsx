import {
  CreatorBulkRelationshipDialog,
  getCreatorBulkRelationshipDialogId,
} from '@/myah/creator-crm/components/CreatorBulkRelationshipDialog';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreTargetedRecordsRuleComponentState } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { MenuItem } from 'twenty-ui/navigation';

const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const CREATOR_BULK_RELATIONSHIP_DROPDOWN_ID =
  'creator-bulk-relationship-dropdown';
const CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID =
  'creator-bulk-relationship-target-picker';

type PendingCreatorBulkRelationshipTarget = Pick<
  CreatorBulkRelationshipTarget,
  'kind' | 'id'
>;

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
  const { openModal, closeModal } = useModal();
  const [pendingTarget, setPendingTarget] =
    useState<PendingCreatorBulkRelationshipTarget | null>(null);

  const selectedCreatorIds =
    targetedRecordsRule.mode === 'selection'
      ? targetedRecordsRule.selectedRecordIds
      : [];
  const targetObjectNameSingular =
    pendingTarget?.kind === 'campaign' ? 'campaign' : 'creatorList';
  const { record: targetRecord } = useFindOneRecord({
    objectNameSingular: targetObjectNameSingular,
    objectRecordId: pendingTarget?.id,
    recordGqlFields: { id: true, name: true },
    skip: pendingTarget === null,
  });
  const target =
    pendingTarget && targetRecord
      ? {
          ...pendingTarget,
          label:
            targetRecord.name?.trim() ||
            (pendingTarget.kind === 'creator-list'
              ? t`Untitled Creator List`
              : t`Untitled Campaign`),
        }
      : undefined;

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

  const openTargetPicker = (kind: CreatorBulkRelationshipTarget['kind']) => {
    setPendingTarget({ kind, id: '' });
    openModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  };

  const handleTargetSelected = (targetId: string | null) => {
    if (!targetId || !pendingTarget) {
      return;
    }

    setPendingTarget({ ...pendingTarget, id: targetId });
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  };

  const clearSelectionAfterSuccess = () => {
    setTargetedRecordsRule({ mode: 'selection', selectedRecordIds: [] });
    setPendingTarget(null);
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
      <ModalStatefulWrapper
        modalInstanceId={CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID}
        onClose={() => setPendingTarget(null)}
        isClosable
        padding="large"
        narrowWidth
        autoHeight
      >
        {pendingTarget && (
          <Section>
            <FormSingleRecordPicker
              label={
                pendingTarget.kind === 'creator-list'
                  ? t`Choose a Creator List`
                  : t`Choose a Campaign`
              }
              defaultValue={null}
              objectNameSingulars={[targetObjectNameSingular]}
              onChange={handleTargetSelected}
            />
          </Section>
        )}
      </ModalStatefulWrapper>
      {target && (
        <CreatorBulkRelationshipDialog
          target={target}
          selectedCreatorIds={selectedCreatorIds}
          onSuccess={clearSelectionAfterSuccess}
          onClose={() => setPendingTarget(null)}
        />
      )}
    </>
  );
};
