import { styled } from '@linaria/react';
import React from 'react';

import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';

import { MOBILE_VIEWPORT } from 'twenty-ui/theme-constants';
import { Step, type StepProps } from './Step';

const StyledContainer = styled.ol`
  display: flex;
  flex: 1;
  justify-content: space-between;
  list-style: none;
  margin: 0;
  padding: 0;
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    align-items: center;
    justify-content: center;
  }
`;

export type StepBarProps = React.PropsWithChildren &
  React.ComponentProps<'ol'> & {
    activeStep: number;
  };

export const StepBar = ({ activeStep, children, ...props }: StepBarProps) => {
  const isMobile = useIsMobile();
  const stepCount = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child) && child.type === Step,
  ).length;
  let stepIndex = 0;

  return (
    <StyledContainer
      // oxlint-disable-next-line react/jsx-props-no-spreading
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<StepProps>(child) || child.type !== Step) {
          return child;
        }

        const currentStepIndex = stepIndex++;

        return React.cloneElement(child, {
          activeStep,
          index: currentStepIndex,
          isLast: currentStepIndex === stepCount - 1,
          isVisuallyHidden:
            isMobile &&
            (activeStep === -1
              ? currentStepIndex !== 0
              : activeStep !== currentStepIndex),
          totalSteps: stepCount,
        });
      })}
    </StyledContainer>
  );
};

StepBar.Step = Step;
