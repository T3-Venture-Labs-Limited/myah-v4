import { currentUserState } from '@/auth/states/currentUserState';
import { isMyahTeamUser } from '@/auth/utils/isMyahTeamUser';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useIsMyahTeamUser = () => {
  const currentUser = useAtomStateValue(currentUserState);

  return isMyahTeamUser({ user: currentUser });
};
