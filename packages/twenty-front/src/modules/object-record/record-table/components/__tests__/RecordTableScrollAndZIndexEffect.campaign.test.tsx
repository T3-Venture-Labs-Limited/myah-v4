import { fireEvent, render } from '@testing-library/react';

import { RecordTableScrollAndZIndexEffect } from '@/object-record/record-table/components/RecordTableScrollAndZIndexEffect';
import { shouldCompactRecordIndexLabelIdentifierComponentState } from '@/object-record/record-index/states/shouldCompactRecordIndexLabelIdentifierComponentState';
import { shouldCompactRecordTableFirstColumnComponentState } from '@/object-record/record-table/states/shouldCompactRecordTableFirstColumnComponentState';

const mockScrollWrapper = document.createElement('div');
const mockSetFirstColumnCompact = jest.fn();
const mockSetLabelCompact = jest.fn();
let mockIsMobile = true;
let mockIndexContext:
  | {
      objectNameSingular: string;
      openFirstColumnRelationInIndex?: boolean;
    }
  | undefined;

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useOptionalRecordIndexContext: () => mockIndexContext,
}));
jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({ recordTableId: 'audience-table' }),
}));
jest.mock('@/ui/utilities/scroll/hooks/useScrollWrapperHTMLElement', () => ({
  useScrollWrapperHTMLElement: () => ({
    scrollWrapperHTMLElement: mockScrollWrapper,
  }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentState', () => ({
  useAtomComponentState: () => [false, jest.fn()],
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: (state: unknown) =>
    state === shouldCompactRecordTableFirstColumnComponentState
      ? mockSetFirstColumnCompact
      : state === shouldCompactRecordIndexLabelIdentifierComponentState
        ? mockSetLabelCompact
        : jest.fn(),
}));
jest.mock(
  '@/object-record/record-table/utils/updateRecordTableCSSVariable',
  () => ({
    updateRecordTableCSSVariable: jest.fn(),
  }),
);
jest.mock('twenty-ui/utilities', () => ({
  useIsMobile: () => mockIsMobile,
}));

const scrollHorizontally = () => {
  mockScrollWrapper.scrollLeft = 60;
  fireEvent.scroll(mockScrollWrapper);
};

describe('RecordTableScrollAndZIndexEffect: campaign Creator relation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScrollWrapper.scrollLeft = 0;
    mockIsMobile = true;
    mockIndexContext = undefined;
  });

  it('keeps the Campaign Creator relation first cell and header full-width while horizontally scrolling', () => {
    mockIndexContext = {
      objectNameSingular: 'campaignCreator',
      openFirstColumnRelationInIndex: true,
    };
    render(<RecordTableScrollAndZIndexEffect />);

    scrollHorizontally();

    expect(mockSetFirstColumnCompact).toHaveBeenCalledWith(false);
    expect(mockSetLabelCompact).toHaveBeenCalledWith(false);
  });

  it.each([
    { objectNameSingular: 'creator', openFirstColumnRelationInIndex: true },
    {
      objectNameSingular: 'campaignCreator',
      openFirstColumnRelationInIndex: false,
    },
    undefined,
  ])(
    'retains native mobile compaction for the other table context %p',
    (context) => {
      mockIndexContext = context;
      render(<RecordTableScrollAndZIndexEffect />);

      scrollHorizontally();

      expect(mockSetFirstColumnCompact).toHaveBeenCalledWith(true);
      expect(mockSetLabelCompact).toHaveBeenCalledWith(true);
    },
  );
});
