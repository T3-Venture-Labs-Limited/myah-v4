import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type SidePanelSearchFocusRestoreTarget = {
  restoreElement: HTMLElement | null;
};

export const sidePanelSearchFocusRestoreElementState =
  createAtomState<SidePanelSearchFocusRestoreTarget | null>({
    key: 'side-panel/sidePanelSearchFocusRestoreElementState',
    defaultValue: null,
  });
