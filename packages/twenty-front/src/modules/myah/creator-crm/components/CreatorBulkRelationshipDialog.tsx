import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { t } from '@lingui/core/macro';
import { useState } from 'react';

export const getCreatorBulkRelationshipDialogId = (
  target: CreatorBulkRelationshipTarget,
) => `creator-bulk-relationship-${target.kind}-${target.id}`;

export const CreatorBulkRelationshipDialog = ({
  target,
  selectedCreatorIds,
  onSuccess,
  onClose,
}: {
  target: CreatorBulkRelationshipTarget;
  selectedCreatorIds: string[];
  onSuccess?: () => void;
  onClose?: () => void;
}) => {
  const preview = useCreatorBulkRelationshipPreview({
    target,
    selectedCreatorIds,
  });
  const { applyCreatorBulkRelationship } = useApplyCreatorBulkRelationship();
  const { openModal } = useModal();
  const [isApplying, setIsApplying] = useState(false);
  const modalInstanceId = getCreatorBulkRelationshipDialogId(target);
  const targetLabel = target.kind === 'creator-list' ? t`list` : t`campaign`;
  const isConfirmationDisabled =
    preview.loading ||
    isApplying ||
    preview.selectedCreatorIds.length === 0 ||
    preview.creatorIdsToAdd.length === 0;
  const subtitle =
    preview.creatorIdsToAdd.length === 0
      ? t`${preview.selectedCreatorIds.length} selected · ${preview.creatorIdsToAdd.length} will be added · ${preview.alreadyLinkedCreatorIds.length} already present. No changes will be made.`
      : t`${preview.selectedCreatorIds.length} selected · ${preview.creatorIdsToAdd.length} will be added · ${preview.alreadyLinkedCreatorIds.length} already present.`;

  const handleConfirm = async () => {
    if (isConfirmationDisabled) {
      return;
    }

    setIsApplying(true);

    try {
      await applyCreatorBulkRelationship({
        target,
        creatorIdsToAdd: preview.creatorIdsToAdd,
      });
      onSuccess?.();
    } catch {
      // The mutation hook reports errors and the confirmation reopens for retry.
      openModal(modalInstanceId);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <ConfirmationModal
      modalInstanceId={modalInstanceId}
      title={t`Add creators to ${target.label}`}
      subtitle={subtitle}
      loading={isConfirmationDisabled}
      onClose={onClose}
      onConfirmClick={handleConfirm}
      confirmButtonAccent="brand"
      confirmButtonText={t`Add to ${targetLabel}`}
    />
  );
};
