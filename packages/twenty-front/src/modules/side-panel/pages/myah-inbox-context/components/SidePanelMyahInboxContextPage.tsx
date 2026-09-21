import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { myahInboxContextState } from '@/myah/inbox/states/myahInboxContextState';
import { myahInboxContactSelectionState } from '@/myah/inbox/states/myahInboxSelectionState';
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
  const myahInboxContactSelection = useAtomStateValue(
    myahInboxContactSelectionState,
  );
  const { pathname } = useLocation();
  const contact = myahInboxContext?.contact;

  if (
    pathname !== '/myah/inbox' ||
    !currentWorkspace?.id ||
    !myahInboxContext ||
    !contact ||
    myahInboxContext.workspaceId !== currentWorkspace.id ||
    myahInboxContactSelection.workspaceId !== currentWorkspace.id ||
    myahInboxContactSelection.contactId !== contact.id
  ) {
    return (
      <StyledStatus>Select a contact to view Creator context.</StyledStatus>
    );
  }

  return (
    <MyahInboxContextPanel
      key={`${currentWorkspace.id}:${contact.id}`}
      creator={contact.creator}
    />
  );
};
