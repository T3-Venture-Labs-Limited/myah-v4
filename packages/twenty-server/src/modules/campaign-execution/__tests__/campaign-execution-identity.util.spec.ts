import {
  computeCampaignAttemptId,
  computeCampaignOccurrenceId,
  computeCampaignProjectedMessageId,
} from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

describe('Campaign execution deterministic identities', () => {
  it('is stable, coordinate-sensitive, and domain-separated', () => {
    const enrollmentId = '00000000-0000-4000-8000-000000000001';
    const messageId = '00000000-0000-4000-8000-000000000002';
    const occurrence = computeCampaignOccurrenceId(enrollmentId, 0, messageId);

    expect(computeCampaignOccurrenceId(enrollmentId, 0, messageId)).toBe(
      occurrence,
    );
    expect(computeCampaignOccurrenceId(enrollmentId, 1, messageId)).not.toBe(
      occurrence,
    );
    const attempt = computeCampaignAttemptId(occurrence, 1);
    expect(computeCampaignAttemptId(occurrence, 1)).toBe(attempt);
    expect(computeCampaignProjectedMessageId(attempt)).not.toBe(attempt);
    expect(computeCampaignProjectedMessageId(attempt)).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
