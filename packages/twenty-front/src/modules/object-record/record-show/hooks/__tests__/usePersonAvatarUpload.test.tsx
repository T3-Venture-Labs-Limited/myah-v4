import { renderHook } from '@testing-library/react';

import { usePersonAvatarUpload } from '@/object-record/record-show/hooks/usePersonAvatarUpload';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
  objectMetadataItems: getTestEnrichedObjectMetadataItemsMock().filter(
    (objectMetadataItem) => objectMetadataItem.nameSingular !== 'person',
  ),
});

describe('usePersonAvatarUpload', () => {
  it('returns no upload handler when Person metadata is unavailable', () => {
    const { result } = renderHook(() => usePersonAvatarUpload('record-id'), {
      wrapper: Wrapper,
    });

    expect(result.current.onUploadPicture).toBeUndefined();
  });
});
