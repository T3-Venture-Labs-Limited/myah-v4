import { render, renderHook, screen } from '@testing-library/react';

import { CreatorListWorkspace } from '@/myah/creator-crm/components/CreatorListWorkspace';
import { RecordIndexContainerGater } from '@/object-record/record-index/components/RecordIndexContainerGater';
import { useHandleIndexIdentifierClick } from '@/object-record/record-index/hooks/useHandleIndexIdentifierClick';
import { RecordIndexPage } from '~/pages/object-record/RecordIndexPage';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

const mockUseAtomComponentStateValue = jest.fn(() => 'view-id');
const mockObjectMetadataItems = jest.fn();

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (...args: unknown[]) =>
      mockUseAtomComponentStateValue(...args),
  }),
);

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems(),
  }),
}));

jest.mock('@/myah/creator-crm/components/CreatorListWorkspace', () => ({
  CreatorListWorkspace: jest.fn(() => (
    <div data-testid="creator-list-workspace">Creator List workspace</div>
  )),
}));


jest.mock(
  '@/myah/creator-crm/components/CreatorListMembershipFilterEffect',
  () => ({
    CreatorListMembershipFilterEffect: () => null,
  }),
);
jest.mock(
  '@/object-record/record-index/components/RecordIndexContainerGater',
  () => ({
    RecordIndexContainerGater: jest.fn(() => (
      <div data-testid="record-index-gater">Native record index</div>
    )),
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

describe('RecordIndexPage Creator List workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomComponentStateValue.mockReturnValue('creator-list-metadata-id');
  });

  it('uses the Creator List workspace only for Creator List metadata', () => {
    mockObjectMetadataItems.mockReturnValue([
      {
        id: 'creator-list-metadata-id',
        nameSingular: 'creatorList',
      },
    ]);

    render(<RecordIndexPage />);

    expect(screen.getByTestId('creator-list-workspace')).toBeVisible();
    expect(RecordIndexContainerGater).not.toHaveBeenCalled();
  });

  it('keeps the ordinary native index path unchanged for Creator metadata', () => {
    mockObjectMetadataItems.mockReturnValue([
      {
        id: 'creator-list-metadata-id',
        nameSingular: 'creator',
      },
    ]);

    render(<RecordIndexPage />);

    expect(screen.getByTestId('record-index-gater')).toBeVisible();
    expect(RecordIndexContainerGater).toHaveBeenCalledWith({}, undefined);
    expect(CreatorListWorkspace).not.toHaveBeenCalled();
  });
});
