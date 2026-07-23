import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';

import { CreatorListMembershipFilterEffect } from '@/myah/creator-crm/components/CreatorListMembershipFilterEffect';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { recordIndexContextualViewNameComponentState } from '@/object-record/record-index/states/recordIndexContextualViewNameComponentState';
import { useApplyCurrentViewFiltersToCurrentRecordFilters } from '@/views/hooks/useApplyCurrentViewFiltersToCurrentRecordFilters';
import { useSaveRecordFiltersAndGroupFiltersToViewFiltersAndGroupFilters } from '@/views/hooks/useSaveRecordFiltersAndGroupFiltersToViewFiltersAndGroupFilters';
import { setTestViewsInMetadataStore } from '~/testing/utils/setTestViewsInMetadataStore';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { getJestMetadataAndApolloMocksAndCommandMenuWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksAndCommandMenuWrapper';
import { FieldMetadataType, ViewFilterOperand } from 'twenty-shared/types';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';

const creatorObjectMetadataItem = {
  id: 'creator-object',
  nameSingular: 'creator',
  fields: [
    {
      id: 'creator-list-memberships',
      name: 'listMemberships',
      label: 'List memberships',
      relation: {
        targetObjectMetadata: {
          id: 'creator-list-member-object',
          nameSingular: 'creatorListMember',
          namePlural: 'creatorListMembers',
        },
      },
    },
  ],
};

const creatorListMemberObjectMetadataItem = {
  id: 'creator-list-member-object',
  nameSingular: 'creatorListMember',
  fields: [
    {
      id: 'creator-list-member-creator-list',
      name: 'creatorList',
      label: 'Creator list',
      type: FieldMetadataType.RELATION,
    },
  ],
};

const nonCreatorObjectMetadataItem = {
  id: 'campaign-object',
  nameSingular: 'campaign',
  fields: [],
};

jest.mock('react-router-dom', () => ({
  useSearchParams: jest.fn(),
}));

const mockPerformViewFilterAPICreate = jest.fn();
const mockPerformViewFilterAPIUpdate = jest.fn();
const mockPerformViewFilterAPIDestroy = jest.fn();

jest.mock('@/views/hooks/internal/usePerformViewFilterAPIPersist', () => ({
  usePerformViewFilterAPIPersist: () => ({
    performViewFilterAPICreate: mockPerformViewFilterAPICreate,
    performViewFilterAPIUpdate: mockPerformViewFilterAPIUpdate,
    performViewFilterAPIDestroy: mockPerformViewFilterAPIDestroy,
  }),
}));

jest.mock('@/views/hooks/internal/usePerformViewFilterGroupAPIPersist', () => ({
  usePerformViewFilterGroupAPIPersist: () => ({
    performViewFilterGroupAPICreate: jest.fn().mockResolvedValue({
      status: 'success',
    }),
    performViewFilterGroupAPIUpdate: jest.fn().mockResolvedValue({
      status: 'success',
    }),
    performViewFilterGroupAPIDestroy: jest.fn().mockResolvedValue({
      status: 'success',
    }),
  }),
}));
jest.mock('@/views/hooks/useCanPersistViewChanges', () => ({
  useCanPersistViewChanges: () => ({ canPersistChanges: true }),
}));

jest.mock(
  '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore',
  () => ({
    useRecordIndexIdFromCurrentContextStore: jest.fn(),
  }),
);

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      creatorObjectMetadataItem,
      creatorListMemberObjectMetadataItem,
      nonCreatorObjectMetadataItem,
    ],
  }),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: jest.fn(),
}));

const QueryFilterState = () => {
  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    'creator-index',
  );
  const queryOnlyRecordFilters = useAtomComponentStateValue(
    queryOnlyRecordFiltersComponentState,
    'creator-index',
  );

  return (
    <output data-testid="filter-state">
      {JSON.stringify({ currentRecordFilters, queryOnlyRecordFilters })}
    </output>
  );
};

const ContextualViewNameState = () => {
  const recordIndexContextualViewName = useAtomComponentStateValue(
    recordIndexContextualViewNameComponentState,
    'creator-index',
  );

  return (
    <output data-testid="contextual-view-name">
      {recordIndexContextualViewName ?? ''}
    </output>
  );
};

const renderEffect = () =>
  render(
    <>
      <CreatorListMembershipFilterEffect />
      <QueryFilterState />
    </>,
    {
      wrapper: getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] }),
    },
  );

const readFilterState = () =>
  JSON.parse(screen.getByTestId('filter-state').textContent ?? '{}');

const nativeRecordFilter = {
  id: 'native-filter',
  fieldMetadataId: 'native-field',
  value: 'native-value',
  displayValue: 'native-value',
  type: 'TEXT' as const,
  operand: ViewFilterOperand.CONTAINS,
  label: 'Native',
};

const creatorView = {
  id: 'creator-view',
  name: 'Creators',
  type: 'TABLE',
  objectMetadataId: 'creator-object',
  isCompact: false,
  viewFields: [],
  viewGroups: [],
  viewFilters: [],
  viewFilterGroups: [],
  viewSorts: [],
  shouldHideEmptyGroups: false,
  position: 0,
  icon: 'IconUsers',
  openRecordIn: 'SIDE_PANEL',
  visibility: 'UNLISTED',
  isActive: true,
} as never;

const NativeViewLifecycleState = () => {
  const { applyCurrentViewFiltersToCurrentRecordFilters } =
    useApplyCurrentViewFiltersToCurrentRecordFilters();
  const { saveRecordFiltersAndGroupFiltersToViewFiltersAndGroupFilters } =
    useSaveRecordFiltersAndGroupFiltersToViewFiltersAndGroupFilters();
  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
  );
  const queryOnlyRecordFilters = useAtomComponentStateValue(
    queryOnlyRecordFiltersComponentState,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void saveRecordFiltersAndGroupFiltersToViewFiltersAndGroupFilters();
        }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={applyCurrentViewFiltersToCurrentRecordFilters}
      >
        Reset
      </button>
      <output data-testid="native-view-filter-state">
        {JSON.stringify({ currentRecordFilters, queryOnlyRecordFilters })}
      </output>
    </>
  );
};

describe('CreatorListMembershipFilterEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPerformViewFilterAPICreate.mockResolvedValue({ status: 'success' });
    mockPerformViewFilterAPIUpdate.mockResolvedValue({ status: 'success' });
    mockPerformViewFilterAPIDestroy.mockResolvedValue({ status: 'success' });
    (useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams('creatorListId=list-id'),
    ]);
    (useRecordIndexIdFromCurrentContextStore as jest.Mock).mockReturnValue({
      recordIndexId: 'creator-index',
      objectMetadataItem: creatorObjectMetadataItem,
    });
    (useFindOneRecord as jest.Mock).mockReturnValue({
      record: { id: 'list-id', name: 'MYAH-210 UAT List' },
    });
  });

  it('adds a Creator list-membership relation traversal only to query state', () => {
    renderEffect();

    expect(readFilterState()).toEqual({
      currentRecordFilters: [],
      queryOnlyRecordFilters: [
        expect.objectContaining({
          fieldMetadataId: 'creator-list-memberships',
          relationTargetFieldMetadataId: 'creator-list-member-creator-list',
          type: FieldMetadataType.RELATION,
          operand: ViewFilterOperand.IS,
          value: 'list-id',
        }),
      ],
    });
  });

  it('names the URL-scoped Creator List applied view without persisting it', () => {
    render(
      <>
        <CreatorListMembershipFilterEffect />
        <ContextualViewNameState />
      </>,
      {
        wrapper: getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] }),
      },
    );

    expect(screen.getByTestId('contextual-view-name')).toHaveTextContent(
      'List: MYAH-210 UAT List',
    );
    expect(mockPerformViewFilterAPICreate).not.toHaveBeenCalled();
  });

  it('withholds the contextual label until it can install the membership filter', () => {
    (useRecordIndexIdFromCurrentContextStore as jest.Mock).mockReturnValue({
      recordIndexId: 'creator-index',
      objectMetadataItem: { ...creatorObjectMetadataItem, fields: [] },
    });

    render(
      <>
        <CreatorListMembershipFilterEffect />
        <ContextualViewNameState />
      </>,
      {
        wrapper: getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] }),
      },
    );

    expect(screen.getByTestId('contextual-view-name')).toBeEmptyDOMElement();
  });

  it('excludes the membership filter from native save and retains it after native reset', async () => {
    (useRecordIndexIdFromCurrentContextStore as jest.Mock).mockReturnValue({
      recordIndexId: 'recordIndexId',
      objectMetadataItem: creatorObjectMetadataItem,
    });

    render(
      <>
        <CreatorListMembershipFilterEffect />
        <NativeViewLifecycleState />
      </>,
      {
        wrapper: getJestMetadataAndApolloMocksAndCommandMenuWrapper({
          apolloMocks: [],
          componentInstanceId: 'instanceId',
          contextStoreCurrentViewId: 'creator-view',
          contextStoreCurrentObjectMetadataNameSingular: 'company',
          onInitializeJotaiStore: (store) => {
            setTestViewsInMetadataStore(store, [creatorView]);
            store.set(
              currentRecordFiltersComponentState.atomFamily({
                instanceId: 'recordIndexId',
              }),
              [nativeRecordFilter],
            );
          },
        }),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockPerformViewFilterAPICreate).toHaveBeenCalledWith([
        expect.objectContaining({
          input: expect.objectContaining({
            id: nativeRecordFilter.id,
            fieldMetadataId: nativeRecordFilter.fieldMetadataId,
          }),
        }),
      ]);
    });

    const serializedFilterInputs =
      mockPerformViewFilterAPICreate.mock.calls[0][0];
    expect(serializedFilterInputs).toHaveLength(1);
    expect(JSON.stringify(serializedFilterInputs)).not.toContain('list-id');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(
      JSON.parse(
        screen.getByTestId('native-view-filter-state').textContent ?? '{}',
      ),
    ).toEqual({
      currentRecordFilters: [],
      queryOnlyRecordFilters: [expect.objectContaining({ value: 'list-id' })],
    });
  });

  it('replaces and clears the transient filter when the query parameter changes', () => {
    const { rerender } = renderEffect();

    (useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams('creatorListId=next-list-id'),
    ]);
    rerender(
      <>
        <CreatorListMembershipFilterEffect />
        <QueryFilterState />
      </>,
    );

    expect(readFilterState().queryOnlyRecordFilters).toEqual([
      expect.objectContaining({ value: 'next-list-id' }),
    ]);

    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams('')]);
    rerender(
      <>
        <CreatorListMembershipFilterEffect />
        <QueryFilterState />
      </>,
    );

    expect(readFilterState()).toEqual({
      currentRecordFilters: [],
      queryOnlyRecordFilters: [],
    });
  });

  it.each([
    [
      'the active index is not Creators',
      nonCreatorObjectMetadataItem,
      'creatorListId=list-id',
    ],
    [
      'the Creator List query parameter is absent',
      creatorObjectMetadataItem,
      '',
    ],
  ])('does not add a filter when %s', (_reason, objectMetadataItem, query) => {
    (useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams(query),
    ]);
    (useRecordIndexIdFromCurrentContextStore as jest.Mock).mockReturnValue({
      recordIndexId: 'creator-index',
      objectMetadataItem,
    });

    renderEffect();

    expect(readFilterState()).toEqual({
      currentRecordFilters: [],
      queryOnlyRecordFilters: [],
    });
  });
});
