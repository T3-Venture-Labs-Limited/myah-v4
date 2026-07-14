import { isNonEmptyString } from '@sniptt/guards';

import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

export const DEFAULT_PAGE_FAVICON = '/images/brand/myah-favicon.png';

export const getPageFaviconUrl = (workspaceLogo?: string | null): string =>
  isNonEmptyString(workspaceLogo)
    ? (getAbsoluteImageUrl(workspaceLogo) ?? DEFAULT_PAGE_FAVICON)
    : DEFAULT_PAGE_FAVICON;
export const PageFavicon = () => {
  const workspacePublicData = useAtomStateValue(workspacePublicDataState);
  return (
    <Helmet>
      <link
        rel="icon"
        type="image/png"
        href={getPageFaviconUrl(workspacePublicData?.logo)}
      />
    </Helmet>
  );
};
