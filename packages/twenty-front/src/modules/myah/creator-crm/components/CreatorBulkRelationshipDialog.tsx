import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';

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
  const { closeModal } = useModal();
  const [isApplying, setIsApplying] = useState(false);
  const modalInstanceId = getCreatorBulkRelationshipDialogId(target);
  const targetLabel = target.kind === 'creator-list' ? t`list` : t`campaign`;
  const isConfirmationDisabled =
    preview.loading ||
    isApplying ||
    preview.selectedCreatorIds.length === 0 ||
    preview.creatorIdsToAdd.length === 0;

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
      closeModal(modalInstanceId);
    } catch {
      // The mutation hook reports errors and preserves the selected records.
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={modalInstanceId}
      onEnter={handleConfirm}
      onClose={onClose}
      isClosable
      padding="large"
      narrowWidth
      autoHeight
    >
      <Section>
        <strong>{target.label}</strong>
      </Section>
      <Section>{t`${preview.selectedCreatorIds.length} selected`}</Section>
      <Section>{t`${preview.creatorIdsToAdd.length} will be added`}</Section>
      <Section>
        {t`${preview.alreadyLinkedCreatorIds.length} already present`}
      </Section>
      {preview.selectedCreatorIds.length > 0 &&
        preview.creatorIdsToAdd.length === 0 && (
          <Section>{t`No changes will be made.`}</Section>
        )}
      <Button
        title={t`Add to ${targetLabel}`}
        variant="primary"
        accent="brand"
        onClick={handleConfirm}
        disabled={isConfirmationDisabled}
        fullWidth
      />
    </ModalStatefulWrapper>
  );
};
