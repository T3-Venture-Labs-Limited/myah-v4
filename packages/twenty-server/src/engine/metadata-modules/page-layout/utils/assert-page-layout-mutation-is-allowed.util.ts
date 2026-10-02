import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { type MetadataFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/metadata-flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatPageLayoutTabMaps } from 'src/engine/metadata-modules/flat-page-layout-tab/types/flat-page-layout-tab-maps.type';
import { type FlatPageLayoutWidgetMaps } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget-maps.type';
import { type FlatPageLayoutMaps } from 'src/engine/metadata-modules/flat-page-layout/types/flat-page-layout-maps.type';
import { type FlatViewMaps } from 'src/engine/metadata-modules/flat-view/types/flat-view-maps.type';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { resolveOverridableEntityProperty } from 'src/engine/metadata-modules/utils/resolve-overridable-entity-property.util';
import {
  PageLayoutException,
  PageLayoutExceptionCode,
} from 'src/engine/metadata-modules/page-layout/exceptions/page-layout.exception';

const retiredBrandBrainObjectIdentifiers = new Set<string>([
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
]);

export const assertPageLayoutMutationIsAllowed = ({
  pageLayoutType,
  objectMetadataId,
  configuration,
  flatViewMaps,
  flatObjectMetadataMaps,
  pageLayoutId,
  pageLayoutTabId,
  pageLayoutWidgetId,
  flatPageLayoutMaps,
  flatPageLayoutTabMaps,
  flatPageLayoutWidgetMaps,
}: {
  pageLayoutType?: PageLayoutType;
  objectMetadataId?: string | null;
  configuration?: object | null;
  flatViewMaps?: FlatViewMaps;
  flatObjectMetadataMaps?: MetadataFlatEntityMaps<'objectMetadata'>;
  pageLayoutId?: string;
  pageLayoutTabId?: string;
  pageLayoutWidgetId?: string;
  flatPageLayoutMaps?: FlatPageLayoutMaps;
  flatPageLayoutTabMaps?: FlatPageLayoutTabMaps;
  flatPageLayoutWidgetMaps?: FlatPageLayoutWidgetMaps;
}): void => {
  const isRetiredObject = (id: string | null | undefined) =>
    isDefined(id) &&
    isDefined(flatObjectMetadataMaps) &&
    retiredBrandBrainObjectIdentifiers.has(
      flatObjectMetadataMaps.universalIdentifierById[id] ?? '',
    );

  const viewReference = configuration as
    | {
        viewId?: string | null;
        viewUniversalIdentifier?: string | null;
      }
    | null
    | undefined;
  const viewById =
    isDefined(viewReference?.viewId) && isDefined(flatViewMaps)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: viewReference.viewId,
          flatEntityMaps: flatViewMaps,
        })
      : undefined;
  const viewByUid = isDefined(viewReference?.viewUniversalIdentifier)
    ? flatViewMaps?.byUniversalIdentifier[viewReference.viewUniversalIdentifier]
    : undefined;
  const viewByIdAsUid = isDefined(viewReference?.viewId)
    ? flatViewMaps?.byUniversalIdentifier[viewReference.viewId]
    : undefined;

  if (
    isRetiredObject(objectMetadataId) ||
    isRetiredObject(viewById?.objectMetadataId) ||
    isRetiredObject(viewByUid?.objectMetadataId) ||
    isRetiredObject(viewByIdAsUid?.objectMetadataId)
  ) {
    throw new PageLayoutException(
      'Brand Brain page layouts are retired and cannot be mutated',
      PageLayoutExceptionCode.INVALID_PAGE_LAYOUT_DATA,
    );
  }

  if (pageLayoutType === PageLayoutType.DASHBOARD) {
    throw new PageLayoutException(
      'Dashboard page layouts are retired and cannot be mutated',
      PageLayoutExceptionCode.INVALID_PAGE_LAYOUT_DATA,
    );
  }

  const pageLayoutTabIds = new Set<string>();
  const pageLayoutIds = new Set<string>();

  if (isDefined(pageLayoutId)) {
    pageLayoutIds.add(pageLayoutId);
  }

  if (isDefined(pageLayoutTabId)) {
    pageLayoutTabIds.add(pageLayoutTabId);
  }

  if (isDefined(pageLayoutWidgetId) && isDefined(flatPageLayoutWidgetMaps)) {
    const widget = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: pageLayoutWidgetId,
      flatEntityMaps: flatPageLayoutWidgetMaps,
    });

    if (isDefined(widget)) {
      // Both sources must be protected: an override can move an otherwise Dashboard-owned widget into a record-page tab.
      pageLayoutTabIds.add(widget.pageLayoutTabId);
      pageLayoutTabIds.add(
        resolveOverridableEntityProperty(widget, 'pageLayoutTabId'),
      );
    }
  }

  if (isDefined(flatPageLayoutTabMaps)) {
    for (const tabId of pageLayoutTabIds) {
      const tab = findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: tabId,
        flatEntityMaps: flatPageLayoutTabMaps,
      });

      if (isDefined(tab)) {
        pageLayoutIds.add(tab.pageLayoutId);
        pageLayoutIds.add(
          resolveOverridableEntityProperty(tab, 'pageLayoutId'),
        );
      }
    }
  }

  if (!isDefined(flatPageLayoutMaps)) {
    return;
  }

  for (const layoutId of pageLayoutIds) {
    const layout = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: layoutId,
      flatEntityMaps: flatPageLayoutMaps,
    });

    if (isRetiredObject(layout?.objectMetadataId)) {
      throw new PageLayoutException(
        'Brand Brain page layouts are retired and cannot be mutated',
        PageLayoutExceptionCode.INVALID_PAGE_LAYOUT_DATA,
      );
    }

    if (layout?.type === PageLayoutType.DASHBOARD) {
      throw new PageLayoutException(
        'Dashboard page layouts are retired and cannot be mutated',
        PageLayoutExceptionCode.INVALID_PAGE_LAYOUT_DATA,
      );
    }
  }
};
