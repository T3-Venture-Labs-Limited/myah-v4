import { TextArea } from '@/ui/input/components/TextArea';
import { styled } from '@linaria/react';
import { useId } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInboxInstagramChannelState } from '@/myah/inbox/types/MyahInboxContact';

const StyledComposer = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

type MyahInboxInstagramComposerProps = {
  username: string;
  body: string;
  channelState: MyahInboxInstagramChannelState;
  provider?: 'COMPOSIO_HISTORY' | 'UNIPILE';
  error?: string | null;
  disabled?: boolean;
  sending?: boolean;
  onBodyChange: (body: string) => void;
  onReviewAndSend: () => void;
};

export const MyahInboxInstagramComposer = ({
  username,
  body,
  channelState,
  provider,
  error = null,
  disabled = false,
  sending = false,
  onBodyChange,
  onReviewAndSend,
}: MyahInboxInstagramComposerProps) => {
  const textAreaId = useId();
  const isReadOnly =
    disabled || channelState !== 'READY' || provider === 'COMPOSIO_HISTORY';
  const cannotSend = isReadOnly || sending || !body.trim();
  const label = `Message @${username} via Instagram`;

  return (
    <StyledComposer aria-label="Instagram composer">
      <TextArea
        ariaLabel={label}
        disabled={isReadOnly}
        minRows={4}
        onChange={onBodyChange}
        textAreaId={textAreaId}
        value={body}
      />
      {error && <StyledError role="alert">{error}</StyledError>}
      <Button
        disabled={cannotSend}
        onClick={onReviewAndSend}
        size="small"
        title="Review and send"
        variant="primary"
      />
    </StyledComposer>
  );
};
