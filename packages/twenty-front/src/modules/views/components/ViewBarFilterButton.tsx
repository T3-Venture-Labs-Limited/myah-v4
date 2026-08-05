import { StyledHeaderDropdownButton } from '@/ui/layout/dropdown/components/StyledHeaderDropdownButton';
import { isDropdownOpenComponentState } from '@/ui/layout/dropdown/states/isDropdownOpenComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { Trans } from '@lingui/react/macro';

export const ViewBarFilterButton = () => {
  const { filterDropdownId } = useViewBarControlIds();
  const isDropdownOpen = useAtomComponentStateValue(
    isDropdownOpenComponentState,
    filterDropdownId,
  );

  return (
    <StyledHeaderDropdownButton isUnfolded={isDropdownOpen}>
      <Trans>Filter</Trans>
    </StyledHeaderDropdownButton>
  );
};
