import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconChevronDown } from 'twenty-ui/icon';
import { TabButton } from 'twenty-ui/input';

import { TAB_LIST_HEIGHT } from '@/ui/layout/tab-list/constants/TabListHeight';

const StyledTabMoreButtonContainer = styled.div`
  display: flex;
  height: ${TAB_LIST_HEIGHT};
`;

type TabMoreButtonProps = {
  hiddenTabsCount: number;
  active: boolean;
  className?: string;
} & Pick<
  ComponentPropsWithoutRef<'button'>,
  'aria-controls' | 'aria-expanded' | 'aria-haspopup' | 'onClick'
>;

export const TabMoreButton = forwardRef<HTMLElement, TabMoreButtonProps>(
  (
    {
      hiddenTabsCount,
      active,
      className,
      'aria-controls': ariaControls,
      'aria-expanded': ariaExpanded,
      'aria-haspopup': ariaHasPopup,
      onClick,
    },
    ref,
  ) => (
    <StyledTabMoreButtonContainer>
      <TabButton
        ref={ref}
        id="tab-more-button"
        active={active}
        title={`+${hiddenTabsCount} ${t`More`}`}
        RightIcon={IconChevronDown}
        className={className}
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHasPopup}
        onClick={onClick}
      />
    </StyledTabMoreButtonContainer>
  ),
);

TabMoreButton.displayName = 'TabMoreButton';
