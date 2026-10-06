import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahSubscriptionRefreshEffect } from '@/settings/billing/components/MyahSubscriptionRefreshEffect';
import { myahSubscriptionRefreshRequestedState } from '@/settings/billing/states/myahSubscriptionRefreshRequestedState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { usePageChangeEffectNavigateLocation } from '~/hooks/usePageChangeEffectNavigateLocation';
import {
  GetCurrentUserDocument,
  OnboardingStatus,
} from '~/generated-metadata/graphql';
import {
  mockedUserData,
  mockCurrentWorkspace,
} from '~/testing/mock-data/users';
import { AppPath } from 'twenty-shared/types';

const mockClient = { query: jest.fn() };
const mockSnackBar = { enqueueErrorSnackBar: jest.fn() };
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
  useQuery: () => ({ loading: false }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => mockSnackBar,
}));
jest.mock('@/auth/hooks/useHasAccessTokenPair', () => ({
  useHasAccessTokenPair: () => true,
}));
jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: () => ({ isOnAWorkspace: true }),
}));
jest.mock('@/workspace/hooks/useIsWorkspaceActivationStatusEqualsTo', () => ({
  useIsWorkspaceActivationStatusEqualsTo: () => false,
}));
jest.mock('@/navigation/hooks/useDefaultHomePagePath', () => ({
  useDefaultHomePagePath: () => ({ defaultHomePagePath: '/myah/inbox' }),
}));

const Destination = () => (
  <output data-testid="destination">
    {usePageChangeEffectNavigateLocation()}
  </output>
);
const currentUser = {
  ...mockedUserData,
  currentWorkspace: mockCurrentWorkspace,
  onboardingStatus: OnboardingStatus.COMPLETED,
};
const mount = () =>
  render(
    <Provider store={jotaiStore}>
      <MemoryRouter initialEntries={['/myah/inbox']}>
        <MyahSubscriptionRefreshEffect />
        <Destination />
      </MemoryRouter>
    </Provider>,
  );

beforeEach(() => {
  resetJotaiStore();
  jest.clearAllMocks();
  jotaiStore.set(currentUserState.atom, currentUser);
  jotaiStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
});

it('reloads current user after a subscription refusal and selects the existing paywall redirect', async () => {
  mockClient.query.mockResolvedValue({
    data: {
      currentUser: {
        ...currentUser,
        onboardingStatus: OnboardingStatus.PLAN_REQUIRED,
      },
    },
  });
  jotaiStore.set(myahSubscriptionRefreshRequestedState.atom, true);
  mount();
  await waitFor(() =>
    expect(screen.getByTestId('destination')).toHaveTextContent(
      AppPath.PlanRequired,
    ),
  );
  expect(mockClient.query).toHaveBeenCalledWith({
    query: GetCurrentUserDocument,
    fetchPolicy: 'network-only',
  });
  expect(jotaiStore.get(myahSubscriptionRefreshRequestedState.atom)).toBe(
    false,
  );
});

it('does not refresh normally or overwrite the active workspace with a mismatched response', async () => {
  const view = mount();
  expect(mockClient.query).not.toHaveBeenCalled();
  view.unmount();
  mockClient.query.mockResolvedValue({
    data: {
      currentUser: {
        ...currentUser,
        currentWorkspace: {
          ...mockCurrentWorkspace,
          id: 'different-workspace',
        },
        onboardingStatus: OnboardingStatus.PLAN_REQUIRED,
      },
    },
  });
  jotaiStore.set(myahSubscriptionRefreshRequestedState.atom, true);
  mount();
  await waitFor(() =>
    expect(jotaiStore.get(myahSubscriptionRefreshRequestedState.atom)).toBe(
      false,
    ),
  );
  expect(jotaiStore.get(currentUserState.atom)?.onboardingStatus).toBe(
    OnboardingStatus.COMPLETED,
  );
});

it('reports a reload failure without treating exhaustion as loss of access', async () => {
  mockClient.query.mockRejectedValue(new Error('Offline'));
  jotaiStore.set(myahSubscriptionRefreshRequestedState.atom, true);
  mount();
  await waitFor(() =>
    expect(mockSnackBar.enqueueErrorSnackBar).toHaveBeenCalled(),
  );
  expect(jotaiStore.get(currentUserState.atom)?.onboardingStatus).toBe(
    OnboardingStatus.COMPLETED,
  );
});
