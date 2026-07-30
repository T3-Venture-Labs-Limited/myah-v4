import {
  PageLayoutTabsRenderer,
  type PageLayoutTabsRendererRenderMode,
} from '@/page-layout/components/PageLayoutTabsRenderer';
import { pageLayoutIsInitializedComponentState } from '@/page-layout/states/pageLayoutIsInitializedComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

type PageLayoutRendererContentProps = {
  renderMode?: PageLayoutTabsRendererRenderMode;
};

export const PageLayoutRendererContent = ({
  renderMode,
}: PageLayoutRendererContentProps) => {
  const pageLayoutIsInitialized = useAtomComponentStateValue(
    pageLayoutIsInitializedComponentState,
  );

  if (!pageLayoutIsInitialized) {
    return null;
  }

  return <PageLayoutTabsRenderer renderMode={renderMode} />;
};
