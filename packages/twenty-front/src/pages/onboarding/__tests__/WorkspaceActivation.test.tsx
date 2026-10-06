import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { Provider } from 'jotai';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { WorkspaceActivation } from '~/pages/onboarding/WorkspaceActivation';
import { OnboardingStatus } from '~/generated-metadata/graphql';
import {
  mockedUserData,
  mockCurrentWorkspace,
} from '~/testing/mock-data/users';

const mockActivate = jest.fn();
const mockLoadCurrentUser = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockActivate, { loading: false }],
}));
jest.mock('@/users/hooks/useLoadCurrentUser', () => ({
  useLoadCurrentUser: () => ({ loadCurrentUser: mockLoadCurrentUser }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

it('keeps the server PLAN_REQUIRED status after activating a new workspace, including StrictMode', async () => {
  resetJotaiStore();
  jotaiStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
  jotaiStore.set(currentUserState.atom, {
    ...mockedUserData,
    onboardingStatus: OnboardingStatus.WORKSPACE_ACTIVATION,
  });
  mockActivate.mockResolvedValue({ data: {} });
  mockLoadCurrentUser.mockImplementation(async () => {
    jotaiStore.set(currentUserState.atom, {
      ...mockedUserData,
      onboardingStatus: OnboardingStatus.PLAN_REQUIRED,
    });
  });
  render(
    <StrictMode>
      <Provider store={jotaiStore}>
        <I18nProvider i18n={i18n}>
          <WorkspaceActivation />
        </I18nProvider>
      </Provider>
    </StrictMode>,
  );
  await waitFor(() =>
    expect(jotaiStore.get(currentUserState.atom)?.onboardingStatus).toBe(
      OnboardingStatus.PLAN_REQUIRED,
    ),
  );
  expect(mockActivate).toHaveBeenCalledTimes(1);
  expect(mockLoadCurrentUser).toHaveBeenCalledTimes(1);
});
