import { renderHook } from '@testing-library/react';

import { useHandleIndexIdentifierClick } from '@/object-record/record-index/hooks/useHandleIndexIdentifierClick';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => 'view-id',
  }),
);

describe('RecordIndexPage identifier navigation', () => {
  it('opens a Creator List identifier as its filtered Creator index', () => {
    const { result } = renderHook(() =>
      useHandleIndexIdentifierClick({
        objectMetadataItem: {
          nameSingular: 'creatorList',
        } as never,
      }),
    );

    expect(result.current.indexIdentifierUrl('list-id')).toBe(
      getAppPath(
        AppPath.RecordIndexPage,
        { objectNamePlural: 'creators' },
        { creatorListId: 'list-id' },
      ),
    );
  });

  it('retains the native show URL for other object identifiers', () => {
    const { result } = renderHook(() =>
      useHandleIndexIdentifierClick({
        objectMetadataItem: {
          nameSingular: 'creator',
        } as never,
      }),
    );

    expect(result.current.indexIdentifierUrl('creator-id')).toBe(
      getAppPath(
        AppPath.RecordShowPage,
        {
          objectNameSingular: 'creator',
          objectRecordId: 'creator-id',
        },
        { viewId: 'view-id' },
      ),
    );
  });
});
