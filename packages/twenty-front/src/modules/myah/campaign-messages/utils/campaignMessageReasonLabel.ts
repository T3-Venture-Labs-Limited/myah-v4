// Plain-language explanation for a Campaign message that needs attention
// (MYAH-455). Codes come from occurrence hold reasons and send outcomes.
const REASON_LABELS: Record<string, string> = {
  WORKSPACE_NOT_ACTIVE:
    'Sending is paused because the workspace is not active.',
  ATTACHMENTS_UNAVAILABLE:
    'An attachment in this step is missing. Edit the step and save the sequence.',
  MATERIAL_STALE:
    'The step or the creator changed after the Campaign started. Check the sequence and the creator’s details.',
  SENDER_POOL_STALE:
    'The Campaign’s email accounts changed. Check the Campaign settings.',
  SENDER_NOT_READY:
    'The sending account is not connected or not ready. Reconnect it in Settings › Accounts.',
  CAPACITY_CONFIGURATION_INVALID:
    'The sending account’s daily limit is invalid. Check its sending settings.',
  THREAD_EVIDENCE_MISSING:
    'This follow-up can’t find the earlier email it should reply to.',
  THREAD_EVIDENCE_AMBIGUOUS:
    'This follow-up matches more than one earlier email, so it was held.',
  THREAD_SENDER_CHANGED:
    'The earlier email was sent from a different account, so this follow-up was held.',
  DEFINITELY_UNACCEPTED_REVIEW: 'The email provider rejected this message.',
  PROJECTION_RECONCILIATION_REQUIRED:
    'Sent, but the copy in your mailbox has not been matched yet.',
  DISPATCH_CONTRACT_CONFLICT:
    'Sending stopped to avoid sending twice. It will not be retried automatically.',
  OUTCOME_UNKNOWN:
    'Instagram has not confirmed this message. Check the conversation before sending again.',
};

export const campaignMessageReasonLabel = (reason: string | null): string => {
  if (!reason) return 'This message needs a review before it can continue.';

  return (
    REASON_LABELS[reason] ??
    `Needs review: ${reason.replaceAll('_', ' ').toLowerCase()}.`
  );
};
