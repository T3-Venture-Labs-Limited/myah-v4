import { type AriaRole } from 'react';

import { Tag } from '@ui/data-display';
import { type IconComponent } from '@ui/icon';
import { Checkbox, CheckboxShape, CheckboxSize } from '@ui/input';
import { type ThemeColor } from '@ui/theme';
import {
  StyledMenuItemBase,
  StyledMenuItemLeftContent,
} from '@ui/navigation/MenuItem/parts/StyledMenuItemBase';

type MenuItemMultiSelectTagProps = {
  selected: boolean;
  className?: string;
  isKeySelected?: boolean;
  onClick?: () => void;
  color: ThemeColor | 'transparent';
  text: string;
  Icon?: IconComponent;
  role?: AriaRole;
};

export const MenuItemMultiSelectTag = ({
  color,
  selected,
  className,
  onClick,
  isKeySelected,
  text,
  Icon,
  role,
}: MenuItemMultiSelectTagProps) => {
  return (
    <StyledMenuItemBase
      isKeySelected={isKeySelected}
      onClick={onClick}
      className={className}
      role={role}
      aria-selected={role === 'option' ? selected : undefined}
    >
      <StyledMenuItemLeftContent>
        <Checkbox
          size={CheckboxSize.Small}
          shape={CheckboxShape.Squared}
          checked={selected}
        />
        <Tag color={color} text={text} Icon={Icon} />
      </StyledMenuItemLeftContent>
    </StyledMenuItemBase>
  );
};
