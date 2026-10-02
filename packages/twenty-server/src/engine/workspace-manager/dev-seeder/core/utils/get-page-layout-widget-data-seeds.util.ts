import { PageLayoutTabLayoutMode } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type FlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget.type';
import { fromPageLayoutWidgetConfigurationToUniversalConfiguration } from 'src/engine/metadata-modules/flat-page-layout-widget/utils/from-page-layout-widget-configuration-to-universal-configuration.util';
import { type ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { PAGE_LAYOUT_TAB_SEEDS } from 'src/engine/workspace-manager/dev-seeder/core/constants/page-layout-tab-seeds.constant';
import { PAGE_LAYOUT_WIDGET_SEEDS } from 'src/engine/workspace-manager/dev-seeder/core/constants/page-layout-widget-seeds.constant';
import { type SeederFlatPageLayoutWidget } from 'src/engine/workspace-manager/dev-seeder/core/types/seeder-flat-page-layout-widget.type';
import { generateSeedId } from 'src/engine/workspace-manager/dev-seeder/core/utils/generate-seed-id.util';

export const getPageLayoutWidgetFlatEntitySeeds = ({
  workspaceId,
  flatApplication,
  objectMetadataItems,
}: {
  workspaceId: string;
  flatApplication: FlatApplication;
  objectMetadataItems: ObjectMetadataEntity[];
}): FlatPageLayoutWidget[] => {
  const seeds = getPageLayoutWidgetDataSeeds(workspaceId, objectMetadataItems);
  const now = new Date().toISOString();

  const fieldMetadataUniversalIdentifierById: Record<string, string> = {};

  for (const objectMetadata of objectMetadataItems) {
    if (!isDefined(objectMetadata.fields)) {
      continue;
    }
    for (const field of objectMetadata.fields) {
      fieldMetadataUniversalIdentifierById[field.id] =
        field.universalIdentifier;
    }
  }

  return seeds.map((seed) => {
    const objectMetadata = isDefined(seed.objectMetadataId)
      ? objectMetadataItems.find(
          (objectMetadataItem) =>
            objectMetadataItem.id === seed.objectMetadataId,
        )
      : undefined;

    const universalConfiguration =
      fromPageLayoutWidgetConfigurationToUniversalConfiguration({
        configuration: seed.configuration,
        fieldMetadataUniversalIdentifierById,
        frontComponentUniversalIdentifierById: {},
      });

    return {
      ...seed,
      universalIdentifier: seed.id,
      applicationId: flatApplication.id,
      applicationUniversalIdentifier: flatApplication.universalIdentifier,
      workspaceId,
      pageLayoutTabUniversalIdentifier: seed.pageLayoutTabId,
      objectMetadataUniversalIdentifier:
        objectMetadata?.universalIdentifier ?? null,
      universalConfiguration,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      universalOverrides: null,
    } as FlatPageLayoutWidget;
  });
};

export const getPageLayoutWidgetDataSeeds = (
  workspaceId: string,
  _objectMetadataItems: ObjectMetadataEntity[],
): SeederFlatPageLayoutWidget[] => {
  const v1Widgets: SeederFlatPageLayoutWidget[] = [
    {
      id: generateSeedId(
        workspaceId,
        PAGE_LAYOUT_WIDGET_SEEDS.DOCUMENTATION_IFRAME,
      ),
      pageLayoutTabId: generateSeedId(
        workspaceId,
        PAGE_LAYOUT_TAB_SEEDS.DOCUMENTATION,
      ),
      title: 'Twenty Star History',
      type: WidgetType.IFRAME,
      gridPosition: { row: 0, column: 0, rowSpan: 12, columnSpan: 12 },
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 0,
        column: 0,
        rowSpan: 12,
        columnSpan: 12,
      },
      configuration: {
        configurationType: WidgetConfigurationType.IFRAME,
        url: 'https://www.star-history.com/?repos=twentyhq%2Ftwenty&type=date&legend=top-left',
      },
      objectMetadataId: null,
      overrides: null,
    } satisfies SeederFlatPageLayoutWidget,
  ].filter(isDefined);

  return v1Widgets;
};
