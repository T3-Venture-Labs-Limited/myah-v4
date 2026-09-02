import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { styled } from '@linaria/react';
import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { IconChevronDown } from 'twenty-ui/icon';
import { TabButton } from 'twenty-ui/input';

import { TAB_LIST_HEIGHT } from '@/ui/layout/tab-list/constants/TabListHeight';

const StyledTabMoreButtonContainer = styled.div`
  display: flex;
  height: ${TAB_LIST_HEIGHT};
`;

export const tabMoreLabel = msg`More`;

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
        title={`+${hiddenTabsCount} ${i18n._(tabMoreLabel)}`}
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
