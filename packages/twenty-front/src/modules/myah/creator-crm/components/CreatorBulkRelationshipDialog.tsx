import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { Section, SectionAlignment, SectionFontColor } from 'twenty-ui/layout';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

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
    preview.isPreviewUnavailable ||
    isApplying ||
    preview.selectedCreatorIds.length === 0 ||
    preview.creatorIdsToAdd.length === 0;
  const subtitle = preview.isPreviewUnavailable
    ? t`Unable to verify existing relationships. Try again.`
    : preview.creatorIdsToAdd.length === 0
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
      closeModal(modalInstanceId);
      onSuccess?.();
    } catch {
      // The mutation hook reports errors; leave the confirmation open for retry.
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancel = () => {
    if (isApplying) {
      return;
    }

    closeModal(modalInstanceId);
    onClose?.();
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={modalInstanceId}
      onEnter={handleConfirm}
      onClose={() => {
        if (!isApplying) {
          onClose?.();
        }
      }}
      isClosable
      shouldCloseModalOnClickOutsideOrEscape={!isApplying}
      padding="large"
      overlay="dark"
      dataGloballyPreventClickOutside
      narrowWidth
      autoHeight
    >
      <H1Title
        title={t`Add creators to ${target.label}`}
        fontColor={H1TitleFontColor.Primary}
      />
      <Section
        alignment={SectionAlignment.Center}
        fontColor={SectionFontColor.Primary}
      >
        {subtitle}
      </Section>
      <Button
        title={t`Cancel`}
        variant="secondary"
        onClick={handleCancel}
        disabled={isApplying}
        fullWidth
      />
      <Button
        title={t`Add to ${targetLabel}`}
        variant="primary"
        accent="brand"
        onClick={handleConfirm}
        disabled={isConfirmationDisabled}
        isLoading={isApplying}
        fullWidth
      />
    </ModalStatefulWrapper>
  );
};
