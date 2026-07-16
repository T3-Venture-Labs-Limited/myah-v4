import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { Chip, ChipVariant } from 'twenty-ui/data-display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { RecordChip } from '@/object-record/components/RecordChip';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export type ActionApprovalEvidenceLink = {
  objectMetadataId: string;
  recordId: string;
  role: string;
};

export type ActionApprovalProposalEvidence = {
  action: string;
  state: string;
  occurredAt: string;
  evidenceLinks: ActionApprovalEvidenceLink[];
};

export type ActionExecutionReceiptEvidence = {
  state: string;
  occurredAt: string;
  outcome: string | null;
  evidenceLinks: ActionApprovalEvidenceLink[];
};

type AiChatActionApprovalEvidenceProps = {
  proposal: ActionApprovalProposalEvidence;
  receipt: ActionExecutionReceiptEvidence | null;
};

const StyledEvidence = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledEvidenceLinks = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;


const getReceiptStatusLabel = (state: string) => {
  if (state === 'PROVIDER_ACCEPTED') {
    return 'Accepted; waiting for projection';
  }
  if (state === 'SENT') {
    return 'Sent';
  }
  if (state === 'BLOCKED') {
    return 'Blocked';
  }
  if (state === 'FAILED') {
    return 'Unable to complete';
  }
  if (state === 'UNKNOWN') {
    return 'Outcome unknown';
  }
  return 'Processing';
};

const ActionApprovalEvidenceLinkFallback = () => {
  const { t } = useLingui();

  return <Chip label={t`Evidence unavailable`} variant={ChipVariant.Transparent} />;
};

const ResolvedActionApprovalEvidenceLink = ({
  objectNameSingular,
  recordId,
}: {
  objectNameSingular: string;
  recordId: string;
}) => {
  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });
  const { record } = useFindOneRecord({
    objectNameSingular,
    objectRecordId: recordId,
  });

  if (!record) {
    return <ActionApprovalEvidenceLinkFallback />;
  }

  return (
    <RecordChip
      objectNameSingular={objectMetadataItem.nameSingular}
      record={record}
      variant={ChipVariant.Transparent}
    />
  );
};

const ActionApprovalEvidenceLinkChip = ({
  objectMetadataId,
  recordId,
}: ActionApprovalEvidenceLink) => {
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const objectMetadataItem = objectMetadataItems.find(
    (item) => item.id === objectMetadataId,
  );

  if (!objectMetadataItem) {
    return <ActionApprovalEvidenceLinkFallback />;
  }

  return (
    <ResolvedActionApprovalEvidenceLink
      objectNameSingular={objectMetadataItem.nameSingular}
      recordId={recordId}
    />
  );
};

export const AiChatActionApprovalEvidence = ({
  proposal,
  receipt,
}: AiChatActionApprovalEvidenceProps) => {
  const { t } = useLingui();

  return (
    <StyledEvidence>
      <span>
        {proposal.action === 'send_instagram_reply'
          ? 'Send Instagram reply'
          : 'Action'}
      </span>
      <span>{proposal.state === 'EXPIRED' ? 'Expired' : proposal.state}</span>
      <span>{new Date(proposal.occurredAt).toLocaleString()}</span>
      {receipt && (
        <>
          <span>{getReceiptStatusLabel(receipt.state)}</span>
          {receipt.outcome && <span>{receipt.outcome}</span>}
          <StyledEvidenceLinks>
            {receipt.evidenceLinks.map((evidenceLink) => (
              <ActionApprovalEvidenceLinkChip
                key={`${evidenceLink.objectMetadataId}-${evidenceLink.recordId}-${evidenceLink.role}`}
                {...evidenceLink}
              />
            ))}
          </StyledEvidenceLinks>
          <span>{t`Receipt updated`} {new Date(receipt.occurredAt).toLocaleString()}</span>
        </>
      )}
    </StyledEvidence>
  );
};
