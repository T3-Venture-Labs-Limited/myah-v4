import { act, renderHook } from '@testing-library/react';

import { useIsMyahTeamUser } from '@/auth/hooks/useIsMyahTeamUser';
import {
  currentUserState,
  type CurrentUser,
} from '@/auth/states/currentUserState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { OnboardingStatus } from '~/generated-metadata/graphql';

const createCurrentUser = (isMyahTeamMember: boolean): CurrentUser => ({
  id: 'user-id',
  email: 'operator@t3labs.io',
  supportUserHash: null,
  canAccessFullAdminPanel: false,
  canImpersonate: false,
  isMyahTeamMember,
  onboardingStatus: OnboardingStatus.COMPLETED,
  userVars: {},
  firstName: 'Operator',
  lastName: 'User',
  hasPassword: true,
});

const renderTeamHook = () =>
  renderHook(() => ({
    isMyahTeamUser: useIsMyahTeamUser(),
    setCurrentUser: useSetAtomState(currentUserState),
  }));

describe('useIsMyahTeamUser', () => {
  it('uses the server claim instead of deriving Team identity from email', async () => {
    const { result } = renderTeamHook();

    await act(async () => {
      result.current.setCurrentUser(createCurrentUser(false));
    });

    expect(result.current.isMyahTeamUser).toBe(false);
  });

  it('accepts the server-authorized claim for a Team member', async () => {
    const { result } = renderTeamHook();

    await act(async () => {
      result.current.setCurrentUser(createCurrentUser(true));
    });

    expect(result.current.isMyahTeamUser).toBe(true);
  });
});
