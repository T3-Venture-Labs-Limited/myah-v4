import { CreatorBulkRelationshipTargetNameDialog, CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID } from '@/myah/creator-crm/components/CreatorBulkRelationshipTargetNameDialog';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { SingleRecordPicker } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker';
import { singleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSearchFilterComponentState';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
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
  const objectNameSingular = kind === 'creator-list' ? 'creatorList' : 'campaign';
  const pickerInstanceId = `creator-bulk-relationship-target-picker-${kind}`;
  const searchFilter = useAtomComponentStateValue(
    singleRecordPickerSearchFilterComponentState,
    pickerInstanceId,
  );
  const { record: selectedTargetRecord } = useFindOneRecord({
    objectNameSingular,
    objectRecordId: selectedTargetId,
    recordGqlFields: { id: true, name: true },
    skip: !selectedTargetId,
  });
  const { createOneRecord } = useCreateOneRecord({ objectNameSingular });

  useEffect(() => {
    const label = selectedTargetRecord?.name?.trim();

    if (!selectedTargetId || !label) {
      return;
    }

    onTargetSelected({ kind, id: selectedTargetId, label });
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  }, [closeModal, kind, onTargetSelected, selectedTargetId, selectedTargetRecord]);

  const handleCancel = () => {
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
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
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_NAME_MODAL_ID);
    closeModal(CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID);
  };

  return (
    <>
      <ModalStatefulWrapper
        modalInstanceId={CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID}
        onClose={onClose}
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
          onCreate={(initialName) =>
            openTargetNameDialog(initialName ?? searchFilter)
          }
          objectNameSingulars={[objectNameSingular]}
          recordPickerInstanceId={pickerInstanceId}
        />
        <Button
          ariaLabel={t`Create new ${targetLabel}`}
          title={t`Create new ${targetLabel}`}
          variant="secondary"
          onClick={() => openTargetNameDialog(searchFilter)}
          fullWidth
        />
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
