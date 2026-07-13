import { styled } from '@linaria/react';
import {
  themeCssVariables,
  useThemeColorScheme,
} from 'twenty-ui/theme-constants';

const INVERTED_LOGO_STYLE = { filter: 'invert(1)' };

const StyledLogo = styled.img`
  animation: onboardingPulsingLogo 0.8s ease-in-out infinite alternate;
  height: ${themeCssVariables.spacing[12]};
  margin-bottom: ${themeCssVariables.spacing[8]};
  width: ${themeCssVariables.spacing[12]};

  @keyframes onboardingPulsingLogo {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 1;
  }
`;

export const OnboardingPulsingLogo = () => {
  const colorScheme = useThemeColorScheme();

  return (
    <StyledLogo
      alt=""
      src="/images/integrations/myah-mark.svg"
      style={colorScheme === 'dark' ? INVERTED_LOGO_STYLE : undefined}
    />
  );
};
