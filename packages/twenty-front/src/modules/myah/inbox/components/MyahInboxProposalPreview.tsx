import { styled } from '@linaria/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconLoader, type IconComponent } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { AnimatedCircleLoading } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useMyahInboxDraftAutosaveControllerContext } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import {
  myahInboxDraftKeyId,
  type MyahInboxDraftAutosaveKey,
  type MyahInboxDraftOperationCapture,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';

const StyledProposal = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};

  button[aria-disabled='true'] {
    color: ${themeCssVariables.font.color.light};
    cursor: not-allowed;
  }
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
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

const GenerateReplyLoadingIcon: IconComponent = ({
  className,
  style,
  size,
  stroke,
  color,
  'aria-hidden': ariaHidden,
}) => (
  <AnimatedCircleLoading>
    <IconLoader
      className={className}
      style={style}
      size={size}
      stroke={stroke}
      color={color}
      aria-hidden={ariaHidden}
    />
  </AnimatedCircleLoading>
);

export type MyahInboxProposalPreviewProps = {
  draftKey: MyahInboxDraftAutosaveKey;
  editorOwner?: symbol;
  disabled: boolean;
  generateUnavailableReason?: string;
  renderGenerateAction?: (
    generateAction: ReactNode,
    isGenerating: boolean,
  ) => ReactNode;
};

export const MyahInboxProposalPreview = ({
  draftKey,
  editorOwner,
  disabled,
  generateUnavailableReason,
  renderGenerateAction,
}: MyahInboxProposalPreviewProps) => {
  const identity = myahInboxDraftKeyId(draftKey);
  const controller = useMyahInboxDraftAutosaveControllerContext();
  const { generateProposal } = useMyahInboxThreadMutations();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailableDescriptionId = useId();

  // Only matching mounted work may apply a proposal; operation identity lives in the shared controller.
  // oxlint-disable-next-line twenty/no-state-useref
  const activeRef = useRef<MyahInboxDraftOperationCapture | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const generationAttemptRef = useRef<symbol | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(draftKey);
  scopeRef.current = draftKey;
  // oxlint-disable-next-line twenty/no-state-useref
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeRef.current) controller.release(activeRef.current);
      activeRef.current = null;
      generationAttemptRef.current = null;
    };
  }, [controller, identity]);

  const handleGenerate = async () => {
    if (
      disabled ||
      generateUnavailableReason ||
      isGenerating ||
      generationAttemptRef.current
    )
      return;
    const attempt = Symbol('generate reply');
    generationAttemptRef.current = attempt;
    const key = draftKey;
    const isCurrent = () =>
      mountedRef.current &&
      myahInboxDraftKeyId(scopeRef.current) === myahInboxDraftKeyId(key);
    setIsGenerating(true);
    setError(null);
    let capture: MyahInboxDraftOperationCapture | null = null;
    try {
      await controller.flush(key);
      if (!isCurrent()) return;
      capture = controller.acquire(key, 'generating', editorOwner);
      if (!capture) return;
      activeRef.current = capture;
      const entry = controller.getEntry(key);
      if (!entry?.input || !capture.contextFingerprint) return;
      const generatedProposal = await generateProposal({
        ...entry.input,
        expectedContextFingerprint: capture.contextFingerprint,
        operatorInstructions: 'Draft a concise reply to this conversation.',
      });
      if (
        !isCurrent() ||
        generatedProposal.contextFingerprint !== capture.contextFingerprint
      )
        return;
      const applied = await controller.applyProposalIfCurrent(capture, {
        markdown: generatedProposal.body.markdown,
        blocknote: generatedProposal.body.blocknote ?? null,
      });
      if (!applied && isCurrent()) setError('Draft changed; generate again.');
    } catch {
      if (isCurrent()) setError('Could not generate a reply. Try again.');
    } finally {
      if (capture) controller.release(capture);
      if (activeRef.current === capture) activeRef.current = null;
      if (generationAttemptRef.current === attempt) {
        generationAttemptRef.current = null;
        if (isCurrent()) setIsGenerating(false);
      }
    }
  };

  const generateAction = (
    <Button
      title="Generate reply"
      ariaLabel={isGenerating ? 'Generating reply' : 'Generate reply'}
      variant="secondary"
      size="small"
      Icon={isGenerating ? GenerateReplyLoadingIcon : undefined}
      disabled={disabled || isGenerating}
      aria-disabled={Boolean(generateUnavailableReason) || undefined}
      aria-describedby={
        generateUnavailableReason ? unavailableDescriptionId : undefined
      }
      onClick={generateUnavailableReason ? undefined : handleGenerate}
    />
  );

  return (
    <StyledProposal aria-label="AI reply">
      {renderGenerateAction ? (
        renderGenerateAction(generateAction, isGenerating)
      ) : (
        <StyledActions>{generateAction}</StyledActions>
      )}
      {generateUnavailableReason && (
        <StyledAccessibleDescription id={unavailableDescriptionId}>
          {generateUnavailableReason}
        </StyledAccessibleDescription>
      )}
      {error && <StyledError role="alert">{error}</StyledError>}
    </StyledProposal>
  );
};
