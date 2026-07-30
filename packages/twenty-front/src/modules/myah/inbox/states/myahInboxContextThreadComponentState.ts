import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';

export const myahInboxContextThreadComponentState =
  createAtomComponentState<MyahInboxThread | null>({
    key: 'myah-inbox/context-thread',
    defaultValue: null,
    componentInstanceContext: SidePanelPageComponentInstanceContext,
  });
