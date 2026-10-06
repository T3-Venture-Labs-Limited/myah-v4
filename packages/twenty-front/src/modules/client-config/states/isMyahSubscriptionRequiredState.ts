import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const isMyahSubscriptionRequiredState = createAtomState<boolean>({
  key: 'isMyahSubscriptionRequired',
  defaultValue: false,
});
