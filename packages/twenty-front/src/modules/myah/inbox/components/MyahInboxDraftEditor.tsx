import { FormAdvancedTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput';
import { styled } from '@linaria/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxRichText,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

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

type MyahInboxDraftEditorProps = {
  entry: MyahInboxDraftAutosaveEntry;
  onDraftChange: (body: MyahInboxRichText) => void;
  onRetry: () => void;
  onReloadConflict: () => void;
  actions: ReactNode;
  disabled?: boolean;
};

export const MyahInboxDraftEditor = ({
  entry,
  onDraftChange,
  onRetry,
  onReloadConflict,
  actions,
  disabled = false,
}: MyahInboxDraftEditorProps) => {
  const conflictPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (entry.status === 'conflict') {
      conflictPanelRef.current?.focus();
    }
  }, [entry.status]);

  return (
    <StyledDraftEditor aria-label="Shared reply draft editor">
      <FormAdvancedTextFieldInput
        key={entry.editorVersion}
        ariaLabel="Shared reply draft"
        defaultValue={entry.localBody.markdown}
        placeholder="Write a reply draft"
        readonly={disabled}
        onChange={(markdown) => {
          onDraftChange({ markdown, blocknote: null });
        }}
        minHeight={120}
        maxWidth={600}
        contentType="markdown"
        enableFullScreen={false}
      />
      <StyledActions aria-label="Draft actions">{actions}</StyledActions>
      {entry.status === 'error' && (
        <StyledError role="alert">
          {entry.error}
          <Button
            title="Retry save"
            variant="secondary"
            size="small"
            onClick={onRetry}
          />
        </StyledError>
      )}
      {entry.status === 'conflict' && entry.conflict && (
        <StyledConflict ref={conflictPanelRef} role="alert" tabIndex={-1}>
          <strong>Draft conflict at revision {entry.conflict.revision}</strong>
          <span>
            The current saved draft changed after you started editing.
          </span>
          <div aria-label="Current saved draft">
            {entry.conflict.body?.markdown || 'The saved draft is empty.'}
          </div>
          <StyledActions>
            <Button
              title="Reload saved draft and discard local changes"
              variant="secondary"
              size="small"
              onClick={onReloadConflict}
            />
          </StyledActions>
        </StyledConflict>
      )}
    </StyledDraftEditor>
  );
};
