import { useCallback } from 'react';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { SidePanelPages } from 'twenty-shared/types';
import { IconInfoCircle } from 'twenty-ui/icon';
import { v4 } from 'uuid';

export const useOpenMyahInboxContextInSidePanel = () => {
  const { navigateSidePanelMenu } = useSidePanelMenu();
  const openMyahInboxContextInSidePanel = useCallback(() => {
    navigateSidePanelMenu({
      page: SidePanelPages.MyahInboxContext,
      pageTitle: 'Inbox context',
      pageIcon: IconInfoCircle,
      pageId: v4(),
      resetNavigationStack: true,
    });
  }, [navigateSidePanelMenu]);
  return { openMyahInboxContextInSidePanel };
};
