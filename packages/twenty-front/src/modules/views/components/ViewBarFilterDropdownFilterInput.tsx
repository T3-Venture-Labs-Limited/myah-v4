import { ObjectFilterDropdownContentWrapper } from '@/object-record/object-filter-dropdown/components/ObjectFilterDropdownContentWrapper';
import { ObjectFilterDropdownFilterInput } from '@/object-record/object-filter-dropdown/components/ObjectFilterDropdownFilterInput';
import { ViewBarFilterDropdownFilterInputMenuHeader } from '@/views/components/ViewBarFilterDropdownFilterInputMenuHeader';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';

type ViewBarFilterDropdownFilterInputProps = {
  recordFilterId?: string;
};

export const ViewBarFilterDropdownFilterInput = ({
  recordFilterId,
}: ViewBarFilterDropdownFilterInputProps) => {
  const { filterDropdownId } = useViewBarControlIds();
  return (
    <ObjectFilterDropdownContentWrapper>
      <ViewBarFilterDropdownFilterInputMenuHeader />
      <ObjectFilterDropdownFilterInput
        filterDropdownId={filterDropdownId}
        recordFilterId={recordFilterId}
      />
    </ObjectFilterDropdownContentWrapper>
  );
};
