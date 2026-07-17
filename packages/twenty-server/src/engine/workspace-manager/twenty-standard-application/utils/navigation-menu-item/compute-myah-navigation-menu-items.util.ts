import { NavigationMenuItemType } from 'src/engine/metadata-modules/navigation-menu-item/enums/navigation-menu-item-type.enum';
import { type FlatNavigationMenuItem } from 'src/engine/metadata-modules/flat-navigation-menu-item/types/flat-navigation-menu-item.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatView } from 'src/engine/metadata-modules/flat-view/types/flat-view.type';
import { findFlatEntityByUniversalIdentifier } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { v4 } from 'uuid';
const BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER =
  '6a8289d7-8034-4f70-b3fa-47bc0e52828f';
const MYAH_NAVIGATION_ITEMS = {
  brandBrainPages: {
    universalIdentifier: '43f7a291-b0a4-481d-a5e4-b557e1a8f65d',
    type: NavigationMenuItemType.OBJECT,
    icon: 'IconNotebook',
    position: 0,
    targetObjectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  },
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
  dependencyFlatEntityMaps: { flatObjectMetadataMaps, flatViewMaps },
}: Args): Record<keyof typeof MYAH_NAVIGATION_ITEMS, FlatNavigationMenuItem> =>
  Object.fromEntries(
    Object.entries(MYAH_NAVIGATION_ITEMS).map(([name, definition]) => {
      const targetObject =
        definition.type === NavigationMenuItemType.OBJECT
          ? findFlatEntityByUniversalIdentifier({
              flatEntityMaps: flatObjectMetadataMaps,
              universalIdentifier: definition.targetObjectUniversalIdentifier,
            })
          : undefined;
      const targetView =
        definition.type === NavigationMenuItemType.VIEW
          ? findFlatEntityByUniversalIdentifier({
              flatEntityMaps: flatViewMaps,
              universalIdentifier: definition.viewUniversalIdentifier,
            })
          : undefined;

      if (definition.type === NavigationMenuItemType.OBJECT && !targetObject) {
        throw new Error(`Object not found for navigation menu item ${name}`);
      }
      if (definition.type === NavigationMenuItemType.VIEW && !targetView) {
        throw new Error(`View not found for navigation menu item ${name}`);
      }

      return [name, {
        id: v4(),
        type: definition.type,
        universalIdentifier: definition.universalIdentifier,
        applicationId,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        workspaceId,
        userWorkspaceId: null,
        targetRecordId: null,
        targetObjectMetadataId:
          definition.type === NavigationMenuItemType.OBJECT
            ? targetObject?.id ?? null
            : null,
        targetObjectMetadataUniversalIdentifier:
          definition.type === NavigationMenuItemType.OBJECT
            ? targetObject?.universalIdentifier ?? null
            : null,
        viewId:
          definition.type === NavigationMenuItemType.VIEW
            ? targetView?.id ?? null
            : null,
        viewUniversalIdentifier:
          definition.type === NavigationMenuItemType.VIEW
            ? targetView?.universalIdentifier ?? null
            : null,
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
      } satisfies FlatNavigationMenuItem];
    }),
  ) as Record<keyof typeof MYAH_NAVIGATION_ITEMS, FlatNavigationMenuItem>;
