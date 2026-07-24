import { FormAdvancedTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';

const StyledDraftEditor = styled.section`
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

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
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

export type MyahInboxAppliedProposal = {
  applicationId: number;
  body: MyahInboxRichText;
};

type MyahInboxDraftEditorProps = {
  threadId: string;
  initialBody: MyahInboxRichText | null;
  initialRevision: number;
  canEdit: boolean;
  readOnlyReason?: string;
  appliedProposal: MyahInboxAppliedProposal | null;
};

type DraftConflict = {
  revision: number;
  body: MyahInboxRichText | null;
};

const EMPTY_DRAFT: MyahInboxRichText = { markdown: '', blocknote: null };

export const MyahInboxDraftEditor = ({
  threadId,
  initialBody,
  initialRevision,
  canEdit,
  readOnlyReason,
  appliedProposal,
}: MyahInboxDraftEditorProps) => {
  const { saveDraft } = useMyahInboxThreadMutations();
  const [draftBody, setDraftBody] = useState(initialBody ?? EMPTY_DRAFT);
  const [confirmedRevision, setConfirmedRevision] = useState(initialRevision);
  const [editorVersion, setEditorVersion] = useState(0);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!appliedProposal) {
      return;
    }

    setDraftBody(appliedProposal.body);
    setConflict(null);
    setError(null);
    setStatus('Proposal applied. Save the draft to keep it.');
    setEditorVersion(appliedProposal.applicationId);
  }, [appliedProposal]);

  const normalizeRichText = (
    body: { markdown: string; blocknote?: string | null } | null | undefined,
  ): MyahInboxRichText | null =>
    body
      ? { markdown: body.markdown, blocknote: body.blocknote ?? null }
      : null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const result = await saveDraft({
        threadId,
        expectedRevision: confirmedRevision,
        body: draftBody,
      });
      const savedBody = normalizeRichText(result.body);

      if (result.status === 'CONFLICT') {
        setConflict({ revision: result.revision, body: savedBody });
        return;
      }

      setConfirmedRevision(result.revision);
      setDraftBody(savedBody ?? EMPTY_DRAFT);
      setConflict(null);
      setStatus(`Draft saved at revision ${result.revision}`);
    } catch {
      setError('Could not save the draft. Your changes are still here.');
    } finally {
      setIsSaving(false);
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
      <StyledHeading>Shared reply draft</StyledHeading>
      <FormAdvancedTextFieldInput
        key={`${threadId}-${editorVersion}`}
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
      <StyledActions>
        <Button
          title={isSaving ? 'Saving draft' : 'Save draft'}
          variant="primary"
          size="small"
          disabled={!canEdit || isSaving || conflict !== null}
          onClick={handleSave}
        />
      </StyledActions>
      {status && <StyledStatus role="status">{status}</StyledStatus>}
      {error && <StyledError role="alert">{error}</StyledError>}
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
