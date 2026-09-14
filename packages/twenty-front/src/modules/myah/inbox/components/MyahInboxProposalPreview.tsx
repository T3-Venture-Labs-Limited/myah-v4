import { styled } from '@linaria/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconLoader, type IconComponent } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { AnimatedCircleLoading } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useMyahInboxDraftAutosaveControllerContext } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import {
  type MyahInboxDraftAutosaveKey,
  type MyahInboxDraftOperationCapture,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
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

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
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
  renderGenerateAction?: (
    generateAction: ReactNode,
    isGenerating: boolean,
  ) => ReactNode;
};

export const MyahInboxProposalPreview = ({
  draftKey,
  editorOwner,
  disabled,
  renderGenerateAction,
}: MyahInboxProposalPreviewProps) => {
  const controller = useMyahInboxDraftAutosaveControllerContext();
  const { generateProposal } = useMyahInboxThreadMutations();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only matching mounted work may apply a proposal; operation identity lives in the shared controller.
  // oxlint-disable-next-line twenty/no-state-useref
  const activeRef = useRef<MyahInboxDraftOperationCapture | null>(null);
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
    };
  }, [controller, draftKey.threadId, draftKey.workspaceId]);

  const handleGenerate = async () => {
    if (disabled || isGenerating) return;
    const key = draftKey;
    const isCurrent = () =>
      mountedRef.current &&
      scopeRef.current.workspaceId === key.workspaceId &&
      scopeRef.current.threadId === key.threadId;
    setIsGenerating(true);
    setError(null);
    let capture: MyahInboxDraftOperationCapture | null = null;
    try {
      await controller.flush(key);
      if (!isCurrent()) return;
      capture = controller.acquire(key, 'generating', editorOwner);
      if (!capture) return;
      activeRef.current = capture;
      const generatedProposal = await generateProposal({
        threadId: key.threadId,
        expectedWorkspaceId: key.workspaceId,
        operatorInstructions: 'Draft a concise reply to this conversation.',
      });
      if (!isCurrent()) return;
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
      if (isCurrent()) setIsGenerating(false);
    }
  };

  const generateAction = (
    <Button
      title="Generate Reply"
      ariaLabel={isGenerating ? 'Generating reply' : 'Generate Reply'}
      variant="secondary"
      size="small"
      Icon={isGenerating ? GenerateReplyLoadingIcon : undefined}
      disabled={disabled || isGenerating}
      onClick={handleGenerate}
    />
  );

  return (
    <StyledProposal aria-label="AI reply">
      {renderGenerateAction ? (
        renderGenerateAction(generateAction, isGenerating)
      ) : (
        <StyledActions>{generateAction}</StyledActions>
      )}
      {error && <StyledError role="alert">{error}</StyledError>}
    </StyledProposal>
  );
};
