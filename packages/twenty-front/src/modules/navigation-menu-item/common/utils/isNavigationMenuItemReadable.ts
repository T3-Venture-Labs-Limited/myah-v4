import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type ViewWithRelations } from '@/views/types/ViewWithRelations';

// Keep recoverable metadata and read grants, but do not advertise the retired
// feature through preserved OBJECT/VIEW/RECORD navigation rows.
const retiredBrandBrainObjectUids = new Set<string>([
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
]);

type IsNavigationMenuItemReadableArgs = {
  item: NavigationMenuItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  views: ViewWithRelations[];
  objectPermissionsByObjectMetadataId: Parameters<
    typeof getObjectPermissionsForObject
  >[0];
};

export const isNavigationMenuItemReadable = ({
  item,
  objectMetadataItems,
  views,
  objectPermissionsByObjectMetadataId,
}: IsNavigationMenuItemReadableArgs): boolean => {
  const itemType = item.type;

  if (
    itemType === NavigationMenuItemType.FOLDER ||
    itemType === NavigationMenuItemType.LINK ||
    itemType === NavigationMenuItemType.PAGE_LAYOUT
  ) {
    return true;
  }

  if (
    itemType === NavigationMenuItemType.OBJECT ||
    itemType === NavigationMenuItemType.VIEW ||
    itemType === NavigationMenuItemType.RECORD
  ) {
    const objectMetadataItem = getObjectMetadataForNavigationMenuItem(
      item,
      objectMetadataItems,
      views,
    );

    return (
      isDefined(objectMetadataItem) &&
      !retiredBrandBrainObjectUids.has(
        objectMetadataItem.universalIdentifier,
      ) &&
      getObjectPermissionsForObject(
        objectPermissionsByObjectMetadataId,
        objectMetadataItem.id,
      ).canReadObjectRecords
    );
  }

  return false;
};
