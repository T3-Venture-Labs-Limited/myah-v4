import { RouterProvider } from 'react-router-dom';

import { useCreateWorkspaceAppRouter } from '@/app/hooks/useCreateWorkspaceAppRouter';

export const WorkspaceApp = () => {
  const isFunctionSettingsEnabled = false;
  const isAdminPageEnabled = true;

  return (
    <RouterProvider
      router={useCreateWorkspaceAppRouter(
        isFunctionSettingsEnabled,
        isAdminPageEnabled,
      )}
    />
  );
};
