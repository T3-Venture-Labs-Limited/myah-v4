import { styled } from '@linaria/react';
import { useId } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { INSTAGRAM_MESSAGE_MAX_BODY_BYTES } from 'twenty-shared/constants';
import { getUtf8ByteLength } from 'twenty-shared/utils';

import { MyahInboxReplyAiActions } from '@/myah/inbox/components/MyahInboxReplyAiActions';
import { MyahInboxReplyBox } from '@/myah/inbox/components/MyahInboxReplyBox';
import { StyledMyahInboxReplyCenterContext } from '@/myah/inbox/components/MyahInboxReplyCenterContext';
import { Select } from '@/ui/input/components/Select';
import { type MyahInboxInstagramCampaignOption } from '@/myah/inbox/hooks/useMyahInboxInstagramCampaignOptions';
import { type MyahInboxInstagramChannelState } from '@/myah/inbox/types/MyahInboxContact';

const StyledByteCount = styled.span<{ $overLimit: boolean }>`
  color: ${({ $overLimit }) =>
    $overLimit
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.secondary};
`;

export type MyahInboxInstagramComposerProps = {
  username: string;
  body: string;
  channelState: MyahInboxInstagramChannelState;
  provider?: 'COMPOSIO_HISTORY' | 'UNIPILE';
  error?: string | null;
  disabled?: boolean;
  sending?: boolean;
  editorVersion?: number;
  previewScope?: string;
  conflict?: { revision: number; body: string } | null;
  onBodyChange: (body: string) => void;
  onReviewAndSend: () => void;
  onReloadConflict?: () => void;
  // Membership-scoped Campaign guidance selection (MYAH-413 owns evidence-
  // backed context/draft/send authority). Selecting a Campaign here only
  // changes the Open AI guidance destination.
  campaignOptions?: MyahInboxInstagramCampaignOption[];
  selectedCampaignId?: string | null;
  onSelectCampaign?: (campaignId: string) => void;
  campaignUnavailableReason?: string | null;
  onOpenAiGuidance?: () => void | Promise<void>;
  guidanceUnavailableReason?: string;
};

export const MyahInboxInstagramComposer = ({
  username,
  body,
  channelState,
  provider,
  error = null,
  disabled = false,
  sending = false,
  editorVersion = 0,
  previewScope = '',
  conflict = null,
  onBodyChange,
  onReviewAndSend,
  onReloadConflict,
  campaignOptions = [],
  selectedCampaignId = null,
  onSelectCampaign,
  campaignUnavailableReason = null,
  onOpenAiGuidance,
  guidanceUnavailableReason,
}: MyahInboxInstagramComposerProps) => {
  const composerId = useId();
  const isReadOnly =
    disabled || channelState !== 'READY' || provider === 'COMPOSIO_HISTORY';
  const trimmedByteLength = getUtf8ByteLength(body.trim());
  const isOverLimit = trimmedByteLength > INSTAGRAM_MESSAGE_MAX_BODY_BYTES;
  const cannotSend = isReadOnly || sending || !body.trim() || isOverLimit;
  const displayedError = isOverLimit
    ? `Message is too long (${trimmedByteLength} bytes). Shorten it to ${INSTAGRAM_MESSAGE_MAX_BODY_BYTES} bytes or fewer to send.`
    : error;
  const recipient = `@${username}`;
  const effectiveCampaignUnavailableReason =
    campaignUnavailableReason ??
    (campaignOptions.length === 0 ? 'No associated Campaigns yet.' : null);

  return (
    <MyahInboxReplyBox
      body={{ markdown: body, blocknote: null }}
      bodyAriaLabel={`Message ${recipient} via Instagram`}
      conflict={
        conflict
          ? {
              revision: conflict.revision,
              body: { markdown: conflict.body, blocknote: null },
            }
          : null
      }
      disabled={isReadOnly}
      editorMode="plain-text"
      editorVersion={editorVersion}
      error={conflict ? null : displayedError}
      previewScope={previewScope}
      onBodyChange={(nextBody) => onBodyChange(nextBody.markdown)}
      onReloadConflict={onReloadConflict}
      primaryActions={
        <Button
          disabled={cannotSend}
          onClick={onReviewAndSend}
          size="small"
          title="Review"
          ariaLabel="Review and send"
          variant="primary"
        />
      }
      centerContext={
        <StyledMyahInboxReplyCenterContext
          data-campaign-context
          role="group"
          aria-label="Campaign context"
        >
          <Select
            ariaLabel="Campaign context"
            dropdownId={`${composerId}-campaign-context-select`}
            value={selectedCampaignId ?? ''}
            onChange={(value) => onSelectCampaign?.(value)}
            options={effectiveCampaignUnavailableReason ? [] : campaignOptions}
            emptyOption={{
              value: '',
              label: effectiveCampaignUnavailableReason ?? 'Choose a Campaign',
            }}
            disabled={Boolean(effectiveCampaignUnavailableReason)}
            selectSizeVariant="small"
            showContextualTextInControl={false}
            withSearchInput={!effectiveCampaignUnavailableReason}
            dropdownWidth={340}
            dropdownOffset={{ x: 0, y: 8 }}
          />
        </StyledMyahInboxReplyCenterContext>
      }
      reloadConflictLabel="Reload saved Instagram draft"
      trailingActions={
        <>
          <MyahInboxReplyAiActions
            disabled={isReadOnly}
            onOpenAiGuidance={onOpenAiGuidance}
            guidanceUnavailableReason={guidanceUnavailableReason}
            feedbackResetKey={`${editorVersion}:${body}`}
            status={
              <StyledByteCount $overLimit={isOverLimit}>
                {trimmedByteLength} / {INSTAGRAM_MESSAGE_MAX_BODY_BYTES}
              </StyledByteCount>
            }
          />
        </>
      }
    />
  );
};
