import { styled } from '@linaria/react';
import React from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledInputErrorHelper = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.xs};
  margin-top: 1px;
  position: absolute;
`;

type InputErrorHelperProps = {
  children?: React.ReactNode;
  id?: string;
};

export const InputErrorHelper = ({ children, id }: InputErrorHelperProps) => (
  <div>
    {isDefined(children) && (
      <StyledInputErrorHelper id={id} aria-live="polite">
        {children}
      </StyledInputErrorHelper>
    )}
  </div>
);
