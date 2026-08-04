import { act, renderHook } from '@testing-library/react';

import { useRecordShowPagePagination } from '@/object-record/record-show/hooks/useRecordShowPagePagination';
import { AppPath, ViewFilterOperand } from 'twenty-shared/types';

const mockNavigate = jest.fn();
const mockUseFindManyRecords = jest.fn();
const mockUseQueryVariablesFromParentView = jest.fn();
const mockUseCreatorListContextFromId = jest.fn();
const mockUseCreatorListContextValidation = jest.fn();

const creatorObjectMetadataItem = {
  id: 'creator-object',
  namePlural: 'creators',
  nameSingular: 'creator',
};

const creatorListContext = {
  target: { id: 'list-id', kind: 'creator-list', label: 'Creator List' },
  filter: {
    fieldMetadataId: 'creator-list-memberships',
    relationTargetFieldMetadataId: 'creator-list-member-creator-list',
  },
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({
    objectNameSingular: 'creator',
    objectRecordId: 'creator-current',
  }),
  useSearchParams: () => [
    new URLSearchParams('creatorListId=list-id&viewId=view-id'),
  ],
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: creatorObjectMetadataItem,
  }),
}));

jest.mock('@/myah/creator-crm/hooks/useCreatorListContext', () => ({
  useCreatorListContextFromId: (creatorListId: string | undefined) =>
    mockUseCreatorListContextFromId(creatorListId),
  useCreatorListContextFromIdWithLoading: (creatorListId: string | undefined) =>
    mockUseCreatorListContextValidation(creatorListId),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (options: unknown) => mockUseFindManyRecords(options),
}));

jest.mock(
  '@/object-record/record-field/ui/states/lastShowPageRecordId',
  () => ({
    lastShowPageRecordIdState: {},
  }),
);

jest.mock('@/object-record/graphql/utils/computeCursorArgFilter', () => ({
  computeCursorArgFilter: ({
    isForwardPagination,
  }: {
    isForwardPagination: boolean;
  }) =>
    isForwardPagination
      ? { id: { gt: 'creator-current' } }
      : { id: { lt: 'creator-current' } },
}));

jest.mock('@/object-record/graphql/utils/extractOrderByFieldNames', () => ({
  extractOrderByFieldNames: () => ({ name: true }),
}));

jest.mock('@/object-record/graphql/utils/reverseOrderBy', () => ({
  reverseOrderBy: (orderBy: unknown) => orderBy,
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomState', () => ({
  useSetAtomState: () => jest.fn(),
}));

jest.mock('@/views/hooks/useQueryVariablesFromParentView', () => ({
  useQueryVariablesFromParentView: (options: unknown) =>
    mockUseQueryVariablesFromParentView(options),
}));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

describe('useRecordShowPagePagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreatorListContextFromId.mockReturnValue(creatorListContext);
    mockUseCreatorListContextValidation.mockReturnValue({
      context: creatorListContext,
      isLoading: false,
    });
    mockUseQueryVariablesFromParentView.mockReturnValue({
      filter: { name: { eq: 'Ada' } },
      isSoftDeleteFilterActive: false,
      orderBy: [{ name: 'AscNullsFirst' }],
    });
    mockUseFindManyRecords
      .mockReturnValueOnce({
        loading: false,
        records: [{ id: 'creator-current', name: 'Ada' }],
        totalCount: 1,
      })
      .mockReturnValueOnce({ loading: false, records: [], totalCount: 0 })
      .mockReturnValueOnce({
        loading: false,
        records: [{ id: 'creator-next' }],
        totalCount: 1,
      })
      .mockReturnValue({ loading: false, records: [], totalCount: 0 });
  });

  it('holds Creator List pagination until its validation lookup resolves', () => {
    mockUseCreatorListContextFromId.mockReturnValue(undefined);
    mockUseCreatorListContextValidation.mockReturnValue({
      context: undefined,
      isLoading: true,
    });

    const { result } = renderHook(() =>
      useRecordShowPagePagination('creator', 'creator-current'),
    );

    expect(mockUseCreatorListContextValidation).toHaveBeenCalledWith('list-id');
    expect(result.current.isLoadingPagination).toBe(true);

    const [, ...paginationCalls] = mockUseFindManyRecords.mock.calls;

    for (const [options] of paginationCalls) {
      expect(options).toEqual(expect.objectContaining({ skip: true }));
    }

    act(() => result.current.navigateToNextRecord());
    act(() => result.current.navigateToPreviousRecord());
    act(() => result.current.navigateToIndexView());

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('rehydrates a Creator List URL as a validated membership filter and preserves it across pagination navigation', () => {
    const { result } = renderHook(() =>
      useRecordShowPagePagination('creator', 'creator-current'),
    );

    expect(mockUseCreatorListContextValidation).toHaveBeenCalledWith('list-id');
    expect(mockUseQueryVariablesFromParentView).toHaveBeenCalledWith({
      additionalRecordFilters: [
        {
          displayValue: '',
          fieldMetadataId: 'creator-list-memberships',
          id: 'creator-list-record-show-filter',
          label: 'List: Creator List',
          operand: ViewFilterOperand.IS,
          relationTargetFieldMetadataId: 'creator-list-member-creator-list',
          subFieldName: null,
          type: 'RELATION',
          value: 'list-id',
        },
      ],
      objectMetadataItem: creatorObjectMetadataItem,
    });

    act(() => result.current.navigateToNextRecord());
    act(() => result.current.navigateToIndexView());

    expect(mockNavigate).toHaveBeenNthCalledWith(
      1,
      AppPath.RecordShowPage,
      { objectNameSingular: 'creator', objectRecordId: 'creator-next' },
      { creatorListId: 'list-id', viewId: 'view-id' },
    );
    expect(mockNavigate).toHaveBeenNthCalledWith(
      2,
      AppPath.RecordIndexPage,
      { objectNamePlural: 'creator-lists' },
      { creatorListId: 'list-id', viewId: 'view-id' },
    );
  });

  it('keeps malformed Creator List URL IDs unscoped', () => {
    mockUseCreatorListContextFromId.mockReturnValue(undefined);
    mockUseCreatorListContextValidation.mockReturnValue({
      context: undefined,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useRecordShowPagePagination('creator', 'creator-current'),
    );

    expect(mockUseQueryVariablesFromParentView).toHaveBeenCalledWith({
      additionalRecordFilters: [],
      objectMetadataItem: creatorObjectMetadataItem,
    });

    act(() => result.current.navigateToNextRecord());
    act(() => result.current.navigateToIndexView());

    expect(mockNavigate).toHaveBeenNthCalledWith(
      1,
      AppPath.RecordShowPage,
      { objectNameSingular: 'creator', objectRecordId: 'creator-next' },
      { viewId: 'view-id' },
    );
    expect(mockNavigate).toHaveBeenNthCalledWith(
      2,
      AppPath.RecordIndexPage,
      { objectNamePlural: 'creators' },
      { viewId: 'view-id' },
    );
  });
});
