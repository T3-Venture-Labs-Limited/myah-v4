import { useCallback } from 'react';

import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { myahInboxContextThreadComponentState } from '@/myah/inbox/states/myahInboxContextThreadComponentState';
import { useStore } from 'jotai';
import { SidePanelPages } from 'twenty-shared/types';
import { IconInfoCircle } from 'twenty-ui/icon';
import { v4 } from 'uuid';

import { type MyahInboxThread } from './useMyahInboxThreads';

type OpenMyahInboxContextInSidePanelParams = {
  thread: MyahInboxThread;
};

export const useOpenMyahInboxContextInSidePanel = () => {
  const store = useStore();
  const { navigateSidePanelMenu } = useSidePanelMenu();

  const openMyahInboxContextInSidePanel = useCallback(
    ({ thread }: OpenMyahInboxContextInSidePanelParams) => {
      const pageId = v4();

      store.set(
        myahInboxContextThreadComponentState.atomFamily({
          instanceId: pageId,
        }),
        thread,
      );

      navigateSidePanelMenu({
        page: SidePanelPages.MyahInboxContext,
        pageTitle: 'Inbox context',
        pageIcon: IconInfoCircle,
        pageId,
        resetNavigationStack: true,
      });
    },
    [navigateSidePanelMenu, store],
  );

  return { openMyahInboxContextInSidePanel };
};
