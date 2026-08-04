import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';
import { myahInboxContextThreadComponentState } from '@/myah/inbox/states/myahInboxContextThreadComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]};
`;

export const SidePanelMyahInboxContextPage = () => {
  const myahInboxContextThread = useAtomComponentStateValue(
    myahInboxContextThreadComponentState,
  );

  if (!myahInboxContextThread) {
    return <StyledStatus>No conversation selected.</StyledStatus>;
  }

  return <MyahInboxContextPanel thread={myahInboxContextThread} />;
};
