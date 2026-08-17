import { render, screen } from '@testing-library/react';

import { ViewBarDetails } from '@/views/components/ViewBarDetails';

const queryOnlyCampaignFilter = {
  id: 'campaign-scope-filter',
  fieldMetadataId: 'campaign-field',
  label: 'Campaign',
};

const userStatusFilter = {
  id: 'status-filter',
  fieldMetadataId: 'status-field',
  label: 'Status',
};

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (componentState: { key: string }) => {
      switch (componentState.key) {
        case 'currentRecordFiltersComponentState':
          return [queryOnlyCampaignFilter, userStatusFilter];
        case 'queryOnlyRecordFiltersComponentState':
          return [queryOnlyCampaignFilter];
        case 'isViewBarExpandedComponentState':
          return true;
        default:
          return [];
      }
    },
  }),
);

jest.mock('@/object-metadata/hooks/useObjectNameSingularFromPlural', () => ({
  useObjectNameSingularFromPlural: () => ({ objectNameSingular: 'creator' }),
}));

jest.mock(
  '@/object-record/record-filter/hooks/useCheckIsSoftDeleteFilter',
  () => ({
    useCheckIsSoftDeleteFilter: () => ({
      isSeeDeletedRecordsFilter: () => false,
    }),
  }),
);

jest.mock(
  '@/object-record/record-index/hooks/useHandleToggleTrashColumnFilter',
  () => ({
    useHandleToggleTrashColumnFilter: () => ({
      toggleSoftDeleteFilterState: jest.fn(),
    }),
  }),
);

jest.mock('@/views/hooks/internal/useHasFiltersInQueryParams', () => ({
  useHasFiltersInQueryParams: () => ({ hasFiltersQueryParams: false }),
}));

jest.mock(
  '@/views/hooks/useAreViewFilterGroupsDifferentFromRecordFilterGroups',
  () => ({
    useAreViewFilterGroupsDifferentFromRecordFilterGroups: () => ({
      viewFilterGroupsAreDifferentFromRecordFilterGroups: false,
    }),
  }),
);

jest.mock('@/views/hooks/useAreViewFiltersDifferentFromRecordFilters', () => ({
  useAreViewFiltersDifferentFromRecordFilters: () => ({
    viewFiltersAreDifferentFromRecordFilters: false,
  }),
}));

jest.mock('@/views/hooks/useAreViewSortsDifferentFromRecordSorts', () => ({
  useAreViewSortsDifferentFromRecordSorts: () => ({
    viewSortsAreDifferentFromRecordSorts: false,
  }),
}));

jest.mock(
  '@/views/hooks/useIsViewAnyFieldFilterDifferentFromCurrentAnyFieldFilter',
  () => ({
    useIsViewAnyFieldFilterDifferentFromCurrentAnyFieldFilter: () => ({
      viewAnyFieldFilterDifferentFromCurrentAnyFieldFilter: false,
    }),
  }),
);

jest.mock('@/views/hooks/useApplyCurrentViewFilterGroupsToCurrentRecordFilterGroups', () => ({
  useApplyCurrentViewFilterGroupsToCurrentRecordFilterGroups: () => ({
    applyCurrentViewFilterGroupsToCurrentRecordFilterGroups: jest.fn(),
  }),
}));

jest.mock('@/views/hooks/useApplyCurrentViewFiltersToCurrentRecordFilters', () => ({
  useApplyCurrentViewFiltersToCurrentRecordFilters: () => ({
    applyCurrentViewFiltersToCurrentRecordFilters: jest.fn(),
  }),
}));

jest.mock('@/views/hooks/useApplyCurrentViewAnyFieldFilterToAnyFieldFilter', () => ({
  useApplyCurrentViewAnyFieldFilterToAnyFieldFilter: () => ({
    applyCurrentViewAnyFieldFilterToAnyFieldFilter: jest.fn(),
  }),
}));

jest.mock('@/views/hooks/useApplyCurrentViewSortsToCurrentRecordSorts', () => ({
  useApplyCurrentViewSortsToCurrentRecordSorts: () => ({
    applyCurrentViewSortsToCurrentRecordSorts: jest.fn(),
  }),
}));

jest.mock('@/views/contexts/ViewBarControlIdsContext', () => ({
  useViewBarControlIds: () => ({ anyFieldSearchDropdownId: 'any-field' }),
}));

jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/views/editable-chip/components/EditableFilterDropdownButton', () => ({
  EditableFilterDropdownButton: ({
    recordFilter,
  }: {
    recordFilter: { label: string };
  }) => <div>{recordFilter.label}</div>,
}));

jest.mock('@/views/components/ViewBarDetailsAddFilterButton', () => ({
  ViewBarDetailsAddFilterButton: () => <button>Add filter</button>,
}));

jest.mock('@/views/editable-chip/components/EditableSortChip', () => ({
  EditableSortChip: () => null,
}));

jest.mock('@/views/components/SoftDeleteFilterChip', () => ({
  SoftDeleteFilterChip: () => null,
}));

jest.mock('@/views/components/AnyFieldSearchDropdownButton', () => ({
  AnyFieldSearchDropdownButton: () => null,
}));

jest.mock('@/views/advanced-filter-chip/components/AdvancedFilterDropdownButton', () => ({
  AdvancedFilterDropdownButton: () => null,
}));

describe('ViewBarDetails', () => {
  it('hides query-only filter chips while retaining user filters', () => {
    render(
      <ViewBarDetails
        hideQueryOnlyRecordFilters
        hasFilterButton={false}
        viewBarId="campaign-influencers"
        objectNamePlural="creators"
      />,
    );

    expect(screen.queryByText('Campaign')).not.toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add filter' })).not.toBeInTheDocument();
  });

  it('shows query-only filter chips unless explicitly hidden', () => {
    render(
      <ViewBarDetails
        hasFilterButton={false}
        viewBarId="campaign-influencers"
        objectNamePlural="creators"
      />,
    );

    expect(screen.getByText('Campaign')).toBeInTheDocument();
  });
});
