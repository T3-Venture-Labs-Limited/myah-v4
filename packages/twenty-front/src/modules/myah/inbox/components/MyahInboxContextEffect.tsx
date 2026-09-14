import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { useOpenMyahInboxContextInSidePanel } from '@/myah/inbox/hooks/useOpenMyahInboxContextInSidePanel';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { isSidePanelClosingState } from '@/side-panel/states/isSidePanelClosingState';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { SidePanelPages } from 'twenty-shared/types';
import { useStore } from 'jotai';
import { useLocation } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { myahInboxContextState } from '@/myah/inbox/states/myahInboxContextState';

type MyahInboxContextVisibility = {
  ready: boolean;
  wasWide: boolean | null;
  dismissed: boolean;
  competing: boolean;
};

type MyahInboxContextEffectProps = {
  workspaceId: string | null;
  thread: MyahInboxThread | null;
};

export const MyahInboxContextEffect = ({
  workspaceId,
  thread,
}: MyahInboxContextEffectProps) => {
  const store = useStore();
  const ownerId = useId();
  const { pathname } = useLocation();
  const isWide = useMediaQuery({ query: '(min-width: 1200px)' });

  const { openMyahInboxContextInSidePanel } =
    useOpenMyahInboxContextInSidePanel();
  const { closeSidePanelMenu } = useSidePanelMenu();
  const [visibilityState] = useState(() =>
    createAtomState<MyahInboxContextVisibility>({
      key: 'myah-inbox/context-visibility',
      defaultValue: {
        ready: false,
        wasWide: null,
        dismissed: false,
        competing: false,
      },
    }),
  );

  useLayoutEffect(() => {
    if (pathname !== '/myah/inbox') {
      return;
    }
    store.set(myahInboxContextState.atom, {
      ownerId,
      workspaceId,
      thread,
      isWide,
    });
    return () => {
      if (store.get(myahInboxContextState.atom)?.ownerId === ownerId) {
        store.set(myahInboxContextState.atom, null);
      }
    };
  }, [isWide, ownerId, pathname, store, thread, workspaceId]);

  useEffect(() => {
    let disposed = false;
    let scheduled = false;
    let responsiveClose = false;

    const evaluate = () => {
      scheduled = false;
      if (disposed) {
        return;
      }
      const context = store.get(myahInboxContextState.atom);
      if (context?.ownerId !== ownerId) {
        return;
      }

      const opened = store.get(isSidePanelOpenedState.atom);
      const page = store.get(sidePanelPageState.atom);
      const previous = store.get(visibilityState.atom);
      const competing =
        previous.competing ||
        (opened && page !== SidePanelPages.MyahInboxContext);
      const next = {
        ...previous,
        ready: true,
        wasWide: context.isWide,
        competing,
      };
      store.set(visibilityState.atom, next);

      if (
        previous.wasWide === true &&
        !context.isWide &&
        opened &&
        page === SidePanelPages.MyahInboxContext
      ) {
        responsiveClose = true;
        try {
          void closeSidePanelMenu();
        } finally {
          responsiveClose = false;
        }
        return;
      }

      if (
        context.isWide &&
        context.workspaceId &&
        context.thread &&
        !opened &&
        !store.get(isSidePanelClosingState.atom) &&
        !next.dismissed &&
        !next.competing
      ) {
        openMyahInboxContextInSidePanel();
      }
    };

    const schedule = () => {
      if (disposed || scheduled) {
        return;
      }
      scheduled = true;
      // Native navigate writes opened before page/stack; observe its settled batch.
      // Also runs after PageChangeEffect's initial native route cleanup.
      queueMicrotask(evaluate);
    };

    const unsubscribeOpened = store.sub(isSidePanelOpenedState.atom, () => {
      const policy = store.get(visibilityState.atom);
      if (
        policy.ready &&
        !store.get(isSidePanelOpenedState.atom) &&
        store.get(sidePanelPageState.atom) ===
          SidePanelPages.MyahInboxContext &&
        !responsiveClose
      ) {
        store.set(visibilityState.atom, { ...policy, dismissed: true });
      }
      schedule();
    });
    const unsubscribePage = store.sub(sidePanelPageState.atom, schedule);
    const unsubscribeClosing = store.sub(
      isSidePanelClosingState.atom,
      schedule,
    );
    const unsubscribeContext = store.sub(myahInboxContextState.atom, schedule);
    schedule();

    return () => {
      disposed = true;
      unsubscribeOpened();
      unsubscribePage();
      unsubscribeClosing();
      unsubscribeContext();
    };
  }, [
    closeSidePanelMenu,
    openMyahInboxContextInSidePanel,
    pathname,
    ownerId,
    store,
    visibilityState,
  ]);

  return null;
};
