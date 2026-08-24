import { currentUserState } from '@/auth/states/currentUserState';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { AppPath } from 'twenty-shared/types';
import { mockedUserData } from '~/testing/mock-data/users';

const renderDefaultHome = (isAuthenticated: boolean) => {
  const store = createStore();

  store.set(currentUserState.atom, isAuthenticated ? mockedUserData : null);

  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(JotaiProvider, { store }, children);

  return renderHook(() => useDefaultHomePagePath(), { wrapper: Wrapper });
};

describe('useDefaultHomePagePath', () => {
  it('uses sign in when no user is authenticated', () => {
    const { result } = renderDefaultHome(false);

    expect(result.current.defaultHomePagePath).toBe(AppPath.SignInUp);
  });

  it('uses Inbox when a user is authenticated', () => {
    const { result } = renderDefaultHome(true);

    expect(result.current.defaultHomePagePath).toBe('/myah/inbox');
  });
});
