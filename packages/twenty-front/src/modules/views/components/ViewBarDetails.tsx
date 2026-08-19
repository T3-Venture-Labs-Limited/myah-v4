import { styled } from '@linaria/react';
import { type ReactNode, useMemo } from 'react';

import { useObjectNameSingularFromPlural } from '@/object-metadata/hooks/useObjectNameSingularFromPlural';
import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { useHandleToggleTrashColumnFilter } from '@/object-record/record-index/hooks/useHandleToggleTrashColumnFilter';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { AdvancedFilterDropdownButton } from '@/views/advanced-filter-chip/components/AdvancedFilterDropdownButton';
import { ViewBarDetailsAddFilterButton } from '@/views/components/ViewBarDetailsAddFilterButton';
import { EditableSortChip } from '@/views/editable-chip/components/EditableSortChip';

import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { currentRecordSortsComponentState } from '@/object-record/record-sort/states/currentRecordSortsComponentState';
import { SoftDeleteFilterChip } from '@/views/components/SoftDeleteFilterChip';
import { useApplyCurrentViewFiltersToCurrentRecordFilters } from '@/views/hooks/useApplyCurrentViewFiltersToCurrentRecordFilters';
import { useApplyCurrentViewSortsToCurrentRecordSorts } from '@/views/hooks/useApplyCurrentViewSortsToCurrentRecordSorts';
import { useAreViewFiltersDifferentFromRecordFilters } from '@/views/hooks/useAreViewFiltersDifferentFromRecordFilters';
import { useAreViewSortsDifferentFromRecordSorts } from '@/views/hooks/useAreViewSortsDifferentFromRecordSorts';

import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useCheckIsSoftDeleteFilter } from '@/object-record/record-filter/hooks/useCheckIsSoftDeleteFilter';
import { anyFieldFilterValueComponentState } from '@/object-record/record-filter/states/anyFieldFilterValueComponentState';
import { isDropdownOpenComponentState } from '@/ui/layout/dropdown/states/isDropdownOpenComponentState';
import { ScrollWrapper } from '@/ui/utilities/scroll/components/ScrollWrapper';
import { AnyFieldSearchDropdownButton } from '@/views/components/AnyFieldSearchDropdownButton';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { EditableFilterDropdownButton } from '@/views/editable-chip/components/EditableFilterDropdownButton';
import { getEditableChipObjectFilterDropdownComponentInstanceId } from '@/views/editable-chip/utils/getEditableChipObjectFilterDropdownComponentInstanceId';
import { useHasFiltersInQueryParams } from '@/views/hooks/internal/useHasFiltersInQueryParams';
import { useApplyCurrentViewAnyFieldFilterToAnyFieldFilter } from '@/views/hooks/useApplyCurrentViewAnyFieldFilterToAnyFieldFilter';
import { useApplyCurrentViewFilterGroupsToCurrentRecordFilterGroups } from '@/views/hooks/useApplyCurrentViewFilterGroupsToCurrentRecordFilterGroups';
import { useAreViewFilterGroupsDifferentFromRecordFilterGroups } from '@/views/hooks/useAreViewFilterGroupsDifferentFromRecordFilterGroups';
import { useIsViewAnyFieldFilterDifferentFromCurrentAnyFieldFilter } from '@/views/hooks/useIsViewAnyFieldFilterDifferentFromCurrentAnyFieldFilter';
import { isViewBarExpandedComponentState } from '@/views/states/isViewBarExpandedComponentState';
import { t } from '@lingui/core/macro';
import { isNonEmptyArray, isNonEmptyString } from '@sniptt/guards';
import { isDefined, jsonRelationFilterValueSchema } from 'twenty-shared/utils';
import { LightButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export type ViewBarDetailsProps = {
  hasFilterButton?: boolean;
  hideQueryOnlyRecordFilters?: boolean;
  hideCurrentRecordFilter?: Pick<
    RecordFilter,
    'fieldMetadataId' | 'relationTargetFieldMetadataId' | 'operand'
  >;
  rightComponent?: ReactNode;
  viewBarId: string;
  objectNamePlural: string;
};

const StyledBar = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  min-height: 32px;
  padding-bottom: ${themeCssVariables.spacing[1]};
  padding-top: ${themeCssVariables.spacing[1]};
  z-index: 4;
`;

const StyledChipContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[2]};
  z-index: 1;
`;

const StyledActionButtonContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledFilterContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};

  overflow-x: hidden;
`;

const StyledSeparatorContainer = styled.div`
  align-items: flex-start;
  align-self: stretch;
  display: flex;
  padding-bottom: ${themeCssVariables.spacing[2]};
  padding-left: ${themeCssVariables.spacing[1]};
  padding-right: ${themeCssVariables.spacing[1]};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledSeparator = styled.div`
  align-self: stretch;
  background: ${themeCssVariables.background.quaternary};
  width: 1px;
`;

const StyledAddFilterContainer = styled.div`
  z-index: 5;
`;

export const ViewBarDetails = ({
  hasFilterButton = false,
  hideCurrentRecordFilter,
  hideQueryOnlyRecordFilters = false,
  rightComponent,
  viewBarId,
  objectNamePlural,
}: ViewBarDetailsProps) => {
  const isViewBarExpanded = useAtomComponentStateValue(
    isViewBarExpandedComponentState,
  );

  const { hasFiltersQueryParams } = useHasFiltersInQueryParams();

  const currentRecordFilterGroups = useAtomComponentStateValue(
    currentRecordFilterGroupsComponentState,
    viewBarId,
  );

  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    viewBarId,
  );
  const queryOnlyRecordFilters = useAtomComponentStateValue(
    queryOnlyRecordFiltersComponentState,
    viewBarId,
  );

  const currentRecordSorts = useAtomComponentStateValue(
    currentRecordSortsComponentState,
    viewBarId,
  );

  const anyFieldFilterValue = useAtomComponentStateValue(
    anyFieldFilterValueComponentState,
    viewBarId,
  );

  const { objectNameSingular } = useObjectNameSingularFromPlural({
    objectNamePlural: objectNamePlural,
  });
  const { toggleSoftDeleteFilterState } = useHandleToggleTrashColumnFilter({
    objectNameSingular: objectNameSingular,
    viewBarId: viewBarId,
  });

  const { viewFilterGroupsAreDifferentFromRecordFilterGroups } =
    useAreViewFilterGroupsDifferentFromRecordFilterGroups();

  const { viewFiltersAreDifferentFromRecordFilters } =
    useAreViewFiltersDifferentFromRecordFilters();

  const { viewSortsAreDifferentFromRecordSorts } =
    useAreViewSortsDifferentFromRecordSorts();

  const { viewAnyFieldFilterDifferentFromCurrentAnyFieldFilter } =
    useIsViewAnyFieldFilterDifferentFromCurrentAnyFieldFilter();

  const { isSeeDeletedRecordsFilter } = useCheckIsSoftDeleteFilter();

  const displayedCurrentRecordFilters = useMemo(() => {
    if (!hideQueryOnlyRecordFilters && !hideCurrentRecordFilter) {
      return currentRecordFilters;
    }

    const queryOnlyRecordFilterIds = new Set(
      queryOnlyRecordFilters.map((recordFilter) => recordFilter.id),
    );

    return currentRecordFilters.filter(
      (recordFilter) =>
        (!hideQueryOnlyRecordFilters ||
          !queryOnlyRecordFilterIds.has(recordFilter.id)) &&
        (!hideCurrentRecordFilter ||
          recordFilter.type !== 'RELATION' ||
          recordFilter.fieldMetadataId !==
            hideCurrentRecordFilter.fieldMetadataId ||
          recordFilter.relationTargetFieldMetadataId !==
            hideCurrentRecordFilter.relationTargetFieldMetadataId ||
          recordFilter.operand !== hideCurrentRecordFilter.operand ||
          jsonRelationFilterValueSchema.safeParse(recordFilter.value).data
            ?.isCurrentRecordSelected !== true),
    );
  }, [
    currentRecordFilters,
    hideCurrentRecordFilter,
    hideQueryOnlyRecordFilters,
    queryOnlyRecordFilters,
  ]);

  const allSoftDeletedRecordsFilter = displayedCurrentRecordFilters.find(
    (recordFilter) => isSeeDeletedRecordsFilter(recordFilter),
  );

  const displayedRecordFilters = useMemo(() => {
    return displayedCurrentRecordFilters.filter(
      (recordFilter) =>
        !recordFilter.recordFilterGroupId &&
        !isSeeDeletedRecordsFilter(recordFilter),
    );
  }, [displayedCurrentRecordFilters, isSeeDeletedRecordsFilter]);

  const { applyCurrentViewFilterGroupsToCurrentRecordFilterGroups } =
    useApplyCurrentViewFilterGroupsToCurrentRecordFilterGroups();

  const { applyCurrentViewFiltersToCurrentRecordFilters } =
    useApplyCurrentViewFiltersToCurrentRecordFilters();

  const { applyCurrentViewAnyFieldFilterToAnyFieldFilter } =
    useApplyCurrentViewAnyFieldFilterToAnyFieldFilter();

  const { applyCurrentViewSortsToCurrentRecordSorts } =
    useApplyCurrentViewSortsToCurrentRecordSorts();

  const handleCancelClick = () => {
    applyCurrentViewFilterGroupsToCurrentRecordFilterGroups();
    applyCurrentViewFiltersToCurrentRecordFilters();
    applyCurrentViewSortsToCurrentRecordSorts();
    applyCurrentViewAnyFieldFilterToAnyFieldFilter();
    toggleSoftDeleteFilterState(false);
  };

  const shouldShowAdvancedFilterDropdownButton =
    currentRecordFilterGroups.length > 0;

  const { anyFieldSearchDropdownId } = useViewBarControlIds();

  const isDropdownOpen = useAtomComponentStateValue(
    isDropdownOpenComponentState,
    anyFieldSearchDropdownId,
  );

  const canResetView =
    (viewFiltersAreDifferentFromRecordFilters ||
      viewSortsAreDifferentFromRecordSorts ||
      viewFilterGroupsAreDifferentFromRecordFilterGroups ||
      viewAnyFieldFilterDifferentFromCurrentAnyFieldFilter) &&
    !hasFiltersQueryParams;

  const shouldShowAnyFieldSearchChip =
    isNonEmptyString(anyFieldFilterValue) || isDropdownOpen;

  const shouldExpandViewBar =
    shouldShowAnyFieldSearchChip ||
    viewFiltersAreDifferentFromRecordFilters ||
    viewSortsAreDifferentFromRecordSorts ||
    viewFilterGroupsAreDifferentFromRecordFilterGroups ||
    viewAnyFieldFilterDifferentFromCurrentAnyFieldFilter ||
    ((currentRecordSorts.length > 0 ||
      displayedCurrentRecordFilters.length > 0 ||
      currentRecordFilterGroups.length > 0) &&
      isViewBarExpanded);

  if (!shouldExpandViewBar) {
    return null;
  }

  return (
    <StyledBar>
      <StyledFilterContainer>
        <ScrollWrapper
          componentInstanceId={viewBarId}
          defaultEnableYScroll={false}
        >
          <StyledChipContainer>
            {isDefined(allSoftDeletedRecordsFilter) && (
              <SoftDeleteFilterChip
                key={allSoftDeletedRecordsFilter.fieldMetadataId}
                recordFilter={allSoftDeletedRecordsFilter}
                viewBarId={viewBarId}
              />
            )}
            {isDefined(allSoftDeletedRecordsFilter) && (
              <StyledSeparatorContainer>
                <StyledSeparator />
              </StyledSeparatorContainer>
            )}
            {currentRecordSorts.map((recordSort) => (
              <EditableSortChip
                key={recordSort.fieldMetadataId}
                recordSort={recordSort}
              />
            ))}
            {isNonEmptyArray(displayedRecordFilters) &&
              isNonEmptyArray(currentRecordSorts) && (
                <StyledSeparatorContainer>
                  <StyledSeparator />
                </StyledSeparatorContainer>
              )}
            {shouldShowAnyFieldSearchChip && <AnyFieldSearchDropdownButton />}
            {shouldShowAdvancedFilterDropdownButton && (
              <AdvancedFilterDropdownButton />
            )}
            {displayedRecordFilters.map((recordFilter) => (
              <ObjectFilterDropdownComponentInstanceContext.Provider
                key={recordFilter.id}
                value={{
                  instanceId:
                    getEditableChipObjectFilterDropdownComponentInstanceId({
                      recordFilterId: recordFilter.id,
                    }),
                }}
              >
                <EditableFilterDropdownButton recordFilter={recordFilter} />
              </ObjectFilterDropdownComponentInstanceContext.Provider>
            ))}
          </StyledChipContainer>
        </ScrollWrapper>
        {hasFilterButton && (
          <StyledAddFilterContainer>
            <ViewBarDetailsAddFilterButton />
          </StyledAddFilterContainer>
        )}
      </StyledFilterContainer>
      <StyledActionButtonContainer>
        {canResetView && (
          <LightButton
            data-testid="cancel-button"
            accent="tertiary"
            title={t`Reset`}
            onClick={handleCancelClick}
          />
        )}
        {rightComponent}
      </StyledActionButtonContainer>
    </StyledBar>
  );
};
