import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type DynamicToolUIPart, type ToolUIPart } from 'ai';
import { useContext } from 'react';
import { IconShield } from 'twenty-ui/icon';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import { ShimmeringText } from '@/ai/components/ShimmeringText';
import { AiChatActionApprovalEvidenceRenderer } from '@/ai/components/AiChatActionApprovalEvidenceRenderer';
import { AiChatReviewedActionSummary } from '@/ai/components/AiChatReviewedActionSummary';
import { reviewedGenericActionSchema } from '@/ai/states/selectors/agentChatPendingApprovalComponentSelector';
import { GET_ACTION_APPROVAL_PROPOSAL } from '@/ai/graphql/queries/getActionApprovalProposal';

const StyledContainer = styled.div`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} 0;

  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing['0.5']};
  min-width: 0;
`;

const StyledMessage = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledDetail = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type GetActionApprovalProposalData = {
  getActionApprovalProposal: { state: string } | null;
};

const ACTION_APPROVAL_BINDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const AiChatApprovalStatusRenderer = ({
  toolPart,
  isStreaming,
}: {
  toolPart: ToolUIPart | DynamicToolUIPart;
  isStreaming: boolean;
}) => {
  const { t } = useLingui();
  const { theme } = useContext(ThemeContext);
  const result =
    isRecord(toolPart.output) && isRecord(toolPart.output.result)
      ? toolPart.output.result
      : undefined;
  const actionApprovalBindingId =
    typeof result?.actionApprovalBindingId === 'string' &&
    ACTION_APPROVAL_BINDING_ID_PATTERN.test(result.actionApprovalBindingId)
      ? result.actionApprovalBindingId
      : undefined;
  const { data: proposalData } = useQuery<GetActionApprovalProposalData>(
    GET_ACTION_APPROVAL_PROPOSAL,
    {
      variables: { bindingId: actionApprovalBindingId },
      fetchPolicy: 'cache-and-network',
      skip: !actionApprovalBindingId,
    },
  );
  const resultStatus =
    typeof result?.status === 'string' ? result.status : undefined;
  const comment =
    typeof result?.comment === 'string' ? result.comment : undefined;
  const status = actionApprovalBindingId
    ? (proposalData?.getActionApprovalProposal?.state ??
      (resultStatus === 'pending' ? 'PENDING' : 'RESOLVED'))
    : (resultStatus ?? 'pending');
  const evidenceLifecycleState = `${resultStatus ?? 'unknown'}:${status}:${isStreaming ? 'streaming' : 'complete'}`;
  const parsedReviewedAction = actionApprovalBindingId
    ? undefined
    : reviewedGenericActionSchema.safeParse(result?.reviewedAction);
  const reviewedAction = parsedReviewedAction?.success
    ? parsedReviewedAction.data
    : undefined;
  const invalidReason =
    typeof result?.invalidReason === 'string'
      ? result.invalidReason
      : undefined;

  if (status === 'pending' || status === 'PENDING') {
    const label = t`Waiting for approval...`;

    return (
      <StyledContainer>
        <IconShield size={theme.icon.size.sm} />
        {isStreaming ? (
          <ShimmeringText>
            <StyledMessage>{label}</StyledMessage>
          </ShimmeringText>
        ) : (
          <StyledMessage>{label}</StyledMessage>
        )}
        {actionApprovalBindingId && (
          <AiChatActionApprovalEvidenceRenderer
            bindingId={actionApprovalBindingId}
            lifecycleState={evidenceLifecycleState}
          />
        )}
      </StyledContainer>
    );
  }

  const decisionLabel = actionApprovalBindingId
    ? status === 'APPROVED' || status === 'CONSUMED'
      ? t`Approved`
      : status === 'REJECTED'
        ? t`Rejected`
        : status === 'CHANGES_REQUESTED'
          ? t`Changes requested`
          : status === 'EXPIRED'
            ? t`Expired`
            : t`Approval resolved`
    : resultStatus === 'consumed'
      ? result?.executionOutcome === 'succeeded'
        ? t`Approved and run`
        : result?.executionOutcome === 'failed'
          ? t`Approved, execution reported a failure`
          : t`Approved, outcome unconfirmed`
      : resultStatus === 'invalidated'
        ? t`Approved, but not run`
        : result?.decision === 'approved'
          ? t`Approved`
          : result?.decision === 'rejected'
            ? t`Rejected`
            : t`Changes requested`;
  const executionDetail =
    !actionApprovalBindingId &&
    resultStatus === 'consumed' &&
    result?.executionOutcome !== 'succeeded'
      ? t`The tool may have made changes. Check the records before requesting a new approval.`
      : undefined;
  const invalidDetail =
    resultStatus !== 'invalidated'
      ? undefined
      : invalidReason === 'TARGET_CHANGED'
        ? t`The records changed after review. Nothing was changed; ask for a new approval.`
        : invalidReason === 'NOT_AUTHORIZED_OR_UNAVAILABLE'
          ? t`Permission is missing or the records are unavailable. Nothing was changed.`
          : invalidReason === 'APPROVAL_EXPIRED'
            ? t`The approval expired before it ran. Nothing was changed; ask for a new approval.`
            : t`The assistant tried a different action than the one approved. Nothing was changed; ask for a new approval.`;

  return (
    <StyledContainer>
      <IconShield size={theme.icon.size.sm} />
      <StyledContent>
        <StyledMessage>{decisionLabel}</StyledMessage>
        {invalidDetail && <StyledDetail>{invalidDetail}</StyledDetail>}
        {executionDetail && <StyledDetail>{executionDetail}</StyledDetail>}
        {!actionApprovalBindingId && comment && (
          <StyledDetail>{comment}</StyledDetail>
        )}
        {reviewedAction && (
          <AiChatReviewedActionSummary reviewedAction={reviewedAction} />
        )}
      </StyledContent>
      {actionApprovalBindingId && (
        <AiChatActionApprovalEvidenceRenderer
          bindingId={actionApprovalBindingId}
          lifecycleState={evidenceLifecycleState}
        />
      )}
    </StyledContainer>
  );
};
