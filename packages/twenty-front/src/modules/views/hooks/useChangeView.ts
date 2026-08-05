import { useSetViewInUrl } from '@/views/hooks/useSetViewInUrl';

export const useChangeView = (onViewChange?: (viewId: string) => void) => {
  const { setViewInUrl } = useSetViewInUrl();

  const changeView = (viewId: string) => {
    if (onViewChange) {
      onViewChange(viewId);
      return;
    }

    setViewInUrl(viewId);
  };

  return { changeView };
};
