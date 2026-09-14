import { v5 as uuidv5 } from 'uuid';

export const CAMPAIGN_OCCURRENCE_ID_NAMESPACE =
  'b72238b3-bff5-4e48-b41b-808a46f979aa';
export const CAMPAIGN_ATTEMPT_ID_NAMESPACE =
  '26fd29a1-248e-4686-8a6d-fadd50bf2f51';
export const CAMPAIGN_PROJECTED_MESSAGE_ID_NAMESPACE =
  '27a0dc64-7fd7-469c-ae2a-e693e8f9f584';

export const computeCampaignOccurrenceId = (
  enrollmentId: string,
  authoredMessageIndex: number,
  messageId: string,
): string =>
  uuidv5(
    `${enrollmentId}:${authoredMessageIndex}:${messageId}`,
    CAMPAIGN_OCCURRENCE_ID_NAMESPACE,
  );

export const computeCampaignAttemptId = (
  occurrenceId: string,
  attemptNumber: number,
): string =>
  uuidv5(`${occurrenceId}:${attemptNumber}`, CAMPAIGN_ATTEMPT_ID_NAMESPACE);

export const computeCampaignProjectedMessageId = (attemptId: string): string =>
  uuidv5(attemptId, CAMPAIGN_PROJECTED_MESSAGE_ID_NAMESPACE);
