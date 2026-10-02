import { MyahInboxReplyAiActions } from '@/myah/inbox/components/MyahInboxReplyAiActions';
import { MyahInboxReplyBox } from '@/myah/inbox/components/MyahInboxReplyBox';
import { StyledMyahInboxReplyCenterContext } from '@/myah/inbox/components/MyahInboxReplyCenterContext';
import { MyahInboxRichDraftEditor } from '@/myah/inbox/components/MyahInboxRichDraftEditor';
import { Select } from '@/ui/input/components/Select';
import { TextArea } from '@/ui/input/components/TextArea';
import { styled } from '@linaria/react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { parseMyahReplyRichText } from 'twenty-shared/utils';

import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxRichText,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

const StyledDraftEditor = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};

  button[aria-disabled='true'] {
    color: ${themeCssVariables.font.color.light};
    cursor: not-allowed;
  }
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
  max-width: 100%;
`;

const StyledEditorContainer = styled.div``;

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
  presentation?: 'default' | 'main';
  previewScope?: string;
  bodyAriaLabel?: string;
  subject?: string;
  onOpenAiGuidance?: () => void | Promise<void>;
  guidanceUnavailableReason?: string;
  initialIsEditing?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  subjectOptions?: SelectOption<string>[];
  subjectValue?: string;
  onSubjectChange?: (value: string) => void;
};

export const MyahInboxDraftEditor = ({
  entry,
  onDraftChange,
  onRetry,
  onReloadConflict,
  actions,
  disabled = false,
  presentation = 'default',
  previewScope = '',
  bodyAriaLabel = 'Shared reply draft',
  subject,
  onOpenAiGuidance,
  guidanceUnavailableReason,
  initialIsEditing = false,
  onEditingChange,
  subjectOptions,
  subjectValue,
  onSubjectChange,
}: MyahInboxDraftEditorProps) => {
  const conflictPanelRef = useRef<HTMLDivElement>(null);
  const editorId = useId();
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const isMainCard = presentation === 'main';
  const feedbackResetKey = `${previewScope}:${entry.localBody.markdown}`;

  useEffect(() => {
    if (entry.status === 'conflict') {
      conflictPanelRef.current?.focus();
    }
  }, [entry.status]);

  const hasStructuredBody = entry.localBody.blocknote !== null;
  const hasUnsupportedStructuredBody = useMemo(() => {
    if (!hasStructuredBody) return false;
    try {
      parseMyahReplyRichText(entry.localBody);
      return false;
    } catch {
      return true;
    }
  }, [entry.localBody, hasStructuredBody]);
  const useRichEditor = hasStructuredBody && !hasUnsupportedStructuredBody;
  const editor = hasUnsupportedStructuredBody ? (
    <StyledConflict role="alert">
      <span>This formatted draft cannot be edited safely.</span>
      <Button
        title="Use plain text"
        variant="secondary"
        size="small"
        disabled={disabled}
        onClick={() =>
          onDraftChange({ markdown: entry.localBody.markdown, blocknote: null })
        }
      />
    </StyledConflict>
  ) : useRichEditor ? (
    <StyledEditorContainer>
      <MyahInboxRichDraftEditor
        key={`${previewScope}:${entry.editorVersion}`}
        body={entry.localBody}
        ariaLabel="Shared reply draft"
        disabled={disabled}
        editorVersion={entry.editorVersion}
        focusId={`${previewScope}:${entry.editorVersion}`}
        onDraftChange={onDraftChange}
      />
    </StyledEditorContainer>
  ) : (
    <StyledEditorContainer>
      <TextArea
        key={entry.editorVersion}
        textAreaId={editorId}
        ariaLabel="Shared reply draft"
        value={entry.localBody.markdown}
        placeholder="Write a reply draft"
        disabled={disabled}
        onChange={(markdown) => {
          onDraftChange({ markdown, blocknote: null });
        }}
        minRows={6}
      />
    </StyledEditorContainer>
  );

  if (isMainCard) {
    const centerContext = subject ? (
      <StyledMyahInboxReplyCenterContext data-reply-subject>
        {subjectOptions?.length && subjectValue && onSubjectChange ? (
          <Select
            ariaLabel="Reply subject"
            dropdownId={`${editorId}-reply-subject-select`}
            value={subjectValue}
            onChange={onSubjectChange}
            options={subjectOptions}
            selectSizeVariant="small"
            showContextualTextInControl={false}
            withSearchInput
            dropdownWidth={340}
            dropdownOffset={{ x: 0, y: 8 }}
          />
        ) : (
          <span aria-label="Reply subject" title={subject}>
            {subject}
          </span>
        )}
      </StyledMyahInboxReplyCenterContext>
    ) : null;
    const trailingActions = (
      <MyahInboxReplyAiActions
        disabled={disabled}
        onOpenAiGuidance={onOpenAiGuidance}
        guidanceUnavailableReason={guidanceUnavailableReason}
        feedbackResetKey={feedbackResetKey}
      />
    );
    return (
      <MyahInboxReplyBox
        body={entry.localBody}
        bodyAriaLabel={bodyAriaLabel}
        centerContext={centerContext}
        bodyRecovery={
          hasUnsupportedStructuredBody
            ? {
                message: 'This formatted draft cannot be edited safely.',
                actionLabel: 'Use plain text',
                onRecover: () =>
                  onDraftChange({
                    markdown: entry.localBody.markdown,
                    blocknote: null,
                  }),
              }
            : undefined
        }
        conflict={entry.status === 'conflict' ? entry.conflict : null}
        disabled={disabled}
        editorMode="rich"
        editorVersion={entry.editorVersion}
        error={entry.status === 'error' ? entry.error : null}
        isEditing={isEditing}
        onBodyChange={onDraftChange}
        onEditingChange={(nextIsEditing) => {
          setIsEditing(nextIsEditing);
          onEditingChange?.(nextIsEditing);
        }}
        onReloadConflict={onReloadConflict}
        onRetry={onRetry}
        previewScope={previewScope}
        primaryActions={actions}
        trailingActions={trailingActions}
      />
    );
  }

  return (
    <StyledDraftEditor aria-label="Shared reply draft editor">
      {editor}
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
