import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

// Shared by the Email subject selector and the Instagram Campaign context
// selector so both channels render the exact same center-footer footprint
// instead of channel-specific copied dimensions.
export const StyledMyahInboxReplyCenterContext = styled.div`
  justify-self: center;
  max-width: 100%;
  min-width: 0;

  > span {
    color: ${themeCssVariables.font.color.secondary};
    display: block;
    font-size: ${themeCssVariables.font.size.sm};
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
