import { MyahNavigationDrawerSection } from '@/myah/navigation/components/MyahNavigationDrawerSection';

import { styled } from '@linaria/react';

import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledScrollableItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const MainNavigationDrawerScrollableItems = () => {
  return (
    <StyledScrollableItemsContainer>
      <MyahNavigationDrawerSection />
    </StyledScrollableItemsContainer>
  );
};
