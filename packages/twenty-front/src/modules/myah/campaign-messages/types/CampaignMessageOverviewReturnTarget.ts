export type CampaignMessageOverviewReturnTarget = {
  occurrenceId: string;
  pathname: '/myah/messages';
  search: string;
  workspaceId: string;
};

export const isCampaignMessageOverviewReturnTarget = (
  value: unknown,
  workspaceId: string,
): value is CampaignMessageOverviewReturnTarget => {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<CampaignMessageOverviewReturnTarget>;

  return (
    target.workspaceId === workspaceId &&
    target.pathname === '/myah/messages' &&
    typeof target.search === 'string' &&
    (target.search === '' || target.search.startsWith('?')) &&
    typeof target.occurrenceId === 'string'
  );
};
