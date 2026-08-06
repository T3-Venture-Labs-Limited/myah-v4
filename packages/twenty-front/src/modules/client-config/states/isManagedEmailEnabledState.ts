import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const isManagedEmailEnabledState = createAtomState<boolean>({
  key: 'isManagedEmailEnabled',
  defaultValue: false,
});
