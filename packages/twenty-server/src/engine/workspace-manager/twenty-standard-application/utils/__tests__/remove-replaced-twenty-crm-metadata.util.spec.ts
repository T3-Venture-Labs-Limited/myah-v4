import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { getReplacedTwentyCrmMetadataUniversalIdentifiers } from 'src/engine/workspace-manager/twenty-standard-application/utils/remove-replaced-twenty-crm-metadata.util';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const WIDGET_UNIVERSAL_IDENTIFIER = '20202020-0000-0000-0000-000000000003';

describe('getReplacedTwentyCrmMetadataUniversalIdentifiers', () => {
  it('includes a widget whose serialized configuration references a removed CRM field or view', () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-19T00:00:00.000Z',
      });
    const companyView = Object.values(
      allFlatEntityMaps.flatViewMaps.byUniversalIdentifier,
    ).find(
      (view) =>
        view?.objectMetadataUniversalIdentifier ===
        STANDARD_OBJECTS.company.universalIdentifier,
    );

    if (companyView === undefined) {
      throw new Error(
        'Expected the standard Company metadata to include a view',
      );
    }

    allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
      WIDGET_UNIVERSAL_IDENTIFIER
    ] = {
      id: WIDGET_UNIVERSAL_IDENTIFIER,
      universalIdentifier: WIDGET_UNIVERSAL_IDENTIFIER,
      universalConfiguration: {
        configurationType: 'BAR_CHART',
        aggregateFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.company.fields.name.universalIdentifier,
        filter: {
          recordFilters: [
            {
              fieldMetadataUniversalIdentifier:
                STANDARD_OBJECTS.company.fields.name.universalIdentifier,
            },
          ],
        },
        viewUniversalIdentifier: companyView.universalIdentifier,
      },
    } as never;

    const removedUniversalIdentifiersByMetadataName =
      getReplacedTwentyCrmMetadataUniversalIdentifiers(allFlatEntityMaps);

    expect(
      removedUniversalIdentifiersByMetadataName.pageLayoutWidget?.has(
        WIDGET_UNIVERSAL_IDENTIFIER,
      ),
    ).toBe(true);
  });
});
