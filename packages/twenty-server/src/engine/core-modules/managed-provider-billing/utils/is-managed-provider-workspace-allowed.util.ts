export const isManagedProviderWorkspaceAllowed = ({
  allowedWorkspaceIds,
  workspaceId,
}: {
  allowedWorkspaceIds: string[];
  workspaceId: string;
}): boolean =>
  allowedWorkspaceIds.includes('*') || allowedWorkspaceIds.includes(workspaceId);
