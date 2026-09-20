import { useCallback } from 'react';
import { useStore } from 'jotai';
import { t } from '@lingui/core/macro';
import { SidePanelPages } from 'twenty-shared/types';
import { IconBrandInstagram } from 'twenty-ui/icon';
import { v4 } from 'uuid';

import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { instagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';

export const useOpenInstagramMessageInSidePanel = () => {
  const store = useStore();
  const { navigateSidePanelMenu } = useSidePanelMenu();
  const openInstagramMessageInSidePanel = useCallback(
    ({ creatorRecordId }: { creatorRecordId?: string } = {}) => {
      const pageId = v4();
      store.set(
        instagramMessageComposerState.atomFamily({ instanceId: pageId }),
        {
          recipient: creatorRecordId ? { creatorRecordId } : null,
          body: '',
          draftId: v4(),
        },
      );
      navigateSidePanelMenu({
        page: SidePanelPages.InstagramMessage,
        pageTitle: t`New Instagram Message`,
        pageIcon: IconBrandInstagram,
        pageId,
      });
    },
    [navigateSidePanelMenu, store],
  );
  return { openInstagramMessageInSidePanel };
};
