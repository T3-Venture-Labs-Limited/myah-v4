import { MyahInboxRichDraftEditor } from '@/myah/inbox/components/MyahInboxRichDraftEditor';
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
import { useIcons } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { AppTooltip, TooltipDelay, TooltipPosition } from 'twenty-ui/surfaces';
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

  &[data-main-reply-card] {
    container-type: inline-size;
  }
`;

const StyledActions = styled.div<{ $mainCard?: boolean }>`
  align-items: center;
  display: ${({ $mainCard }) => ($mainCard ? 'grid' : 'flex')};
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: ${({ $mainCard }) =>
    $mainCard ? 'repeat(3, minmax(0, 1fr))' : 'none'};
  justify-content: ${({ $mainCard }) => ($mainCard ? 'normal' : 'flex-end')};
  max-width: 100%;

  &[data-main-reply-actions] {
    > [aria-label='AI actions'] {
      grid-column: 3;
      grid-row: 1;
    }

    > [aria-label='Reply actions'] {
      grid-column: 1;
      grid-row: 1;
    }

    > [data-reply-subject] {
      grid-column: 2;
      grid-row: 1;
    }

    @container (max-width: 480px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));

      > [aria-label='AI actions'] {
        grid-column: 2;
        grid-row: 2;
      }

      > [aria-label='Reply actions'] {
        grid-column: 1;
        grid-row: 2;
      }

      > [data-reply-subject] {
        grid-column: 1 / -1;
        grid-row: 1;
      }
    }
  }
`;

const StyledActionGroup = styled.div<{ $alignEnd?: boolean }>`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  margin-left: ${({ $alignEnd }) => ($alignEnd ? 'auto' : '0')};
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const MAIN_REPLY_SCROLL_STYLES = `
  max-height: min(240px, 40vh);
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const StyledEditorContainer = styled.div``;

const StyledDraftPreview = styled.div`
  ${MAIN_REPLY_SCROLL_STYLES}
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: inherit;
  min-height: ${themeCssVariables.spacing[6]};
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

const StyledReplySubject = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledAccessibleDescription = styled.span`
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
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
  presentation?: 'default' | 'main';
  previewScope?: string;
  subject?: string;
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
  subject,
}: MyahInboxDraftEditorProps) => {
  const conflictPanelRef = useRef<HTMLDivElement>(null);
  const editorId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const isMainCard = presentation === 'main';
  const { getIcon } = useIcons();
  const thumbsUpIcon = getIcon('IconThumbUp');
  const thumbsDownIcon = getIcon('IconThumbDown');
  const guidanceDescriptionId = `${editorId}-guidance-description`;
  const feedbackDescriptionId = `${editorId}-feedback-description`;

  useEffect(() => {
    if (entry.status === 'conflict') {
      conflictPanelRef.current?.focus();
    }
  }, [entry.status]);

  useEffect(() => {
    setFeedback(null);
  }, [entry.localBody.markdown, previewScope]);

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
  const useRichEditor =
    (isMainCard || hasStructuredBody) && !hasUnsupportedStructuredBody;
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
        autoFocus={isMainCard && isEditing}
        presentation={presentation}
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

  return (
    <StyledDraftEditor
      aria-label="Shared reply draft editor"
      data-main-reply-card={isMainCard || undefined}
    >
      {isMainCard && !isEditing ? (
        <StyledDraftPreview
          role="region"
          aria-label="Reply draft preview"
          tabIndex={0}
        >
          {entry.localBody.markdown || 'No reply draft yet.'}
        </StyledDraftPreview>
      ) : (
        editor
      )}
      <StyledActions
        $mainCard={isMainCard}
        data-main-reply-actions={isMainCard || undefined}
        aria-label="Draft actions"
      >
        {!isMainCard && actions}
        {isMainCard && (
          <>
            <StyledActionGroup role="group" aria-label="Reply actions">
              {actions}
              <Button
                title={isEditing ? 'Done editing' : 'Edit reply'}
                variant="tertiary"
                size="small"
                disabled={disabled}
                onClick={() => setIsEditing((editing) => !editing)}
              />
            </StyledActionGroup>
            {subject && (
              <StyledReplySubject
                aria-label="Reply subject"
                data-reply-subject
                title={subject}
              >
                {subject}
              </StyledReplySubject>
            )}
            <StyledActionGroup $alignEnd role="group" aria-label="AI actions">
              <div data-testid="myah-inbox-guidance-tooltip-anchor">
                <Button
                  title="Open AI guidance"
                  variant="tertiary"
                  size="small"
                  disabled
                  aria-describedby={guidanceDescriptionId}
                />
              </div>
              <Button
                Icon={thumbsUpIcon}
                ariaLabel="Thumbs up"
                aria-pressed={feedback === 'up'}
                aria-describedby={feedbackDescriptionId}
                data-selected={feedback === 'up' || undefined}
                dataTestId="myah-inbox-feedback-tooltip-up"
                variant={feedback === 'up' ? 'secondary' : 'tertiary'}
                accent={feedback === 'up' ? 'brand' : 'default'}
                size="small"
                disabled={disabled}
                onClick={() =>
                  setFeedback((selection) => (selection === 'up' ? null : 'up'))
                }
              />
              <Button
                Icon={thumbsDownIcon}
                ariaLabel="Thumbs down"
                aria-pressed={feedback === 'down'}
                aria-describedby={feedbackDescriptionId}
                data-selected={feedback === 'down' || undefined}
                dataTestId="myah-inbox-feedback-tooltip-down"
                variant={feedback === 'down' ? 'secondary' : 'tertiary'}
                accent={feedback === 'down' ? 'brand' : 'default'}
                size="small"
                disabled={disabled}
                onClick={() =>
                  setFeedback((selection) =>
                    selection === 'down' ? null : 'down',
                  )
                }
              />
            </StyledActionGroup>
          </>
        )}
      </StyledActions>
      {hasUnsupportedStructuredBody && isMainCard && !isEditing && (
        <StyledConflict role="alert">
          <span>This formatted draft cannot be edited safely.</span>
          <Button
            title="Use plain text"
            variant="secondary"
            size="small"
            disabled={disabled}
            onClick={() =>
              onDraftChange({
                markdown: entry.localBody.markdown,
                blocknote: null,
              })
            }
          />
        </StyledConflict>
      )}
      {isMainCard && (
        <>
          <StyledAccessibleDescription id={guidanceDescriptionId}>
            Campaign navigation is not connected yet.
          </StyledAccessibleDescription>
          <StyledAccessibleDescription id={feedbackDescriptionId}>
            Feedback is a local preview and is not saved.
          </StyledAccessibleDescription>
          <AppTooltip
            anchorSelect="[data-testid='myah-inbox-guidance-tooltip-anchor']"
            content="Campaign navigation is not connected yet."
            delay={TooltipDelay.shortDelay}
            place={TooltipPosition.Top}
          />
          <AppTooltip
            anchorSelect="[data-testid^='myah-inbox-feedback-tooltip-']"
            content="Feedback is a local preview and is not saved."
            delay={TooltipDelay.shortDelay}
            place={TooltipPosition.Top}
          />
        </>
      )}
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
