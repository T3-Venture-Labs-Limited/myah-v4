import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';

export const shouldCloseAfterCreationComponentState =
  createAtomComponentState<boolean>({
    key: 'side-panel/should-close-after-creation',
    defaultValue: false,
    componentInstanceContext: SidePanelPageComponentInstanceContext,
  });
