import { fireEvent, render, screen } from '@testing-library/react';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import {
  RecordIndexContextProvider,
  type RecordIndexContextValue,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { RecordTableWithWrappers } from '@/object-record/record-table/components/RecordTableWithWrappers';
import { PageFocusId } from '@/types/PageFocusId';



const mockUseHotkeysOnFocusedElement = jest.fn();
const mockResetFocusStackToRecordIndex = jest.fn();

const mockScrollWrapper = jest.fn(
  ({ children }: { children: React.ReactNode }) => <>{children}</>,
);


jest.mock('@/object-record/hooks/useDeleteOneRecord', () => ({
  useDeleteOneRecord: () => ({ deleteOneRecord: jest.fn() }),
}));

jest.mock(
  '@/object-record/record-index/hooks/useOpenRecordFromIndexView',
  () => ({
    useOpenRecordFromIndexView: () => ({ openRecordFromIndexView: jest.fn() }),
  }),
);

jest.mock(
  '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex',
  () => ({
    useResetFocusStackToRecordIndex: () => ({
      resetFocusStackToRecordIndex: mockResetFocusStackToRecordIndex,
    }),
  }),
);

jest.mock('@/object-record/record-table/components/RecordTable', () => ({
  RecordTable: () => <button data-testid="native-table-cell">Creator</button>,
}));

jest.mock(
  '@/object-record/record-table/components/RecordTableComponentInstance',
  () => ({
    RecordTableComponentInstance: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,
  }),
);

jest.mock(
  '@/object-record/record-table/components/RecordTableContextProvider',
  () => ({
    RecordTableContextProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,
  }),
);

jest.mock(
  '@/object-record/record-table/hooks/internal/useSelectAllRows',
  () => ({
    useSelectAllRows: () => ({ selectAllRows: jest.fn() }),
  }),
);

jest.mock('@/object-record/record-table/hooks/useActiveRecordTableRow', () => ({
  useActiveRecordTableRow: () => ({ activateRecordTableRow: jest.fn() }),
}));

jest.mock(
  '@/object-record/record-table/hooks/useFocusedRecordTableRow',
  () => ({
    useFocusedRecordTableRow: () => ({ unfocusRecordTableRow: jest.fn() }),
  }),
);

jest.mock(
  '@/object-record/record-table/virtualization/components/RecordTableRecordLimitReloadEffect',
  () => ({ RecordTableRecordLimitReloadEffect: () => null }),
);

jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: (params: unknown) =>
    mockUseHotkeysOnFocusedElement(params),
}));

jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: (props: { children: React.ReactNode }) =>
    mockScrollWrapper(props),
}));

const scopedRecordIndexContextValue: RecordIndexContextValue = {
  fieldDefinitionByFieldMetadataItemId: {},
  fieldMetadataItemByFieldMetadataItemId: {},
  indexIdentifierUrl: () => '',
  labelIdentifierFieldMetadataItem: undefined,
  objectMetadataItem: {} as never,
  objectNamePlural: 'creators',
  objectNameSingular: 'creator',
  objectPermissionsByObjectMetadataId: {},
  onIndexRecordsLoaded: jest.fn(),
  recordFieldByFieldMetadataItemId: {},
  recordIndexId: 'creator-index-list-a',
  viewBarInstanceId: 'creator-index-list-a',
};

const renderRecordTable = (
  contextStoreInstanceId: string,
  embeddedSurfaceOptions?: RecordIndexContextValue['embeddedSurfaceOptions'],
) =>
  render(
    <ContextStoreComponentInstanceContext.Provider
      value={{ instanceId: contextStoreInstanceId }}
    >
      <RecordIndexContextProvider
        value={{ ...scopedRecordIndexContextValue, embeddedSurfaceOptions }}
      >
        <RecordTableWithWrappers
          objectNameSingular="creator"
          recordTableId="creator-index-list-a"
          viewBarId="creator-index-list-a"
        />
      </RecordIndexContextProvider>
    </ContextStoreComponentInstanceContext.Provider>,
  );

describe('RecordTableWithWrappers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScrollWrapper.mockClear();
  });

  it('routes native table keyboard and pointer focus to its scoped index', () => {
    renderRecordTable('creator-list-pane-list-a');

    expect(mockUseHotkeysOnFocusedElement).toHaveBeenCalledWith(
      expect.objectContaining({ focusId: 'record-index-creator-index-list-a' }),
    );

    fireEvent.mouseDown(screen.getByTestId('native-table-cell'));

    expect(mockResetFocusStackToRecordIndex).toHaveBeenCalledWith(
      'record-index-creator-index-list-a',
    );
  });

  it('keeps the main table on the existing record-index focus identity', () => {
    renderRecordTable(MAIN_CONTEXT_STORE_INSTANCE_ID);

    expect(mockUseHotkeysOnFocusedElement).toHaveBeenCalledWith(
      expect.objectContaining({ focusId: PageFocusId.RecordIndex }),
    );
  });
  it('keeps the normal Creators table in its native ScrollWrapper', () => {
    renderRecordTable(MAIN_CONTEXT_STORE_INSTANCE_ID);

    expect(mockScrollWrapper).toHaveBeenCalledWith(
      expect.objectContaining({
        componentInstanceId: 'record-table-scroll-creator-index-list-a',
      }),
    );
  });

  it('gives compact Campaign tables the standard native ScrollWrapper defaults', () => {
    renderRecordTable('campaign-influencers-campaign-a', {
      compactTable: true,
    });

    expect(mockScrollWrapper).toHaveBeenCalledWith(
      expect.objectContaining({
        componentInstanceId: 'record-table-scroll-creator-index-list-a',
      }),
    );

    const scrollWrapperProps = mockScrollWrapper.mock.calls.at(-1)?.[0];

    expect(scrollWrapperProps).not.toHaveProperty('defaultEnableXScroll');
    expect(scrollWrapperProps).not.toHaveProperty('defaultEnableYScroll');
  });
});
