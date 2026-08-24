import { currentUserState } from '@/auth/states/currentUserState';
import { getMyahEntryPath } from '@/myah/navigation/myah-navigation-registry';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export const useDefaultHomePagePath = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const defaultHomePagePath = isDefined(currentUser)
    ? getMyahEntryPath('inbox')
    : AppPath.SignInUp;

  return { defaultHomePagePath };
};
