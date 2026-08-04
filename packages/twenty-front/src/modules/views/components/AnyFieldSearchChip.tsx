import { anyFieldFilterValueComponentState } from '@/object-record/record-filter/states/anyFieldFilterValueComponentState';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentState';
import { SortOrFilterChip } from '@/views/components/SortOrFilterChip';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { useLingui } from '@lingui/react/macro';
import { IconFilter } from 'twenty-ui/icon';

export const AnyFieldSearchChip = () => {
  const { advancedFilterDropdownId } = useViewBarControlIds();
  const { t } = useLingui();

  const { closeDropdown } = useCloseDropdown();

  const [anyFieldFilterValue, setAnyFieldFilterValue] = useAtomComponentState(
    anyFieldFilterValueComponentState,
  );

  const handleRemoveClick = () => {
    closeDropdown();
    setAnyFieldFilterValue('');
  };

  return (
    <SortOrFilterChip
      testId={advancedFilterDropdownId}
      labelKey={t`Any field`}
      labelValue={`: ${anyFieldFilterValue}`}
      Icon={IconFilter}
      onRemove={handleRemoveClick}
      type="filter"
    />
  );
};
