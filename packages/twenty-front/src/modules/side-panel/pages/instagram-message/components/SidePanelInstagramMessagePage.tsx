import { useId, useRef } from 'react';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { IconSend } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  InstagramMessageRecipientInput,
  StyledInstagramMessageFieldLabel,
} from '@/side-panel/pages/instagram-message/components/InstagramMessageRecipientInput';
import { useInstagramMessageComposer } from '@/side-panel/pages/instagram-message/hooks/useInstagramMessageComposer';
import { TextArea } from '@/ui/input/components/TextArea';

const StyledPage = styled.section`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;
const StyledContent = styled.div`
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[3]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;
const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const preparationMessage = (code: string | null | undefined) => {
  switch (code) {
    case 'RECIPIENT_UNAVAILABLE':
      return t`This recipient could not be resolved. Add a valid Instagram handle to the Creator and check that its Instagram fields agree, or choose another recipient.`;
    case 'CREATOR_AMBIGUOUS':
      return t`Multiple Creators match this handle. Resolve the duplicate Creator records before sending.`;
    case 'CHAT_AMBIGUOUS':
      return t`The Instagram conversation is ambiguous. Check the recipient's chats before sending.`;
    case 'MISSING_ROUTE_PERMISSION':
      return t`You do not have permission for this Instagram message route.`;
    case 'TARGET_LOCKED':
      return t`Another attempt for this recipient is unresolved. Check its status; do not resend.`;
    case 'ACCOUNT_UNAVAILABLE':
      return t`The connected Instagram account is unavailable. Check the account connection before sending.`;
    case 'CONTEXT_CHANGED':
      return t`The recipient or sender changed. Remove the recipient and choose them again before sending.`;
    case 'CONVERSATION_DELETED':
      return t`This contact's Instagram conversation was deleted. Restore it in the Inbox or start a new conversation from the recipient's Instagram profile.`;
    default:
      return t`Could not resolve this recipient safely. Remove the recipient and choose them again to retry.`;
  }
};

export const SidePanelInstagramMessagePage = () => {
  const composer = useInstagramMessageComposer();
  const messageId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const state = composer.composer;
  const attempt = state?.attempt;
  const result = attempt?.result;
  const frozen = Boolean(attempt);
  const sender =
    attempt?.senderLabel ??
    composer.preparation?.sender?.label ??
    composer.account?.sender?.label;
  const handle =
    attempt?.normalizedHandle ?? composer.preparation?.normalizedHandle;
  const message = !composer.canMessage
    ? t`You do not have permission to send Instagram messages.`
    : attempt && !composer.attemptInWorkspace
      ? t`This attempt belongs to another workspace. Return to that workspace to check its status.`
      : result?.status === 'SENT'
        ? t`Message sent. Open Inbox to view it. If the destination is not yet available, refresh or load more contacts in Inbox.`
        : result?.status === 'BLOCKED'
          ? t`Instagram sending is blocked. Your message and recipient have been kept. Check status before starting another attempt.`
          : result?.status === 'FAILED'
            ? t`Instagram did not send this message. Your message and recipient have been kept. Check status before starting another attempt.`
            : result &&
                ['PROVIDER_ACCEPTED', 'PENDING', 'PROCESSING'].includes(
                  result.status,
                )
              ? t`Instagram accepted or is processing this attempt. Waiting for confirmation; do not resend.`
              : result
                ? t`Delivery is unconfirmed. Do not resend. Check status to recover this exact attempt.`
                : attempt
                  ? t`Sending. Do not resend. You can check this attempt's status if confirmation is interrupted.`
                  : composer.accountLoading
                    ? t`Loading Instagram sender account`
                    : composer.account?.status !== 'READY'
                      ? t`The connected Instagram account is unavailable. Check its connection in Settings, then return here.`
                      : composer.preparation?.status === 'BLOCKED'
                        ? preparationMessage(composer.preparation.code)
                        : composer.preparation?.status === 'READY' &&
                            composer.preparation.sender?.accountRecordId !==
                              composer.account.sender?.accountRecordId
                          ? preparationMessage('CONTEXT_CHANGED')
                          : state?.recipient && !composer.preparation
                            ? t`Resolving Instagram recipient`
                            : null;
  const isAlert =
    !composer.canMessage ||
    composer.preparation?.status === 'BLOCKED' ||
    ['BLOCKED', 'FAILED', 'UNKNOWN'].includes(result?.status ?? '') ||
    (!composer.accountLoading &&
      composer.account?.status !== 'READY' &&
      !attempt);

  return (
    <StyledPage aria-label={t`New Instagram Message`}>
      <StyledContent ref={contentRef}>
        <InstagramMessageRecipientInput
          recipient={state?.recipient ?? null}
          confirmedHandle={handle}
          disabled={frozen || !composer.canMessage}
          onChange={(recipient) => {
            composer.setRecipient(recipient);
            if (recipient) {
              // The search field unmounts on selection; hand focus to Message.
              contentRef.current?.querySelector('textarea')?.focus();
            } else {
              // Replacing the recipient is also the way to retry a stale lookup.
              composer.refreshPreparation();
            }
          }}
        />
        <div>
          <StyledInstagramMessageFieldLabel as="div">
            {t`From`}
          </StyledInstagramMessageFieldLabel>
          <div>{sender ?? t`No connected sender`}</div>
        </div>
        <TextArea
          textAreaId={messageId}
          label={t`Message`}
          ariaLabel={t`Message`}
          minRows={6}
          value={state?.body ?? ''}
          readOnly={frozen}
          onChange={composer.setBody}
        />
        {message ? (
          <div role={isAlert ? 'alert' : 'status'} aria-live="polite">
            {message}
          </div>
        ) : null}
        {result?.nextEligibleAt ? (
          <div role="status">
            {t`Next eligible time:`}{' '}
            <time dateTime={result.nextEligibleAt}>
              {new Date(result.nextEligibleAt).toLocaleString()}
            </time>
          </div>
        ) : null}
        <StyledActions>
          {attempt ? (
            <Button
              title={t`Check status`}
              variant="secondary"
              size="small"
              disabled={composer.checking || !composer.attemptInWorkspace}
              onClick={() => void composer.checkStatus()}
            />
          ) : null}
          {composer.canStartNewAttempt ? (
            <Button
              title={t`Start new attempt`}
              variant="secondary"
              size="small"
              onClick={composer.startNewAttempt}
            />
          ) : null}
          {result?.status === 'SENT' ? (
            <Button
              title={t`Open Inbox`}
              variant="secondary"
              size="small"
              onClick={composer.openInbox}
            />
          ) : null}
          <Button
            title={t`Send`}
            Icon={IconSend}
            variant="primary"
            accent="brand"
            size="small"
            disabled={!composer.canSend}
            onClick={() => void composer.send()}
          />
        </StyledActions>
      </StyledContent>
    </StyledPage>
  );
};
