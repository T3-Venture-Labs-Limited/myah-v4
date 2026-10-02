import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';

export const composeEmailCreatorIdComponentState = createAtomComponentState<
  string | null
>({
  key: 'side-panel/compose-email-creator-id',
  defaultValue: null,
  componentInstanceContext: SidePanelPageComponentInstanceContext,
});
