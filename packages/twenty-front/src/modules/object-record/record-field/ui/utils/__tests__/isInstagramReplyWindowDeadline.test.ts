import { FieldMetadataType } from '~/generated-metadata/graphql';

import { isInstagramReplyWindowDeadline } from '@/object-record/record-field/ui/utils/isInstagramReplyWindowDeadline';

describe('isInstagramReplyWindowDeadline', () => {
  it('matches only the Myah social conversation reply deadline', () => {
    expect(
      isInstagramReplyWindowDeadline({
        type: FieldMetadataType.DATE_TIME,
        metadata: {
          fieldName: 'replyWindowEndsAt',
          objectMetadataNameSingular: 'myahSocialConversation',
        },
      }),
    ).toBe(true);
  });

  it('does not match another date-time field', () => {
    expect(
      isInstagramReplyWindowDeadline({
        type: FieldMetadataType.DATE_TIME,
        metadata: {
          fieldName: 'createdAt',
          objectMetadataNameSingular: 'myahSocialConversation',
        },
      }),
    ).toBe(false);
  });

  it('does not match the reply deadline on another object', () => {
    expect(
      isInstagramReplyWindowDeadline({
        type: FieldMetadataType.DATE_TIME,
        metadata: {
          fieldName: 'replyWindowEndsAt',
          objectMetadataNameSingular: 'company',
        },
      }),
    ).toBe(false);
  });
});
