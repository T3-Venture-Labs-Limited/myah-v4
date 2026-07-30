import { type IconComponent } from '@ui/icon';
import { AppTooltip, TooltipDelay } from '@ui/surfaces';
import {
  StyledTabButton,
  StyledTabContainer,
} from '@ui/input/TabButton/parts/StyledTabBase';
import {
  TabContent,
  type TabContentProps,
} from '@ui/input/TabButton/parts/TabContent';
import {
  type AriaRole,
  type KeyboardEventHandler,
  type ReactElement,
} from 'react';

import styles from './TabButton.module.scss';

export { StyledTabContainer, TabContent };
export type { TabContentProps };

type TabButtonProps = {
  id: string;
  active?: boolean;
  disabled?: boolean;
  to?: string;
  role?: AriaRole;
  ariaSelected?: boolean;
  'aria-controls'?: string;
  tabIndex?: number;
  LeftIcon?: IconComponent;
  className?: string;
  title?: string;
  onClick?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  logo?: string;
  RightIcon?: IconComponent;
  pill?: string | ReactElement;
  contentSize?: 'sm' | 'md';
  disableTestId?: boolean;
  tooltipContent?: string;
};

export const TabButton = ({
  id,
  active,
  disabled,
  to,
  role,
  ariaSelected,
  'aria-controls': ariaControls,
  tabIndex,
  LeftIcon,
  className,
  title,
  onClick,
  onKeyDown,
  logo,
  RightIcon,
  pill,
  contentSize = 'sm',
  disableTestId = false,
  tooltipContent,
}: TabButtonProps) => {
  const tabElementId = `tab-${id}`;

  return (
    <div className={styles.tabTooltipWrapper}>
      <StyledTabButton
        id={tabElementId}
        role={role}
        aria-selected={ariaSelected}
        aria-controls={ariaControls}
        tabIndex={tabIndex}
        data-testid={disableTestId ? undefined : `tab-${id}`}
        active={active}
        disabled={disabled}
        to={to}
        className={className}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <TabContent
          id={id}
          active={active}
          disabled={disabled}
          LeftIcon={LeftIcon}
          title={title}
          logo={logo}
          RightIcon={RightIcon}
          pill={pill}
          contentSize={contentSize}
        />
      </StyledTabButton>
      {tooltipContent && (
        <AppTooltip
          anchorSelect={`#${tabElementId}`}
          content={tooltipContent}
          noArrow
          place="bottom"
          positionStrategy="fixed"
          delay={TooltipDelay.shortDelay}
        />
      )}
    </div>
  );
};
