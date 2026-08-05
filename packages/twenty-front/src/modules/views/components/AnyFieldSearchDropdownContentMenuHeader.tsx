import { DropdownMenuHeader } from '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader';
import { DropdownMenuHeaderLeftComponent } from '@/ui/layout/dropdown/components/DropdownMenuHeader/internal/DropdownMenuHeaderLeftComponent';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { useLingui } from '@lingui/react/macro';
import { IconX } from 'twenty-ui/icon';

export const AnyFieldSearchDropdownContentMenuHeader = () => {
  const { t } = useLingui();

  const { anyFieldSearchDropdownId } = useViewBarControlIds();
  const { closeDropdown } = useCloseDropdown();

  const handleBackButtonClick = () => {
    closeDropdown(anyFieldSearchDropdownId);
  };

  return (
    <DropdownMenuHeader
      StartComponent={
        <DropdownMenuHeaderLeftComponent
          onClick={handleBackButtonClick}
          Icon={IconX}
        />
      }
    >
      {t`Search any field`}
    </DropdownMenuHeader>
  );
};
