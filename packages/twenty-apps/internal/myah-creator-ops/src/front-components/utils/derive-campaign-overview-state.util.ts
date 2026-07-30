import { type CampaignOverviewSnapshot } from 'src/front-components/types/campaign-overview-snapshot.type';

const blockerCopy: Record<'name' | 'objective' | 'audience', string> = {
  name: 'Campaign name is required before activation.',
  objective: 'Campaign objective is required before activation.',
  audience: 'Add at least one creator before activating this campaign.',
};

export const deriveCampaignOverviewState = (
  snapshot: CampaignOverviewSnapshot,
) => {
  const hasName = (snapshot.name?.trim().length ?? 0) > 0;
  const hasObjective = (snapshot.objective?.trim().length ?? 0) > 0;
  const hasAudience = snapshot.effectiveAudienceCount > 0;
  const blockers: string[] = [];

  if (!hasName) {
    blockers.push(blockerCopy.name);
  }
  if (!hasObjective) {
    blockers.push(blockerCopy.objective);
  }
  if (!hasAudience) {
    blockers.push(blockerCopy.audience);
  }

  return {
    lifecycleStatus: snapshot.lifecycleStatus,
    hasName,
    hasObjective,
    hasAudience,
    isActivationReady: hasName && hasObjective && hasAudience,
    blockers,
  };
};
