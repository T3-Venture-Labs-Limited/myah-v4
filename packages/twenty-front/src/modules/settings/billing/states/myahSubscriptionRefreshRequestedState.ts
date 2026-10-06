import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const myahSubscriptionRefreshRequestedState = createAtomState<boolean>({
  key: 'myahSubscriptionRefreshRequested',
  defaultValue: false,
});
