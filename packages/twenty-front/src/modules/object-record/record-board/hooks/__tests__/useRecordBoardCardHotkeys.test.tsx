import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import { RecordBoardContext } from '@/object-record/record-board/contexts/RecordBoardContext';
import { useRecordBoardCardHotkeys } from '@/object-record/record-board/hooks/useRecordBoardCardHotkeys';
import { RecordBoardCardContext } from '@/object-record/record-board/record-board-card/contexts/RecordBoardCardContext';

const mockActivateBoardCard = jest.fn();
const mockHotkeyConfigurations: Array<{
  callback: () => void;
  keys: string[];
}> = [];
const mockOpenRecordFromIndexView = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
const mockUnfocusBoardCard = jest.fn();
let mockOnOpenRecordFromIndexView: ((request: unknown) => void) | undefined;

jest.mock(
  '@/object-record/record-board/hooks/useActiveRecordBoardCard',
  () => ({
    useActiveRecordBoardCard: () => ({
      activateBoardCard: mockActivateBoardCard,
    }),
  }),
);

jest.mock(
  '@/object-record/record-board/hooks/useFocusedRecordBoardCard',
  () => ({
    useFocusedRecordBoardCard: () => ({
      unfocusBoardCard: mockUnfocusBoardCard,
    }),
  }),
);

jest.mock(
  '@/object-record/record-board/hooks/useRecordBoardSelectAllHotkeys',
  () => ({
    useRecordBoardSelectAllHotkeys: () => undefined,
  }),
);

jest.mock('@/object-record/record-board/hooks/useRecordBoardSelection', () => ({
  useRecordBoardSelection: () => ({ setRecordAsSelected: jest.fn() }),
}));

jest.mock(
  '@/object-record/record-board/hooks/useResetRecordBoardSelection',
  () => ({
    useResetRecordBoardSelection: () => ({
      resetRecordBoardSelection: jest.fn(),
    }),
  }),
);

jest.mock(
  '@/object-record/record-board/states/isRecordBoardCardSelectedComponentFamilyState',
  () => ({ isRecordBoardCardSelectedComponentFamilyState: {} }),
);

jest.mock(
  '@/object-record/record-board/states/selectors/recordBoardSelectedRecordIdsComponentSelector',
  () => ({ recordBoardSelectedRecordIdsComponentSelector: {} }),
);

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    onOpenRecordFromIndexView: mockOnOpenRecordFromIndexView,
  }),
}));

jest.mock(
  '@/object-record/record-index/hooks/useOpenRecordFromIndexView',
  () => ({
    useOpenRecordFromIndexView: () => ({
      openRecordFromIndexView: mockOpenRecordFromIndexView,
    }),
  }),
);

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: (configuration: {
    callback: () => void;
    keys: string[];
  }) => mockHotkeyConfigurations.push(configuration),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateValue',
  () => ({ useAtomComponentFamilyStateValue: () => false }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({ useAtomComponentSelectorValue: () => [] }),
);
type BoardCardWrapperProps = {
  children: ReactNode;
};

const BoardCardWrapper = ({ children }: BoardCardWrapperProps) => (
  <RecordBoardContext.Provider
    value={
      {
        objectMetadataItem: { nameSingular: 'creatorList' },
        recordBoardId: 'creator-list-board',
      } as never
    }
  >
    <RecordBoardCardContext.Provider
      value={{
        columnIndex: 2,
        isRecordReadOnly: false,
        recordId: 'list-a',
        rowIndex: 1,
      }}
    >
      {children}
    </RecordBoardCardContext.Provider>
  </RecordBoardContext.Provider>
);

const runBoardOpenHotkey = () => {
  const openConfiguration = mockHotkeyConfigurations.find((configuration) =>
    configuration.keys.includes('Enter'),
  );

  openConfiguration?.callback();
};

describe('useRecordBoardCardHotkeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHotkeyConfigurations.length = 0;
    mockOnOpenRecordFromIndexView = undefined;
  });

  it('uses the index open interceptor for Enter and modifier Enter when present', () => {
    mockOnOpenRecordFromIndexView = jest.fn();
    renderHook(() => useRecordBoardCardHotkeys('creator-list-board'), {
      wrapper: BoardCardWrapper,
    });

    runBoardOpenHotkey();

    expect(mockOpenRecordFromIndexView).toHaveBeenCalledWith({
      recordId: 'list-a',
      source: 'record-board-card',
    });
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
  });

  it('preserves the direct board side-panel activation when no interceptor exists', () => {
    renderHook(() => useRecordBoardCardHotkeys('creator-list-board'), {
      wrapper: BoardCardWrapper,
    });

    runBoardOpenHotkey();

    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      isNewRecord: false,
      objectNameSingular: 'creatorList',
      recordId: 'list-a',
    });
    expect(mockOpenRecordFromIndexView).not.toHaveBeenCalled();
  });
});
