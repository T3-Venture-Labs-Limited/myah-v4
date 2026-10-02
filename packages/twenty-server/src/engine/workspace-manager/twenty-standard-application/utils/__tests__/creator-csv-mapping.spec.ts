import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const result = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
});
const creatorFieldNames = new Set(
  Object.values(
    result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
  )
    .filter(isDefined)
    .filter(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    )
    .map((field) => field.name),
);

describe('Influencer Club CSV standard metadata', () => {
  it('retains Creator contact fields without restoring retired platform fields', () => {
    for (const name of ['email', 'name', 'location', 'language', 'phone']) {
      expect(creatorFieldNames).toContain(name);
    }
    expect(creatorFieldNames).not.toContain('instagramUsername');
    expect(creatorFieldNames).not.toContain('hasLinkInBio');
  });
});
