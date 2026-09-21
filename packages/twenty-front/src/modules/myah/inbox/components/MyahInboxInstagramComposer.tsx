import { TextArea } from '@/ui/input/components/TextArea';
import { styled } from '@linaria/react';
import { useId } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { INSTAGRAM_MESSAGE_MAX_BODY_BYTES } from 'twenty-shared/constants';
import { getUtf8ByteLength } from 'twenty-shared/utils';

import { type MyahInboxInstagramChannelState } from '@/myah/inbox/types/MyahInboxContact';

const StyledComposer = styled.section`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
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

const StyledByteCount = styled.div<{ $overLimit: boolean }>`
  align-self: flex-end;
  color: ${({ $overLimit }) =>
    $overLimit
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.secondary};
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
  const trimmedByteLength = getUtf8ByteLength(body.trim());
  const isOverLimit = trimmedByteLength > INSTAGRAM_MESSAGE_MAX_BODY_BYTES;
  const cannotSend = isReadOnly || sending || !body.trim() || isOverLimit;
  const displayedError = isOverLimit
    ? `Message is too long (${trimmedByteLength} bytes). Shorten it to ${INSTAGRAM_MESSAGE_MAX_BODY_BYTES} bytes or fewer to send.`
    : error;
  const label = `Message @${username} via Instagram`;

  return (
    <StyledComposer aria-label="Instagram composer">
      <TextArea
        ariaLabel={label}
        disabled={isReadOnly}
        minRows={6}
        maxRows={6}
        onChange={onBodyChange}
        textAreaId={textAreaId}
        value={body}
      />
      <StyledByteCount $overLimit={isOverLimit}>
        {trimmedByteLength} / {INSTAGRAM_MESSAGE_MAX_BODY_BYTES}
      </StyledByteCount>
      {displayedError && (
        <StyledError role="alert">{displayedError}</StyledError>
      )}
      <StyledActions aria-label="Instagram draft actions">
        <Button
          disabled={cannotSend}
          onClick={onReviewAndSend}
          size="small"
          title="Review and send"
          variant="primary"
        />
      </StyledActions>
    </StyledComposer>
  );
};
