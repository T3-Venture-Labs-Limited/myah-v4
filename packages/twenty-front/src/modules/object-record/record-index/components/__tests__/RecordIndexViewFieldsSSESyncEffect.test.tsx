import { render } from '@testing-library/react';

import { RecordIndexViewFieldsSSESyncEffect } from '@/object-record/record-index/components/RecordIndexViewFieldsSSESyncEffect';

const mockSyncRecordIndexViewFields = jest.fn();
const mockUseListenToMetadataOperationBrowserEvent = jest.fn();
const mockStoreGet = jest.fn();

jest.mock(
  '@/browser-event/hooks/useListenToMetadataOperationBrowserEvent',
  () => ({
    useListenToMetadataOperationBrowserEvent: (...args: unknown[]) =>
      mockUseListenToMetadataOperationBrowserEvent(...args),
  }),
);

jest.mock(
  '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow',
  () => ({
    useContextStoreObjectMetadataItemOrThrow: () => ({
      objectMetadataItem: { id: 'creator-object' },
    }),
  }),
);

jest.mock(
  '@/object-record/record-index/hooks/useLoadRecordIndexStates',
  () => ({
    useLoadRecordIndexStates: () => ({
      syncRecordIndexViewFields: mockSyncRecordIndexViewFields,
    }),
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => 'creator-default-view',
  }),
);

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => ({ get: mockStoreGet }),
}));

describe('RecordIndexViewFieldsSSESyncEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreGet.mockReturnValue({
      id: 'creator-default-view',
      viewFields: [],
    });
  });

  it('syncs isolated VIEW_FIELD events to their index without global index writes', () => {
    render(
      <RecordIndexViewFieldsSSESyncEffect
        recordIndexId="creators-creator-default-view-creator-list-pane-list-a"
        skipGlobalIndexStates
      />,
    );

    const listener = mockUseListenToMetadataOperationBrowserEvent.mock
      .calls[0][0] as {
      onMetadataOperationBrowserEvent: () => void;
    };

    listener.onMetadataOperationBrowserEvent();

    expect(mockSyncRecordIndexViewFields).toHaveBeenCalledWith(
      { id: 'creator-default-view', viewFields: [] },
      { id: 'creator-object' },
      {
        recordIndexId: 'creators-creator-default-view-creator-list-pane-list-a',
        skipGlobalIndexStates: true,
      },
    );
  });
});
