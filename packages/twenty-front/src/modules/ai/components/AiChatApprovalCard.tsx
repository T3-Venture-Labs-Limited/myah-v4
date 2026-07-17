import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  type ApprovalActionKind,
  type ApprovalDecision,
  type ApprovalRiskLevel,
  type RequestApprovalToolInput,
} from 'twenty-shared/ai';
import {
  IconAlertTriangle,
  IconCheck,
  IconRefresh,
  IconX,
} from 'twenty-ui/icon';
import { MainButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { LazyMarkdownRenderer } from '@/ai/components/LazyMarkdownRenderer';
import { useSubmitApprovalDecision } from '@/ai/hooks/useSubmitApprovalDecision';
import { type AgentChatPendingApproval } from '@/ai/types/AgentChatPendingApproval';
import { GET_ACTION_APPROVAL_PROPOSAL } from '@/ai/graphql/queries/getActionApprovalProposal';

const StyledCard = styled.div`
  background-color: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: flex-start;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledHeaderText = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledSummary = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.4;
`;

const StyledMeta = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSectionTitle = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledPreview = styled.pre`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
  margin: 0;
  max-height: 180px;
  overflow: auto;
  padding: ${themeCssVariables.spacing[2]};
  white-space: pre-wrap;
`;

const StyledMarkdownPreview = styled.div`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
  max-height: 180px;
  overflow: auto;
  padding: ${themeCssVariables.spacing[2]};

  .markdown-section {
    margin: 0;
  }
`;

const StyledList = styled.ul`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding-left: ${themeCssVariables.spacing[5]};
`;

const StyledTextarea = styled.textarea`
  background: transparent;
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  min-height: 52px;
  outline: none;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

type AiChatApprovalCardProps = {
  pendingApproval: AgentChatPendingApproval;
};

const APPROVAL_ACTION_KIND_LABELS: Record<ApprovalActionKind, string> = {
  internal_record_write: 'Write to record',
  external_write: 'Write to external service',
  public_post: 'Post publicly',
  email_send: 'Send email',
  webhook_call: 'Call webhook',
  destructive_change: 'Make destructive change',
  financial_action: 'Take financial action',
  other: 'Other action',
};

const APPROVAL_RISK_LEVEL_LABELS: Record<ApprovalRiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

type GetActionApprovalProposalData = {
  getActionApprovalProposal: {
    action: string;
    actionVersion: number;
    body: string | null;
    recipientLabel: string | null;
    sendingAccountLabel: string | null;
    state: string;
    expiresAt: string;
  };
};

type ExactActionApprovalProposal = GetActionApprovalProposalData['getActionApprovalProposal'] & {
  action: 'send_instagram_reply';
  actionVersion: 1;
  body: string;
  recipientLabel: string;
  sendingAccountLabel: string;
  state: 'PENDING';
};

const isExactActionApprovalProposal = (
  proposal: GetActionApprovalProposalData['getActionApprovalProposal'] | undefined,
): proposal is ExactActionApprovalProposal =>
  proposal?.action === 'send_instagram_reply' &&
  proposal.actionVersion === 1 &&
  proposal.state === 'PENDING' &&
  typeof proposal.body === 'string' &&
  typeof proposal.recipientLabel === 'string' &&
  typeof proposal.sendingAccountLabel === 'string';

export const AiChatApprovalCard = ({
  pendingApproval,
}: AiChatApprovalCardProps) => {
  const { t } = useLingui();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { submitDecision } = useSubmitApprovalDecision();
  const { messageId, toolCallId } = pendingApproval;
  const actionApprovalBindingId =
    'actionApprovalBindingId' in pendingApproval
      ? pendingApproval.actionApprovalBindingId
      : undefined;
  const {
    data: proposalData,
    loading: isProposalLoading,
    error: proposalError,
  } = useQuery<GetActionApprovalProposalData>(GET_ACTION_APPROVAL_PROPOSAL, {
    variables: { bindingId: actionApprovalBindingId },
    fetchPolicy: 'cache-and-network',
    skip: !actionApprovalBindingId,
  });
  const proposal = proposalData?.getActionApprovalProposal;
  const exactProposal = isExactActionApprovalProposal(proposal)
    ? proposal
    : undefined;
  const proposalExpiresAt = exactProposal
    ? Date.parse(exactProposal.expiresAt)
    : Number.NaN;
  const isActionApprovalProposalDecidable =
    actionApprovalBindingId !== undefined &&
    !isProposalLoading &&
    !proposalError &&
    exactProposal !== undefined &&
    Number.isFinite(proposalExpiresAt) &&
    proposalExpiresAt > Date.now();
  const isDecisionDisabled =
    isSubmitting ||
    (actionApprovalBindingId !== undefined &&
      !isActionApprovalProposalDecidable);
  const request: RequestApprovalToolInput =
    'request' in pendingApproval
      ? pendingApproval.request
      : isActionApprovalProposalDecidable && exactProposal
        ? {
            title: t`Review Instagram reply`,
            summary: t`Review the exact server-derived Instagram reply before it is sent.`,
            actionKind: 'external_write',
            riskLevel: 'medium',
            consequences: [t`The reply will be sent to the existing conversation.`],
            preview: { format: 'text', content: exactProposal.body },
          }
        : {
            title: t`Instagram reply unavailable`,
            summary: t`The exact server-derived Instagram reply is unavailable.`,
            actionKind: 'external_write',
            riskLevel: 'medium',
            consequences: [
              t`The reply cannot be approved until its source is available.`,
            ],
          };

  const handleDecision = async (decision: ApprovalDecision) => {
    if (isDecisionDisabled) {
      return;
    }

    setIsSubmitting(true);
    await submitDecision({
      messageId,
      toolCallId,
      decision,
      comment: comment.trim().length > 0 ? comment.trim() : undefined,
    });
    setIsSubmitting(false);
  };

  return (
    <StyledCard>
      <StyledHeader>
        <IconAlertTriangle size={16} color={themeCssVariables.color.orange} />
        <StyledHeaderText>
          <StyledTitle>{request.title}</StyledTitle>
          <StyledSummary>{request.summary}</StyledSummary>
          <StyledMeta>
            <span>
              {t`Risk`}: {APPROVAL_RISK_LEVEL_LABELS[request.riskLevel]}
            </span>
            <span>
              {t`Action`}: {APPROVAL_ACTION_KIND_LABELS[request.actionKind]}
            </span>
            {request.targetLabel && <span>{request.targetLabel}</span>}
          </StyledMeta>
        </StyledHeaderText>
      </StyledHeader>

      {request.preview && (
        <StyledSection>
          <StyledSectionTitle>
            {actionApprovalBindingId ? t`Projected message` : t`Preview`}
          </StyledSectionTitle>
          {request.preview.format === 'markdown' ? (
            <StyledMarkdownPreview>
              <LazyMarkdownRenderer text={request.preview.content} />
            </StyledMarkdownPreview>
          ) : (
            <StyledPreview>{request.preview.content}</StyledPreview>
          )}
        </StyledSection>
      )}

      {isActionApprovalProposalDecidable && exactProposal && (
        <StyledMeta>
          <span>{t`To`}: {exactProposal.recipientLabel}</span>
          <span>{t`From`}: {exactProposal.sendingAccountLabel}</span>
        </StyledMeta>
      )}

      <StyledSection>
        <StyledSectionTitle>{t`Consequences`}</StyledSectionTitle>
        <StyledList>
          {request.consequences.map((consequence, index) => (
            <li key={index}>{consequence}</li>
          ))}
        </StyledList>
      </StyledSection>

      <StyledTextarea
        value={comment}
        placeholder={t`Optional note for the agent`}
        onChange={(event) => setComment(event.target.value)}
      />

      <StyledActions>
        {request.options?.allowRequestChanges !== false && (
          <MainButton
            title={t`Request changes`}
            variant="secondary"
            Icon={IconRefresh}
            disabled={isDecisionDisabled}
            onClick={() => void handleDecision('changes_requested')}
          />
        )}
        <MainButton
          title={t`Reject`}
          variant="secondary"
          Icon={IconX}
          disabled={isDecisionDisabled}
          onClick={() => void handleDecision('rejected')}
        />
        <MainButton
          title={t`Approve`}
          Icon={IconCheck}
          disabled={isDecisionDisabled}
          onClick={() => void handleDecision('approved')}
        />
      </StyledActions>
    </StyledCard>
  );
};
