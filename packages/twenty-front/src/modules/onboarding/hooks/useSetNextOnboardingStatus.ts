import { isDefined } from 'twenty-shared/utils';

import {
  type CurrentUser,
  currentUserState,
} from '@/auth/states/currentUserState';
import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { billingState } from '@/client-config/states/billingState';
import { calendarBookingPageIdState } from '@/client-config/states/calendarBookingPageIdState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

import { useCallback } from 'react';
import { OnboardingStatus } from '~/generated-metadata/graphql';
import { useStore } from 'jotai';

type GetNextOnboardingStatusArgs = {
  currentUser: CurrentUser | null;
  currentWorkspace: CurrentWorkspace | null;
  calendarBookingPageId: string | null;
  isBillingEnabled: boolean;
  isMyahSubscriptionRequired: boolean;
  myahAccessState: string | undefined;
};

const getNextOnboardingStatus = ({
  currentUser,
  currentWorkspace,
  calendarBookingPageId,
  isBillingEnabled,
  isMyahSubscriptionRequired,
  myahAccessState,
}: GetNextOnboardingStatusArgs) => {
  const isPlanRequired = isMyahSubscriptionRequired
    ? !myahAccessState ||
      ['NEEDS_SUBSCRIPTION', 'LAPSED'].includes(myahAccessState)
    : isBillingEnabled &&
      (currentWorkspace?.billingSubscriptions?.length ?? 0) === 0;

  if (isMyahSubscriptionRequired && isPlanRequired)
    return OnboardingStatus.PLAN_REQUIRED;

  if (currentUser?.onboardingStatus === OnboardingStatus.WORKSPACE_ACTIVATION) {
    return OnboardingStatus.SYNC_EMAIL;
  }

  if (currentUser?.onboardingStatus === OnboardingStatus.SYNC_EMAIL) {
    return OnboardingStatus.PROFILE_CREATION;
  }

  if (currentUser?.onboardingStatus === OnboardingStatus.APPS_INSTALLATION) {
    return OnboardingStatus.PROFILE_CREATION;
  }

  if (currentUser?.onboardingStatus === OnboardingStatus.PROFILE_CREATION) {
    if (currentWorkspace?.workspaceMembersCount === 1) {
      return OnboardingStatus.INVITE_TEAM;
    }
    return isPlanRequired
      ? OnboardingStatus.PLAN_REQUIRED
      : OnboardingStatus.COMPLETED;
  }
  if (currentUser?.onboardingStatus === OnboardingStatus.INVITE_TEAM) {
    if (isPlanRequired) {
      return OnboardingStatus.PLAN_REQUIRED;
    }
    return isDefined(calendarBookingPageId)
      ? OnboardingStatus.BOOK_ONBOARDING
      : OnboardingStatus.COMPLETED;
  }
  if (currentUser?.onboardingStatus === OnboardingStatus.BOOK_ONBOARDING) {
    return isPlanRequired
      ? OnboardingStatus.PLAN_REQUIRED
      : OnboardingStatus.COMPLETED;
  }
  return OnboardingStatus.COMPLETED;
};

export const useSetNextOnboardingStatus = () => {
  const store = useStore();
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const calendarBookingPageId = useAtomStateValue(calendarBookingPageIdState);
  const billing = useAtomStateValue(billingState);
  const isBillingEnabled = billing?.isBillingEnabled ?? false;
  const { isEnabled: isMyahSubscriptionRequired, usage } =
    useMyahWorkspaceUsage();
  const myahAccessState = usage?.state;

  return useCallback(() => {
    const nextOnboardingStatus = getNextOnboardingStatus({
      currentUser,
      currentWorkspace,
      calendarBookingPageId,
      isBillingEnabled,
      isMyahSubscriptionRequired,
      myahAccessState,
    });
    store.set(currentUserState.atom, (current) => {
      if (isDefined(current)) {
        return {
          ...current,
          onboardingStatus: nextOnboardingStatus,
        };
      }
      return current;
    });
  }, [
    currentUser,
    currentWorkspace,
    calendarBookingPageId,
    isBillingEnabled,
    isMyahSubscriptionRequired,
    myahAccessState,
    store,
  ]);
};
