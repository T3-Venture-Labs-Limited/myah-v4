import { describe, expect, it } from 'vitest';

import { deriveCampaignOverviewState } from 'src/front-components/utils/derive-campaign-overview-state.util';

const blockerByMissingField = {
  name: 'Campaign name is required before activation.',
  objective: 'Campaign objective is required before activation.',
  audience: 'Add at least one creator before activating this campaign.',
} as const;

type MissingField = keyof typeof blockerByMissingField;

const readinessCases: {
  name: string;
  objective: string | null;
  count: number;
  missing: MissingField[];
}[] = [
  { name: '', objective: 'Goal', count: 1, missing: ['name'] },
  { name: '   ', objective: 'Goal', count: 1, missing: ['name'] },
  { name: 'Campaign', objective: null, count: 1, missing: ['objective'] },
  { name: 'Campaign', objective: '   ', count: 1, missing: ['objective'] },
  { name: 'Campaign', objective: 'Goal', count: 0, missing: ['audience'] },
  { name: 'Campaign', objective: 'Goal', count: 1, missing: [] },
];

describe('deriveCampaignOverviewState', () => {
  it.each(readinessCases)(
    'derives trimmed readiness for name=$name, objective=$objective, count=$count',
    ({ name, objective, count, missing }) => {
      const state = deriveCampaignOverviewState({
        id: 'campaign-1',
        name,
        objective,
        lifecycleStatus: 'DRAFT',
        effectiveAudienceCount: count,
      });

      expect(state).toEqual({
        lifecycleStatus: 'DRAFT',
        hasName: !missing.includes('name'),
        hasObjective: !missing.includes('objective'),
        hasAudience: !missing.includes('audience'),
        isActivationReady: missing.length === 0,
        blockers: missing.map(
          (missingField) => blockerByMissingField[missingField],
        ),
      });
    },
  );

  it.each(['ACTIVE', 'PAUSED', 'COMPLETED'] as const)(
    'preserves the current %s status',
    (status) => {
      expect(
        deriveCampaignOverviewState({
          id: 'campaign-1',
          name: 'Campaign',
          objective: 'Goal',
          lifecycleStatus: status,
          effectiveAudienceCount: 1,
        }),
      ).toMatchObject({
        lifecycleStatus: status,
        isActivationReady: true,
      });
    },
  );
});
