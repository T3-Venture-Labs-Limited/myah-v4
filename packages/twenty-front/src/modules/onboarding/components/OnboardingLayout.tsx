import { OnboardingHeader } from '@/onboarding/components/OnboardingHeader';
import { styled } from '@linaria/react';
import { type ReactNode } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledBackground = styled.div`
  background: ${themeCssVariables.background.secondary};
  display: flex;
  flex-direction: column;
  height: 100dvh;
  width: 100%;
`;

type OnboardingLayoutProps = {
  children: ReactNode;
  onBack?: () => void;
  freeCredits?: number;
  hideHeader?: boolean;
};

export const OnboardingLayout = ({
  children,
  onBack,
  freeCredits,
  hideHeader = false,
}: OnboardingLayoutProps) => (
  <StyledBackground>
    {!hideHeader && (
      <OnboardingHeader onBack={onBack} freeCredits={freeCredits} />
    )}
    {children}
  </StyledBackground>
);
