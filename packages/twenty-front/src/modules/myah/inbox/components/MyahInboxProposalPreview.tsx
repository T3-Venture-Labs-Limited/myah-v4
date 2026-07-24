import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';

const StyledProposal = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[3]};
`;

const StyledHeading = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTextArea = styled.textarea`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.font.family};
  font-size: ${themeCssVariables.font.size.sm};
  min-height: calc(${themeCssVariables.spacing[8]} * 2);
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.border.color.medium};
    outline-offset: 1px;
  }
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
};

export const MyahInboxProposalPreview = ({
  threadId,
  disabled,
  onApply,
}: MyahInboxProposalPreviewProps) => {
  const { generateProposal } = useMyahInboxThreadMutations();
  const [instructions, setInstructions] = useState('');
  const [proposal, setProposal] = useState<{
    subject: string | null;
    body: ProposalBody;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const generatedProposal = await generateProposal({
        threadId,
        operatorInstructions: instructions.trim(),
      });
      setProposal({
        subject: generatedProposal.subject ?? null,
        body: {
          markdown: generatedProposal.body.markdown,
          blocknote: generatedProposal.body.blocknote ?? null,
        },
      });
    } catch {
      setError('Could not generate a proposal. Try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <StyledProposal aria-label="AI proposal">
      <StyledHeading>Reply proposal</StyledHeading>
      <StyledLabel>
        Proposal instructions
        <StyledTextArea
          value={instructions}
          disabled={disabled || isGenerating}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </StyledLabel>
      <StyledActions>
        <Button
          title={isGenerating ? 'Generating proposal' : 'Generate proposal'}
          variant="secondary"
          size="small"
          disabled={disabled || isGenerating || instructions.trim() === ''}
          onClick={handleGenerate}
        />
      </StyledActions>
      {isGenerating && (
        <StyledStatus role="status">Generating proposal</StyledStatus>
      )}
      {error && <StyledError role="alert">{error}</StyledError>}
      {proposal && (
        <>
          <StyledPreview aria-label="Proposal preview">
            <strong>{proposal.subject || 'Reply proposal'}</strong>
            <span>{proposal.body.markdown}</span>
          </StyledPreview>
          <StyledActions>
            <Button
              title="Apply to draft"
              variant="secondary"
              size="small"
              disabled={disabled}
              onClick={() => onApply(proposal.body)}
            />
          </StyledActions>
        </>
      )}
    </StyledProposal>
  );
};
