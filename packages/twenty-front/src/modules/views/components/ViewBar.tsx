import { type ReactNode } from 'react';

import { ObjectSortDropdownButton } from '@/object-record/object-sort-dropdown/components/ObjectSortDropdownButton';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { TopBar } from '@/ui/layout/top-bar/components/TopBar';
import { QueryParamsFiltersEffect } from '@/views/components/QueryParamsFiltersEffect';
import { QueryParamsSortsEffect } from '@/views/components/QueryParamsSortsEffect';
import { ViewBarPageTitle } from '@/views/components/ViewBarPageTitle';
import { ViewPickerDropdown } from '@/views/view-picker/components/ViewPickerDropdown';

import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { ObjectSortDropdownComponentInstanceContext } from '@/object-record/object-sort-dropdown/states/context/ObjectSortDropdownComponentInstanceContext';
import { QueryParamsCleanupEffect } from '@/views/components/QueryParamsCleanupEffect';
import { ViewBarAnyFieldFilterEffect } from '@/views/components/ViewBarAnyFieldFilterEffect';
import { ViewBarFilterDropdown } from '@/views/components/ViewBarFilterDropdown';
import { ViewBarRecordFieldEffect } from '@/views/components/ViewBarRecordFieldEffect';
import { ViewBarRecordFilterEffect } from '@/views/components/ViewBarRecordFilterEffect';
import { ViewBarRecordFilterGroupEffect } from '@/views/components/ViewBarRecordFilterGroupEffect';
import { ViewBarRecordSortEffect } from '@/views/components/ViewBarRecordSortEffect';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { type ViewType } from '@/views/types/ViewType';
import { UpdateViewButtonGroup } from './UpdateViewButtonGroup';
import { ViewBarDetails } from './ViewBarDetails';

type ViewBarProps = {
  viewBarId: string;
  className?: string;
  optionsDropdownButton: ReactNode;
  isReadOnly?: boolean;
  onViewChange?: (viewId: string) => void;
  forcedViewType?: ViewType;
  hideQueryOnlyRecordFilters?: boolean;
};

export const ViewBar = ({
  viewBarId,
  className,
  optionsDropdownButton,
  isReadOnly = false,
  onViewChange,
  forcedViewType,
  hideQueryOnlyRecordFilters,
}: ViewBarProps) => {
  const { objectNamePlural } = useRecordIndexContextOrThrow();

  const { filterDropdownId, viewSortDropdownId } = useViewBarControlIds();

  if (!objectNamePlural) {
    return;
  }

  return (
    <>
      {isReadOnly ? (
        <TopBar
          className={className}
          leftComponent={
            <ViewPickerDropdown
              onViewChange={onViewChange}
              forcedViewType={forcedViewType}
            />
          }
        />
      ) : (
        <ObjectSortDropdownComponentInstanceContext.Provider
          value={{ instanceId: viewSortDropdownId }}
        >
          <ViewBarRecordFilterGroupEffect />
          <ViewBarAnyFieldFilterEffect />
          <ViewBarRecordFieldEffect />
          <ViewBarRecordFilterEffect />
          <ViewBarRecordSortEffect />
          <QueryParamsFiltersEffect />
          <QueryParamsSortsEffect />
          <QueryParamsCleanupEffect />
          <ViewBarPageTitle />
          <TopBar
            className={className}
            leftComponent={
              <ViewPickerDropdown
                onViewChange={onViewChange}
                forcedViewType={forcedViewType}
              />
            }
            rightComponent={
              <>
                <ObjectFilterDropdownComponentInstanceContext.Provider
                  value={{ instanceId: filterDropdownId }}
                >
                  <ViewBarFilterDropdown />
                </ObjectFilterDropdownComponentInstanceContext.Provider>
                <ObjectSortDropdownButton />
                {optionsDropdownButton}
              </>
            }
            bottomComponent={
              <ViewBarDetails
                hasFilterButton={!hideQueryOnlyRecordFilters}
                hideQueryOnlyRecordFilters={hideQueryOnlyRecordFilters}
                viewBarId={viewBarId}
                objectNamePlural={objectNamePlural}
                rightComponent={<UpdateViewButtonGroup />}
              />
            }
          />
        </ObjectSortDropdownComponentInstanceContext.Provider>
      )}
    </>
  );
};
