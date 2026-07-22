import {
  CreatorBulkRelationshipTargetNameDialog,
  CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID,
} from '@/myah/creator-crm/components/CreatorBulkRelationshipTargetNameDialog';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { SingleRecordPicker } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker';
import { singleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSearchFilterComponentState';
import { canCreateRecordsForObjectMetadataItem } from '@/object-record/utils/canCreateRecordsForObjectMetadataItem';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconForbid } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

export const CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID =
  'creator-bulk-relationship-target-picker';

type CreatorBulkRelationshipTargetPickerDialogProps = {
  kind: CreatorBulkRelationshipTarget['kind'];
  onClose: () => void;
  onTargetSelected: (target: CreatorBulkRelationshipTarget) => void;
};

export const CreatorBulkRelationshipTargetPickerDialog = ({
  kind,
  onClose,
  onTargetSelected,
}: CreatorBulkRelationshipTargetPickerDialogProps) => {
  const { closeModal, openModal } = useModal();
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [initialTargetName, setInitialTargetName] = useState<string | null>(
    null,
  );
  const targetLabel = kind === 'creator-list' ? t`list` : t`campaign`;
  const title =
    kind === 'creator-list'
      ? t`Add creators to a list`
      : t`Add creators to a campaign`;
  const objectNameSingular =
    kind === 'creator-list' ? 'creatorList' : 'campaign';
  const pickerInstanceId = `creator-bulk-relationship-target-picker-${kind}`;
  const searchFilter = useAtomComponentStateValue(
    singleRecordPickerSearchFilterComponentState,
    pickerInstanceId,
  );
  const setSearchFilter = useSetAtomComponentState(
    singleRecordPickerSearchFilterComponentState,
    pickerInstanceId,
  );
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const targetObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === objectNameSingular,
  );
  const targetObjectPermissions = targetObjectMetadataItem
    ? objectPermissionsByObjectMetadataId[targetObjectMetadataItem.id]
    : undefined;
  const canCreateTarget =
    isDefined(targetObjectMetadataItem) &&
    isDefined(targetObjectPermissions) &&
    canCreateRecordsForObjectMetadataItem({
      objectPermissions: targetObjectPermissions,
      objectMetadataItem: targetObjectMetadataItem,
    });
  const { record: selectedTargetRecord } = useFindOneRecord({
    objectNameSingular,
    objectRecordId: selectedTargetId,
    recordGqlFields: { id: true, name: true },
    skip: !selectedTargetId,
  });
  const { createOneRecord } = useCreateOneRecord({ objectNameSingular });

  const resetPickerSearch = () => {
    setSearchFilter('');
  };

  useEffect(() => {
    const label = selectedTargetRecord?.name?.trim();

    if (!selectedTargetId || !label) {
      return;
    }

    onTargetSelected({ kind, id: selectedTargetId, label });
    resetPickerSearch();
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  }, [closeModal, kind, onTargetSelected, selectedTargetId, selectedTargetRecord]);

  const handleCancel = () => {
    resetPickerSearch();
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
    onClose();
  };

  const handlePickerClose = () => {
    resetPickerSearch();
    onClose();
  };

  const openTargetNameDialog = (initialName: string) => {
    setInitialTargetName(initialName);
    openModal(CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID);
  };

  const handleTargetCreated = async (targetName: string) => {
    const name = targetName.trim();

    if (!name) {
      return;
    }

    const createdTarget = await createOneRecord({ name });

    if (!createdTarget) {
      return;
    }

    onTargetSelected({ kind, id: createdTarget.id, label: name });
    setInitialTargetName(null);
    resetPickerSearch();
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID);
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  };

  return (
    <>
      <ModalStatefulWrapper
        modalInstanceId={CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID}
        onClose={handlePickerClose}
        isClosable
        padding="large"
        overlay="dark"
        dataGloballyPreventClickOutside
        narrowWidth
        autoHeight
      >
        <H1Title title={title} fontColor={H1TitleFontColor.Primary} />
        <SingleRecordPicker
          focusId={pickerInstanceId}
          componentInstanceId={pickerInstanceId}
          EmptyIcon={IconForbid}
          emptyLabel={t`No ${targetLabel}`}
          onCancel={handleCancel}
          onMorphItemSelected={(selectedMorphItem) =>
            setSelectedTargetId(selectedMorphItem?.recordId)
          }
          onCreate={
            canCreateTarget
              ? (initialName) =>
                  openTargetNameDialog(initialName ?? searchFilter)
              : undefined
          }
          objectNameSingulars={[objectNameSingular]}
          recordPickerInstanceId={pickerInstanceId}
        />
        {canCreateTarget && (
          <Button
            ariaLabel={t`Create new ${targetLabel}`}
            title={t`Create new ${targetLabel}`}
            variant="secondary"
            onClick={() => openTargetNameDialog(searchFilter)}
            fullWidth
          />
        )}
      </ModalStatefulWrapper>
      {initialTargetName !== null && (
        <CreatorBulkRelationshipTargetNameDialog
          kind={kind}
          initialName={initialTargetName}
          onClose={() => setInitialTargetName(null)}
          onCreate={handleTargetCreated}
        />
      )}
    </>
  );
};
