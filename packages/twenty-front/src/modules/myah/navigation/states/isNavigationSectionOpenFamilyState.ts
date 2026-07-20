import { type MyahNavigationRouteGroupId } from '@/myah/navigation/types/MyahNavigationRoute';
import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

export const isNavigationSectionOpenFamilyState = createAtomFamilyState<
  boolean,
  MyahNavigationRouteGroupId
>({
  key: 'isNavigationSectionOpenFamilyState',
  defaultValue: true,
});
