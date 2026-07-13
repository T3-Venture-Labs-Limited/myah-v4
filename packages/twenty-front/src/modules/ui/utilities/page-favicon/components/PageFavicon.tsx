import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { getWorkspaceLogoUrl } from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const PageFavicon = () => {
  const workspacePublicData = useAtomStateValue(workspacePublicDataState);
  return (
    <Helmet>
      <link
        rel="icon"
        type="image/png"
        href={getWorkspaceLogoUrl(workspacePublicData?.logo)}
      />
    </Helmet>
  );
};
