import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type DynamicToolUIPart, type ToolUIPart } from 'ai';
import { useContext } from 'react';
import { type RequestApprovalToolResult } from 'twenty-shared/ai';
import { IconShield } from 'twenty-ui/icon';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import { ShimmeringText } from '@/ai/components/ShimmeringText';

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
    toolPart.output as { result?: RequestApprovalToolResult } | null
  )?.result;
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
    </StyledContainer>
  );
};
