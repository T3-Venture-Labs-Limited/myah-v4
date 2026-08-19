import { FormAdvancedTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput';
import { styled } from '@linaria/react';
import { useCallback, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';

const StyledDraftEditor = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledActionFeedback = styled.div`
  flex: 1 1 180px;
  min-width: 0;
`;

const StyledActionButtons = styled.div`
  display: flex;
  flex: none;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledConflict = styled.div`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
`;

export type MyahInboxRichText = {
  markdown: string;
  blocknote: string | null;
};

type MyahInboxDraftEditorProps = {
  threadId: string;
  initialBody: MyahInboxRichText | null;
  initialRevision: number;
  canEdit: boolean;
  readOnlyReason?: string;
};

type DraftConflict = {
  revision: number;
  body: MyahInboxRichText | null;
};

const EMPTY_DRAFT: MyahInboxRichText = { markdown: '', blocknote: null };

const normalizeRichText = (
  body: { markdown: string; blocknote?: string | null } | null | undefined,
): MyahInboxRichText | null =>
  body ? { markdown: body.markdown, blocknote: body.blocknote ?? null } : null;

export const MyahInboxDraftEditor = ({
  threadId,
  initialBody,
  initialRevision,
  canEdit,
  readOnlyReason,
}: MyahInboxDraftEditorProps) => {
  const { generateProposal, saveDraft } = useMyahInboxThreadMutations();
  const [draftBody, setDraftBody] = useState(initialBody ?? EMPTY_DRAFT);
  const [confirmedRevision, setConfirmedRevision] = useState(initialRevision);
  const [editorVersion, setEditorVersion] = useState(0);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const persistDraft = useCallback(
    async (submittedBody: MyahInboxRichText) => {
      setIsSaving(true);
      setError(null);
      setStatus(null);

      try {
        const result = await saveDraft({
          threadId,
          expectedRevision: confirmedRevision,
          body: submittedBody,
        });
        const savedBody = normalizeRichText(result.body);

        if (result.status === 'CONFLICT') {
          setConflict({ revision: result.revision, body: savedBody });

          return;
        }

        setConfirmedRevision(result.revision);
        setDraftBody((currentBody) =>
          currentBody.markdown === submittedBody.markdown &&
          currentBody.blocknote === submittedBody.blocknote
            ? (savedBody ?? EMPTY_DRAFT)
            : currentBody,
        );
        setConflict(null);
        setStatus(`Draft saved at revision ${result.revision}`);
        setEditorVersion((version) => version + 1);
      } catch {
        setError('Could not save the draft. Your changes are still here.');
      } finally {
        setIsSaving(false);
      }
    },
    [confirmedRevision, saveDraft, threadId],
  );

  const handleGenerateProposal = async () => {
    setIsGenerating(true);
    setConflict(null);
    setError(null);
    setStatus(null);

    try {
      const proposal = await generateProposal({
        threadId,
        operatorInstructions: 'Draft a concise reply to this conversation.',
      });

      setDraftBody({
        markdown: proposal.body.markdown,
        blocknote: proposal.body.blocknote ?? null,
      });
      setEditorVersion((version) => version + 1);
      setStatus('Proposal generated. Review and save the draft when ready.');
    } catch {
      setError('Could not generate a proposal. Try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReloadConflict = () => {
    if (!conflict) {
      return;
    }

    setDraftBody(conflict.body ?? EMPTY_DRAFT);
    setConfirmedRevision(conflict.revision);
    setConflict(null);
    setError(null);
    setStatus(`Reloaded saved revision ${conflict.revision}`);
    setEditorVersion((version) => version + 1);
  };

  return (
    <StyledDraftEditor aria-label="Shared reply draft editor">
      <FormAdvancedTextFieldInput
        key={`${threadId}-${editorVersion}-${canEdit ? 'editable' : 'readonly'}`}
        label="Shared reply draft"
        defaultValue={draftBody.markdown}
        placeholder="Write a reply draft"
        readonly={!canEdit}
        onChange={(markdown) => {
          setDraftBody({ markdown, blocknote: null });
          setStatus(null);
        }}
        minHeight={120}
        maxWidth={600}
        contentType="markdown"
        enableFullScreen={false}
      />
      {readOnlyReason && <StyledHint>{readOnlyReason}</StyledHint>}
      <StyledActions aria-label="Draft actions">
        <StyledActionFeedback aria-label="Draft action feedback">
          {status && <StyledStatus role="status">{status}</StyledStatus>}
          {error && <StyledError role="alert">{error}</StyledError>}
        </StyledActionFeedback>
        <StyledActionButtons aria-label="Draft action buttons">
          <Button
            title={isSaving ? 'Saving draft' : 'Save draft'}
            variant="primary"
            size="small"
            disabled={!canEdit || isSaving || isGenerating || conflict !== null}
            onClick={() => void persistDraft(draftBody)}
          />
          <Button
            title={isGenerating ? 'Generating proposal' : 'Generate proposal'}
            variant="secondary"
            size="small"
            disabled={!canEdit || isSaving || isGenerating || conflict !== null}
            onClick={() => void handleGenerateProposal()}
          />
        </StyledActionButtons>
      </StyledActions>
      {conflict && (
        <StyledConflict role="alert">
          <strong>Draft conflict at revision {conflict.revision}</strong>
          <span>
            The current saved draft changed after you started editing.
          </span>
          <div aria-label="Current saved draft">
            {conflict.body?.markdown || 'The saved draft is empty.'}
          </div>
          <StyledActions>
            <Button
              title="Reload and discard local changes"
              variant="secondary"
              size="small"
              onClick={handleReloadConflict}
            />
          </StyledActions>
        </StyledConflict>
      )}
    </StyledDraftEditor>
  );
};
