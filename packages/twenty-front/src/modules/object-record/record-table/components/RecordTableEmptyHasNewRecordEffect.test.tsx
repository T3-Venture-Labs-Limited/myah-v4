import { act, render } from '@testing-library/react';
import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { RecordTableEmptyHasNewRecordEffect } from '@/object-record/record-table/components/RecordTableEmptyHasNewRecordEffect';

const mockSet = jest.fn();
const mockUseAtomComponentStateValue = jest.fn();
const mockTransitionState = {};
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => ({ set: mockSet }),
}));

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectMetadataItem: {
      id: 'campaign-creator-metadata-id',
      nameSingular: 'campaignCreator',
    },
  }),
}));

jest.mock(
  '@/object-record/object-sort-dropdown/utils/turnSortsIntoOrderBy',
  () => ({ turnSortsIntoOrderBy: () => [] }),
);

jest.mock(
  '@/object-record/record-filter/hooks/useEffectiveRecordFilters',
  () => ({ useEffectiveRecordFilters: () => [] }),
);

jest.mock(
  '@/object-record/record-filter/hooks/useFilterValueDependencies',
  () => ({
    useFilterValueDependencies: () => ({ filterValueDependencies: [] }),
  }),
);

jest.mock('@/sse-db-event/hooks/useListenToEventsForQuery', () => ({
  useListenToEventsForQuery: jest.fn(),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({ useAtomComponentSelectorValue: () => false }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({ useAtomComponentStateCallbackState: () => mockTransitionState }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (...args: unknown[]) =>
      mockUseAtomComponentStateValue(...args),
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));

jest.mock('twenty-shared/utils', () => ({
  ...jest.requireActual('twenty-shared/utils'),
  computeRecordGqlOperationFilter: () => ({}),
}));

const campaignCreatorMetadata = {
  id: 'campaign-creator-metadata-id',
  nameSingular: 'campaignCreator',
} as unknown as EnrichedObjectMetadataItem;

describe('RecordTableEmptyHasNewRecordEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomComponentStateValue
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([]);
  });

  it('moves a mounted empty Campaign Influencers table into its populated state after a native create event', () => {
    render(<RecordTableEmptyHasNewRecordEffect />);

    act(() => {
      dispatchObjectRecordOperationBrowserEvent({
        objectMetadataItem: campaignCreatorMetadata,
        operation: { type: 'create-many' },
      });
    });

    expect(mockSet).toHaveBeenCalledWith(mockTransitionState, true);
  });

  it('ignores create events for another object', () => {
    render(<RecordTableEmptyHasNewRecordEffect />);

    act(() => {
      dispatchObjectRecordOperationBrowserEvent({
        objectMetadataItem: {
          ...campaignCreatorMetadata,
          id: 'creator-metadata-id',
          nameSingular: 'creator',
        },
        operation: { type: 'create-many' },
      });
    });

    expect(mockSet).not.toHaveBeenCalled();
  });
});
