import { CommandMenuOpenContainer } from '@/command-menu/components/CommandMenuOpenContainer';
import { SidePanelRouter } from '@/side-panel/components/SidePanelRouter';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { isSidePanelClosingState } from '@/side-panel/states/isSidePanelClosingState';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { sidePanelPageInfoState } from '@/side-panel/states/sidePanelPageInfoState';
import { useSidePanelCloseAnimationCompleteCleanup } from '@/side-panel/hooks/useSidePanelCloseAnimationCompleteCleanup';
import { useStore } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { SidePanelPages } from 'twenty-shared/types';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';

import { AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

const StyledCommandMenuMobileFullScreenContainer = styled.div`
  height: 100%;
  width: 100%;
`;

export const CommandMenuForMobile = () => {
  const isSidePanelOpened = useAtomStateValue(isSidePanelOpenedState);
  const store = useStore();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { sidePanelCloseAnimationCompleteCleanup } =
    useSidePanelCloseAnimationCompleteCleanup();

  const completeInboxClose = useCallback(
    (pageInfo: { instanceId: string }) => {
      if (
        store.get(sidePanelPageInfoState.atom) === pageInfo &&
        store.get(sidePanelPageState.atom) ===
          SidePanelPages.MyahInboxContext &&
        !store.get(isSidePanelOpenedState.atom) &&
        store.get(isSidePanelClosingState.atom)
      ) {
        sidePanelCloseAnimationCompleteCleanup();
      }
    },
    [sidePanelCloseAnimationCompleteCleanup, store],
  );

  const handleContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      setContainer(element);
      return () => {
        setContainer(null);
        const pageInfo = store.get(sidePanelPageInfoState.atom);
        const wasClosingInbox =
          store.get(sidePanelPageState.atom) ===
            SidePanelPages.MyahInboxContext &&
          !store.get(isSidePanelOpenedState.atom) &&
          store.get(isSidePanelClosingState.atom);
        // Presence can retain the router after opened=false. Reset its instance
        // only after actual disposal, including a breakpoint unmount mid-exit.
        queueMicrotask(() => {
          if (wasClosingInbox && !element.isConnected)
            completeInboxClose(pageInfo);
        });
      };
    },
    [completeInboxClose, store],
  );

  useEffect(() => {
    // Also owns a desktop close interrupted by a switch to mobile before any
    // mobile router mounts. Never clear a retained router's required instance.
    if (!isSidePanelOpened && container === null) {
      completeInboxClose(store.get(sidePanelPageInfoState.atom));
    }
  }, [completeInboxClose, container, isSidePanelOpened, store]);

  return (
    <AnimatePresence>
      {isSidePanelOpened && (
        <>
          {createPortal(
            <StyledCommandMenuMobileFullScreenContainer
              ref={handleContainerRef}
            >
              <CommandMenuOpenContainer>
                <SidePanelRouter />
              </CommandMenuOpenContainer>
            </StyledCommandMenuMobileFullScreenContainer>,
            document.body,
          )}
        </>
      )}
    </AnimatePresence>
  );
};
