import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { type CreatorBulkRelationshipTarget } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { plural, t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

export const getCreatorBulkRelationshipDialogId = (
  target: CreatorBulkRelationshipTarget,
) => `creator-bulk-relationship-${target.kind}-${target.id}`;

const StyledDialogContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledReviewRows = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  border-top: 1px solid ${themeCssVariables.border.color.light};
`;

const StyledReviewRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  min-height: ${themeCssVariables.spacing[8]};
  padding: ${themeCssVariables.spacing[1]} 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
  }
`;

const StyledReviewLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledReviewValue = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  line-height: ${themeCssVariables.text.lineHeight.md};
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
`;

const StyledFeedback = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;
  line-height: ${themeCssVariables.text.lineHeight.md};
  min-height: ${themeCssVariables.spacing[10]};
  text-align: center;
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};

  > * {
    flex: 1;
    min-width: 0;
  }
`;

type CreatorBulkRelationshipDialogPreview = {
  selectedCount: number;
  willAddCount: number;
  alreadyPresentCount: number;
  state: 'loading' | 'unavailable' | 'ready';
};

type CreatorBulkRelationshipDialogContentProps = {
  target: CreatorBulkRelationshipTarget;
  preview: CreatorBulkRelationshipDialogPreview;
  isApplying: boolean;
  isConfirmationDisabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const getCreatorCountLabel = (count: number) =>
  plural(count, {
    one: `${count} creator`,
    other: `${count} creators`,
  });

const getPreviewCountLabel = (
  state: CreatorBulkRelationshipDialogPreview['state'],
  count: number,
) =>
  state === 'loading'
    ? t`Checking…`
    : state === 'unavailable'
      ? t`Unavailable`
      : getCreatorCountLabel(count);

export const CreatorBulkRelationshipDialogContent = ({
  target,
  preview,
  isApplying,
  isConfirmationDisabled,
  onCancel,
  onConfirm,
}: CreatorBulkRelationshipDialogContentProps) => {
  const targetLabel = target.kind === 'creator-list' ? t`list` : t`campaign`;
  const willAddValue = getPreviewCountLabel(
    preview.state,
    preview.willAddCount,
  );
  const alreadyPresentValue = getPreviewCountLabel(
    preview.state,
    preview.alreadyPresentCount,
  );
  const feedback =
    preview.state === 'unavailable'
      ? t`Unable to verify existing relationships. Try again.`
      : preview.state === 'ready' && preview.willAddCount === 0
        ? t`No changes will be made.`
        : undefined;

  return (
    <StyledDialogContent>
      <H1Title
        title={t`Confirm addition`}
        fontColor={H1TitleFontColor.Primary}
      />
      <StyledReviewRows>
        <StyledReviewRow>
          <StyledReviewLabel>{t`Target`}</StyledReviewLabel>
          <StyledReviewValue>{target.label}</StyledReviewValue>
        </StyledReviewRow>
        <StyledReviewRow>
          <StyledReviewLabel>{t`Selected`}</StyledReviewLabel>
          <StyledReviewValue>
            {getCreatorCountLabel(preview.selectedCount)}
          </StyledReviewValue>
        </StyledReviewRow>
        <StyledReviewRow>
          <StyledReviewLabel>{t`Will be added`}</StyledReviewLabel>
          <StyledReviewValue>{willAddValue}</StyledReviewValue>
        </StyledReviewRow>
        <StyledReviewRow>
          <StyledReviewLabel>{t`Already present`}</StyledReviewLabel>
          <StyledReviewValue>{alreadyPresentValue}</StyledReviewValue>
        </StyledReviewRow>
      </StyledReviewRows>
      <StyledFeedback role="status">{feedback}</StyledFeedback>
      <StyledActions>
        <Button
          title={t`Cancel`}
          variant="secondary"
          onClick={onCancel}
          disabled={isApplying}
          fullWidth
          justify="center"
        />
        <Button
          title={isApplying ? t`Adding` : t`Add to ${targetLabel}`}
          variant="primary"
          accent="brand"
          onClick={onConfirm}
          disabled={isConfirmationDisabled}
          fullWidth
          justify="center"
        />
      </StyledActions>
    </StyledDialogContent>
  );
};

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
  const isConfirmationDisabled =
    preview.loading ||
    preview.isPreviewUnavailable ||
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
      <CreatorBulkRelationshipDialogContent
        target={target}
        preview={{
          selectedCount: preview.selectedCreatorIds.length,
          willAddCount: preview.creatorIdsToAdd.length,
          alreadyPresentCount: preview.alreadyLinkedCreatorIds.length,
          state: preview.loading
            ? 'loading'
            : preview.isPreviewUnavailable
              ? 'unavailable'
              : 'ready',
        }}
        isApplying={isApplying}
        isConfirmationDisabled={isConfirmationDisabled}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </ModalStatefulWrapper>
  );
};
