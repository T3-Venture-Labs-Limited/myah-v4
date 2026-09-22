import { NavigationMenuItemType } from 'src/engine/metadata-modules/navigation-menu-item/enums/navigation-menu-item-type.enum';
import { type FlatNavigationMenuItem } from 'src/engine/metadata-modules/flat-navigation-menu-item/types/flat-navigation-menu-item.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatView } from 'src/engine/metadata-modules/flat-view/types/flat-view.type';
import { findFlatEntityByUniversalIdentifier } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { v4 } from 'uuid';

const MYAH_NAVIGATION_ITEMS = {
  creators: {
    universalIdentifier: 'd06225df-32da-5c5d-b5d1-2b8d48fdca1c',
    type: NavigationMenuItemType.VIEW,
    icon: 'IconUserStar',
    position: 0,
    viewUniversalIdentifier: 'a5abdae3-d86a-51d3-9b04-2dc21c172c3e',
  },
  creatorLists: {
    universalIdentifier: 'c124f0aa-7836-5242-ac52-e8667e0ed4f7',
    type: NavigationMenuItemType.VIEW,
    icon: 'IconListDetails',
    position: 1,
    viewUniversalIdentifier: '1bc58554-efb5-52e4-8e2a-7f522a1c453c',
  },
  campaigns: {
    universalIdentifier: 'a1556a2b-8c0a-570a-a902-38827cadc867',
    type: NavigationMenuItemType.VIEW,
    icon: 'IconTargetArrow',
    position: 2,
    viewUniversalIdentifier: '5865bdbf-be33-5457-9d91-184885276b94',
  },
} as const;

type Args = {
  workspaceId: string;
  applicationId: string;
  now: string;
  dependencyFlatEntityMaps: {
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
    flatViewMaps: FlatEntityMaps<FlatView>;
  };
};

export const computeMyahNavigationMenuItems = ({
  workspaceId,
  applicationId,
  now,
  dependencyFlatEntityMaps: { flatViewMaps },
}: Args): Record<keyof typeof MYAH_NAVIGATION_ITEMS, FlatNavigationMenuItem> =>
  Object.fromEntries(
    Object.entries(MYAH_NAVIGATION_ITEMS).map(([name, definition]) => {
      const targetView = findFlatEntityByUniversalIdentifier({
        flatEntityMaps: flatViewMaps,
        universalIdentifier: definition.viewUniversalIdentifier,
      });

      if (!targetView) {
        throw new Error(`View not found for navigation menu item ${name}`);
      }

      return [
        name,
        {
          id: v4(),
          type: definition.type,
          universalIdentifier: definition.universalIdentifier,
          applicationId,
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
          workspaceId,
          userWorkspaceId: null,
          targetRecordId: null,
          targetObjectMetadataId: null,
          targetObjectMetadataUniversalIdentifier: null,
          viewId: targetView.id,
          viewUniversalIdentifier: targetView.universalIdentifier,
          folderId: null,
          folderUniversalIdentifier: null,
          pageLayoutId: null,
          pageLayoutUniversalIdentifier: null,
          name: null,
          link: null,
          icon: definition.icon,
          color: null,
          position: definition.position,
          createdAt: now,
          updatedAt: now,
        } satisfies FlatNavigationMenuItem,
      ];
    }),
  ) as Record<keyof typeof MYAH_NAVIGATION_ITEMS, FlatNavigationMenuItem>;
