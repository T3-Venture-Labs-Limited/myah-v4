import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type DynamicToolUIPart, type ToolUIPart } from 'ai';
import { useContext } from 'react';
import { type RequestApprovalToolResult } from 'twenty-shared/ai';
import { IconShield } from 'twenty-ui/icon';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import { ShimmeringText } from '@/ai/components/ShimmeringText';
import { AiChatActionApprovalEvidenceRenderer } from '@/ai/components/AiChatActionApprovalEvidenceRenderer';

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

const ACTION_APPROVAL_BINDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AiChatApprovalStatusRenderer = ({
  toolPart,
  isStreaming,
}: {
  toolPart: ToolUIPart | DynamicToolUIPart;
  isStreaming: boolean;
}) => {
  const { t } = useLingui();
  const { theme } = useContext(ThemeContext);
  const result = (
    toolPart.output as {
      result?: RequestApprovalToolResult & { actionApprovalBindingId?: unknown };
    } | null
  )?.result;
  const actionApprovalBindingId =
    typeof result?.actionApprovalBindingId === 'string' &&
    ACTION_APPROVAL_BINDING_ID_PATTERN.test(result.actionApprovalBindingId)
      ? result.actionApprovalBindingId
      : undefined;
  const status = result?.status ?? 'pending';

  if (status === 'pending') {
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
          />
        )}
      </StyledContainer>
    );
  }

  const decisionLabel =
    result?.decision === 'approved'
      ? t`Approved`
      : result?.decision === 'rejected'
        ? t`Rejected`
        : t`Changes requested`;

  return (
    <StyledContainer>
      <IconShield size={theme.icon.size.sm} />
      <StyledContent>
        <StyledMessage>{decisionLabel}</StyledMessage>
        {result?.comment && <StyledDetail>{result.comment}</StyledDetail>}
      </StyledContent>
        {actionApprovalBindingId && (
          <AiChatActionApprovalEvidenceRenderer
            bindingId={actionApprovalBindingId}
          />
        )}
    </StyledContainer>
  );
};
