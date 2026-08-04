import { doesActivityTargetObjectSupportAttachments } from '@/activities/utils/getActivityTargetObjectFieldIdName';

describe('doesActivityTargetObjectSupportAttachments', () => {
  it('returns false when Attachment has no target field for the record object', () => {
    expect(
      doesActivityTargetObjectSupportAttachments({
        attachmentFieldNames: ['targetTaskId', 'targetNoteId'],
        objectNameSingular: 'campaign',
      }),
    ).toBe(false);
  });

  it('returns true when Attachment has the record object target field', () => {
    expect(
      doesActivityTargetObjectSupportAttachments({
        attachmentFieldNames: ['targetCampaignId'],
        objectNameSingular: 'campaign',
      }),
    ).toBe(true);
  });
});
