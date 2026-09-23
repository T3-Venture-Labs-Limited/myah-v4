import { MyahInboxRichDraftEditor } from '@/myah/inbox/components/MyahInboxRichDraftEditor';
import { styled } from '@linaria/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInboxRichText } from '@/myah/inbox/types/MyahInboxDraftAutosave';

const StyledReplyBox = styled.section`
  animation: myahReplyCardBorder 12s ease-in-out infinite alternate;
  background:
    linear-gradient(
        ${themeCssVariables.background.primary},
        ${themeCssVariables.background.primary}
      )
      padding-box,
    linear-gradient(
        120deg,
        ${themeCssVariables.color.pink},
        ${themeCssVariables.color.sky},
        ${themeCssVariables.color.pink}
      )
      border-box;
  background-size:
    100% 100%,
    200% 200%;
  border: 1px solid transparent;
  border-radius: ${themeCssVariables.border.radius.md};
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};

  @keyframes myahReplyCardBorder {
    from {
      background-position:
        0 0,
        0% 50%;
    }
    to {
      background-position:
        0 0,
        100% 50%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  button[aria-disabled='true'] {
    cursor: not-allowed;
  }
`;

const StyledBody = styled.div`
  max-height: min(240px, 40vh);
  min-height: ${themeCssVariables.spacing[6]};
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const StyledPreview = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: inherit;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

const StyledFooter = styled.footer`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(3, minmax(0, 1fr));

  > * {
    min-width: 0;
  }
  > :nth-child(2) {
    justify-content: center;
  }
  > :last-child {
    justify-self: end;
  }

  @container (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > :nth-child(2) {
      grid-column: 1 / -1;
      grid-row: 1;
    }
    > :first-child {
      grid-row: 2;
    }
    > :last-child {
      grid-column: 2;
      grid-row: 2;
    }
  }
`;

const StyledActionGroup = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledAlert = styled.div`
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

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

export type MyahInboxReplyBoxConflict = {
  revision: number;
  body?: MyahInboxRichText | null;
};

type MyahInboxReplyBoxBodyRecovery = {
  message: string;
  actionLabel: string;
  onRecover: () => void;
};

export type MyahInboxReplyBoxProps = {
  body: MyahInboxRichText;
  bodyAriaLabel: string;
  editorVersion: number;
  onBodyChange: (body: MyahInboxRichText) => void;
  primaryActions: ReactNode;
  centerContext?: ReactNode;
  trailingActions?: ReactNode;
  disabled?: boolean;
  editorMode?: 'rich' | 'plain-text';
  presentation?: 'default' | 'main';
  previewScope?: string;
  isEditing?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  error?: string | null;
  onRetry?: () => void;
  bodyRecovery?: MyahInboxReplyBoxBodyRecovery;
  conflict?: MyahInboxReplyBoxConflict | null;
  onReloadConflict?: () => void;
  reloadConflictLabel?: string;
};

export const MyahInboxReplyBox = ({
  body,
  bodyAriaLabel,
  editorVersion,
  onBodyChange,
  primaryActions,
  centerContext,
  trailingActions,
  disabled = false,
  editorMode = 'rich',
  presentation = 'main',
  previewScope = '',
  isEditing: controlledIsEditing,
  onEditingChange,
  error = null,
  onRetry,
  bodyRecovery,
  conflict = null,
  onReloadConflict,
  reloadConflictLabel = 'Reload saved draft and discard local changes',
}: MyahInboxReplyBoxProps) => {
  const [uncontrolledIsEditing, setUncontrolledIsEditing] = useState(false);
  const isEditing = controlledIsEditing ?? uncontrolledIsEditing;
  const conflictRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const hasDraftContent = body.markdown.trim().length > 0;
  const conflictRevision = conflict?.revision;
  const conflictMarkdown = conflict?.body?.markdown;

  useEffect(() => {
    if (conflictRevision !== undefined) conflictRef.current?.focus();
  }, [conflictRevision, conflictMarkdown]);

  const setEditing = (nextIsEditing: boolean) => {
    if (controlledIsEditing === undefined)
      setUncontrolledIsEditing(nextIsEditing);
    onEditingChange?.(nextIsEditing);
    if (!nextIsEditing)
      requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const bodyRecoveryAlert = bodyRecovery ? (
    <StyledAlert role="alert">
      <span>{bodyRecovery.message}</span>
      <Button
        title={bodyRecovery.actionLabel}
        variant="secondary"
        size="small"
        disabled={disabled}
        onClick={bodyRecovery.onRecover}
      />
    </StyledAlert>
  ) : null;

  return (
    <StyledReplyBox data-main-reply-card data-testid="myah-inbox-reply-box">
      {(presentation !== 'main' || isEditing || hasDraftContent) && (
        <StyledBody data-testid="myah-inbox-reply-box-body">
          {presentation === 'main' && !isEditing ? (
            <StyledPreview
              role="region"
              aria-label="Reply draft preview"
              tabIndex={0}
            >
              {body.markdown}
            </StyledPreview>
          ) : bodyRecoveryAlert ? (
            bodyRecoveryAlert
          ) : (
            <MyahInboxRichDraftEditor
              key={`${previewScope}:${editorVersion}`}
              ariaLabel={bodyAriaLabel}
              autoFocus={isEditing}
              body={body}
              disabled={disabled}
              editorVersion={editorVersion}
              focusId={`${previewScope}:${editorVersion}`}
              mode={editorMode}
              presentation="main"
              onDraftChange={onBodyChange}
            />
          )}
        </StyledBody>
      )}
      <StyledFooter
        aria-label="Draft actions"
        data-testid="myah-inbox-reply-box-footer"
      >
        <StyledActionGroup role="group" aria-label="Reply actions">
          {primaryActions}
          <Button
            ref={editButtonRef}
            title={isEditing ? 'Done' : 'Edit'}
            ariaLabel={isEditing ? 'Done editing' : 'Edit reply'}
            variant="tertiary"
            size="small"
            disabled={disabled}
            onClick={() => setEditing(!isEditing)}
          />
        </StyledActionGroup>
        <StyledActionGroup>{centerContext}</StyledActionGroup>
        <StyledActionGroup>{trailingActions}</StyledActionGroup>
      </StyledFooter>
      {bodyRecoveryAlert && presentation === 'main' && !isEditing
        ? bodyRecoveryAlert
        : null}
      {error ? (
        <StyledError role="alert">
          {error}
          {onRetry ? (
            <Button
              title="Retry save"
              variant="secondary"
              size="small"
              onClick={onRetry}
            />
          ) : null}
        </StyledError>
      ) : null}
      {conflict ? (
        <StyledAlert ref={conflictRef} role="alert" tabIndex={-1}>
          <strong>Draft conflict at revision {conflict.revision}</strong>
          <span>
            The current saved draft changed after you started editing.
          </span>
          <div aria-label="Current saved draft">
            {conflict.body?.markdown || 'The saved draft is empty.'}
          </div>
          {onReloadConflict ? (
            <Button
              title={reloadConflictLabel}
              variant="secondary"
              size="small"
              onClick={onReloadConflict}
            />
          ) : null}
        </StyledAlert>
      ) : null}
    </StyledReplyBox>
  );
};
