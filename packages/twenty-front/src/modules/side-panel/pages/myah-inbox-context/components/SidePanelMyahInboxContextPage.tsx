import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { myahInboxContextState } from '@/myah/inbox/states/myahInboxContextState';
import {
  myahInboxSelectedThreadIdState,
  myahInboxSelectionWorkspaceIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLocation } from 'react-router-dom';

import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]};
`;

export const SidePanelMyahInboxContextPage = () => {
  const myahInboxContext = useAtomStateValue(myahInboxContextState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const myahInboxSelectedThreadId = useAtomStateValue(
    myahInboxSelectedThreadIdState,
  );
  const myahInboxSelectionWorkspaceId = useAtomStateValue(
    myahInboxSelectionWorkspaceIdState,
  );
  const { pathname } = useLocation();
  const thread = myahInboxContext?.thread;

  if (
    pathname !== '/myah/inbox' ||
    !currentWorkspace?.id ||
    !myahInboxContext ||
    !thread ||
    myahInboxContext.workspaceId !== currentWorkspace.id ||
    myahInboxSelectionWorkspaceId !== currentWorkspace.id ||
    myahInboxSelectedThreadId !== thread.id
  ) {
    return <StyledStatus>No conversation selected.</StyledStatus>;
  }

  return (
    <MyahInboxContextPanel
      key={`${currentWorkspace.id}:${thread.id}`}
      thread={thread}
    />
  );
};
