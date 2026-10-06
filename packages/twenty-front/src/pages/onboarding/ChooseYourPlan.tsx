import { billingState } from '@/client-config/states/billingState';
import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { MyahSubscribe } from '~/pages/onboarding/MyahSubscribe';
import { onboardingConfigState } from '@/client-config/states/onboardingConfigState';
import { OnboardingPageLoader } from '@/onboarding/components/OnboardingPageLoader';
import { usePlans } from '@/settings/billing/hooks/usePlans';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';
import { UpgradeFreeTrial } from '~/pages/onboarding/UpgradeFreeTrial';

export const ChooseYourPlan = () => {
  const isMyahSubscriptionRequired = useAtomStateValue(
    isMyahSubscriptionRequiredState,
  );
  return isMyahSubscriptionRequired ? (
    <MyahSubscribe />
  ) : (
    <LegacyChooseYourPlan />
  );
};

const LegacyChooseYourPlan = () => {
  const { isPlansLoaded } = usePlans();
  const billing = useAtomStateValue(billingState);
  const onboardingConfig = useAtomStateValue(onboardingConfigState);

  return isDefined(billing) && isPlansLoaded ? (
    <UpgradeFreeTrial
      billing={billing}
      creditsReward={onboardingConfig?.upgradeCreditsReward}
    />
  ) : (
    <OnboardingPageLoader />
  );
};
