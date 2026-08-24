import { styled } from '@linaria/react';
import { useState, type ReactNode } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';

const StyledProposal = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledPreview = styled.div`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

type ProposalBody = { markdown: string; blocknote: string | null };

type MyahInboxProposalPreviewProps = {
  threadId: string;
  disabled: boolean;
  onApply: (body: ProposalBody) => void;
  renderGenerateAction?: (generateAction: ReactNode) => ReactNode;
};

export const MyahInboxProposalPreview = ({
  threadId,
  disabled,
  onApply,
  renderGenerateAction,
}: MyahInboxProposalPreviewProps) => {
  const { generateProposal } = useMyahInboxThreadMutations();
  const [proposal, setProposal] = useState<ProposalBody | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const generatedProposal = await generateProposal({
        threadId,
        operatorInstructions: 'Draft a concise reply to this conversation.',
      });
      setProposal({
        markdown: generatedProposal.body.markdown,
        blocknote: generatedProposal.body.blocknote ?? null,
      });
    } catch {
      setError('Could not generate a reply. Try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAction = (
    <Button
      title={isGenerating ? 'Generating reply' : 'Generate Reply'}
      variant="secondary"
      size="small"
      disabled={disabled || isGenerating}
      onClick={handleGenerate}
    />
  );

  return (
    <StyledProposal aria-label="AI reply">
      {renderGenerateAction ? (
        renderGenerateAction(generateAction)
      ) : (
        <StyledActions>{generateAction}</StyledActions>
      )}
      {isGenerating && (
        <StyledStatus role="status">Generating reply</StyledStatus>
      )}
      {error && <StyledError role="alert">{error}</StyledError>}
      {proposal && (
        <>
          <StyledPreview aria-label="Reply preview">
            <strong>Generated reply</strong>
            <span>{proposal.markdown}</span>
          </StyledPreview>
          <StyledActions>
            <Button
              title="Apply to draft"
              variant="secondary"
              size="small"
              disabled={disabled}
              onClick={() => onApply(proposal)}
            />
          </StyledActions>
        </>
      )}
    </StyledProposal>
  );
};
