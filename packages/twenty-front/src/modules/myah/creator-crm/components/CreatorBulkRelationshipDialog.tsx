import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { type CreatorBulkRelationshipAction } from '@/myah/creator-crm/types/CreatorBulkRelationshipTarget';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { plural, t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

export const getCreatorBulkRelationshipDialogId = (
  action: CreatorBulkRelationshipAction,
) =>
  `creator-bulk-relationship-${action.operation}-${action.target.kind}-${action.target.id}`;

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
  willChangeCount: number;
  unchangedCount: number;
  state: 'loading' | 'unavailable' | 'ready';
  campaignImpact?: {
    campaignIds: string[];
    campaigns: Array<{ id: string; label: string }>;
    confirmationToken?: string;
  };
};

type CreatorBulkRelationshipDialogContentProps = {
  action: CreatorBulkRelationshipAction;
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

const getCampaignImpactFingerprint = (
  campaignImpact: CreatorBulkRelationshipDialogPreview['campaignImpact'],
) =>
  campaignImpact
    ? JSON.stringify([
        campaignImpact.confirmationToken,
        [...campaignImpact.campaignIds].sort(),
      ])
    : null;

export const CreatorBulkRelationshipDialogContent = ({
  action,
  preview,
  isApplying,
  isConfirmationDisabled,
  onCancel,
  onConfirm,
}: CreatorBulkRelationshipDialogContentProps) => {
  const isRemoval = action.operation === 'remove';
  const title = isRemoval ? t`Confirm removal` : t`Confirm addition`;
  const changedLabel = isRemoval ? t`Will be removed` : t`Will be added`;
  const unchangedLabel = isRemoval ? t`Already absent` : t`Already present`;
  const targetLabel =
    action.target.kind === 'creator-list' ? t`list` : t`campaign`;
  const confirmTitle = isApplying
    ? isRemoval
      ? t`Removing`
      : t`Adding`
    : isRemoval
      ? t`Remove from list`
      : t`Add to ${targetLabel}`;
  const feedback =
    preview.state === 'unavailable'
      ? t`Unable to verify existing relationships. Try again.`
      : preview.state === 'ready' && preview.willChangeCount === 0
        ? t`No changes will be made.`
        : undefined;

  return (
    <StyledDialogContent>
      <H1Title title={title} fontColor={H1TitleFontColor.Primary} />
      <StyledReviewRows>
        <StyledReviewRow>
          <StyledReviewLabel>{t`Target`}</StyledReviewLabel>
          <StyledReviewValue>{action.target.label}</StyledReviewValue>
        </StyledReviewRow>
        <StyledReviewRow>
          <StyledReviewLabel>{t`Selected`}</StyledReviewLabel>
          <StyledReviewValue>
            {getCreatorCountLabel(preview.selectedCount)}
          </StyledReviewValue>
        </StyledReviewRow>
        <StyledReviewRow>
          <StyledReviewLabel>{changedLabel}</StyledReviewLabel>
          <StyledReviewValue>
            {getPreviewCountLabel(preview.state, preview.willChangeCount)}
          </StyledReviewValue>
        </StyledReviewRow>
        {isRemoval &&
          preview.campaignImpact &&
          preview.campaignImpact.campaigns.length > 0 && (
            <StyledReviewRow>
              <StyledReviewLabel>{t`Affected campaigns`}</StyledReviewLabel>
              <StyledReviewValue>
                {preview.campaignImpact.campaigns
                  .map(({ label }) => label)
                  .join(', ')}
              </StyledReviewValue>
            </StyledReviewRow>
          )}
        <StyledReviewRow>
          <StyledReviewLabel>{unchangedLabel}</StyledReviewLabel>
          <StyledReviewValue>
            {getPreviewCountLabel(preview.state, preview.unchangedCount)}
          </StyledReviewValue>
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
          title={confirmTitle}
          variant="primary"
          accent={isRemoval ? 'danger' : 'brand'}
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
  action,
  selectedCreatorIds,
  onSuccess,
  onClose,
}: {
  action: CreatorBulkRelationshipAction;
  selectedCreatorIds: string[];
  onSuccess?: () => void;
  onClose?: () => void;
}) => {
  const [
    rejectedCampaignImpactFingerprint,
    setRejectedCampaignImpactFingerprint,
  ] = useState<string | null>(null);
  const preview = useCreatorBulkRelationshipPreview({
    target: action.target,
    selectedCreatorIds,
  });
  const campaignImpactFingerprint = getCampaignImpactFingerprint(
    preview.campaignImpact,
  );
  const isRejectedCampaignImpact =
    rejectedCampaignImpactFingerprint !== null &&
    rejectedCampaignImpactFingerprint === campaignImpactFingerprint;
  const { applyCreatorBulkRelationship, removeCreatorListMembers } =
    useApplyCreatorBulkRelationship();
  const { closeModal } = useModal();
  const [isApplying, setIsApplying] = useState(false);
  const modalInstanceId = getCreatorBulkRelationshipDialogId(action);
  const isRemoval = action.operation === 'remove';
  const actionableCount = isRemoval
    ? preview.relationshipRecordIds.length
    : preview.unlinkedCreatorIds.length;
  const isConfirmationDisabled =
    preview.loading ||
    preview.isPreviewUnavailable ||
    isApplying ||
    isRejectedCampaignImpact ||
    preview.selectedCreatorIds.length === 0 ||
    actionableCount === 0 ||
    (isRemoval && preview.relationshipRecordIds.length !== 1);

  const handleConfirm = async () => {
    if (isConfirmationDisabled) {
      return;
    }

    setIsApplying(true);

    try {
      let confirmedCampaignIds: string[] | undefined;
      let confirmationToken: string | undefined;
      if (isRemoval && preview.campaignImpact) {
        const latestImpact = (await preview.refetchImpact()).data
          ?.creatorListMembershipRemovalImpact;
        if (
          !latestImpact ||
          latestImpact.confirmationToken !==
            preview.campaignImpact.confirmationToken ||
          latestImpact.affectedCampaignIds.length !==
            preview.campaignImpact.campaignIds.length ||
          latestImpact.affectedCampaignIds.some(
            (id: string) => !preview.campaignImpact?.campaignIds.includes(id),
          )
        ) {
          setRejectedCampaignImpactFingerprint(campaignImpactFingerprint);
          await preview.refetch();
          return;
        }
        confirmedCampaignIds = preview.campaignImpact.campaignIds;
        confirmationToken = preview.campaignImpact.confirmationToken;
      }

      if (action.operation === 'remove') {
        await removeCreatorListMembers({
          creatorListId: action.target.id,
          creatorListMemberIdsToRemove: preview.relationshipRecordIds,
          creatorIdsToRemove: preview.linkedCreatorIds,
          ...(preview.campaignImpact
            ? {
                confirmedCampaignIds,
                confirmationToken,
              }
            : {}),
        });
      } else {
        await applyCreatorBulkRelationship({
          target: action.target,
          creatorIdsToAdd: preview.unlinkedCreatorIds,
        });
      }
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
        action={action}
        preview={{
          selectedCount: preview.selectedCreatorIds.length,
          willChangeCount: actionableCount,
          unchangedCount: isRemoval
            ? preview.unlinkedCreatorIds.length
            : preview.linkedCreatorIds.length,
          state: preview.loading
            ? 'loading'
            : preview.isPreviewUnavailable
              ? 'unavailable'
              : 'ready',
          campaignImpact: preview.campaignImpact,
        }}
        isApplying={isApplying}
        isConfirmationDisabled={isConfirmationDisabled}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </ModalStatefulWrapper>
  );
};
